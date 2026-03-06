import { computeAgentCost } from '@agent-move/shared';
import type { StateStore } from '../connection/state-store.js';
import { formatTokens } from '../utils/formatting.js';

/**
 * TopBar — enterprise-grade top navigation bar.
 * Absorbs: StatsHud, connection status, nav tabs, action icons.
 */

interface TokenSample {
  timestamp: number;
  total: number;
}

const VELOCITY_WINDOW = 60_000;
const SAMPLE_INTERVAL = 2_000;

export type NavTab = 'monitor' | 'analytics' | 'leaderboard' | 'toolchain' | 'taskgraph' | 'activity' | 'waterfall' | 'graph';

export class TopBar {
  private store: StateStore;
  private refreshTimer: ReturnType<typeof setInterval>;
  private sampleTimer: ReturnType<typeof setInterval>;
  private samples: TokenSample[] = [];
  private connectionDot: HTMLElement;
  private hooksDot: HTMLElement;
  private focusBar: HTMLElement;
  private hookEventCount = 0;
  private onHooksStatusBound: () => void;
  private onPermRequestBound: () => void;
  private onPermResolvedBound: () => void;
  private onConnectionStatusBound: (status: import('../connection/state-store.js').ConnectionStatus) => void;

  constructor(store: StateStore) {
    this.store = store;

    this.connectionDot = document.getElementById('connection-dot')!;
    this.hooksDot = document.getElementById('hooks-dot')!;
    this.focusBar = document.getElementById('focus-sub-bar')!;

    // Track hook event count
    this.onHooksStatusBound = () => { this.hookEventCount++; };
    this.onPermRequestBound = () => { this.hookEventCount++; };
    this.onPermResolvedBound = () => { this.hookEventCount++; };
    store.on('hooks:status', this.onHooksStatusBound);
    store.on('permission:request', this.onPermRequestBound);
    store.on('permission:resolved', this.onPermResolvedBound);

    // Connection status
    this.onConnectionStatusBound = (status) => {
      const isConnected = status === 'connected';
      this.connectionDot.classList.toggle('connected', isConnected);
      this.connectionDot.classList.toggle('disconnected', !isConnected);
      this.connectionDot.title = isConnected ? 'Connected' : 'Disconnected';

      const bar = document.getElementById('disconnected-bar')!;
      bar.classList.toggle('visible', !isConnected);
    };
    this.store.on('connection:status', this.onConnectionStatusBound);

    // Stats updates
    this.refreshTimer = setInterval(() => this.updateStats(), 1000);
    this.sampleTimer = setInterval(() => this.takeSample(), SAMPLE_INTERVAL);
  }

  showFocus(name: string): void {
    this.focusBar.querySelector('.fi-name')!.textContent = name;
    this.focusBar.classList.add('visible');
  }

  hideFocus(): void {
    this.focusBar.classList.remove('visible');
  }

  private takeSample(): void {
    const agents = Array.from(this.store.getAgents().values());
    let total = 0;
    for (const a of agents) {
      total += a.totalInputTokens + a.totalOutputTokens;
    }
    this.samples.push({ timestamp: Date.now(), total });
    if (this.samples.length > 90) this.samples.shift();
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

  private updateStats(): void {
    const agents = Array.from(this.store.getAgents().values());
    const active = agents.filter(a => !a.isIdle && !a.isDone).length;
    const idle = agents.filter(a => a.isIdle || a.isDone).length;

    let totalCost = 0;
    for (const a of agents) {
      totalCost += computeAgentCost(a);
    }

    const velocity = this.getVelocity();

    const setVal = (id: string, text: string) => {
      const val = document.querySelector(`#${id} .tb-stat-val`);
      if (val) val.textContent = text;
    };

    setVal('tb-active', String(active));
    setVal('tb-idle', String(idle));
    setVal('tb-cost', totalCost < 0.01 ? totalCost.toFixed(4) : totalCost.toFixed(2));
    setVal('tb-velocity', formatTokens(Math.round(velocity)));

    const activeDot = document.querySelector('#tb-active .tb-stat-dot') as HTMLElement;
    if (activeDot) activeDot.classList.toggle('pulse', active > 0);

    // Hooks status dot
    const pendingCount = this.store.getPendingPermissions().length;
    const hooksActive = this.store.isHooksActive();
    this.hooksDot.classList.toggle('hooks-pending', pendingCount > 0);
    this.hooksDot.classList.toggle('hooks-active', hooksActive && pendingCount === 0);
    if (pendingCount > 0) {
      this.hooksDot.title = `Hooks: ${pendingCount} permission${pendingCount > 1 ? 's' : ''} pending | ${this.hookEventCount} events received`;
    } else if (hooksActive) {
      this.hooksDot.title = `Hooks: active | ${this.hookEventCount} events received`;
    } else {
      this.hooksDot.title = 'Hooks: not detected (run `agent-move hooks install`)';
    }
  }

  dispose(): void {
    clearInterval(this.refreshTimer);
    clearInterval(this.sampleTimer);
    this.store.off('hooks:status', this.onHooksStatusBound);
    this.store.off('permission:request', this.onPermRequestBound);
    this.store.off('permission:resolved', this.onPermResolvedBound);
    this.store.off('connection:status', this.onConnectionStatusBound);
  }
}
