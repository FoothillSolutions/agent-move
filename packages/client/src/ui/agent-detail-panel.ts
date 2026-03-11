import type { AgentState, ActivityEntry } from '@agent-move/shared';
import { AGENT_PALETTES, ZONE_MAP, getProjectColorIndex } from '@agent-move/shared';
import type { StateStore } from '../connection/state-store.js';
import { escapeHtml, escapeAttr, truncate, formatTokens, formatTokenPair, formatDuration, hexToCss, getCliBadge } from '../utils/formatting.js';

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
  private onUpdateBound: (agent: AgentState) => void;
  private onIdleBound: (agent: AgentState) => void;
  private onShutdownBound: (agentId: string) => void;
  private _onCustomize: ((agent: AgentState) => void) | null = null;
  private _customizationLookup: ((agent: AgentState) => { displayName: string; colorIndex: number }) | null = null;

  // Sparkline data
  private tokenSamples: number[] = [];
  private toolTimestamps: number[] = [];
  private sparklineTimer: ReturnType<typeof setInterval> | null = null;

  constructor(store: StateStore) {
    this.store = store;

    // Create panel element — inside right panel for in-place rendering
    this.panelEl = document.createElement('div');
    this.panelEl.id = 'agent-detail-panel';
    this.panelEl.innerHTML = `
      <div class="detail-header">
        <div class="detail-header-buttons">
          <button id="detail-back" title="Back to agent list">
            <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor"><path d="M20 11H7.83l5.59-5.59L12 4l-8 8 8 8 1.41-1.41L7.83 13H20v-2z"/></svg>
            Back
          </button>
          <span class="detail-btn-spacer"></span>
          <button id="detail-customize" title="Customize agent name and color">Edit</button>
          <button id="detail-kill" title="Shut down this agent permanently">Kill</button>
        </div>
        <div id="detail-card"></div>
      </div>
      <div id="detail-info"></div>
      <div class="detail-section-title">Activity Feed</div>
      <div id="detail-feed"></div>
    `;
    const rightPanel = document.getElementById('right-panel');
    if (rightPanel) {
      rightPanel.appendChild(this.panelEl);
    } else {
      document.body.appendChild(this.panelEl);
    }

    // Back button
    this.panelEl.querySelector('#detail-back')!.addEventListener('click', () => this.close());

    // Kill button — with confirmation
    this.panelEl.querySelector('#detail-kill')!.addEventListener('click', () => this.showKillConfirm());

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
    this.onUpdateBound = (agent) => {
      if (agent.id === this.selectedAgentId) {
        this.renderCardStats(agent);
        this.renderInfo(agent);
        // Track tool calls for velocity sparkline
        if (agent.currentTool) {
          const now = Date.now();
          const last = this.toolTimestamps.length > 0 ? this.toolTimestamps[this.toolTimestamps.length - 1] : 0;
          if (now - last > 1000) this.toolTimestamps.push(now);
          // Trim old entries (5 min window)
          const cutoff = now - 5 * 60 * 1000;
          this.toolTimestamps = this.toolTimestamps.filter(ts => ts >= cutoff);
        }
        this.drawSparklines(agent);
      }
    };
    this.onIdleBound = (agent) => {
      if (agent.id === this.selectedAgentId) this.renderCardStats(agent);
    };
    this.onShutdownBound = (agentId) => {
      if (agentId === this.selectedAgentId) this.close();
    };
    this.store.on('agent:update', this.onUpdateBound);
    this.store.on('agent:idle', this.onIdleBound);
    this.store.on('agent:shutdown', this.onShutdownBound);
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
    this.tokenSamples = [];
    this.toolTimestamps = [];
    this.panelEl.classList.add('open');

    const agent = this.store.getAgent(agentId);
    if (agent) {
      this.renderHeader(agent);
      this.renderInfo(agent);
      // Seed first sample
      this.tokenSamples.push(agent.totalInputTokens + agent.totalOutputTokens);
    }

    // Start sparkline sampling
    if (this.sparklineTimer) clearInterval(this.sparklineTimer);
    this.sparklineTimer = setInterval(() => this.sampleSparkline(), 2000);

    // Request history from server
    this.store.requestHistory(agentId);
  }

  close(): void {
    this.selectedAgentId = null;
    this.panelEl.classList.remove('open');
    if (this.sparklineTimer) {
      clearInterval(this.sparklineTimer);
      this.sparklineTimer = null;
    }
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

    const statusClass = agent.isDone ? 'done' : agent.isIdle ? 'idle' : 'active';
    const statusTitle = agent.isDone ? 'Agent finished' : agent.isIdle ? 'Agent is idle' : 'Agent is actively working';

    // Role badge
    const roleBadges: Record<string, { label: string; color: string }> = {
      'main': { label: 'MAIN', color: '#4a90d9' },
      'subagent': { label: 'SUB', color: '#ab47bc' },
      'team-lead': { label: 'LEAD', color: '#ff9800' },
      'team-member': { label: 'MEMBER', color: '#26c6da' },
    };
    const rb = roleBadges[agent.role] ?? { label: agent.role.toUpperCase(), color: '#888' };
    const roleBadge = `<span class="detail-role-badge" title="Agent role: ${rb.label}" style="background:${rb.color}33;color:${rb.color};">${rb.label}</span>`;

    // Project badge
    let projectBadge = '';
    if (agent.projectName) {
      const projColorIdx = agent.projectPath ? getProjectColorIndex(agent.projectPath) : colorIndex;
      const projColor = hexToCss(AGENT_PALETTES[projColorIdx % AGENT_PALETTES.length].body);
      projectBadge = `<span class="detail-project-badge" title="Project: ${escapeAttr(agent.projectName)}" style="background:${projColor}33;color:${projColor};">${escapeHtml(agent.projectName)}</span>`;
    }

    const doneBadge = agent.isDone ? '<span class="detail-done-badge" title="Agent has finished">DONE</span>' : '';

    const cardEl = this.panelEl.querySelector('#detail-card')!;
    cardEl.innerHTML = `
      <div class="detail-card-inner" style="border-left: 3px solid ${borderColor};">
        <div class="detail-card-top">
          <div class="detail-card-name">
            <span class="agent-status-dot ${statusClass}" title="${statusTitle}"></span>
            ${escapeHtml(name)}${roleBadge}${projectBadge}${doneBadge}
          </div>
          <div class="detail-card-actions">
            <canvas class="detail-velocity-canvas" width="60" height="16" title="Tool call frequency (last 5 min)"></canvas>
            <span class="detail-health-dot" title="Agent health indicator"></span>
            <canvas class="detail-sparkline-canvas" width="60" height="20" title="Token usage rate over time"></canvas>
          </div>
        </div>
        ${agent.taskDescription ? `<div class="detail-card-task" title="${escapeAttr(agent.taskDescription)}">${escapeHtml(truncate(agent.taskDescription, 80))}</div>` : ''}
        <div class="detail-card-zone" id="detail-zone-line"></div>
        <div class="detail-card-tokens" id="detail-token-line"></div>
      </div>
    `;

    // Render live stats into the card
    this.renderCardStats(agent);
  }

  /** Update just the live-changing parts inside the card (zone, tool, tokens) */
  private renderCardStats(agent: AgentState): void {
    const zone = ZONE_MAP.get(agent.currentZone);
    const zoneIcon = zone?.icon ?? '';
    const zoneName = zone?.label ?? agent.currentZone;
    const toolText = agent.currentTool ?? 'none';
    const tokens = formatTokenPair(agent.totalInputTokens, agent.totalOutputTokens);

    const zoneLine = this.panelEl.querySelector('#detail-zone-line');
    if (zoneLine) {
      zoneLine.innerHTML = `<span title="Current activity zone">${zoneIcon} ${zoneName}</span> <span class="detail-card-sep" title="Current tool">&middot;</span> <span class="detail-card-tool" title="Current tool: ${escapeAttr(toolText)}">${escapeHtml(toolText)}</span>`;
    }

    const tokenLine = this.panelEl.querySelector('#detail-token-line');
    if (tokenLine) {
      const ctxPct = agent.contextTokens > 0 ? Math.round(agent.contextTokens / 200_000 * 100) : 0;
      const ctxColor = ctxPct >= 90 ? '#ef4444' : ctxPct >= 75 ? '#f97316' : ctxPct >= 50 ? '#eab308' : '#22c55e';
      const newTok = agent.contextTokens - agent.contextCacheTokens;
      const fmtK = (n: number) => n >= 1000 ? `${Math.round(n / 1000)}k` : `${n}`;
      const title = `Context window: ${ctxPct}% full\n${newTok.toLocaleString()} new + ${agent.contextCacheTokens.toLocaleString()} cached = ${agent.contextTokens.toLocaleString()} / 200,000`;
      tokenLine.innerHTML = ctxPct > 0
        ? `<span class="detail-ctx-bar" title="${title}">
             <span class="detail-ctx-breakdown">${fmtK(newTok)} new · ${fmtK(agent.contextCacheTokens)} cached</span>
             <span class="detail-ctx-track"><span class="detail-ctx-fill" style="width:${ctxPct}%;background:${ctxColor}"></span></span>
             <span class="detail-ctx-label" style="color:${ctxColor}">${ctxPct}%</span>
           </span>`
        : `<span title="Total token usage">${tokens}</span>`;
    }

    // Update health dot
    const healthDot = this.panelEl.querySelector('.detail-health-dot') as HTMLElement | null;
    if (healthDot) {
      const color = agent.isDone || agent.isIdle ? '#888' : '#22c55e';
      healthDot.style.background = color;
      healthDot.title = agent.isDone ? 'Agent finished' : agent.isIdle ? 'Agent idle' : 'Agent healthy';
    }
  }

  /** Render the info rows below the card (model, session, uptime, git, relations) */
  private renderInfo(agent: AgentState): void {
    const infoEl = this.panelEl.querySelector('#detail-info')!;

    const rows: string[] = [];

    // Uptime
    rows.push(this.infoRow('Uptime', formatDuration(Date.now() - agent.spawnedAt), 'How long this agent has been running'));

    // CLI type
    rows.push(this.infoRow('CLI', getCliBadge(agent.sessionId), 'Agent CLI source'));

    // Model
    if (agent.model) {
      rows.push(this.infoRow('Model', `<code>${escapeAttr(agent.model)}</code>`, 'AI model powering this agent'));
    }

    // Session ID (copyable)
    rows.push(this.infoRow(
      'Session',
      `<code class="detail-session-id" title="Click to copy full session ID">${agent.sessionId.slice(0, 16)}…</code>
       <button class="detail-copy-btn" data-copy="${escapeAttr(agent.sessionId)}" title="Copy session ID to clipboard">
         <svg viewBox="0 0 24 24" width="12" height="12" fill="currentColor"><path d="M16 1H4c-1.1 0-2 .9-2 2v14h2V3h12V1zm3 4H8c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h11c1.1 0 2-.9 2-2V7c0-1.1-.9-2-2-2zm0 16H8V7h11v14z"/></svg>
       </button>`,
      'Unique session identifier'
    ));

    // Team
    if (agent.teamName) {
      rows.push(this.infoRow('Team', escapeHtml(agent.teamName), 'Team this agent belongs to'));
    }

    // Git branch
    if (agent.gitBranch) {
      rows.push(this.infoRow('Branch', `<code>${escapeAttr(agent.gitBranch)}</code>`, 'Git branch this agent is working on'));
    }

    // Files
    const editedCount = agent.recentDiffs ? new Set(agent.recentDiffs.map(d => d.filePath)).size : 0;
    const totalFiles = agent.recentFiles ? agent.recentFiles.length : 0;
    if (totalFiles > 0 || editedCount > 0) {
      const parts: string[] = [];
      if (totalFiles > 0) parts.push(`${totalFiles} touched`);
      if (editedCount > 0) parts.push(`${editedCount} edited`);
      rows.push(this.infoRow('Files', parts.join(', '), 'Files this agent has read or modified'));
    }

    // Parent
    if (agent.parentId) {
      const parent = this.store.getAgent(agent.parentId);
      const parentName = parent ? this.getDisplayName(parent) : agent.parentId.slice(0, 10);
      rows.push(this.infoRow('Parent', `<a href="#" class="detail-link" data-agent-id="${escapeAttr(agent.parentId)}" title="Navigate to parent agent">${escapeHtml(parentName)}</a>`, 'The agent that spawned this one'));
    }

    // Children
    const children = Array.from(this.store.getAgents().values()).filter(a => a.parentId === agent.id);
    if (children.length > 0) {
      const names = children.map(c => {
        const n = this.getDisplayName(c);
        return `<a href="#" class="detail-link" data-agent-id="${escapeAttr(c.id)}" title="Navigate to subagent">${escapeHtml(n)}</a>`;
      });
      rows.push(this.infoRow('Subagents', names.join(', '), 'Child agents spawned by this agent'));
    }

    infoEl.innerHTML = rows.join('');

    // Bind copy button
    infoEl.querySelectorAll('.detail-copy-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const text = (btn as HTMLElement).dataset.copy;
        if (text) {
          navigator.clipboard.writeText(text).catch(() => {});
          (btn as HTMLElement).classList.add('copied');
          setTimeout(() => (btn as HTMLElement).classList.remove('copied'), 1200);
        }
      });
    });

    // Bind clickable session ID
    infoEl.querySelectorAll('.detail-session-id').forEach(el => {
      el.addEventListener('click', () => {
        navigator.clipboard.writeText(agent.sessionId).catch(() => {});
      });
    });

    // Bind clickable links to navigate to parent/child
    infoEl.querySelectorAll('.detail-link').forEach(el => {
      el.addEventListener('click', (e) => {
        e.preventDefault();
        const targetId = (el as HTMLElement).dataset.agentId;
        if (targetId) this.open(targetId);
      });
    });
  }

  private infoRow(label: string, value: string, tooltip: string): string {
    return `<div class="detail-info-row" title="${escapeAttr(tooltip)}">
      <span class="detail-info-label">${label}</span>
      <span class="detail-info-value">${value}</span>
    </div>`;
  }

  private sampleSparkline(): void {
    if (!this.selectedAgentId) return;
    const agent = this.store.getAgent(this.selectedAgentId);
    if (!agent) return;
    this.tokenSamples.push(agent.totalInputTokens + agent.totalOutputTokens);
    if (this.tokenSamples.length > 30) this.tokenSamples.shift();
    this.drawSparklines(agent);
  }

  private drawSparklines(agent: AgentState): void {
    // Token sparkline
    const tokenCanvas = this.panelEl.querySelector('.detail-sparkline-canvas') as HTMLCanvasElement | null;
    if (tokenCanvas && this.tokenSamples.length >= 2) {
      const ctx = tokenCanvas.getContext('2d');
      if (ctx) {
        const w = tokenCanvas.width;
        const h = tokenCanvas.height;
        ctx.clearRect(0, 0, w, h);

        const deltas: number[] = [];
        for (let i = 1; i < this.tokenSamples.length; i++) {
          deltas.push(Math.max(0, this.tokenSamples[i] - this.tokenSamples[i - 1]));
        }
        const maxDelta = Math.max(...deltas, 1);
        const stepX = w / Math.max(deltas.length - 1, 1);

        ctx.beginPath();
        ctx.moveTo(0, h);
        for (let i = 0; i < deltas.length; i++) {
          ctx.lineTo(i * stepX, h - (deltas[i] / maxDelta) * (h - 2) - 1);
        }
        ctx.lineTo((deltas.length - 1) * stepX, h);
        ctx.closePath();
        ctx.fillStyle = 'rgba(74, 222, 128, 0.15)';
        ctx.fill();

        ctx.beginPath();
        for (let i = 0; i < deltas.length; i++) {
          const x = i * stepX;
          const y = h - (deltas[i] / maxDelta) * (h - 2) - 1;
          if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
        }
        ctx.strokeStyle = '#4ade80';
        ctx.lineWidth = 1.5;
        ctx.stroke();
      }
    }

    // Tool velocity sparkline
    const velCanvas = this.panelEl.querySelector('.detail-velocity-canvas') as HTMLCanvasElement | null;
    if (velCanvas) {
      const ctx = velCanvas.getContext('2d');
      if (!ctx) return;
      const w = velCanvas.width;
      const h = velCanvas.height;
      ctx.clearRect(0, 0, w, h);

      const now = Date.now();
      const windowSize = 30_000;
      const numBars = 10;
      const bars: number[] = new Array(numBars).fill(0);
      for (const ts of this.toolTimestamps) {
        const idx = Math.floor((now - ts) / windowSize);
        if (idx >= 0 && idx < numBars) bars[numBars - 1 - idx]++;
      }

      const maxVal = Math.max(...bars, 1);
      const barWidth = Math.floor(w / numBars) - 1;

      const colorIndex = this.getDisplayColorIndex(agent);
      const palette = AGENT_PALETTES[colorIndex % AGENT_PALETTES.length];
      const barColor = hexToCss(palette.body);

      for (let i = 0; i < numBars; i++) {
        const val = bars[i] ?? 0;
        const barHeight = Math.max(val > 0 ? 2 : 0, Math.round((val / maxVal) * (h - 2)));
        ctx.fillStyle = barColor;
        ctx.globalAlpha = val > 0 ? 0.8 : 0.15;
        ctx.fillRect(i * (barWidth + 1), h - barHeight, barWidth, barHeight);
      }
      ctx.globalAlpha = 1.0;
    }
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

  /** Make a path relative to the agent's project directory */
  private relativePath(filePath: string): string {
    if (!this.selectedAgentId) return filePath;
    const agent = this.store.getAgent(this.selectedAgentId);
    if (!agent?.projectPath) return filePath;
    const projDir = agent.projectPath.replace(/\\/g, '/').replace(/\/$/, '') + '/';
    const normalized = filePath.replace(/\\/g, '/');
    return normalized.startsWith(projDir) ? normalized.slice(projDir.length) : normalized;
  }

  /** Shorten tool args — make any embedded file paths relative */
  private shortenArgs(args: string): string {
    if (!this.selectedAgentId) return args;
    const agent = this.store.getAgent(this.selectedAgentId);
    if (!agent?.projectPath) return args;
    const projDir = agent.projectPath.replace(/\\/g, '/').replace(/\/$/, '') + '/';
    return args.replace(/\\/g, '/').split(projDir).join('');
  }

  private renderEntry(entry: ActivityEntry): string {
    const time = this.formatTime(entry.timestamp);
    const t = `<span class="feed-time">${time}</span>`;

    switch (entry.kind) {
      case 'tool': {
        const args = entry.toolArgs ? ` <span class="feed-args">${escapeAttr(this.shortenArgs(entry.toolArgs))}</span>` : '';
        return `<div class="feed-entry feed-tool">${t} <span class="feed-icon">&#128295;</span> <span class="feed-tool-name">${escapeAttr(entry.tool ?? 'unknown')}</span>${args}</div>`;
      }

      case 'text': {
        const text = entry.text ? this.shortenArgs(entry.text) : '';
        return `<div class="feed-entry feed-text">${t} <span class="feed-icon">&#128172;</span> ${escapeAttr(text)}</div>`;
      }

      case 'zone-change': {
        const from = ZONE_MAP.get(entry.prevZone!);
        const to = ZONE_MAP.get(entry.zone!);
        return `<div class="feed-entry feed-zone">${t} <span class="feed-icon">&#128694;</span> ${from?.icon ?? ''} ${from?.label ?? entry.prevZone} &rarr; ${to?.icon ?? ''} ${to?.label ?? entry.zone}</div>`;
      }

      case 'spawn':
        return `<div class="feed-entry feed-spawn">${t} <span class="feed-icon">&#9889;</span> Agent spawned</div>`;

      case 'idle':
        return `<div class="feed-entry feed-idle">${t} <span class="feed-icon">&#9749;</span> Went idle</div>`;

      case 'shutdown':
        return `<div class="feed-entry feed-shutdown">${t} <span class="feed-icon">&#128721;</span> Agent shut down</div>`;

      case 'tokens':
        return `<div class="feed-entry feed-tokens">${t} <span class="feed-icon">&#127916;</span> +${formatTokens(entry.inputTokens ?? 0)} in / +${formatTokens(entry.outputTokens ?? 0)} out</div>`;

      default:
        return '';
    }
  }

  private showKillConfirm(): void {
    if (!this.selectedAgentId) return;
    const agent = this.store.getAgent(this.selectedAgentId);
    const name = agent ? this.getDisplayName(agent) : 'this agent';

    // Remove any existing confirm overlay
    this.panelEl.querySelector('.kill-confirm-overlay')?.remove();

    const overlay = document.createElement('div');
    overlay.className = 'kill-confirm-overlay';
    overlay.innerHTML = `
      <div class="kill-confirm-box">
        <div class="kill-confirm-title">Kill Agent</div>
        <div class="kill-confirm-msg">Are you sure you want to shut down <strong>${escapeAttr(name)}</strong>? This cannot be undone.</div>
        <div class="kill-confirm-actions">
          <button class="kill-confirm-cancel">Cancel</button>
          <button class="kill-confirm-yes">Kill Agent</button>
        </div>
      </div>
    `;
    this.panelEl.appendChild(overlay);

    overlay.querySelector('.kill-confirm-cancel')!.addEventListener('click', () => overlay.remove());
    overlay.querySelector('.kill-confirm-yes')!.addEventListener('click', async () => {
      overlay.remove();
      await this.killAgent();
    });
    // Click on backdrop to dismiss
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) overlay.remove();
    });
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

  dispose(): void {
    if (this.sparklineTimer) clearInterval(this.sparklineTimer);
    if (this.historyListener) this.store.off('agent:history', this.historyListener);
    this.store.off('agent:update', this.onUpdateBound);
    this.store.off('agent:idle', this.onIdleBound);
    this.store.off('agent:shutdown', this.onShutdownBound);
    this.panelEl.remove();
  }
}
