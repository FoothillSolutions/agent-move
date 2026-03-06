import type { AgentState, AnomalyEvent, PendingPermission } from '@agent-move/shared';
import type { StateStore } from '../connection/state-store.js';

type NotifPriority = 'urgent' | 'high' | 'normal' | 'low';
type NotifKind = 'permission' | 'failure' | 'anomaly' | 'task' | 'lifecycle';

interface Notification {
  id: string;
  kind: NotifKind;
  priority: NotifPriority;
  message: string;
  detail?: string;
  timestamp: number;
}

const MAX_NOTIFICATIONS = 50;
let notifCounter = 0;

/**
 * NotificationPanel — priority-based notification feed.
 * Shows permission requests, tool failures, anomalies, task completions, etc.
 */
export class NotificationPanel {
  private container: HTMLElement;
  private store: StateStore;
  private notifications: Notification[] = [];
  private visible = false;
  private badgeEl: HTMLElement;
  private onPermRequestBound: (perm: PendingPermission) => void;
  private onAnomalyBound: (anomaly: AnomalyEvent) => void;
  private onTaskBound: (data: { taskSubject: string }) => void;
  private onSpawnBound: (agent: AgentState) => void;
  private onShutdownBound: () => void;

  constructor(store: StateStore) {
    this.store = store;

    // Badge on top bar
    this.badgeEl = document.createElement('span');
    this.badgeEl.id = 'notif-badge';
    this.badgeEl.className = 'notif-badge';
    this.badgeEl.style.display = 'none';

    // Panel
    this.container = document.createElement('div');
    this.container.id = 'notification-panel';
    this.container.style.display = 'none';
    document.body.appendChild(this.container);

    // Listen to events
    this.onPermRequestBound = (perm) => this.addPermission(perm);
    this.onAnomalyBound = (anomaly) => this.addAnomaly(anomaly);
    this.onTaskBound = ({ taskSubject }) => this.addTask(taskSubject);
    this.onSpawnBound = (agent) => this.addLifecycle(agent, 'spawned');
    this.onShutdownBound = () => this.addLifecycleSimple('Agent shut down');
    store.on('permission:request', this.onPermRequestBound);
    store.on('anomaly:alert', this.onAnomalyBound);
    store.on('task:completed', this.onTaskBound);
    store.on('agent:spawn', this.onSpawnBound);
    store.on('agent:shutdown', this.onShutdownBound);
  }

  getBadgeElement(): HTMLElement {
    return this.badgeEl;
  }

  toggle(): void {
    this.visible = !this.visible;
    this.container.style.display = this.visible ? '' : 'none';
    if (this.visible) this.render();
  }

  private addPermission(perm: PendingPermission): void {
    this.push({
      kind: 'permission',
      priority: 'urgent',
      message: `Permission: ${perm.toolName}`,
      detail: this.summarizeInput(perm.toolInput),
    });
  }

  private addAnomaly(anomaly: AnomalyEvent): void {
    this.push({
      kind: 'anomaly',
      priority: anomaly.severity === 'critical' ? 'urgent' : 'high',
      message: `${anomaly.agentName}: ${anomaly.message}`,
    });
  }

  private addTask(subject: string): void {
    this.push({
      kind: 'task',
      priority: 'normal',
      message: `Task completed: ${subject}`,
    });
  }

  private addLifecycle(agent: AgentState, action: string): void {
    const name = agent.agentName || agent.projectName || agent.sessionId.slice(0, 10);
    this.push({
      kind: 'lifecycle',
      priority: 'low',
      message: `${name} ${action}`,
    });
  }

  private addLifecycleSimple(msg: string): void {
    this.push({ kind: 'lifecycle', priority: 'low', message: msg });
  }

  private push(partial: Omit<Notification, 'id' | 'timestamp'>): void {
    const notif: Notification = {
      id: `n${++notifCounter}`,
      ...partial,
      timestamp: Date.now(),
    };
    this.notifications.unshift(notif);
    if (this.notifications.length > MAX_NOTIFICATIONS) this.notifications.pop();
    this.updateBadge();
    if (this.visible) this.render();
  }

  private updateBadge(): void {
    const urgent = this.notifications.filter(n => n.priority === 'urgent' || n.priority === 'high').length;
    if (urgent > 0) {
      this.badgeEl.textContent = String(urgent);
      this.badgeEl.style.display = '';
    } else {
      this.badgeEl.style.display = 'none';
    }
  }

  private render(): void {
    if (this.notifications.length === 0) {
      this.container.innerHTML = '<div class="notif-empty">No notifications</div>';
      return;
    }

    let html = '<div class="notif-header">Notifications <button class="notif-clear">Clear</button></div>';
    html += '<div class="notif-list">';

    for (const n of this.notifications) {
      const age = this.formatAge(n.timestamp);
      html += `<div class="notif-item notif-${this.esc(n.priority)} notif-${this.esc(n.kind)}">`;
      html += `<span class="notif-icon">${this.icon(n.kind)}</span>`;
      html += `<span class="notif-msg">${this.esc(n.message)}</span>`;
      if (n.detail) {
        html += `<span class="notif-detail">${this.esc(n.detail)}</span>`;
      }
      html += `<span class="notif-age">${age}</span>`;
      html += `</div>`;
    }

    html += '</div>';
    this.container.innerHTML = html;

    const clearBtn = this.container.querySelector('.notif-clear');
    clearBtn?.addEventListener('click', () => {
      this.notifications = [];
      this.updateBadge();
      this.render();
    }, { once: true });
  }

  private icon(kind: NotifKind): string {
    switch (kind) {
      case 'permission': return '\u{1F512}';
      case 'failure': return '\u274C';
      case 'anomaly': return '\u26A0\uFE0F';
      case 'task': return '\u2705';
      case 'lifecycle': return '\u{1F7E2}';
    }
  }

  private formatAge(ts: number): string {
    const s = Math.round((Date.now() - ts) / 1000);
    if (s < 60) return `${s}s`;
    if (s < 3600) return `${Math.round(s / 60)}m`;
    return `${Math.round(s / 3600)}h`;
  }

  private summarizeInput(input: unknown): string | undefined {
    if (!input) return undefined;
    const obj = input as Record<string, unknown>;
    const val = (obj.command ?? obj.file_path ?? obj.pattern ?? obj.query) as string | undefined;
    if (val) return val.length > 80 ? val.slice(0, 77) + '...' : val;
    return undefined;
  }

  private esc(s: string): string {
    return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  dispose(): void {
    this.store.off('permission:request', this.onPermRequestBound);
    this.store.off('anomaly:alert', this.onAnomalyBound);
    this.store.off('task:completed', this.onTaskBound);
    this.store.off('agent:spawn', this.onSpawnBound);
    this.store.off('agent:shutdown', this.onShutdownBound);
    this.container.remove();
    this.badgeEl.remove();
  }
}
