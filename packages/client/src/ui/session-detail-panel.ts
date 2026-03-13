import type { RecordedSession, RecordedAgent, RecordedTimelineEvent, LiveSessionSummary, ActivityEntry, AgentState, ZoneId } from '@agent-move/shared';
import { getFunnyName, ZONE_MAP, computeAgentCost, FILE_WRITE_TOOLS, FILE_READ_TOOLS } from '@agent-move/shared';
import { escapeHtml, escapeAttr, formatDuration, formatTokens, truncate, getSourceIcon, getSourceLabel, resolveAgentName } from '../utils/formatting.js';
import { fetchSession, fetchTimeline } from '../connection/session-api.js';
import type { StateStore } from '../connection/state-store.js';

/** Minimal shape for timeline event rendering (shared between recorded + live) */
interface TimelineEntry {
  timestamp: number;
  agentId: string;
  kind: string;
  zone?: ZoneId;
  tool?: string;
  toolArgs?: string;
  inputTokens?: number;
  outputTokens?: number;
}

/**
 * Session Detail Panel — slide-in panel for viewing full session details.
 * Works for both recorded sessions and live sessions.
 */
export class SessionDetailPanel {
  private panelEl: HTMLElement;
  private store: StateStore;
  private session: RecordedSession | null = null;
  private timeline: RecordedTimelineEvent[] = [];
  private liveSession: LiveSessionSummary | null = null;
  private isLive = false;
  private _onNavigateToAgent: ((agentId: string) => void) | null = null;
  private _onClose: (() => void) | null = null;
  private liveActivityEntries: Map<string, ActivityEntry[]> = new Map();
  /** Accumulated cost/tokens for agents that have shut down (lost from store) */
  private shutdownTotals = { cost: 0, input: 0, output: 0, tools: 0 };
  private liveListeners: Array<{ event: string; fn: (...args: any[]) => void }> = [];
  private renderDebounceTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(store: StateStore) {
    this.store = store;

    this.panelEl = document.createElement('div');
    this.panelEl.id = 'session-detail-panel';
    this.panelEl.innerHTML = `
      <div class="sd-header">
        <button id="sd-back" title="Back to session list">
          <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor"><path d="M20 11H7.83l5.59-5.59L12 4l-8 8 8 8 1.41-1.41L7.83 13H20v-2z"/></svg>
          Back
        </button>
      </div>
      <div id="sd-content" class="sd-content"></div>
    `;

    const rightPanel = document.getElementById('right-panel');
    if (rightPanel) {
      rightPanel.appendChild(this.panelEl);
    } else {
      document.body.appendChild(this.panelEl);
    }

    this.panelEl.querySelector('#sd-back')!.addEventListener('click', () => this.close());
  }

  setNavigateToAgentHandler(handler: (agentId: string) => void): void {
    this._onNavigateToAgent = handler;
  }

  setCloseHandler(handler: () => void): void {
    this._onClose = handler;
  }

  /** Open detail for a recorded session */
  async openRecorded(sessionId: string): Promise<void> {
    this.cleanupLiveListeners();
    this.isLive = false;
    this.liveSession = null;
    this.session = null;
    this.timeline = [];
    this.panelEl.classList.add('open');
    this.renderLoading();

    try {
      const [session, timeline] = await Promise.all([
        fetchSession(sessionId),
        fetchTimeline(sessionId),
      ]);
      this.session = session;
      this.timeline = timeline;
      this.renderSession();
    } catch (err) {
      console.error('Failed to load session:', err);
      this.renderError();
    }
  }

