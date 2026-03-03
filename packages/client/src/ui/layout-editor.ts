import { ZONES, ZONE_MAP } from '@agent-move/shared';
import type { ZoneId } from '@agent-move/shared';
import type { WorldManager } from '../world/world-manager.js';

/** Persisted layout entry per zone */
interface ZoneLayout {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Serializable form of the layout for export/import */
interface ExportedLayout {
  version: 1;
  zones: Record<string, ZoneLayout>;
}

const STORAGE_KEY = 'agent-move-layout';
const MIN_SIZE = 200;
const MAX_UNDO = 50;

/** Capture the original default positions at module load time (before any mutation). */
const DEFAULT_LAYOUTS: ReadonlyMap<ZoneId, Readonly<ZoneLayout>> = new Map(
  ZONES.map((z) => [z.id, { x: z.x, y: z.y, width: z.width, height: z.height }] as const),
);

/**
 * Apply any saved layout from localStorage onto ZONE_MAP.
 * Call this BEFORE WorldManager is constructed so ZoneRenderer
 * picks up the persisted positions on first render.
 */
export function applySavedLayout(): void {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    const parsed: ExportedLayout = JSON.parse(raw);
    if (parsed.version !== 1 || !parsed.zones) return;
    for (const [id, rect] of Object.entries(parsed.zones)) {
      const zone = ZONE_MAP.get(id as ZoneId);
      if (zone) {
        zone.x = rect.x;
        zone.y = rect.y;
        zone.width = Math.max(MIN_SIZE, rect.width);
        zone.height = Math.max(MIN_SIZE, rect.height);
      }
    }
  } catch {
    // ignore corrupt data
  }
}

/**
 * Interactive layout editor for zone positioning and sizing.
 *
 * Uses an HTML overlay approach: when edit mode is active, transparent
 * divs are positioned over each zone matching the Pixi camera transform.
 * Mouse events on those divs drive drag-to-move and corner-resize.
 */
export class LayoutEditor {
  private active = false;
  private layout: Map<ZoneId, ZoneLayout> = new Map();

  // Undo / redo stacks (serialised JSON snapshots)
  private undoStack: string[] = [];
  private redoStack: string[] = [];

  // DOM elements
  private toggleBtn!: HTMLButtonElement;
  private panel!: HTMLDivElement;
  private overlayRoot!: HTMLDivElement;
  private handles = new Map<ZoneId, HTMLDivElement>();

