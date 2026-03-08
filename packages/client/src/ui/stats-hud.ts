import type { AgentState } from '@agent-move/shared';
import { computeAgentCost } from '@agent-move/shared';
import type { StateStore } from '../connection/state-store.js';
import { formatTokens } from '../utils/formatting.js';

/**
 * Persistent Stats HUD — compact always-visible bar showing key session metrics.
 * Positioned at the top-left of the viewport, above the Pixi canvas.
 */

interface TokenSample {
  timestamp: number;
  total: number;
}

const VELOCITY_WINDOW = 60_000; // 1 minute
const SAMPLE_INTERVAL = 2_000;

export class StatsHud {
  private el: HTMLElement;
  private store: StateStore;
  private refreshTimer: ReturnType<typeof setInterval>;
  private sampleTimer: ReturnType<typeof setInterval>;
  private samples: TokenSample[] = [];

  constructor(store: StateStore) {
    this.store = store;

    this.el = document.createElement('div');
    this.el.id = 'stats-hud';
    this.el.setAttribute('aria-live', 'polite');
    this.el.innerHTML = `
      <span class="hud-item" id="hud-active"><span class="hud-dot active"></span><span class="hud-val">0</span> active</span>
      <span class="hud-sep"></span>
      <span class="hud-item" id="hud-idle"><span class="hud-dot idle"></span><span class="hud-val">0</span> idle</span>
      <span class="hud-sep"></span>
      <span class="hud-item" id="hud-cost"><span class="hud-icon">$</span><span class="hud-val">0.0000</span></span>
      <span class="hud-sep"></span>
      <span class="hud-item" id="hud-velocity"><span class="hud-icon hud-bolt">&#9889;</span><span class="hud-val">0</span><span class="hud-unit">/min</span></span>
    `;
    document.body.appendChild(this.el);

    // Update every second
    this.refreshTimer = setInterval(() => this.update(), 1000);

    // Sample token velocity
    this.sampleTimer = setInterval(() => this.takeSample(), SAMPLE_INTERVAL);
  }

  private takeSample(): void {
    const agents = Array.from(this.store.getAgents().values());
    let total = 0;
    for (const a of agents) {
      total += a.totalInputTokens + a.totalOutputTokens + a.cacheReadTokens + a.cacheCreationTokens;
    }
    this.samples.push({ timestamp: Date.now(), total });
    if (this.samples.length > 90) this.samples.shift(); // 3 min
  }

  private getVelocity(): number {
    if (this.samples.length < 2) return 0;
    const now = Date.now();
    const cutoff = now - VELOCITY_WINDOW;
    const recent = this.samples.filter(s => s.timestamp >= cutoff);
    if (recent.length < 2) return 0;
    const first = recent[0];
    const last = recent[recent.length - 1];
    const elapsed = (last.timestamp - first.timestamp) / 60_000;
    if (elapsed < 0.01) return 0;
    return (last.total - first.total) / elapsed;
  }

  private update(): void {
    const agents = Array.from(this.store.getAgents().values());
    const active = agents.filter(a => !a.isIdle && !a.isDone).length;
    const idle = agents.filter(a => a.isIdle && !a.isDone).length;
    const done = agents.filter(a => a.isDone).length;

    // Cost
    let totalCost = 0;
    for (const a of agents) {
      totalCost += computeAgentCost(a);
    }

    // Velocity
    const velocity = this.getVelocity();

    // Update DOM
    const setVal = (id: string, text: string) => {
      const val = this.el.querySelector(`#${id} .hud-val`);
      if (val) val.textContent = text;
    };

    setVal('hud-active', String(active));
    setVal('hud-idle', String(idle + done));
    setVal('hud-cost', totalCost < 0.01 ? totalCost.toFixed(4) : totalCost.toFixed(2));
    setVal('hud-velocity', formatTokens(Math.round(velocity)));

    // Highlight active dot based on count
    const activeDot = this.el.querySelector('#hud-active .hud-dot') as HTMLElement;
    if (activeDot) {
      activeDot.classList.toggle('pulse', active > 0);
    }
  }

  dispose(): void {
    clearInterval(this.refreshTimer);
    clearInterval(this.sampleTimer);
    this.el.remove();
  }
}