  /** Open detail for a live session */
  openLive(live: LiveSessionSummary): void {
    this.cleanupLiveListeners();
    this.isLive = true;
    this.liveSession = live;
    this.session = null;
    this.timeline = [];
    this.liveActivityEntries.clear();
    this.shutdownTotals = { cost: 0, input: 0, output: 0, tools: 0 };
    this.panelEl.classList.add('open');
    this.renderLiveSession();

    // Request history for all agents in this session
    const sessionAgents = this.getSessionAgents(live.rootSessionId);
    for (const ag of sessionAgents) {
      this.store.requestHistory(ag.id);
    }

    // Listen for history responses
    this.addLiveListener('agent:history', (data: { agentId: string; entries: ActivityEntry[] }) => {
      if (!this.isLive || !this.liveSession) return;
      const agent = this.store.getAgent(data.agentId);
      if (agent?.rootSessionId === this.liveSession.rootSessionId) {
        this.liveActivityEntries.set(data.agentId, data.entries);
        this.debouncedRenderLive();
      }
    });

    // Listen for live agent updates, spawns, and shutdowns to re-render
    const sessionHandler = (agent: AgentState) => {
      if (!this.isLive || !this.liveSession) return;
      if (agent.rootSessionId === this.liveSession.rootSessionId) {
        this.debouncedRenderLive();
      }
    };
    this.addLiveListener('agent:update', sessionHandler);
    this.addLiveListener('agent:spawn', sessionHandler);

    this.addLiveListener('agent:shutdown', (agentId: string) => {
      if (!this.isLive || !this.liveSession) return;
      // Agent is still in the store at this point (emit fires before delete).
      // Capture its cost/tokens so the session totals remain accurate after removal.
      const agent = this.store.getAgent(agentId);
      if (agent && agent.rootSessionId === this.liveSession.rootSessionId) {
        this.shutdownTotals.cost += computeAgentCost(agent);
        this.shutdownTotals.input += agent.totalInputTokens ?? 0;
        this.shutdownTotals.output += agent.totalOutputTokens ?? 0;
        this.shutdownTotals.tools += agent.toolUseCount ?? 0;
        this.debouncedRenderLive();
      }
    });
  }

  close(): void {
    this.cleanupLiveListeners();
    this.session = null;
    this.liveSession = null;
    this.timeline = [];
    this.liveActivityEntries.clear();
    this.panelEl.classList.remove('open');
    this._onClose?.();
  }

  private addLiveListener(event: string, fn: (...args: any[]) => void): void {
    this.store.on(event as any, fn);
    this.liveListeners.push({ event, fn });
  }

  private cleanupLiveListeners(): void {
    for (const { event, fn } of this.liveListeners) {
      this.store.off(event as any, fn);
    }
    this.liveListeners = [];
    if (this.renderDebounceTimer) {
      clearTimeout(this.renderDebounceTimer);
      this.renderDebounceTimer = null;
    }
  }

  private debouncedRenderLive(): void {
    if (this.renderDebounceTimer) return;
    this.renderDebounceTimer = setTimeout(() => {
      this.renderDebounceTimer = null;
      if (this.isLive && this.liveSession) {
        this.renderLiveSession();
      }
    }, 200);
  }

  isOpen(): boolean {
    return this.panelEl.classList.contains('open');
  }

  private getSessionAgents(rootSessionId: string): AgentState[] {
    const agents: AgentState[] = [];
    for (const ag of this.store.getAgents().values()) {
      if (ag.rootSessionId === rootSessionId) agents.push(ag);
    }
    return agents;
  }

  private renderLoading(): void {
    const content = this.panelEl.querySelector('#sd-content')!;
    content.innerHTML = '<div class="sd-loading">Loading session details...</div>';
  }

  private renderError(): void {
    const content = this.panelEl.querySelector('#sd-content')!;
    content.innerHTML = '<div class="sd-loading">Failed to load session.</div>';
  }

