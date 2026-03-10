import { Application, Container } from 'pixi.js';
import { ZONE_MAP } from '@agent-move/shared';
import type { ZoneId, ZoneConfig } from '@agent-move/shared';
import { createGrid } from './grid.js';
import { ZoneRenderer } from './zone-renderer.js';
import { Camera } from './camera.js';
import { LayoutEngine } from './layout-engine.js';
import { DayNightCycle } from '../effects/day-night-cycle.js';
import { FlowLines } from '../effects/flow-lines.js';
import type { Theme } from './themes/theme-types.js';

/**
 * Layered scene management.
 * Containers ordered: grid -> zones -> agents -> effects -> ui
 */
export class WorldManager {
  public readonly root = new Container();
  public readonly gridLayer = new Container();
  public readonly zoneLayer: Container;
  public readonly agentLayer = new Container();
  public readonly effectLayer = new Container();
  public readonly uiLayer = new Container();

  public readonly zoneRenderer: ZoneRenderer;
  public readonly camera: Camera;
  public readonly dayNight: DayNightCycle;
  public readonly flowLines: FlowLines;
  private layoutEngine: LayoutEngine;
  private app: Application;
  private _worldWidth = 1100;
  private _worldHeight = 980;
  private gridGraphics: import('pixi.js').Graphics;
  private resizeHandler: () => void;
  private resizeRaf = 0;
  private resizeObserver: ResizeObserver | null = null;

  constructor(app: Application) {
    this.app = app;
    this.layoutEngine = new LayoutEngine();

    // Compute initial layout based on viewport
    const screenW = app.screen.width;
    const screenH = app.screen.height;
    const { worldWidth, worldHeight } = this.layoutEngine.computeLayout(screenW, screenH);
    this._worldWidth = worldWidth;
    this._worldHeight = worldHeight;

    // Build grid background
    this.gridGraphics = createGrid(worldWidth, worldHeight);
    this.gridLayer.addChild(this.gridGraphics);

    // Build zones (they read from mutated ZONES array)
    this.zoneRenderer = new ZoneRenderer();
    this.zoneLayer = this.zoneRenderer.container;

    // Flow lines between zones
    this.flowLines = new FlowLines();

    // Assemble layers in order
    this.root.addChild(this.gridLayer);
    this.root.addChild(this.zoneLayer);
    this.root.addChild(this.flowLines.container);
    this.root.addChild(this.agentLayer);
    this.root.addChild(this.effectLayer);
    this.root.addChild(this.uiLayer);

    // Day/night overlay (topmost, click-through)
    this.dayNight = new DayNightCycle(worldWidth, worldHeight);
    this.root.addChild(this.dayNight.overlay);

    // Add root to stage
    app.stage.addChild(this.root);

    // Set up camera
    this.camera = new Camera(app, this.root);

    // Auto-fit to viewport
    this.camera.resetView(worldWidth, worldHeight);

    // Listen for resize — defer to next frame so Pixi's resizeTo has updated app.screen
    this.resizeHandler = () => {
      cancelAnimationFrame(this.resizeRaf);
      this.resizeRaf = requestAnimationFrame(() => this.onResize());
    };
    window.addEventListener('resize', this.resizeHandler);

    // Also observe container resizes (e.g. sidebar collapse/expand)
    const container = document.getElementById('canvas-container');
    if (container) {
      let resizeTimeout = 0;
      this.resizeObserver = new ResizeObserver(() => {
        // Debounce to catch final size after CSS transitions
        clearTimeout(resizeTimeout);
        resizeTimeout = window.setTimeout(() => {
          // Force Pixi to resize its canvas to match the container
          app.resize();
          this.onResize();
        }, 250);
      });
      this.resizeObserver.observe(container);
    }
  }

  private onResize(): void {
    const screenW = this.app.screen.width;
    const screenH = this.app.screen.height;
    const { worldWidth, worldHeight } = this.layoutEngine.computeLayout(screenW, screenH);

    if (worldWidth !== this._worldWidth || worldHeight !== this._worldHeight) {
      this._worldWidth = worldWidth;
      this._worldHeight = worldHeight;

      // Rebuild grid background
      this.gridLayer.removeChildren();
      this.gridGraphics.destroy();
      this.gridGraphics = createGrid(worldWidth, worldHeight);
      this.gridLayer.addChild(this.gridGraphics);

      // Rebuild zone visuals from mutated ZONES array
      this.zoneRenderer.rebuild();

      // Resize day/night overlay
      this.dayNight.overlay.clear();
      this.dayNight.overlay.rect(0, 0, worldWidth, worldHeight).fill({ color: 0x1a1a4a, alpha: 1 });
    }

    // Always re-fit camera to new viewport size
    this.camera.resetView(this._worldWidth, this._worldHeight);
  }

  /** Reset camera to fit all rooms */
  resetCamera(): void {
    this.camera.resetView(this._worldWidth, this._worldHeight);
  }

  /** Add an agent to the agent layer (accepts object with .container or a Container directly) */
  addAgent(child: Container | { container: Container }): void {
    const c = child instanceof Container ? child : child.container;
    this.agentLayer.addChild(c);
  }

  /** Remove an agent from the agent layer */
  removeAgent(child: Container | { container: Container }): void {
    const c = child instanceof Container ? child : child.container;
    this.agentLayer.removeChild(c);
  }

  /** Add effect display object */
  addEffect(child: Container): void {
    this.effectLayer.addChild(child);
  }

  /** Remove effect display object */
  removeEffect(child: Container): void {
    this.effectLayer.removeChild(child);
  }

  /** Get the center position of a zone (world coordinates) */
  getZoneCenter(zoneId: ZoneId): { x: number; y: number } {
    const zone = ZONE_MAP.get(zoneId);
    if (!zone) {
      return { x: this._worldWidth / 2, y: this._worldHeight / 2 };
    }
    return {
      x: zone.x + zone.width / 2,
      y: zone.y + zone.height / 2,
    };
  }

  /** Get zone config by id */
  getZoneConfig(zoneId: ZoneId): ZoneConfig | undefined {
    return ZONE_MAP.get(zoneId);
  }

  /** Update zone glow counts */
  setZoneAgentCount(zoneId: ZoneId, count: number): void {
    this.zoneRenderer.setAgentCount(zoneId, count);
  }

  /** Rebuild all zone visuals from current ZONE_MAP data (used by layout editor) */
  rebuildZones(): void {
    this.zoneRenderer.rebuild();
  }

  /** Apply a theme's decorators and background color */
  applyTheme(theme: Theme): void {
    this.zoneRenderer.setThemeDecorators(theme.decorators);
    this.app.renderer.background.color = theme.colors.background;
    // Rebuild grid so the outdoor scenery uses the correct zone positions
    this.gridLayer.removeChildren();
    this.gridGraphics.destroy();
    this.gridGraphics = createGrid(this._worldWidth, this._worldHeight);
    this.gridLayer.addChild(this.gridGraphics);
  }

  /** Per-frame update */
  update(dt: number): void {
    this.zoneRenderer.update(dt);
    this.dayNight.update(dt);
    this.flowLines.update(dt);
  }

  get worldWidth(): number { return this._worldWidth; }
  get worldHeight(): number { return this._worldHeight; }

  destroy(): void {
    window.removeEventListener('resize', this.resizeHandler);
    this.resizeObserver?.disconnect();
  }
}
