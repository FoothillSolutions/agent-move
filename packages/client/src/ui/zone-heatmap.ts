import type { ZoneId } from '@agent-move/shared';
import { ZONES } from '@agent-move/shared';
import type { StateStore } from '../connection/state-store.js';

/**
 * Feature 1: Activity Heatmap
 * Tracks per-zone activity frequency over a rolling window
 * and renders a heat overlay on each zone showing intensity.
 * Cold (blue) → Warm (orange) → Hot (red) with animated pulse.
 */

interface ZoneHeat {
  /** Rolling event counts (one per second, last 300 seconds = 5 min) */
  buckets: number[];
  /** Current smoothed heat value 0..1 */
  heat: number;
  /** Current pulse phase (radians) */
  pulsePhase: number;
  /** Canvas overlay element for this zone */
  overlay: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
}

const BUCKET_COUNT = 300; // 5 minutes of 1-second buckets
const HEAT_SMOOTHING = 2; // speed of heat transition
const PULSE_SPEED = 3; // radians/sec for pulse animation
const MAX_EVENTS_PER_BUCKET = 8; // normalize heat to this

export class ZoneHeatmap {
  private zones = new Map<ZoneId, ZoneHeat>();
  private container: HTMLElement;
  private currentBucketIndex = 0;
  private bucketTimer: ReturnType<typeof setInterval>;
  private animFrame: number | null = null;
  private lastFrameTime = 0;

  constructor(private store: StateStore) {
    // Create heatmap overlay container
    this.container = document.createElement('div');
    this.container.id = 'zone-heatmap';
    this.container.style.cssText = `
      position: absolute;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      pointer-events: none;
      z-index: 5;
    `;
    document.getElementById('app')!.appendChild(this.container);

    // Create overlay canvas for each zone
    for (const zone of ZONES) {
      const canvas = document.createElement('canvas');
      canvas.style.cssText = `
        position: absolute;
        pointer-events: none;
        border-radius: 4px;
      `;
      this.container.appendChild(canvas);

      const ctx = canvas.getContext('2d')!;
      this.zones.set(zone.id, {
        buckets: new Array(BUCKET_COUNT).fill(0),
        heat: 0,
        pulsePhase: Math.random() * Math.PI * 2,
        overlay: canvas,
        ctx,
      });
    }

    // Listen for agent activity events
    this.store.on('agent:update', (agent) => {
      const zh = this.zones.get(agent.currentZone);
      if (zh) {
        zh.buckets[this.currentBucketIndex]++;
      }
    });

    // Rotate bucket every second
    this.bucketTimer = setInterval(() => {
      this.currentBucketIndex = (this.currentBucketIndex + 1) % BUCKET_COUNT;
      for (const zh of this.zones.values()) {
        zh.buckets[this.currentBucketIndex] = 0;
      }
    }, 1000);

    // Start render loop
    this.lastFrameTime = performance.now();
    this.animate();
  }

  /** Call this when the Pixi camera transform changes */
  updateTransform(offsetX: number, offsetY: number, scale: number): void {
    for (const zone of ZONES) {
      const zh = this.zones.get(zone.id);
      if (!zh) continue;

      const x = zone.x * scale + offsetX;
      const y = zone.y * scale + offsetY;
      const w = zone.width * scale;
      const h = zone.height * scale;

      zh.overlay.style.left = `${x}px`;
      zh.overlay.style.top = `${y}px`;
      zh.overlay.style.width = `${w}px`;
      zh.overlay.style.height = `${h}px`;
      zh.overlay.width = Math.ceil(w);
      zh.overlay.height = Math.ceil(h);
    }
  }

  private animate = (): void => {
    const now = performance.now();
    const dt = (now - this.lastFrameTime) / 1000;
    this.lastFrameTime = now;

    for (const [zoneId, zh] of this.zones) {
      // Calculate total events in the rolling window
      let total = 0;
      for (let i = 0; i < BUCKET_COUNT; i++) {
        // Weight recent events higher (exponential decay)
        const age = ((this.currentBucketIndex - i + BUCKET_COUNT) % BUCKET_COUNT);
        const weight = Math.exp(-age / 60); // ~1min half-life
        total += zh.buckets[i] * weight;
      }

      // Normalize to 0..1
      const targetHeat = Math.min(1, total / (MAX_EVENTS_PER_BUCKET * 15));

      // Smooth transition
      zh.heat += (targetHeat - zh.heat) * Math.min(1, HEAT_SMOOTHING * dt);

      // Update pulse
      zh.pulsePhase += PULSE_SPEED * dt * (0.5 + zh.heat * 0.5);

      // Render heat overlay
      this.renderZoneHeat(zh, zoneId);
    }

    this.animFrame = requestAnimationFrame(this.animate);
  };

  private renderZoneHeat(zh: ZoneHeat, _zoneId: ZoneId): void {
    const { ctx, overlay } = zh;
    const w = overlay.width;
    const h = overlay.height;

    if (w === 0 || h === 0) return;

    ctx.clearRect(0, 0, w, h);

    if (zh.heat < 0.01) return;

    // Pulse amplitude
    const pulse = Math.sin(zh.pulsePhase) * 0.15 + 0.85;
    const alpha = zh.heat * 0.18 * pulse;

    // Heat gradient: blue(cold) → orange(warm) → red(hot)
    const r = Math.floor(lerp(30, 255, zh.heat));
    const g = Math.floor(lerp(60, zh.heat < 0.5 ? lerp(80, 160, zh.heat * 2) : lerp(160, 50, (zh.heat - 0.5) * 2), zh.heat));
    const b = Math.floor(lerp(180, 20, zh.heat));

    // Radial gradient from center
    const cx = w / 2;
    const cy = h / 2;
    const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, Math.max(w, h) * 0.7);
    grad.addColorStop(0, `rgba(${r},${g},${b},${alpha})`);
    grad.addColorStop(0.6, `rgba(${r},${g},${b},${alpha * 0.5})`);
    grad.addColorStop(1, `rgba(${r},${g},${b},0)`);

    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, w, h);

    // Add edge glow for hot zones
    if (zh.heat > 0.3) {
      const edgeAlpha = (zh.heat - 0.3) * 0.4 * pulse;
      ctx.strokeStyle = `rgba(${r},${g},${b},${edgeAlpha})`;
      ctx.lineWidth = 2 + zh.heat * 3;
      ctx.strokeRect(1, 1, w - 2, h - 2);
    }
  }

  dispose(): void {
    clearInterval(this.bucketTimer);
    if (this.animFrame) cancelAnimationFrame(this.animFrame);
    this.container.remove();
  }
}

function clamp(v: number, min: number, max: number): number {
  return Math.min(Math.max(v, min), max);
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * clamp(t, 0, 1);
}
