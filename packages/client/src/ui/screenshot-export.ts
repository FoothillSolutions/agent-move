import type { Application } from 'pixi.js';
import type { WorldManager } from '../world/world-manager.js';

/**
 * Screenshot Export — captures the Pixi canvas as a PNG image.
 * Supports viewport (current view) and full-world (all 9 zones) capture modes.
 * Shows a preview modal with Download / Copy to Clipboard actions.
 */

type CaptureMode = 'viewport' | 'full-world';

export class ScreenshotExport {
  private el: HTMLElement;
  private isOpen = false;
  private currentBlob: Blob | null = null;
  private currentMode: CaptureMode = 'viewport';
  private app: Application;
  private world: WorldManager;

  constructor(app: Application, world: WorldManager) {
    this.app = app;
    this.world = world;

    this.el = document.createElement('div');
    this.el.id = 'screenshot-export';

    // Build DOM structure safely using static template
    // Note: all content here is hardcoded — no user input is interpolated
    this.el.innerHTML = [
      '<div class="sse-backdrop"></div>',
      '<div class="sse-modal">',
      '  <div class="sse-header">',
      '    <span class="sse-title">Screenshot Export</span>',
      '    <div class="sse-mode-toggle">',
      '      <button class="sse-mode-btn active" data-mode="viewport">Viewport</button>',
      '      <button class="sse-mode-btn" data-mode="full-world">Full World</button>',
      '    </div>',
      '    <button class="sse-close">&times;</button>',
      '  </div>',
      '  <div class="sse-body">',
      '    <div class="sse-preview">',
      '      <img class="sse-preview-img" alt="Screenshot preview" />',
      '      <div class="sse-loading">Capturing...</div>',
      '    </div>',
      '  </div>',
      '  <div class="sse-footer">',
      '    <button class="sse-copy-btn">Copy to Clipboard</button>',
      '    <button class="sse-download-btn">Download PNG</button>',
      '  </div>',
      '</div>',
    ].join('\n');

    document.body.appendChild(this.el);

    // Event listeners
    this.el.querySelector('.sse-backdrop')!.addEventListener('click', () => this.close());
    this.el.querySelector('.sse-close')!.addEventListener('click', () => this.close());
    this.el.querySelector('.sse-copy-btn')!.addEventListener('click', () => this.copyToClipboard());
    this.el.querySelector('.sse-download-btn')!.addEventListener('click', () => this.download());

    // Mode toggle buttons
    this.el.querySelectorAll('.sse-mode-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        const mode = (btn as HTMLElement).dataset.mode as CaptureMode;
        if (mode !== this.currentMode) {
          this.currentMode = mode;
          this.updateModeButtons();
          this.capture();
        }
      });
    });
  }

  toggle(): void {
    if (this.isOpen) this.close();
    else this.open();
  }

  open(): void {
    this.isOpen = true;
    this.currentMode = 'viewport';
    this.updateModeButtons();
    this.el.classList.add('open');
    this.capture();
  }

  close(): void {
    this.isOpen = false;
    this.el.classList.remove('open');
    this.currentBlob = null;
    // Clear preview
    const img = this.el.querySelector('.sse-preview-img') as HTMLImageElement;
    img.src = '';
  }

  private updateModeButtons(): void {
    this.el.querySelectorAll('.sse-mode-btn').forEach((btn) => {
      btn.classList.toggle('active', (btn as HTMLElement).dataset.mode === this.currentMode);
    });
  }

  private async capture(): Promise<void> {
    const img = this.el.querySelector('.sse-preview-img') as HTMLImageElement;
    const loading = this.el.querySelector('.sse-loading') as HTMLElement;

    // Show loading state
    img.style.display = 'none';
    loading.style.display = 'flex';

    try {
      if (this.currentMode === 'full-world') {
        await this.captureFullWorld();
      } else {
        await this.captureViewport();
      }

      // Show preview
      if (this.currentBlob) {
        const url = URL.createObjectURL(this.currentBlob);
        img.onload = () => URL.revokeObjectURL(url);
        img.src = url;
        img.style.display = 'block';
      }
    } catch (err) {
      console.error('Screenshot capture failed:', err);
    } finally {
      loading.style.display = 'none';
    }
  }

  private captureViewport(): Promise<void> {
    return new Promise((resolve) => {
      const canvas = this.app.canvas as HTMLCanvasElement;
      canvas.toBlob((blob) => {
        this.currentBlob = blob;
        resolve();
      }, 'image/png');
    });
  }

  private async captureFullWorld(): Promise<void> {
    const camera = this.world.camera;
    const root = this.world.root;

    // Save current camera state
    const savedZoom = camera.getZoom();
    const savedX = root.position.x;
    const savedY = root.position.y;

    // Temporarily fit the entire world into view
    camera.resetView(this.world.worldWidth, this.world.worldHeight);

    // Wait a frame for the render to update
    await new Promise<void>((resolve) => {
      requestAnimationFrame(() => {
        // Force a render
        this.app.render();
        resolve();
      });
    });

    // Capture the canvas
    await this.captureViewport();

    // Restore camera state
    camera.setZoom(savedZoom);
    root.position.set(savedX, savedY);
  }

  private async copyToClipboard(): Promise<void> {
    if (!this.currentBlob) return;

    const btn = this.el.querySelector('.sse-copy-btn') as HTMLButtonElement;
    try {
      await navigator.clipboard.write([
        new ClipboardItem({ 'image/png': this.currentBlob }),
      ]);
      btn.textContent = 'Copied!';
      setTimeout(() => { btn.textContent = 'Copy to Clipboard'; }, 2000);
    } catch {
      // Fallback: open the image in a new tab
      const url = URL.createObjectURL(this.currentBlob);
      window.open(url, '_blank');
      setTimeout(() => URL.revokeObjectURL(url), 10000);
      btn.textContent = 'Opened in new tab';
      setTimeout(() => { btn.textContent = 'Copy to Clipboard'; }, 2000);
    }
  }

  private download(): void {
    if (!this.currentBlob) return;

    const url = URL.createObjectURL(this.currentBlob);
    const a = document.createElement('a');
    a.href = url;
    const timestamp = new Date().toISOString().slice(0, 19).replace(/:/g, '-');
    const suffix = this.currentMode === 'full-world' ? '-full' : '';
    a.download = `agent-move-screenshot${suffix}-${timestamp}.png`;
    a.click();
    URL.revokeObjectURL(url);

    const btn = this.el.querySelector('.sse-download-btn') as HTMLButtonElement;
    btn.textContent = 'Downloaded!';
    setTimeout(() => { btn.textContent = 'Download PNG'; }, 2000);
  }

  dispose(): void {
    this.el.remove();
  }
}
