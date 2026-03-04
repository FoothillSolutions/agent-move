import type { AgentState } from '@agent-move/shared';
import { AGENT_PALETTES, getModelPricing } from '@agent-move/shared';
import type { StateStore } from '../connection/state-store.js';
import { escapeHtml, formatTokens, formatDuration } from '../utils/formatting.js';

const RANK_BADGES = ['🥇', '🥈', '🥉'];

export class LeaderboardPanel {
  private el: HTMLElement;
  private isOpen = false;
  private refreshInterval: ReturnType<typeof setInterval> | null = null;
  private sortColumn: 'tokens' | 'cost' | 'duration' | 'tools' | 'velocity' = 'tokens';
  private sortDir: 'asc' | 'desc' = 'desc';
  private _customizationLookup: ((agent: AgentState) => { displayName: string; colorIndex: number }) | null = null;

  /** Set a lookup function to resolve customized display name + color from agent state */
  setCustomizationLookup(lookup: (agent: AgentState) => { displayName: string; colorIndex: number }): void {
    this._customizationLookup = lookup;
  }

  constructor(private store: StateStore) {
    this.el = document.createElement('div');
    this.el.id = 'leaderboard-panel';
    this.el.innerHTML = `
      <div class="lb-header">
        <span class="lb-title">🏆 Agent Leaderboard</span>
        <button class="lb-close">&times;</button>
      </div>
      <div class="lb-body"></div>
    `;
    document.body.appendChild(this.el);

    this.el.querySelector('.lb-close')!.addEventListener('click', () => this.close());
  }

  toggle(): void {
    if (this.isOpen) this.close();
    else this.open();
  }

  open(): void {
    this.isOpen = true;
    this.el.classList.add('open');
    this.render();
    this.refreshInterval = setInterval(() => this.render(), 1000);
  }

  close(): void {
    this.isOpen = false;
    this.el.classList.remove('open');
    if (this.refreshInterval) {
      clearInterval(this.refreshInterval);
      this.refreshInterval = null;
    }
  }

  private computeCost(agent: AgentState): number {
    const pricing = getModelPricing(agent.model ?? '');
    // Cache tokens are priced at reduced input rate (~10% of input cost)
    const cacheInputCost = agent.cacheReadTokens * pricing.input * 0.1;
    return (agent.totalInputTokens * pricing.input + agent.totalOutputTokens * pricing.output + cacheInputCost) / 1_000_000;
  }

  private render(): void {
    const body = this.el.querySelector('.lb-body')!;
    const agents = Array.from(this.store.getAgents().values());

    if (agents.length === 0) {
      body.innerHTML = '<div class="lb-empty">No agents active</div>';
      return;
    }

    type AgentRow = AgentState & { cost: number; duration: number; velocity: number };
    const rows: AgentRow[] = agents.map(a => {
      const cost = this.computeCost(a);
      const duration = Date.now() - a.spawnedAt;
      const totalTokens = a.totalInputTokens + a.totalOutputTokens;
      const velocity = duration > 60000 ? totalTokens / (duration / 60000) : totalTokens;
      return { ...a, cost, duration, velocity };
    });

    // Sort
    rows.sort((a, b) => {
      let va: number, vb: number;
      switch (this.sortColumn) {
        case 'tokens': va = a.totalInputTokens + a.totalOutputTokens; vb = b.totalInputTokens + b.totalOutputTokens; break;
        case 'cost': va = a.cost; vb = b.cost; break;
        case 'duration': va = a.duration; vb = b.duration; break;
        case 'tools': va = a.toolUseCount; vb = b.toolUseCount; break;
        case 'velocity': va = a.velocity; vb = b.velocity; break;
      }
      return this.sortDir === 'desc' ? vb - va : va - vb;
    });

    const maxTokens = Math.max(...rows.map(r => r.totalInputTokens + r.totalOutputTokens), 1);

    body.innerHTML = `
      <table class="lb-table">
        <thead>
          <tr>
            <th>#</th>
            <th>Agent</th>
            <th class="lb-sortable" data-col="tokens">Tokens</th>
            <th class="lb-sortable" data-col="cost">Cost</th>
            <th class="lb-sortable" data-col="duration">Duration</th>
            <th class="lb-sortable" data-col="tools">Tools</th>
            <th class="lb-sortable" data-col="velocity">Tok/min</th>
          </tr>
        </thead>
        <tbody>
          ${rows.map((r, i) => {
            const custom = this._customizationLookup?.(r);
            const effectiveColorIndex = custom?.colorIndex ?? r.colorIndex;
            const palette = AGENT_PALETTES[effectiveColorIndex % AGENT_PALETTES.length];
            const color = '#' + palette.body.toString(16).padStart(6, '0');
            const name = custom?.displayName || r.agentName || r.projectName || r.sessionId.slice(0, 10);
            const totalTokens = r.totalInputTokens + r.totalOutputTokens;
            const barPct = (totalTokens / maxTokens) * 100;
            const badge = i < 3 ? RANK_BADGES[i] : `${i + 1}`;
            return `<tr>
              <td class="lb-rank">${badge}</td>
              <td class="lb-name"><span class="lb-dot" style="background:${color}"></span>${escapeHtml(name)}</td>
              <td>
                <div class="lb-bar-wrap">
                  <div class="lb-bar" style="width:${barPct}%;background:${color}"></div>
                  <span class="lb-bar-label">${formatTokens(totalTokens)}</span>
                </div>
              </td>
              <td>$${r.cost.toFixed(3)}</td>
              <td>${formatDuration(r.duration)}</td>
              <td>${r.toolUseCount}</td>
              <td>${formatTokens(Math.round(r.velocity))}</td>
            </tr>`;
          }).join('')}
        </tbody>
      </table>
    `;

    // Bind sort handlers
    body.querySelectorAll('.lb-sortable').forEach(el => {
      el.addEventListener('click', () => {
        const col = (el as HTMLElement).dataset.col as typeof this.sortColumn;
        if (this.sortColumn === col) {
          this.sortDir = this.sortDir === 'desc' ? 'asc' : 'desc';
        } else {
          this.sortColumn = col;
          this.sortDir = 'desc';
        }
        this.render();
      });
    });
  }

  dispose(): void {
    if (this.refreshInterval) clearInterval(this.refreshInterval);
    this.el.remove();
  }
}
