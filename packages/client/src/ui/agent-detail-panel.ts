import type { AgentState, ActivityEntry } from '@agent-move/shared';
import { AGENT_PALETTES, ZONE_MAP } from '@agent-move/shared';
import type { StateStore } from '../connection/state-store.js';
import { escapeAttr, formatTokens, formatDuration, hexToCss } from '../utils/formatting.js';
import { DiffViewerModal } from './diff-viewer-modal.js';

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
  private _onCustomize: ((agent: AgentState) => void) | null = null;
  private _customizationLookup: ((agent: AgentState) => { displayName: string; colorIndex: number }) | null = null;
  private diffModal: DiffViewerModal;

  constructor(store: StateStore) {
    this.store = store;

    // Create panel element
    this.panelEl = document.createElement('div');
    this.panelEl.id = 'agent-detail-panel';
    this.panelEl.innerHTML = `
      <div class="detail-header">
        <div class="detail-header-buttons">
          <button id="detail-customize" title="Customize this agent">Edit</button>
          <button id="detail-kill" title="Remove this agent">Kill</button>
          <button id="detail-close">&times;</button>
        </div>
        <div id="detail-name"></div>
        <div id="detail-task"></div>
        <div id="detail-meta"></div>
      </div>
      <div id="detail-stats"></div>
      <div id="detail-git"></div>
      <div class="detail-section-title">Activity Feed</div>
      <div id="detail-feed"></div>
    `;
    document.body.appendChild(this.panelEl);

    this.diffModal = new DiffViewerModal();

    // Close button
    this.panelEl.querySelector('#detail-close')!.addEventListener('click', () => this.close());

    // Kill button
    this.panelEl.querySelector('#detail-kill')!.addEventListener('click', () => this.killAgent());

    // Customize button
    this.panelEl.querySelector('#detail-customize')!.addEventListener('click', () => {
      if (this.selectedAgentId && this._onCustomize) {
        const agent = this.store.getAgent(this.selectedAgentId);
        if (agent) this._onCustomize(agent);
      }
    });

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
      if (agent.id === this.selectedAgentId) {
        this.renderStats(agent);
        this.renderGitInfo(agent);
      }
    });
    this.store.on('agent:idle', (agent) => {
      if (agent.id === this.selectedAgentId) this.renderStats(agent);
    });
    this.store.on('agent:shutdown', (agentId) => {
      if (agentId === this.selectedAgentId) this.close();
    });
  }

  /** Set handler for the customize button */
  setCustomizeHandler(handler: (agent: AgentState) => void): void {
    this._onCustomize = handler;
  }

  /** Set a lookup function to resolve customized display name + color from agent state */
  setCustomizationLookup(lookup: (agent: AgentState) => { displayName: string; colorIndex: number }): void {
    this._customizationLookup = lookup;
  }

  /** Get customized display name for an agent */
  private getDisplayName(agent: AgentState): string {
    if (this._customizationLookup) {
      return this._customizationLookup(agent).displayName;
    }
    return agent.agentName || agent.projectName || agent.id.slice(0, 8);
  }

  /** Get customized color index for an agent */
  private getDisplayColorIndex(agent: AgentState): number {
    if (this._customizationLookup) {
      return this._customizationLookup(agent).colorIndex;
    }
    return agent.colorIndex;
  }

  open(agentId: string): void {
    this.selectedAgentId = agentId;
    this.entries = [];
    this.panelEl.classList.add('open');

    const agent = this.store.getAgent(agentId);
    if (agent) {
      this.renderHeader(agent);
      this.renderStats(agent);
      this.renderGitInfo(agent);
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

  /** Re-render the header for the currently open agent, with an optional display name override */
  refreshHeader(displayName?: string): void {
    if (!this.selectedAgentId) return;
    const agent = this.store.getAgent(this.selectedAgentId);
    if (agent) this.renderHeader(agent, displayName);
  }

  private renderHeader(agent: AgentState, displayNameOverride?: string): void {
    const colorIndex = this.getDisplayColorIndex(agent);
    const palette = AGENT_PALETTES[colorIndex % AGENT_PALETTES.length];
    const borderColor = hexToCss(palette.body);
    const name = displayNameOverride || this.getDisplayName(agent);

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

    // Resolve parent name using customization lookup
    let parentHtml = '';
    if (agent.parentId) {
      const parent = this.store.getAgent(agent.parentId);
      const parentName = parent ? this.getDisplayName(parent) : agent.parentId.slice(0, 10);
      parentHtml = `<div>Parent: <a href="#" class="detail-link" data-agent-id="${escapeAttr(agent.parentId)}">${escapeAttr(parentName)}</a></div>`;
    }

    // Find children (subagents whose parentId = this agent), use customization lookup
    let childrenHtml = '';
    const children = Array.from(this.store.getAgents().values()).filter(a => a.parentId === agent.id);
    if (children.length > 0) {
      const names = children.map(c => {
        const n = this.getDisplayName(c);
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

  private renderGitInfo(agent: AgentState): void {
    const gitEl = this.panelEl.querySelector('#detail-git') as HTMLElement | null;
    if (!gitEl) return;

    const hasBranch = !!agent.gitBranch;
    const hasFiles = agent.recentFiles && agent.recentFiles.length > 0;
    const hasDiffs = agent.recentDiffs && agent.recentDiffs.length > 0;

    if (!hasBranch && !hasFiles && !hasDiffs) {
      gitEl.style.display = 'none';
      return;
    }

    gitEl.style.display = '';
    let html = '';
    if (hasBranch) {
      html += `<div class="stat-row"><span class="stat-label">&#128268; Branch</span><span class="stat-value"><code>${escapeAttr(agent.gitBranch!)}</code></span></div>`;
    }

    // Build a unified file list from recentFiles + any diff-only paths
    // Group diffs by file path for count + modal lookup
    const diffsByPath = new Map<string, typeof agent.recentDiffs>();
    if (agent.recentDiffs) {
      for (const d of agent.recentDiffs) {
        let arr = diffsByPath.get(d.filePath);
        if (!arr) { arr = []; diffsByPath.set(d.filePath, arr); }
        arr.push(d);
      }
    }

    // Merge: start with recentFiles, then add any diff paths not already listed
    const allPaths: string[] = [];
    const seen = new Set<string>();
    if (agent.recentFiles) {
      for (const f of agent.recentFiles) {
        if (!seen.has(f)) { seen.add(f); allPaths.push(f); }
      }
    }
    for (const p of diffsByPath.keys()) {
      if (!seen.has(p)) { seen.add(p); allPaths.push(p); }
    }

    if (allPaths.length > 0) {
      const fileList = allPaths.map(f => {
        const short = f.replace(/\\/g, '/').split('/').slice(-2).join('/');
        const diffs = diffsByPath.get(f);
        const icon = diffs
          ? `<span class="git-diff-icon" data-diff-path="${escapeAttr(f)}" title="View ${diffs.length} diff${diffs.length > 1 ? 's' : ''}">\u00b1${diffs.length > 1 ? diffs.length : ''}</span>`
          : '';
        return `<div class="git-file"><span class="git-file-name">${escapeAttr(short)}</span>${icon}</div>`;
      }).join('');
      html += `<div class="detail-section-title">&#128196; Files (${allPaths.length})</div><div class="git-file-list">${fileList}</div>`;
    }

    gitEl.innerHTML = html;

    // Bind diff icon click handlers — opens modal, no inline expansion
    gitEl.querySelectorAll('.git-diff-icon').forEach(el => {
      el.addEventListener('click', (e) => {
        e.stopPropagation();
        const path = (el as HTMLElement).dataset.diffPath;
        if (path) {
          const fileDiffs = diffsByPath.get(path);
          if (fileDiffs && fileDiffs.length > 0) {
            this.diffModal.open(path, fileDiffs);
          }
        }
      });
    });
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