  private renderLiveSession(): void {
    const content = this.panelEl.querySelector('#sd-content')!;
    const s = this.liveSession!;
    const elapsedMs = Date.now() - s.startedAt;
    const startDate = new Date(s.startedAt);
    const sourceIcon = getSourceIcon(s.source);
    const sourceLabel = getSourceLabel(s.source);

    // Find live agents belonging to this session
    const sessionAgents = this.getSessionAgents(s.rootSessionId);

    // Aggregate cost/tokens from live agents + agents that already shut down
    let totalCost = this.shutdownTotals.cost;
    let totalInput = this.shutdownTotals.input;
    let totalOutput = this.shutdownTotals.output;
    let totalToolUses = this.shutdownTotals.tools;
    const models = new Set<string>();
    for (const ag of sessionAgents) {
      totalCost += computeAgentCost(ag);
      totalInput += ag.totalInputTokens ?? 0;
      totalOutput += ag.totalOutputTokens ?? 0;
      totalToolUses += ag.toolUseCount ?? 0;
      if (ag.model) models.add(ag.model);
    }
    // Merge all activity entries from agents, sorted by timestamp
    const allEntries: TimelineEntry[] = [];
    for (const [agentId, entries] of this.liveActivityEntries) {
      for (const e of entries) {
        allEntries.push({ timestamp: e.timestamp, agentId, kind: e.kind, zone: e.zone, tool: e.tool, toolArgs: e.toolArgs, inputTokens: e.inputTokens, outputTokens: e.outputTokens });
      }
    }
    allEntries.sort((a, b) => a.timestamp - b.timestamp);

    // Count tool usage from entries
    const toolCounts: Record<string, number> = {};
    for (const e of allEntries) {
      if (e.kind === 'tool' && e.tool) {
        toolCounts[e.tool] = (toolCounts[e.tool] ?? 0) + 1;
      }
    }
    const toolEntries = Object.entries(toolCounts).sort((a, b) => b[1] - a[1]);
    const maxToolCount = toolEntries.length > 0 ? toolEntries[0][1] : 1;

    content.innerHTML = `
      <div class="sd-card">
        <div class="sd-card-header">
          <span class="sh-source-badge">${sourceIcon}</span>
          <span class="sd-project-name">${escapeHtml(s.projectName)}</span>
          <span class="sh-status-badge sh-status-live"><span class="sh-live-dot"></span>Live</span>
        </div>
      </div>

      <div class="sd-section">
        <div class="sd-section-title">Overview</div>
        <div class="sd-info-grid">
          ${this.infoRow('Source', `<span class="sd-source-label">${sourceLabel}</span>`)}
          ${models.size > 0 ? this.infoRow('Model', `<code>${escapeHtml([...models].join(', '))}</code>`) : ''}
          ${this.infoRow('Started', startDate.toLocaleString())}
          ${this.infoRow('Elapsed', formatDuration(elapsedMs))}
          ${this.infoRow('Agents', String(sessionAgents.length))}
          ${this.infoRow('Session ID', `<code class="sd-session-id" title="Click to copy">${s.rootSessionId.slice(0, 20)}...</code>`)}
        </div>
      </div>

      ${totalCost > 0 || totalInput > 0 ? `
        <div class="sd-section">
          <div class="sd-section-title">Cost & Tokens (live)</div>
          <div class="sd-info-grid">
            ${this.infoRow('Total Cost', `<span class="sd-cost">$${totalCost.toFixed(3)}</span>`)}
            ${this.infoRow('Input Tokens', formatTokens(totalInput))}
            ${this.infoRow('Output Tokens', formatTokens(totalOutput))}
            ${this.infoRow('Tool Uses', String(totalToolUses))}
          </div>
        </div>
      ` : ''}

      ${sessionAgents.length > 0 ? `
        <div class="sd-section">
          <div class="sd-section-title">Active Agents (${sessionAgents.length})</div>
          <div class="sd-agents-list">
            ${sessionAgents.map(ag => {
              const name = ag.agentName || getFunnyName(ag.id);
              const statusClass = ag.isDone ? 'done' : ag.isIdle ? 'idle' : 'active';
              const elapsed = formatDuration(Date.now() - ag.spawnedAt);
              return `
                <div class="sd-agent-card">
                  <div class="sd-agent-header">
                    <span class="agent-status-dot ${statusClass}"></span>
                    <a href="#" class="sd-agent-link" data-agent-id="${escapeAttr(ag.id)}">${escapeHtml(name)}</a>
                    <span class="sd-agent-role">${ag.role.toUpperCase()}</span>
                  </div>
                  <div class="sd-agent-meta">
                    ${ag.model ? `<span>${escapeHtml(ag.model)}</span>` : ''}
                    <span>${elapsed}</span>
                    <span>${ag.currentTool ? escapeHtml(ag.currentTool) : 'idle'}</span>
                    <span>$${computeAgentCost(ag).toFixed(3)}</span>
                    <span>${formatTokens((ag.totalInputTokens ?? 0) + (ag.totalOutputTokens ?? 0))} tok</span>
                  </div>
                </div>
              `;
            }).join('')}
          </div>
        </div>
      ` : ''}

      ${toolEntries.length > 0 ? `
        <div class="sd-section">
          <div class="sd-section-title">Tool Usage (${totalToolUses} total)</div>
          <div class="sd-tool-list">
            ${this.renderToolBars(toolEntries, maxToolCount)}
          </div>
        </div>
      ` : ''}

      ${allEntries.length > 0 ? `
        <div class="sd-section">
          <div class="sd-section-title">Activity History (${allEntries.length} events)</div>
          <div class="sd-timeline">
            ${this.renderTimelineEvents(allEntries, s.startedAt, id => {
              const agent = this.store.getAgent(id);
              return agent?.agentName || getFunnyName(id);
            })}
          </div>
        </div>
      ` : ''}
    `;

    this.bindAgentLinks(content);
    this.bindSessionIdCopy(content);
  }

