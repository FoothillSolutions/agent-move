import type { Application, Container } from 'pixi.js';

const MIN_ZOOM = 0.5;
const MAX_ZOOM = 3.0;
const ZOOM_SPEED = 0.001;

/**
 * Pan/zoom controls for the world container.
 * - Mouse wheel to zoom (0.5x to 3x)
 * - Click and drag to pan
 */
export class Camera {
  private zoom = 1;
  private dragging = false;
  private lastMouse = { x: 0, y: 0 };

  constructor(
    private app: Application,
    private world: Container,
  ) {
    const canvas = app.canvas;

    canvas.addEventListener('wheel', this.onWheel, { passive: false });
    canvas.addEventListener('pointerdown', this.onPointerDown);
    canvas.addEventListener('pointermove', this.onPointerMove);
    canvas.addEventListener('pointerup', this.onPointerUp);
    canvas.addEventListener('pointerleave', this.onPointerUp);
  }

  private onWheel = (e: WheelEvent): void => {
    e.preventDefault();

    const oldZoom = this.zoom;
    this.zoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, this.zoom - e.deltaY * ZOOM_SPEED));

    // Zoom towards cursor position
    const rect = this.app.canvas.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;

    const zoomRatio = this.zoom / oldZoom;
    this.world.position.x = mouseX - (mouseX - this.world.position.x) * zoomRatio;
    this.world.position.y = mouseY - (mouseY - this.world.position.y) * zoomRatio;

    this.world.scale.set(this.zoom);
  };

  private onPointerDown = (e: PointerEvent): void => {
    // Only pan with left click or middle click
    if (e.button !== 0 && e.button !== 1) return;
    this.dragging = true;
    this.lastMouse.x = e.clientX;
    this.lastMouse.y = e.clientY;
  };

  private onPointerMove = (e: PointerEvent): void => {
    if (!this.dragging) return;
    const dx = e.clientX - this.lastMouse.x;
    const dy = e.clientY - this.lastMouse.y;
    this.world.position.x += dx;
    this.world.position.y += dy;
    this.lastMouse.x = e.clientX;
    this.lastMouse.y = e.clientY;
  };

  private onPointerUp = (): void => {
    this.dragging = false;
  };

  /** Programmatically set zoom level */
  setZoom(z: number): void {
    this.zoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, z));
    this.world.scale.set(this.zoom);
  }

  /** Get current zoom */
  getZoom(): number {
    return this.zoom;
  }

  destroy(): void {
    const canvas = this.app.canvas;
    canvas.removeEventListener('wheel', this.onWheel);
    canvas.removeEventListener('pointerdown', this.onPointerDown);
    canvas.removeEventListener('pointermove', this.onPointerMove);
    canvas.removeEventListener('pointerup', this.onPointerUp);
    canvas.removeEventListener('pointerleave', this.onPointerUp);
  }
}
