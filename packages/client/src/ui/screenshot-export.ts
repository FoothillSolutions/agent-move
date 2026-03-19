/**
 * Screenshot Export — captures the Pixi.js canvas as a PNG image
 * and triggers a direct download with a timestamped filename.
 */

export class ScreenshotExport {
  private canvas: HTMLCanvasElement;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
  }

  /**
   * Capture the current canvas contents and download as a PNG file.
   */
  capture(): void {
    try {
      const dataUrl = this.canvas.toDataURL('image/png');
      const timestamp = new Date()
        .toISOString()
        .slice(0, 19)
        .replace(/:/g, '-');
      const filename = `agent-move-screenshot-${timestamp}.png`;

      const a = document.createElement('a');
      a.href = dataUrl;
      a.download = filename;
      a.click();
    } catch (err) {
      console.error('Screenshot capture failed:', err);
    }
  }
}