  private renderSession(): void {
    const content = this.panelEl.querySelector('#sd-content')!;
    const s = this.session!;
    const startDate = new Date(s.startedAt);
    const endDate = new Date(s.endedAt);
    const sourceIcon = getSourceIcon(s.source);
    const sourceLabel = getSourceLabel(s.source);

    // Calculate derived metrics
    const allInput = s.totalInputTokens + s.totalCacheReadTokens;
    const cacheRate = allInput > 0 ? (s.totalCacheReadTokens / allInput) * 100 : 0;
    const tokensPerMin = s.durationMs > 0 ? (s.totalInputTokens + s.totalOutputTokens) / (s.durationMs / 60_000) : 0;

    // Tool usage from toolchain
    const toolCounts = s.toolChain?.toolCounts ?? {};
    const toolEntries = Object.entries(toolCounts).sort((a, b) => b[1] - a[1]);
    const maxToolCount = toolEntries.length > 0 ? toolEntries[0][1] : 1;

    // File analysis from timeline
    const fileInfo = this.analyzeFiles();
    const fileEntries = Object.entries(fileInfo).sort((a, b) => (b[1].readCount + b[1].writeCount) - (a[1].readCount + a[1].writeCount));

    // Build set of live agent IDs for navigation links (single pass)
    const liveAgentIds = new Set<string>();
    for (const la of this.store.getAgents().values()) {
      liveAgentIds.add(la.id);
    }

    content.innerHTML = `
      <div class="sd-card">
        <div class="sd-card-header">
          <span class="sh-source-badge">${sourceIcon}</span>
          <span class="sd-project-name">${escapeHtml(s.projectName)}</span>
          ${s.label ? `<span class="sh-label">${escapeHtml(s.label)}</span>` : ''}
        </div>
        ${s.projectPath ? `<div class="sd-project-path">${escapeHtml(s.projectPath)}</div>` : ''}
      </div>

      <div class="sd-section">
        <div class="sd-section-title">Overview</div>
        <div class="sd-info-grid">
          ${this.infoRow('Source', `<span class="sd-source-label">${sourceLabel}</span>`)}
          ${s.model ? this.infoRow('Model', `<code>${escapeHtml(s.model)}</code>`) : ''}
          ${this.infoRow('Started', startDate.toLocaleString())}
          ${this.infoRow('Ended', endDate.toLocaleString())}
          ${this.infoRow('Duration', formatDuration(s.durationMs))}
          ${this.infoRow('Session ID', `<code class="sd-session-id" title="Click to copy">${s.rootSessionId.slice(0, 20)}...</code>`)}
        </div>
      </div>

      <div class="sd-section">
        <div class="sd-section-title">Cost & Tokens</div>
        <div class="sd-info-grid">
          ${this.infoRow('Total Cost', `<span class="sd-cost">$${s.totalCost.toFixed(3)}</span>`)}
          ${this.infoRow('Input Tokens', formatTokens(s.totalInputTokens))}
          ${this.infoRow('Output Tokens', formatTokens(s.totalOutputTokens))}
          ${this.infoRow('Cache Read', formatTokens(s.totalCacheReadTokens))}
          ${this.infoRow('Cache Created', formatTokens(s.totalCacheCreationTokens))}
          ${this.infoRow('Cache Hit', `${cacheRate.toFixed(1)}%`)}
          ${this.infoRow('Tokens/min', formatTokens(Math.round(tokensPerMin)))}
        </div>
      </div>

      ${s.agents.length > 0 ? `
        <div class="sd-section">
          <div class="sd-section-title">Agents (${s.agents.length})</div>
          <div class="sd-agents-list">
            ${s.agents.map(ag => this.renderAgent(ag, liveAgentIds.has(ag.agentId))).join('')}
          </div>
        </div>
      ` : ''}

      ${toolEntries.length > 0 ? `
        <div class="sd-section">
          <div class="sd-section-title">Tool Usage (${s.totalToolUses} total)</div>
          <div class="sd-tool-list">
            ${this.renderToolBars(toolEntries, maxToolCount)}
          </div>
        </div>
      ` : ''}

      ${fileEntries.length > 0 ? `
        <div class="sd-section">
          <div class="sd-section-title">Files (${fileEntries.length} unique)</div>
          <div class="sd-file-list">
            ${fileEntries.slice(0, 30).map(([path, info]) => {
              const shortPath = this.shortenPath(path, s.projectPath);
              return `
                <div class="sd-file-row">
                  <span class="sd-file-path" title="${escapeAttr(path)}">${escapeHtml(shortPath)}</span>
                  <span class="sd-file-counts">
                    ${info.readCount > 0 ? `<span class="sd-file-read" title="Read ${info.readCount} times">R:${info.readCount}</span>` : ''}
                    ${info.writeCount > 0 ? `<span class="sd-file-write" title="Written ${info.writeCount} times">W:${info.writeCount}</span>` : ''}
                  </span>
                </div>
              `;
            }).join('')}
            ${fileEntries.length > 30 ? `<div class="sd-file-more">+${fileEntries.length - 30} more files</div>` : ''}
          </div>
        </div>
      ` : ''}

      ${this.timeline.length > 0 ? `
        <div class="sd-section">
          <div class="sd-section-title">Timeline (${this.timeline.length} events)</div>
          <div class="sd-timeline">
            ${this.renderTimelineEvents(this.timeline, s.startedAt, id => this.getAgentName(id))}
          </div>
        </div>
      ` : ''}
    `;

    this.bindAgentLinks(content);
    this.bindSessionIdCopy(content);
  }

