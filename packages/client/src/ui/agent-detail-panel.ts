import type { AgentState, ActivityEntry } from '@agent-move/shared';
import { AGENT_PALETTES, ZONE_MAP } from '@agent-move/shared';
import type { StateStore } from '../connection/state-store.js';
import { escapeAttr, formatTokens, formatDuration, hexToCss } from '../utils/formatting.js';

/**
 * Slide-out detail panel for a selected agent.
 * Shows agent info, model, tokens, and scrolling activity feed.
 */
export class AgentDetailPanel {
  private panelEl: HTMLElement;
  private store: StateStore;
  private selectedAgentId: string | null = null;
  private entries: ActivityEntry[] = [];
  private historyListener: ((data: { agentId: string; entries: ActivityEntry[] }) => void) | null = null;

  constructor(store: StateStore) {
    this.store = store;

    // Create panel element
    this.panelEl = document.createElement('div');
    this.panelEl.id = 'agent-detail-panel';
    this.panelEl.innerHTML = `
      <div class="detail-header">
        <div class="detail-header-buttons">
          <button id="detail-kill" title="Remove this agent">Kill</button>
          <button id="detail-close">&times;</button>
        </div>
        <div id="detail-name"></div>
        <div id="detail-task"></div>
        <div id="detail-meta"></div>
      </div>
      <div id="detail-stats"></div>
      <div class="detail-section-title">Activity Feed</div>
      <div id="detail-feed"></div>
    `;
    document.body.appendChild(this.panelEl);

    // Close button
    this.panelEl.querySelector('#detail-close')!.addEventListener('click', () => this.close());

    // Kill button
    this.panelEl.querySelector('#detail-kill')!.addEventListener('click', () => this.killAgent());

    // Listen for history responses
    this.historyListener = (data) => {
      if (data.agentId === this.selectedAgentId) {
        this.entries = data.entries;
        this.renderFeed();
      }
    };
    this.store.on('agent:history', this.historyListener);

    // Live updates for the selected agent
    this.store.on('agent:update', (agent) => {
      if (agent.id === this.selectedAgentId) this.renderStats(agent);
    });
    this.store.on('agent:idle', (agent) => {
      if (agent.id === this.selectedAgentId) this.renderStats(agent);
    });
    this.store.on('agent:shutdown', (agentId) => {
      if (agentId === this.selectedAgentId) this.close();
    });
  }

  open(agentId: string): void {
    this.selectedAgentId = agentId;
    this.entries = [];
    this.panelEl.classList.add('open');

    const agent = this.store.getAgent(agentId);
    if (agent) {
      this.renderHeader(agent);
      this.renderStats(agent);
    }

    // Request history from server
    this.store.requestHistory(agentId);
  }

  close(): void {
    this.selectedAgentId = null;
    this.panelEl.classList.remove('open');
  }

  isOpen(): boolean {
    return this.selectedAgentId !== null;
  }

  get currentAgentId(): string | null {
    return this.selectedAgentId;
  }

  private renderHeader(agent: AgentState): void {
    const palette = AGENT_PALETTES[agent.colorIndex % AGENT_PALETTES.length];
    const borderColor = hexToCss(palette.body);
    const name = agent.agentName || agent.projectName || agent.sessionId.slice(0, 12);

    const nameEl = this.panelEl.querySelector('#detail-name')!;
    nameEl.innerHTML = `<span style="color:${borderColor}">\u25CF</span> ${escapeAttr(name)} <span class="detail-role">${agent.role.toUpperCase()}</span>`;

    // Task description
    const taskEl = this.panelEl.querySelector('#detail-task') as HTMLElement | null;
    if (taskEl) {
      if (agent.taskDescription) {
        taskEl.innerHTML = `<div class="detail-task-text">${escapeAttr(agent.taskDescription)}</div>`;
        taskEl.style.display = '';
      } else {
        taskEl.style.display = 'none';
      }
    }

    const metaEl = this.panelEl.querySelector('#detail-meta')!;

    // Resolve parent name
    let parentHtml = '';
    if (agent.parentId) {
      const parent = this.store.getAgent(agent.parentId);
      const parentName = parent ? (parent.agentName || parent.projectName || parent.sessionId.slice(0, 10)) : agent.parentId.slice(0, 10);
      parentHtml = `<div>Parent: <a href="#" class="detail-link" data-agent-id="${escapeAttr(agent.parentId)}">${escapeAttr(parentName)}</a></div>`;
    }

    // Find children (subagents whose parentId = this agent)
    let childrenHtml = '';
    const children = Array.from(this.store.getAgents().values()).filter(a => a.parentId === agent.id);
    if (children.length > 0) {
      const names = children.map(c => {
        const n = c.agentName || c.projectName || c.sessionId.slice(0, 10);
        return `<a href="#" class="detail-link" data-agent-id="${escapeAttr(c.id)}">${escapeAttr(n)}</a>`;
      });
      childrenHtml = `<div>Subagents: ${names.join(', ')}</div>`;
    }

    metaEl.innerHTML = `
      <div>Session: <code>${agent.sessionId.slice(0, 16)}...</code></div>
      ${agent.model ? `<div>Model: <code>${escapeAttr(agent.model)}</code></div>` : ''}
      ${agent.teamName ? `<div>Team: ${escapeAttr(agent.teamName)}</div>` : ''}
      ${parentHtml}
      ${childrenHtml}
    `;

    // Bind clickable links to navigate to parent/child
    metaEl.querySelectorAll('.detail-link').forEach(el => {
      el.addEventListener('click', (e) => {
        e.preventDefault();
        const targetId = (el as HTMLElement).dataset.agentId;
        if (targetId) this.open(targetId);
      });
    });
  }