  // Bound event handlers (stored for cleanup)
  private keydownHandler = (e: KeyboardEvent) => {
    if (!this.active) return;
    if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) {
      e.preventDefault();
      this.undo();
    }
    if ((e.ctrlKey || e.metaKey) && (e.key === 'y' || (e.key === 'z' && e.shiftKey))) {
      e.preventDefault();
      this.redo();
    }
  };
  private pointerMoveHandler = (e: PointerEvent) => this.onPointerMove(e);
  private pointerUpHandler = () => this.onPointerUp();

  // Drag state
  private dragZone: ZoneId | null = null;
  private dragType: 'move' | 'resize-tl' | 'resize-tr' | 'resize-bl' | 'resize-br' | null = null;
  private dragStartMouse = { x: 0, y: 0 };
  private dragStartRect = { x: 0, y: 0, w: 0, h: 0 };

  constructor(private world: WorldManager) {
    // Initialise internal layout mirror from current ZONE_MAP state
    // (which already has saved layout applied via applySavedLayout)
    this.syncFromZoneMap();
    // Build DOM
    this.buildUI();
    // Bind global listeners
    this.bindEvents();
  }

  // ─── Public API ──────────────────────────────────────────

  /** Whether editor is currently active */
  get isActive(): boolean {
    return this.active;
  }

  dispose(): void {
    document.removeEventListener('keydown', this.keydownHandler);
    document.removeEventListener('pointermove', this.pointerMoveHandler);
    document.removeEventListener('pointerup', this.pointerUpHandler);
    this.removeZoneHandles();
    this.toggleBtn.remove();
    this.panel.remove();
    this.overlayRoot.remove();
    const fileInput = document.getElementById('le-file-input');
    if (fileInput) fileInput.remove();
  }

  /** Call every frame so HTML overlay tracks the Pixi camera */
  updateTransform(offsetX: number, offsetY: number, scale: number): void {
    if (!this.active) return;
    for (const [zoneId, handle] of this.handles) {
      const lay = this.layout.get(zoneId);
      if (!lay) continue;
      handle.style.left = `${lay.x * scale + offsetX}px`;
      handle.style.top = `${lay.y * scale + offsetY}px`;
      handle.style.width = `${lay.width * scale}px`;
      handle.style.height = `${lay.height * scale}px`;
    }
  }

  // ─── Layout helpers ────────────────────────────────────────

  /** Copy current ZONE_MAP values into the internal layout map */
  private syncFromZoneMap(): void {
    for (const zone of ZONES) {
      const z = ZONE_MAP.get(zone.id);
      if (z) {
        this.layout.set(zone.id, { x: z.x, y: z.y, width: z.width, height: z.height });
      }
    }
  }

  /** Push internal layout map values into ZONE_MAP (mutates shared state) */
  private applyToZoneMap(): void {
    for (const [id, rect] of this.layout) {
      const zone = ZONE_MAP.get(id);
      if (zone) {
        zone.x = rect.x;
        zone.y = rect.y;
        zone.width = rect.width;
        zone.height = rect.height;
      }
    }
  }

  private saveLayout(): void {
    const obj: ExportedLayout = { version: 1, zones: {} as Record<string, ZoneLayout> };
    for (const [id, rect] of this.layout) {
      obj.zones[id] = { ...rect };
    }
    localStorage.setItem(STORAGE_KEY, JSON.stringify(obj));
  }

  /** Push current state onto undo stack and clear redo */
  private pushUndo(): void {
    const snap = this.serializeLayout();
    this.undoStack.push(snap);
    if (this.undoStack.length > MAX_UNDO) {
      this.undoStack.shift();
    }
    this.redoStack.length = 0;
    this.updateButtonStates();
  }

  private undo(): void {
    if (this.undoStack.length === 0) return;
    this.redoStack.push(this.serializeLayout());
    const prev = this.undoStack.pop()!;
    this.deserializeLayout(prev);
    this.applyToZoneMap();
    this.world.rebuildZones();
    this.saveLayout();
    this.updateButtonStates();
  }

  private redo(): void {
    if (this.redoStack.length === 0) return;
    this.undoStack.push(this.serializeLayout());
    const next = this.redoStack.pop()!;
    this.deserializeLayout(next);
    this.applyToZoneMap();
    this.world.rebuildZones();
    this.saveLayout();
    this.updateButtonStates();
  }

  private serializeLayout(): string {
    const obj: Record<string, ZoneLayout> = {};
    for (const [id, rect] of this.layout) {
      obj[id] = { ...rect };
    }
    return JSON.stringify(obj);
  }

  private deserializeLayout(json: string): void {
    const obj: Record<string, ZoneLayout> = JSON.parse(json);
    for (const [id, rect] of Object.entries(obj)) {
      if (this.layout.has(id as ZoneId)) {
        this.layout.set(id as ZoneId, { ...rect });
      }
    }
  }

  // ─── DOM construction ────────────────────────────────────

  private buildUI(): void {
    // Toggle button — appended inside #zoom-controls row with a grid icon
    this.toggleBtn = document.createElement('button');
    this.toggleBtn.id = 'layout-editor-toggle';
    this.toggleBtn.className = 'layout-editor-toggle';
    this.toggleBtn.title = 'Toggle Layout Editor';
    this.toggleBtn.innerHTML = '<svg viewBox="0 0 24 24"><path d="M3 3h8v8H3zm10 0h8v8h-8zM3 13h8v8H3zm10 0h8v8h-8z"/></svg>';
    document.getElementById('zoom-controls')!.appendChild(this.toggleBtn);

    // Floating editor panel
    this.panel = document.createElement('div');
    this.panel.id = 'layout-editor-panel';
    this.panel.className = 'layout-editor-panel';
    this.panel.innerHTML = `
      <div class="le-title">Layout Editor</div>
      <div class="le-buttons">
        <button id="le-save" title="Save to browser">Save</button>
        <button id="le-reset" title="Reset to defaults">Reset</button>
        <button id="le-undo" title="Undo (Ctrl+Z)" disabled>Undo</button>
        <button id="le-redo" title="Redo (Ctrl+Y)" disabled>Redo</button>
        <button id="le-export" title="Download layout JSON">Export</button>
        <button id="le-import" title="Upload layout JSON">Import</button>
      </div>
    `;
    document.getElementById('app')!.appendChild(this.panel);

    // Hidden file input for import
    const fileInput = document.createElement('input');
    fileInput.type = 'file';
    fileInput.accept = '.json';
    fileInput.id = 'le-file-input';
    fileInput.style.display = 'none';
    document.body.appendChild(fileInput);

    // Overlay root for zone drag handles
    this.overlayRoot = document.createElement('div');
    this.overlayRoot.id = 'layout-editor-overlay';
    this.overlayRoot.className = 'layout-editor-overlay';
    document.getElementById('app')!.appendChild(this.overlayRoot);
  }

  private buildZoneHandles(): void {
    this.overlayRoot.innerHTML = '';
    this.handles.clear();

    for (const [zoneId] of this.layout) {
      const zone = ZONE_MAP.get(zoneId);
      if (!zone) continue;

      const handle = document.createElement('div');
      handle.className = 'zone-drag-handle';
      handle.dataset.zone = zoneId;

      // Zone label inside handle
      const label = document.createElement('div');
      label.className = 'zone-handle-label';
      label.textContent = `${zone.icon} ${zone.label}`;
      handle.appendChild(label);

      // Size indicator
      const sizeLabel = document.createElement('div');
      sizeLabel.className = 'zone-handle-size';
      const lay = this.layout.get(zoneId)!;
      sizeLabel.textContent = `${lay.width} x ${lay.height}`;
      handle.appendChild(sizeLabel);

      // Four corner resize handles
      for (const corner of ['tl', 'tr', 'bl', 'br'] as const) {
        const rh = document.createElement('div');
        rh.className = `zone-resize-handle zone-resize-${corner}`;
        rh.dataset.corner = corner;
        handle.appendChild(rh);
      }

      this.overlayRoot.appendChild(handle);
      this.handles.set(zoneId, handle);
    }
  }

  private removeZoneHandles(): void {
    this.overlayRoot.innerHTML = '';
    this.handles.clear();
  }

  /** Update the size label inside a zone handle */
  private updateSizeLabel(zoneId: ZoneId): void {
    const handle = this.handles.get(zoneId);
    if (!handle) return;
    const sizeEl = handle.querySelector('.zone-handle-size');
    if (!sizeEl) return;
    const lay = this.layout.get(zoneId)!;
    sizeEl.textContent = `${lay.width} x ${lay.height}`;
  }

  // ─── Events ──────────────────────────────────────────────

  private bindEvents(): void {
    // Toggle button
    this.toggleBtn.addEventListener('click', () => this.toggle());

    // Panel buttons
    this.panel.querySelector('#le-save')!.addEventListener('click', () => this.onSave());
    this.panel.querySelector('#le-reset')!.addEventListener('click', () => this.onReset());
    this.panel.querySelector('#le-undo')!.addEventListener('click', () => this.undo());
    this.panel.querySelector('#le-redo')!.addEventListener('click', () => this.redo());
    this.panel.querySelector('#le-export')!.addEventListener('click', () => this.onExport());
    this.panel.querySelector('#le-import')!.addEventListener('click', () => {
      (document.getElementById('le-file-input') as HTMLInputElement).click();
    });

    // File import
    document.getElementById('le-file-input')!.addEventListener('change', (e) => {
      this.onImport(e as Event);
    });

    // Keyboard shortcuts for undo/redo (only when editor is active)
    document.addEventListener('keydown', this.keydownHandler);

    // Drag handling on overlay root (delegation)
    this.overlayRoot.addEventListener('pointerdown', (e) => this.onPointerDown(e));
    document.addEventListener('pointermove', this.pointerMoveHandler);
    document.addEventListener('pointerup', this.pointerUpHandler);
  }

  private toggle(): void {
    this.active = !this.active;
    this.toggleBtn.classList.toggle('active', this.active);
    this.panel.classList.toggle('open', this.active);
    this.overlayRoot.classList.toggle('active', this.active);

    if (this.active) {
      this.buildZoneHandles();
      // Force an initial transform update
      const root = this.world.root;
      this.updateTransform(root.x, root.y, root.scale.x);
    } else {
      this.removeZoneHandles();
    }
  }

  // ─── Drag / resize logic ─────────────────────────────────

  private onPointerDown(e: PointerEvent): void {
    const target = e.target as HTMLElement;

    // Check if a resize handle was clicked
    if (target.classList.contains('zone-resize-handle')) {
      const parent = target.parentElement!;
      const zoneId = parent.dataset.zone as ZoneId;
      const corner = target.dataset.corner as 'tl' | 'tr' | 'bl' | 'br';
      this.startDrag(e, zoneId, `resize-${corner}` as typeof this.dragType);
      return;
    }

    // Check if a zone handle (move) was clicked
    const handle = target.closest('.zone-drag-handle') as HTMLElement | null;
    if (handle) {
      const zoneId = handle.dataset.zone as ZoneId;
      this.startDrag(e, zoneId, 'move');
    }
  }

  private startDrag(e: PointerEvent, zoneId: ZoneId, type: typeof this.dragType): void {
    e.preventDefault();
    e.stopPropagation();

    this.dragZone = zoneId;
    this.dragType = type;
    this.dragStartMouse = { x: e.clientX, y: e.clientY };

    const rect = this.layout.get(zoneId)!;
    this.dragStartRect = { x: rect.x, y: rect.y, w: rect.width, h: rect.height };

    // Push undo snapshot before modification
    this.pushUndo();

    // Add dragging class for ghost effect
    const handle = this.handles.get(zoneId);
    if (handle) handle.classList.add('dragging');
  }

  private onPointerMove(e: PointerEvent): void {
    if (!this.dragZone || !this.dragType) return;

    const root = this.world.root;
    const scale = root.scale.x;

    // Convert mouse delta to world coords
    const dxScreen = e.clientX - this.dragStartMouse.x;
    const dyScreen = e.clientY - this.dragStartMouse.y;
    const dxWorld = dxScreen / scale;
    const dyWorld = dyScreen / scale;

    const rect = this.layout.get(this.dragZone)!;
    const orig = this.dragStartRect;

    if (this.dragType === 'move') {
      rect.x = Math.round(orig.x + dxWorld);
      rect.y = Math.round(orig.y + dyWorld);
    } else if (this.dragType === 'resize-br') {
      rect.width = Math.max(MIN_SIZE, Math.round(orig.w + dxWorld));
      rect.height = Math.max(MIN_SIZE, Math.round(orig.h + dyWorld));
    } else if (this.dragType === 'resize-bl') {
      const newW = Math.max(MIN_SIZE, Math.round(orig.w - dxWorld));
      rect.x = Math.round(orig.x + orig.w - newW);
      rect.width = newW;
      rect.height = Math.max(MIN_SIZE, Math.round(orig.h + dyWorld));
    } else if (this.dragType === 'resize-tr') {
      rect.width = Math.max(MIN_SIZE, Math.round(orig.w + dxWorld));
      const newH = Math.max(MIN_SIZE, Math.round(orig.h - dyWorld));
      rect.y = Math.round(orig.y + orig.h - newH);
      rect.height = newH;
    } else if (this.dragType === 'resize-tl') {
      const newW = Math.max(MIN_SIZE, Math.round(orig.w - dxWorld));
      const newH = Math.max(MIN_SIZE, Math.round(orig.h - dyWorld));
      rect.x = Math.round(orig.x + orig.w - newW);
      rect.y = Math.round(orig.y + orig.h - newH);
      rect.width = newW;
      rect.height = newH;
    }

    // Update size label
    this.updateSizeLabel(this.dragZone);

    // Live-update Pixi
    this.applyToZoneMap();
    this.world.rebuildZones();
  }

  private onPointerUp(): void {
    if (!this.dragZone) return;

    const handle = this.handles.get(this.dragZone);
    if (handle) handle.classList.remove('dragging');

    this.dragZone = null;
    this.dragType = null;

    // Auto-save after each drag
    this.saveLayout();
  }

  // ─── Button handlers ─────────────────────────────────────

  private onSave(): void {
    this.saveLayout();
    // Brief visual feedback
    const btn = this.panel.querySelector('#le-save') as HTMLButtonElement;
    btn.textContent = 'Saved!';
    setTimeout(() => { btn.textContent = 'Save'; }, 1200);
  }

  private onReset(): void {
    this.pushUndo();
    // Reset to the original hardcoded defaults captured at module load
    for (const [id, defaults] of DEFAULT_LAYOUTS) {
      this.layout.set(id, { ...defaults });
    }
    localStorage.removeItem(STORAGE_KEY);
    this.applyToZoneMap();
    this.world.rebuildZones();

    // Rebuild handles to match new positions
    if (this.active) {
      this.buildZoneHandles();
      const root = this.world.root;
      this.updateTransform(root.x, root.y, root.scale.x);
    }
  }

  private onExport(): void {
    const obj: ExportedLayout = { version: 1, zones: {} as Record<string, ZoneLayout> };
    for (const [id, rect] of this.layout) {
      obj.zones[id] = { ...rect };
    }
    const blob = new Blob([JSON.stringify(obj, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'agent-move-layout.json';
    a.click();
    URL.revokeObjectURL(url);
  }

  private onImport(e: Event): void {
    const input = e.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed: ExportedLayout = JSON.parse(reader.result as string);
        if (parsed.version !== 1 || !parsed.zones) {
          alert('Invalid layout file format.');
          return;
        }

        this.pushUndo();

        for (const [id, rect] of Object.entries(parsed.zones)) {
          if (this.layout.has(id as ZoneId)) {
            this.layout.set(id as ZoneId, {
              x: rect.x,
              y: rect.y,
              width: Math.max(MIN_SIZE, rect.width),
              height: Math.max(MIN_SIZE, rect.height),
            });
          }
        }

        this.applyToZoneMap();
        this.saveLayout();
        this.world.rebuildZones();

        if (this.active) {
          this.buildZoneHandles();
          const root = this.world.root;
          this.updateTransform(root.x, root.y, root.scale.x);
        }
      } catch {
        alert('Failed to parse layout file.');
      }
    };
    reader.readAsText(file);

    // Reset input so the same file can be re-imported
    input.value = '';
  }

  private updateButtonStates(): void {
    const undoBtn = this.panel.querySelector('#le-undo') as HTMLButtonElement;
    const redoBtn = this.panel.querySelector('#le-redo') as HTMLButtonElement;
    if (undoBtn) undoBtn.disabled = this.undoStack.length === 0;
    if (redoBtn) redoBtn.disabled = this.redoStack.length === 0;
  }
}