  private renderAgent(ag: RecordedAgent, canNavigate: boolean): string {
    const name = resolveAgentName(ag);
    const duration = formatDuration(ag.endedAt - ag.spawnedAt);
    const totalTokens = ag.totalInputTokens + ag.totalOutputTokens;

    return `
      <div class="sd-agent-card">
        <div class="sd-agent-header">
          ${canNavigate
            ? `<a href="#" class="sd-agent-link" data-agent-id="${escapeAttr(ag.agentId)}" title="View in monitor">${escapeHtml(name)}</a>`
            : `<span class="sd-agent-name-text">${escapeHtml(name)}</span>`
          }
          <span class="sd-agent-role">${ag.role.toUpperCase()}</span>
        </div>
        <div class="sd-agent-meta">
          ${ag.model ? `<span>${escapeHtml(ag.model)}</span>` : ''}
          <span>$${ag.cost.toFixed(3)}</span>
          <span>${ag.toolUseCount} tools</span>
          <span>${formatTokens(totalTokens)} tok</span>
          <span>${duration}</span>
        </div>
        <div class="sd-agent-tokens">
          <span>${formatTokens(ag.totalInputTokens)} in</span>
          <span>${formatTokens(ag.totalOutputTokens)} out</span>
          <span>${formatTokens(ag.cacheReadTokens)} cached</span>
        </div>
      </div>
    `;
  }

  /** Unified timeline renderer for both recorded and live sessions */
  private renderTimelineEvents(
    events: TimelineEntry[],
    startTime: number,
    resolveName: (agentId: string) => string,
  ): string {
    const recent = events.slice(-100);

    return recent.map(e => {
      const elapsed = formatDuration(e.timestamp - startTime);
      const agentName = resolveName(e.agentId);

      switch (e.kind) {
        case 'tool': {
          const args = e.toolArgs ? ` ${truncate(e.toolArgs, 60)}` : '';
          return `<div class="sd-tl-event sd-tl-tool">
            <span class="sd-tl-time">${elapsed}</span>
            <span class="sd-tl-agent">${escapeHtml(agentName)}</span>
            <span class="sd-tl-icon">&#128295;</span>
            <span class="sd-tl-tool-name">${escapeHtml(e.tool ?? 'unknown')}</span>
            <span class="sd-tl-args">${escapeHtml(args)}</span>
          </div>`;
        }
        case 'spawn':
          return `<div class="sd-tl-event sd-tl-spawn">
            <span class="sd-tl-time">${elapsed}</span>
            <span class="sd-tl-agent">${escapeHtml(agentName)}</span>
            <span class="sd-tl-icon">&#9889;</span> Spawned
          </div>`;
        case 'shutdown':
          return `<div class="sd-tl-event sd-tl-shutdown">
            <span class="sd-tl-time">${elapsed}</span>
            <span class="sd-tl-agent">${escapeHtml(agentName)}</span>
            <span class="sd-tl-icon">&#128721;</span> Shut down
          </div>`;
        case 'idle':
          return `<div class="sd-tl-event sd-tl-idle">
            <span class="sd-tl-time">${elapsed}</span>
            <span class="sd-tl-agent">${escapeHtml(agentName)}</span>
            <span class="sd-tl-icon">&#9749;</span> Idle
          </div>`;
        case 'zone-change': {
          const zone = e.zone ? ZONE_MAP.get(e.zone) : null;
          return `<div class="sd-tl-event sd-tl-zone">
            <span class="sd-tl-time">${elapsed}</span>
            <span class="sd-tl-agent">${escapeHtml(agentName)}</span>
            <span class="sd-tl-icon">&#128694;</span> ${zone?.icon ?? ''} ${zone?.label ?? e.zone ?? ''}
          </div>`;
        }
        case 'tokens':
          return `<div class="sd-tl-event sd-tl-tokens">
            <span class="sd-tl-time">${elapsed}</span>
            <span class="sd-tl-agent">${escapeHtml(agentName)}</span>
            <span class="sd-tl-icon">&#127916;</span> +${formatTokens(e.inputTokens ?? 0)} in / +${formatTokens(e.outputTokens ?? 0)} out
          </div>`;
        default:
          return '';
      }
    }).join('');
  }