  private renderStats(agent: AgentState): void {
    const zone = ZONE_MAP.get(agent.currentZone);
    const zoneName = zone ? `${zone.icon} ${zone.label}` : agent.currentZone;
    const totalTokens = agent.totalInputTokens + agent.totalOutputTokens;
    const tokensStr = formatTokens(totalTokens);

    const statsEl = this.panelEl.querySelector('#detail-stats')!;
    statsEl.innerHTML = `
      <div class="stat-row">
        <span class="stat-label">Zone</span>
        <span class="stat-value">${zoneName}</span>
      </div>
      <div class="stat-row">
        <span class="stat-label">Tool</span>
        <span class="stat-value tool-val">${agent.currentTool ? escapeAttr(agent.currentTool) : '<span style="color:#666">none</span>'}</span>
      </div>
      <div class="stat-row">
        <span class="stat-label">Status</span>
        <span class="stat-value">${agent.isIdle ? '<span style="color:#6b7280">Idle</span>' : '<span style="color:#4ade80">Active</span>'}</span>
      </div>
      <div class="stat-row">
        <span class="stat-label">Tokens</span>
        <span class="stat-value">${tokensStr} <span style="color:#666">(${formatTokens(agent.totalInputTokens)} in / ${formatTokens(agent.totalOutputTokens)} out)</span></span>
      </div>
      <div class="stat-row">
        <span class="stat-label">Uptime</span>
        <span class="stat-value">${formatDuration(Date.now() - agent.spawnedAt)}</span>
      </div>
    `;
  }

  private renderFeed(): void {
    const feedEl = this.panelEl.querySelector('#detail-feed')!;

    if (this.entries.length === 0) {
      feedEl.innerHTML = '<div class="feed-empty">No activity recorded yet</div>';
      return;
    }

    // Show most recent first
    const reversed = [...this.entries].reverse();
    feedEl.innerHTML = reversed.map((e) => this.renderEntry(e)).join('');
    feedEl.scrollTop = 0;
  }

  private renderEntry(entry: ActivityEntry): string {
    const time = this.formatTime(entry.timestamp);
    const timeHtml = `<span class="feed-time">${time}</span>`;

    switch (entry.kind) {
      case 'tool':
        return `<div class="feed-entry feed-tool">
          ${timeHtml}
          <span class="feed-icon">&#128295;</span>
          <span class="feed-tool-name">${escapeAttr(entry.tool ?? 'unknown')}</span>
          ${entry.toolArgs ? `<div class="feed-args">${escapeAttr(entry.toolArgs)}</div>` : ''}
        </div>`;

      case 'text':
        return `<div class="feed-entry feed-text">
          ${timeHtml}
          <span class="feed-icon">&#128172;</span>
          <span>${escapeAttr(entry.text ?? '')}</span>
        </div>`;

      case 'zone-change': {
        const from = ZONE_MAP.get(entry.prevZone!);
        const to = ZONE_MAP.get(entry.zone!);
        return `<div class="feed-entry feed-zone">
          ${timeHtml}
          <span class="feed-icon">&#128694;</span>
          ${from?.icon ?? ''} ${from?.label ?? entry.prevZone} &rarr; ${to?.icon ?? ''} ${to?.label ?? entry.zone}
        </div>`;
      }

      case 'spawn':
        return `<div class="feed-entry feed-spawn">
          ${timeHtml}
          <span class="feed-icon">&#9889;</span>
          Agent spawned
        </div>`;

      case 'idle':
        return `<div class="feed-entry feed-idle">
          ${timeHtml}
          <span class="feed-icon">&#9749;</span>
          Went idle
        </div>`;

      case 'shutdown':
        return `<div class="feed-entry feed-shutdown">
          ${timeHtml}
          <span class="feed-icon">&#128721;</span>
          Agent shut down
        </div>`;

      case 'tokens':
        return `<div class="feed-entry feed-tokens">
          ${timeHtml}
          <span class="feed-icon">&#127916;</span>
          +${formatTokens(entry.inputTokens ?? 0)} in / +${formatTokens(entry.outputTokens ?? 0)} out
        </div>`;

      default:
        return '';
    }
  }

  private async killAgent(): Promise<void> {
    if (!this.selectedAgentId) return;
    try {
      const res = await fetch(`/api/agents/${this.selectedAgentId}/shutdown`, { method: 'POST' });
      if (res.ok) this.close();
    } catch (err) {
      console.error('Failed to kill agent:', err);
    }
  }

  private formatTime(ts: number): string {
    const d = new Date(ts);
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  }

}
