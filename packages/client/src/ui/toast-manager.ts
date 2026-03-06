import type { AgentState, AnomalyEvent } from '@agent-move/shared';
import { AGENT_PALETTES } from '@agent-move/shared';
import type { StateStore } from '../connection/state-store.js';
import { hexToCss, escapeHtml } from '../utils/formatting.js';

/**
 * Toast Notification Manager — shows transient pop-up notifications
 * for key agent lifecycle events: spawn, shutdown, idle, done.
 */

interface ToastEntry {
  el: HTMLElement;
  timer: ReturnType<typeof setTimeout>;
}

const TOAST_DURATION = 4500; // ms
const MAX_TOASTS = 5;

export class ToastManager {
  private containerEl: HTMLElement;
  private store: StateStore;
  private toasts: ToastEntry[] = [];
  private onSpawnBound: (agent: AgentState) => void;
  private onIdleBound: (agent: AgentState) => void;
  private onShutdownBound: (agentId: string) => void;
  private onAnomalyBound: (anomaly: AnomalyEvent) => void;
  private onTaskBound: (data: { taskSubject: string }) => void;

  constructor(store: StateStore) {
    this.store = store;

    // Container anchored at bottom-left
    this.containerEl = document.createElement('div');
    this.containerEl.id = 'toast-container';
    this.containerEl.setAttribute('aria-live', 'polite');
    document.body.appendChild(this.containerEl);

    // Listen for events
    this.onSpawnBound = (agent) => this.onSpawn(agent);
    this.onIdleBound = (agent) => this.onIdle(agent);
    this.onShutdownBound = (agentId) => this.onShutdown(agentId);
    this.onAnomalyBound = (anomaly) => this.onAnomaly(anomaly);
    this.onTaskBound = ({ taskSubject }) => this.onTaskCompleted(taskSubject);
    this.store.on('agent:spawn', this.onSpawnBound);
    this.store.on('agent:idle', this.onIdleBound);
    this.store.on('agent:shutdown', this.onShutdownBound);
    this.store.on('anomaly:alert', this.onAnomalyBound);
    this.store.on('task:completed', this.onTaskBound);
  }

  private getName(agent: AgentState): string {
    return agent.agentName || agent.projectName || agent.sessionId.slice(0, 10);
  }

  private getColor(agent: AgentState): string {
    const palette = AGENT_PALETTES[agent.colorIndex % AGENT_PALETTES.length];
    return hexToCss(palette.body);
  }

  private onSpawn(agent: AgentState): void {
    const name = this.getName(agent);
    const color = this.getColor(agent);
    const roleLabel = agent.role === 'main' ? '' : ` (${agent.role})`;
    this.show(`<span class="toast-dot" style="background:${color}"></span> <strong>${escapeHtml(name)}</strong>${roleLabel} spawned`, 'spawn');
  }

  private onIdle(agent: AgentState): void {
    if (agent.isDone) {
      const name = this.getName(agent);
      const color = this.getColor(agent);
      this.show(`<span class="toast-dot" style="background:${color}"></span> <strong>${escapeHtml(name)}</strong> finished`, 'done');
    }
  }

  private onShutdown(agentId: string): void {
    // Agent already removed from store at this point — use minimal info
    this.show(`Agent shut down`, 'shutdown');
  }

  private onTaskCompleted(taskSubject: string): void {
    this.show(`\u2713 Task completed: <strong>${escapeHtml(taskSubject)}</strong>`, 'done');
  }

  private static readonly ANOMALY_ICONS: Record<string, string> = {
    'retry-loop': '\u{1F501}',
    'token-spike': '\u{1F4C8}',
    'stuck-agent': '\u{23F3}',
  };

  private onAnomaly(anomaly: AnomalyEvent): void {
    const icon = ToastManager.ANOMALY_ICONS[anomaly.kind] ?? '\u26A0\uFE0F';
    const type = anomaly.severity === 'critical' ? 'critical' : 'warning';
    this.show(
      `${icon} <strong>${escapeHtml(anomaly.agentName)}</strong>: ${escapeHtml(anomaly.message)}`,
      type
    );
  }

  show(html: string, type: 'spawn' | 'done' | 'shutdown' | 'info' | 'warning' | 'critical' = 'info'): void {
    const el = document.createElement('div');
    el.className = `toast toast-${type}`;
    el.innerHTML = html;

    this.containerEl.appendChild(el);

    // Trigger enter animation
    requestAnimationFrame(() => {
      el.classList.add('toast-enter');
    });

    // Auto-dismiss
    const timer = setTimeout(() => this.dismiss(el), TOAST_DURATION);
    this.toasts.push({ el, timer });

    // Limit visible toasts
    while (this.toasts.length > MAX_TOASTS) {
      const oldest = this.toasts.shift();
      if (oldest) {
        clearTimeout(oldest.timer);
        this.removeEl(oldest.el);
      }
    }
  }

  private dismiss(el: HTMLElement): void {
    el.classList.add('toast-exit');
    el.addEventListener('animationend', () => el.remove(), { once: true });
    // Fallback removal
    setTimeout(() => el.remove(), 400);

    // Remove from tracking
    const idx = this.toasts.findIndex(t => t.el === el);
    if (idx >= 0) this.toasts.splice(idx, 1);
  }

  private removeEl(el: HTMLElement): void {
    el.classList.add('toast-exit');
    el.addEventListener('animationend', () => el.remove(), { once: true });
    setTimeout(() => el.remove(), 400);
  }

  dispose(): void {
    this.store.off('agent:spawn', this.onSpawnBound);
    this.store.off('agent:idle', this.onIdleBound);
    this.store.off('agent:shutdown', this.onShutdownBound);
    this.store.off('anomaly:alert', this.onAnomalyBound);
    this.store.off('task:completed', this.onTaskBound);
    for (const t of this.toasts) {
      clearTimeout(t.timer);
      t.el.remove();
    }
    this.toasts = [];
    this.containerEl.remove();
  }
}