  private renderToolBars(toolEntries: [string, number][], maxCount: number): string {
    return toolEntries.map(([tool, count]) => {
      const pct = (count / maxCount) * 100;
      return `
        <div class="sd-tool-row">
          <span class="sd-tool-name">${escapeHtml(tool)}</span>
          <div class="sd-tool-bar-track">
            <div class="sd-tool-bar-fill" style="width:${Math.max(2, pct)}%"></div>
          </div>
          <span class="sd-tool-count">${count}</span>
        </div>
      `;
    }).join('');
  }

  private getAgentName(agentId: string): string {
    if (this.session) {
      const ag = this.session.agents.find(a => a.agentId === agentId);
      if (ag) return resolveAgentName(ag);
    }
    return getFunnyName(agentId);
  }

  private analyzeFiles(): Record<string, { readCount: number; writeCount: number }> {
    const files: Record<string, { readCount: number; writeCount: number }> = {};
    for (const e of this.timeline) {
      if (e.kind !== 'tool' || !e.tool || !e.toolArgs) continue;
      const isWrite = FILE_WRITE_TOOLS.has(e.tool);
      const isRead = FILE_READ_TOOLS.has(e.tool);
      if (!isWrite && !isRead) continue;

      const pathMatch = e.toolArgs.match(/(?:file_path|path|file)["']?\s*[:=]\s*["']?([^\s"',}]+)/i);
      if (!pathMatch) continue;
      const filePath = pathMatch[1];

      if (!files[filePath]) files[filePath] = { readCount: 0, writeCount: 0 };
      if (isWrite) files[filePath].writeCount++;
      else files[filePath].readCount++;
    }
    return files;
  }

  private shortenPath(filePath: string, projectPath: string): string {
    const normalized = filePath.replace(/\\/g, '/');
    const projDir = projectPath.replace(/\\/g, '/').replace(/\/$/, '') + '/';
    return normalized.startsWith(projDir) ? normalized.slice(projDir.length) : normalized;
  }

  private infoRow(label: string, value: string): string {
    return `<div class="sd-info-row">
      <span class="sd-info-label">${label}</span>
      <span class="sd-info-value">${value}</span>
    </div>`;
  }

  private bindAgentLinks(container: Element): void {
    container.querySelectorAll<HTMLElement>('.sd-agent-link').forEach(el => {
      el.addEventListener('click', (e) => {
        e.preventDefault();
        const agentId = el.dataset.agentId;
        if (agentId && this._onNavigateToAgent) {
          this._onNavigateToAgent(agentId);
        }
      });
    });
  }

  private bindSessionIdCopy(container: Element): void {
    container.querySelectorAll<HTMLElement>('.sd-session-id').forEach(el => {
      el.addEventListener('click', () => {
        const fullId = this.session?.rootSessionId ?? this.liveSession?.rootSessionId ?? '';
        if (fullId) navigator.clipboard.writeText(fullId).catch(() => {});
      });
    });
  }

  dispose(): void {
    this.cleanupLiveListeners();
    this.panelEl.remove();
  }
}
