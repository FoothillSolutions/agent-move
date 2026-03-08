import type { AgentState } from '@agent-move/shared';
import { AGENT_PALETTES, computeAgentCost } from '@agent-move/shared';
import type { StateStore } from '../connection/state-store.js';
import { escapeHtml, formatTokens, formatDuration } from '../utils/formatting.js';

const RANK_BADGES = ['\u{1F947}', '\u{1F948}', '\u{1F949}'];

export class LeaderboardPanel {
  private contentEl: HTMLElement;
  private containerEl: HTMLElement;
  private isVisible = false;
  private refreshInterval: ReturnType<typeof setInterval> | null = null;
  private sortColumn: 'tokens' | 'cost' | 'duration' | 'tools' | 'velocity' = 'tokens';
  private sortDir: 'asc' | 'desc' = 'desc';
  private _customizationLookup: ((agent: AgentState) => { displayName: string; colorIndex: number }) | null = null;

  setCustomizationLookup(lookup: (agent: AgentState) => { displayName: string; colorIndex: number }): void {
    this._customizationLookup = lookup;
  }

  constructor(private store: StateStore, container: HTMLElement) {
    this.containerEl = container;

    this.contentEl = document.createElement('div');
    this.contentEl.id = 'leaderboard-content';
    this.contentEl.style.display = 'none';
    this.containerEl.appendChild(this.contentEl);
  }

  show(): void {
    this.isVisible = true;
    this.contentEl.style.display = '';
    this.render();
    this.refreshInterval = setInterval(() => this.render(), 1000);
  }

  hide(): void {
    this.isVisible = false;
    this.contentEl.style.display = 'none';
    if (this.refreshInterval) {
      clearInterval(this.refreshInterval);
      this.refreshInterval = null;
    }
  }

  /** Legacy toggle for command palette compatibility */
  toggle(): void {
    if (this.isVisible) this.hide();
    else this.show();
  }

  private computeCost(agent: AgentState): number {
    return computeAgentCost(agent);
  }

  private render(): void {
    const agents = Array.from(this.store.getAgents().values());

    if (agents.length === 0) {
      this.contentEl.innerHTML = '<div class="lb-empty">No agents active</div>';
      return;
    }

    type AgentRow = AgentState & { cost: number; duration: number; velocity: number };
    const rows: AgentRow[] = agents.map(a => {
      const cost = this.computeCost(a);
      const duration = Date.now() - a.spawnedAt;
      const totalTokens = a.totalInputTokens + a.totalOutputTokens + a.cacheReadTokens + a.cacheCreationTokens;
      const velocity = duration > 60000 ? totalTokens / (duration / 60000) : totalTokens;
      return { ...a, cost, duration, velocity };
    });

    rows.sort((a, b) => {
      let va: number, vb: number;
      switch (this.sortColumn) {
        case 'tokens': va = a.totalInputTokens + a.totalOutputTokens + a.cacheReadTokens + a.cacheCreationTokens; vb = b.totalInputTokens + b.totalOutputTokens + b.cacheReadTokens + b.cacheCreationTokens; break;
        case 'cost': va = a.cost; vb = b.cost; break;
        case 'duration': va = a.duration; vb = b.duration; break;
        case 'tools': va = a.toolUseCount; vb = b.toolUseCount; break;
        case 'velocity': va = a.velocity; vb = b.velocity; break;
      }
      return this.sortDir === 'desc' ? vb - va : va - vb;
    });

    const maxTokens = Math.max(...rows.map(r => r.totalInputTokens + r.totalOutputTokens + r.cacheReadTokens + r.cacheCreationTokens), 1);

    this.contentEl.innerHTML = `
      <table class="lb-table">
        <thead>
          <tr>
            <th>#</th>
            <th>Agent</th>
            <th class="lb-sortable" data-col="tokens">Tokens</th>
            <th class="lb-sortable" data-col="cost">Cost</th>
            <th class="lb-sortable" data-col="duration">Duration</th>
            <th class="lb-sortable" data-col="tools">Tools</th>
          </tr>
        </thead>
        <tbody>
          ${rows.map((r, i) => {
            const custom = this._customizationLookup?.(r);
            const effectiveColorIndex = custom?.colorIndex ?? r.colorIndex;
            const palette = AGENT_PALETTES[effectiveColorIndex % AGENT_PALETTES.length];
            const color = '#' + palette.body.toString(16).padStart(6, '0');
            const name = custom?.displayName || r.agentName || r.projectName || r.sessionId.slice(0, 10);
            const totalTokens = r.totalInputTokens + r.totalOutputTokens + r.cacheReadTokens + r.cacheCreationTokens;
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
              <td>$${r.cost.toFixed(2)}</td>
              <td>${formatDuration(r.duration)}</td>
              <td>${r.toolUseCount}</td>
            </tr>`;
          }).join('')}
        </tbody>
      </table>
    `;

    // Bind sort handlers
    this.contentEl.querySelectorAll('.lb-sortable').forEach(el => {
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
    this.contentEl.remove();
  }
}
