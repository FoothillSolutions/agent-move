import type { Application } from 'pixi.js';
import type { WorldManager } from '../world/world-manager.js';

/**
 * Canvas Screenshot Export — captures the full world view (all 9 zones)
 * as a PNG and triggers an immediate download.
 *
 * Uses Pixi v8's renderer.extract API to render world.root to a canvas,
 * temporarily hiding the day/night overlay for clarity.
 */
export class CanvasExport {
  private app: Application;
  private world: WorldManager;
  private btn: HTMLButtonElement | null = null;
  private capturing = false;

  constructor(app: Application, world: WorldManager) {
    this.app = app;
    this.world = world;

    this.btn = document.getElementById('screenshot-btn') as HTMLButtonElement | null;
    if (this.btn) {
      this.btn.addEventListener('click', () => this.export());
    }
  }

  /** Capture the world and trigger a PNG download */
  async export(): Promise<void> {
    if (this.capturing || !this.btn) return;

    this.capturing = true;
    this.btn.disabled = true;

    try {
      // Hide day/night overlay so screenshot is clear
      const overlay = this.world.dayNight.overlay;
      const wasVisible = overlay.visible;
      overlay.visible = false;

      // Save current root transform and temporarily reset it
      // so we capture the full world regardless of camera position
      const root = this.world.root;
      const savedX = root.x;
      const savedY = root.y;
      const savedScaleX = root.scale.x;
      const savedScaleY = root.scale.y;

      root.x = 0;
      root.y = 0;
      root.scale.set(1);

      // Extract world.root to an offscreen canvas
      const canvas = await (this.app.renderer as any).extract.canvas(root);

      // Restore root transform
      root.x = savedX;
      root.y = savedY;
      root.scale.set(savedScaleX, savedScaleY);

      // Restore overlay visibility
      overlay.visible = wasVisible;

      // Convert canvas to PNG blob and download
      await this.download(canvas);
    } catch (err) {
      console.error('Screenshot capture failed:', err);
    } finally {
      this.capturing = false;
      if (this.btn) this.btn.disabled = false;
    }
  }

  /** Convert canvas to blob and trigger download */
  private download(canvas: HTMLCanvasElement): Promise<void> {
    return new Promise<void>((resolve) => {
      canvas.toBlob((blob) => {
        if (!blob) {
          resolve();
          return;
        }

        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `agent-move-screenshot-${new Date().toISOString().slice(0, 19).replace(/:/g, '-')}.png`;
        a.click();
        URL.revokeObjectURL(url);
        resolve();
      }, 'image/png');
    });
  }

  dispose(): void {
    // Button is part of static HTML, no dynamic cleanup needed
    this.btn = null;
  }
}
