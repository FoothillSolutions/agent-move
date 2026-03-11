import type { AgentState, ZoneId } from '@agent-move/shared';
import { AGENT_PALETTES, ZONE_MAP, ZONES, getFunnyName, getProjectColorIndex, getContextWindow } from '@agent-move/shared';
import type { StateStore, ConnectionStatus } from '../connection/state-store.js';
import { escapeHtml, escapeAttr, truncate, formatTokenPair, hexToCss, getCliBadge } from '../utils/formatting.js';

type FilterMode = 'all' | 'active' | 'idle' | 'done' | ZoneId | `project:${string}`;

interface TokenHistory {
  samples: number[];
}

interface ToolMetrics {
  toolTimestamps: number[];
  failCount: number;
}

export class Overlay {
  private store: StateStore;
  private agentListEl: HTMLElement;
  private filterEl: HTMLElement;
  private refreshTimer: ReturnType<typeof setInterval>;
  private onAgentClick: ((agentId: string) => void) | null = null;
  private _customizationLookup: ((agent: AgentState) => { displayName: string; colorIndex: number }) | null = null;
  private currentFilter: FilterMode = 'all';
  private collapsedGroups = new Set<string>();
  private renderPending = false;
  scheduleRender: () => void;

  private tokenHistory = new Map<string, TokenHistory>();
  private sparklineSampleTimer: ReturnType<typeof setInterval>;

  private _metrics = new Map<string, ToolMetrics>();

  setAgentClickHandler(handler: (agentId: string) => void): void {
    this.onAgentClick = handler;
  }

  setCustomizationLookup(lookup: (agent: AgentState) => { displayName: string; colorIndex: number }): void {
    this._customizationLookup = lookup;
  }

  constructor(store: StateStore) {
    this.store = store;
    this.agentListEl = document.getElementById('agent-list')!;

    // Create filter pills
    this.filterEl = document.createElement('div');
    this.filterEl.id = 'filter-pills';
    this.agentListEl.parentElement!.insertBefore(this.filterEl, this.agentListEl);
    this.renderFilters();

    // Coalesced rendering
    this.scheduleRender = () => {
      if (!this.renderPending) {
        this.renderPending = true;
        requestAnimationFrame(() => {
          this.renderPending = false;
          this.renderAgents();
        });
      }
    };
    this.store.on('agent:spawn', this.scheduleRender);
    this.store.on('agent:update', this.onAgentUpdate);
    this.store.on('agent:idle', this.scheduleRender);
    this.store.on('agent:shutdown', this.scheduleRender);
    this.store.on('state:reset', this.scheduleRender);

    this.refreshTimer = setInterval(this.scheduleRender, 500);
    this.sparklineSampleTimer = setInterval(() => this.sampleSparklines(), 2000);
  }

  private onAgentUpdate = (agent: AgentState): void => {
    // Track tool velocity metrics
    let metrics = this._metrics.get(agent.id);
    if (!metrics) {
      metrics = { toolTimestamps: [], failCount: 0 };
      this._metrics.set(agent.id, metrics);
    }

    if (agent.currentTool) {
      const now = Date.now();
      const lastTs = metrics.toolTimestamps.length > 0
        ? metrics.toolTimestamps[metrics.toolTimestamps.length - 1]
        : 0;
      // Dedup within 1s
      if (now - lastTs > 1000) {
        metrics.toolTimestamps.push(now);
      }
    }

    if (agent.lastToolOutcome === 'failure') {
      metrics.failCount++;
    }

    // Clear timestamps older than 5 minutes
    const cutoff = Date.now() - 5 * 60 * 1000;
    metrics.toolTimestamps = metrics.toolTimestamps.filter(ts => ts >= cutoff);

    this.scheduleRender();
  };

  private sampleSparklines(): void {
    const agents = this.store.getAgents();
    for (const [id, agent] of agents) {
      let hist = this.tokenHistory.get(id);
      if (!hist) {
        hist = { samples: [] };
        this.tokenHistory.set(id, hist);
      }
      hist.samples.push(agent.totalInputTokens + agent.totalOutputTokens);
      if (hist.samples.length > 30) hist.samples.shift();
    }
    for (const id of this.tokenHistory.keys()) {
      if (!agents.has(id)) this.tokenHistory.delete(id);
    }
    // Clean up metrics for removed agents
    for (const id of this._metrics.keys()) {
      if (!agents.has(id)) this._metrics.delete(id);
    }
  }

  private toggleGroup(groupId: string): void {
    if (this.collapsedGroups.has(groupId)) {
      this.collapsedGroups.delete(groupId);
    } else {
      this.collapsedGroups.add(groupId);
    }
    this.renderAgents();
  }

  private renderFilters(): void {
    const filters: { label: string; value: FilterMode }[] = [
      { label: 'All', value: 'all' },
      { label: 'Active', value: 'active' },
      { label: 'Idle', value: 'idle' },
      { label: 'Done', value: 'done' },
    ];

    const allAgents = Array.from(this.store.getAgents().values());
    const doneCount = allAgents.filter(a => a.isDone).length;

    // Collect unique project names for project filter
    const projectNames = [...new Set(allAgents.map(a => a.projectName).filter(Boolean))] as string[];
    const showProjectFilter = projectNames.length > 1;
    const currentProjectFilter = typeof this.currentFilter === 'string' && this.currentFilter.startsWith('project:')
      ? this.currentFilter.slice('project:'.length) : '';

    this.filterEl.innerHTML = filters.map(f => {
      const badge = f.value === 'done' && doneCount > 0 ? ` <span class="filter-badge">${doneCount}</span>` : '';
      return `<button class="filter-pill${this.currentFilter === f.value ? ' active' : ''}" data-filter="${f.value}">${f.label}${badge}</button>`;
    }).join('') + `
      <select class="filter-zone-select" title="Filter by zone">
        <option value="">Zone...</option>
        ${ZONES.map(z => `<option value="${z.id}" ${this.currentFilter === z.id ? 'selected' : ''}>${z.icon} ${z.label}</option>`).join('')}
      </select>
      ${showProjectFilter ? `<select class="filter-zone-select filter-project-select" title="Filter by project">
        <option value="">Project...</option>
        ${projectNames.sort().map(p => `<option value="project:${escapeAttr(p)}" ${currentProjectFilter === p ? 'selected' : ''}>${escapeHtml(p)}</option>`).join('')}
      </select>` : ''}
      ${doneCount > 0 ? `<button class="clean-done-btn" title="Remove ${doneCount} done agent${doneCount > 1 ? 's' : ''}">Clean up (${doneCount})</button>` : ''}
    `;

    this.filterEl.querySelectorAll('.filter-pill').forEach(btn => {
      btn.addEventListener('click', () => {
        this.currentFilter = (btn as HTMLElement).dataset.filter as FilterMode;
        (this.filterEl.querySelector('.filter-zone-select') as HTMLSelectElement).value = '';
        const projSelect = this.filterEl.querySelector('.filter-project-select') as HTMLSelectElement | null;
        if (projSelect) projSelect.value = '';
        this.renderFilters();
        this.renderAgents();
      });
    });

    const zoneSelect = this.filterEl.querySelector('.filter-zone-select:not(.filter-project-select)') as HTMLSelectElement;
    zoneSelect.addEventListener('change', () => {
      if (zoneSelect.value) {
        this.currentFilter = zoneSelect.value as ZoneId;
      } else {
        this.currentFilter = 'all';
      }
      const projSelect = this.filterEl.querySelector('.filter-project-select') as HTMLSelectElement | null;
      if (projSelect) projSelect.value = '';
      this.renderFilters();
      this.renderAgents();
    });

    const projectSelect = this.filterEl.querySelector('.filter-project-select') as HTMLSelectElement | null;
    if (projectSelect) {
      projectSelect.addEventListener('change', () => {
        if (projectSelect.value) {
          this.currentFilter = projectSelect.value as FilterMode;
        } else {
          this.currentFilter = 'all';
        }
        zoneSelect.value = '';
        this.renderFilters();
        this.renderAgents();
      });
    }

    const cleanBtn = this.filterEl.querySelector('.clean-done-btn');
    if (cleanBtn) {
      cleanBtn.addEventListener('click', () => this.cleanDoneAgents());
    }
  }

  private shortenId(id: string): string {
    return id.length > 8 ? id.slice(0, 8) : id;
  }

  private roleBadge(role: string): string {
    const badges: Record<string, { label: string; color: string }> = {
      'main': { label: 'MAIN', color: '#4a90d9' },
      'subagent': { label: 'SUB', color: '#ab47bc' },
      'team-lead': { label: 'LEAD', color: '#ff9800' },
      'team-member': { label: 'MEMBER', color: '#26c6da' },
    };
    const b = badges[role] ?? { label: role.toUpperCase(), color: '#888' };
    return `<span style="
      background: ${b.color}33;
      color: ${b.color};
      padding: 1px 6px;
      border-radius: 3px;
      font-size: 10px;
      font-weight: bold;
      margin-left: 6px;
    ">${b.label}</span>`;
  }

  private filterAgents(agents: AgentState[]): AgentState[] {
    const f = this.currentFilter;
    if (typeof f === 'string' && f.startsWith('project:')) {
      const projectName = f.slice('project:'.length);
      return agents.filter(a => a.projectName === projectName);
    }
    switch (f) {
      case 'all':
        return agents;
      case 'active':
        return agents.filter(a => !a.isIdle && !a.isDone);
      case 'idle':
        return agents.filter(a => a.isIdle && !a.isDone);
      case 'done':
        return agents.filter(a => a.isDone);
      default:
        return agents.filter(a => a.currentZone === f);
    }
  }

  private renderAgents(): void {
    let agents = Array.from(this.store.getAgents().values());
    const totalCount = agents.length;

    agents = this.filterAgents(agents);

    if (agents.length === 0) {
      if (totalCount === 0) {
        // Empty state: no agents at all
        this.agentListEl.innerHTML = `
          <div class="empty-state">
            <div class="empty-icon">
              <svg viewBox="0 0 48 48" width="48" height="48" fill="none" stroke="currentColor" stroke-width="1.5">
                <rect x="14" y="6" width="20" height="16" rx="3" />
                <circle cx="20" cy="14" r="2" fill="currentColor"/>
                <circle cx="28" cy="14" r="2" fill="currentColor"/>
                <rect x="16" y="24" width="16" height="14" rx="2" />
                <rect x="10" y="26" width="6" height="4" rx="1" />
                <rect x="32" y="26" width="6" height="4" rx="1" />
                <rect x="18" y="38" width="4" height="6" rx="1" />
                <rect x="26" y="38" width="4" height="6" rx="1" />
              </svg>
            </div>
            <div class="empty-title">Waiting for agents</div>
            <div class="empty-desc">Start a Claude Code session and agents will appear here automatically</div>
          </div>`;
      } else {
        const filterMsg = `No ${this.currentFilter} agents (${totalCount} total)`;
        this.agentListEl.innerHTML = `<div class="empty-state"><div class="empty-desc">${filterMsg}</div></div>`;
      }
      return;
    }

    agents.sort((a, b) => {
      if (a.isDone !== b.isDone) return a.isDone ? 1 : -1;
      if (a.isIdle !== b.isIdle) return a.isIdle ? 1 : -1;
      return a.spawnedAt - b.spawnedAt;
    });

    const allAgentsMap = this.store.getAgents();

    const subAgents = agents.filter(a => a.role === 'subagent');
    const nonSubAgents = agents.filter(a => a.role !== 'subagent');
    const orphanSubs: AgentState[] = [];

    const filteredNonSubIds = new Set(nonSubAgents.map(a => a.id));
    const childrenOf = new Map<string, AgentState[]>();
    for (const sub of subAgents) {
      if (sub.parentId && filteredNonSubIds.has(sub.parentId)) {
        let list = childrenOf.get(sub.parentId);
        if (!list) { list = []; childrenOf.set(sub.parentId, list); }
        list.push(sub);
      } else {
        orphanSubs.push(sub);
      }
    }

    const totalSubCountOf = new Map<string, number>();
    for (const a of allAgentsMap.values()) {
      if (a.parentId && a.role === 'subagent') {
        totalSubCountOf.set(a.parentId, (totalSubCountOf.get(a.parentId) ?? 0) + 1);
      }
    }

    const teamGroups = new Map<string, AgentState[]>();
    const standalone: AgentState[] = [];
    for (const agent of nonSubAgents) {
      if (agent.teamName) {
        const groupKey = `${agent.rootSessionId}:${agent.teamName}`;
        let list = teamGroups.get(groupKey);
        if (!list) { list = []; teamGroups.set(groupKey, list); }
        list.push(agent);
      } else {
        standalone.push(agent);
      }
    }

    let html = '';

    for (const [groupKey, members] of teamGroups) {
      const colonIdx = groupKey.indexOf(':');
      const teamName = colonIdx >= 0 ? groupKey.slice(colonIdx + 1) : groupKey;
      const rootId = members[0]?.rootSessionId;

      members.sort((a, b) => {
        if (a.role === 'team-lead' && b.role !== 'team-lead') return -1;
        if (a.role !== 'team-lead' && b.role === 'team-lead') return 1;
        return 0;
      });

      let totalTeamCount = 0;
      for (const a of allAgentsMap.values()) {
        if (a.teamName === teamName && a.rootSessionId === rootId) totalTeamCount++;
      }

      const groupId = `team:${groupKey}`;
      const isCollapsed = this.collapsedGroups.has(groupId);

      html += `<div class="agent-group${isCollapsed ? ' collapsed' : ''}">`;
      html += `<div class="group-header" role="button" tabindex="0" data-group-id="${escapeAttr(groupId)}">
        <span class="group-chevron">${isCollapsed ? '&#9656;' : '&#9662;'}</span>
        <span class="group-icon">&#128101;</span>
        <span class="group-name">${escapeHtml(teamName)}</span>
        <span class="group-count">${totalTeamCount}</span>
      </div>`;

      if (!isCollapsed) {
        html += `<div class="group-children">`;
        for (const member of members) {
          html += this.renderAgentWithSubs(member, childrenOf, totalSubCountOf);
        }
        html += `</div>`;
      }

      html += `</div>`;
    }

    for (const agent of standalone) {
      html += this.renderAgentWithSubs(agent, childrenOf, totalSubCountOf);
    }

    for (const orphan of orphanSubs) {
      html += this.renderCard(orphan, true);
    }

    this.agentListEl.innerHTML = html;

    // Bind handlers
    this.agentListEl.querySelectorAll('.group-header').forEach(el => {
      el.addEventListener('click', () => {
        const groupId = (el as HTMLElement).dataset.groupId;
        if (groupId) this.toggleGroup(groupId);
      });
      el.addEventListener('keydown', (e) => {
        if ((e as KeyboardEvent).key === 'Enter' || (e as KeyboardEvent).key === ' ') {
          (e as KeyboardEvent).preventDefault();
          const groupId = (el as HTMLElement).dataset.groupId;
          if (groupId) this.toggleGroup(groupId);
        }
      });
    });

    this.agentListEl.querySelectorAll('.sub-collapse-bar').forEach(el => {
      el.addEventListener('click', () => {
        const groupId = (el as HTMLElement).dataset.groupId;
        if (groupId) this.toggleGroup(groupId);
      });
    });

    this.agentListEl.querySelectorAll('.agent-card[data-agent-id]').forEach((el) => {
      el.addEventListener('click', () => {
        const id = (el as HTMLElement).dataset.agentId;
        if (id && this.onAgentClick) this.onAgentClick(id);
      });
    });

    this.agentListEl.querySelectorAll('.sparkline-canvas').forEach((canvas) => {
      const agentId = (canvas as HTMLElement).dataset.agentId;
      if (agentId) this.drawSparkline(canvas as HTMLCanvasElement, agentId);
    });

    this.agentListEl.querySelectorAll('.agent-sparkline').forEach((canvas) => {
      const agentId = (canvas as HTMLElement).dataset.agentId;
      if (agentId) this.drawToolVelocitySparkline(canvas as HTMLCanvasElement, agentId);
    });
  }

  private renderAgentWithSubs(
    agent: AgentState,
    childrenOf: Map<string, AgentState[]>,
    totalSubCountOf: Map<string, number>,
    isChild = false,
  ): string {
    const children = childrenOf.get(agent.id);
    const subCount = totalSubCountOf.get(agent.id) ?? 0;
    const hasVisibleChildren = children && children.length > 0;

    let html = '';

    if (hasVisibleChildren) {
      const groupId = `sub:${agent.id}`;
      const isCollapsed = this.collapsedGroups.has(groupId);

      html += this.renderCard(agent, isChild, 0);

      const chevron = isCollapsed ? '&#9656;' : '&#9662;';
      const label = `${subCount} subagent${subCount > 1 ? 's' : ''}`;
      html += `<div class="sub-collapse-bar${isCollapsed ? ' is-collapsed' : ''}" data-group-id="${escapeAttr(groupId)}">
        <span class="sub-collapse-chevron">${chevron}</span>
        <span class="sub-collapse-label">${label}</span>
      </div>`;

      if (!isCollapsed) {
        html += `<div class="subagent-group">`;
        for (const child of children) {
          html += this.renderAgentWithSubs(child, childrenOf, totalSubCountOf, true);
        }
        html += `</div>`;
      }
    } else {
      html += this.renderCard(agent, isChild, subCount);
    }

    return html;
  }

  private getHealthColor(agent: AgentState): string {
    if (agent.isDone || agent.isIdle) return '#888'; // gray
    const metrics = this._metrics.get(agent.id);
    if (metrics && metrics.failCount > 0) {
      // Check recent fail rate: if failCount is high relative to tool usage, red
      const recentToolCount = metrics.toolTimestamps.length;
      if (recentToolCount > 0 && metrics.failCount / recentToolCount > 0.3) {
        return '#ef4444'; // red
      }
      return '#eab308'; // yellow - some errors
    }
    // Active and healthy
    return '#22c55e'; // green
  }

  private renderCard(agent: AgentState, isChild = false, subCount = 0): string {
    const custom = this._customizationLookup?.(agent);
    const colorIndex = custom?.colorIndex ?? agent.colorIndex;
    const palette = AGENT_PALETTES[colorIndex % AGENT_PALETTES.length];
    const borderColor = hexToCss(palette.body);
    const zone = ZONE_MAP.get(agent.currentZone);
    const zoneName = zone ? zone.label : agent.currentZone;
    const toolText = agent.currentTool ?? 'none';
    const tokens = formatTokenPair(agent.totalInputTokens, agent.totalOutputTokens);
    const name = custom?.displayName || agent.agentName || getFunnyName(agent.sessionId);
    const childClass = isChild ? ' agent-card-child' : '';
    const doneClass = agent.isDone ? ' agent-card-done' : '';
    const doneBadge = agent.isDone ? '<span class="status-badge done">DONE</span>' : '';
    const subBadge = subCount > 0 ? `<span class="sub-count" title="${subCount} subagent${subCount > 1 ? 's' : ''}">${subCount} sub${subCount > 1 ? 's' : ''}</span>` : '';
    const projColorIdx = agent.projectPath ? getProjectColorIndex(agent.projectPath) : colorIndex;
    const projColor = hexToCss(AGENT_PALETTES[projColorIdx % AGENT_PALETTES.length].body);
    const projectBadge = agent.projectName ? `<span style="
      background: ${projColor}33;
      color: ${projColor};
      padding: 1px 5px;
      border-radius: 3px;
      font-size: 9px;
      margin-left: 4px;
    ">${escapeHtml(agent.projectName)}</span>` : '';
    const cliBadge = getCliBadge(agent.agentType);

    // Status dot instead of opacity
    const statusClass = agent.isDone ? 'done' : agent.isIdle ? 'idle' : 'active';

    // Health dot color
    const healthColor = this.getHealthColor(agent);

    return `<div class="agent-card${childClass}${doneClass}" data-agent-id="${agent.id}" style="border-left: 3px solid ${borderColor};">
      <div class="card-top-row">
        <div class="name">
          <span class="agent-status-dot ${statusClass}"></span>
          ${isChild ? '<span class="child-connector">&#8627;</span>' : ''}${escapeHtml(name)}${cliBadge}${this.roleBadge(agent.role)}${projectBadge}${doneBadge}${subBadge}
        </div>
        <div class="card-actions">
          <div class="agent-metrics">
            <canvas class="agent-sparkline" data-agent-id="${agent.id}" data-color-index="${colorIndex}" width="60" height="16"></canvas>
            <span class="agent-health-dot" style="background: ${healthColor};"></span>
          </div>
          <canvas class="sparkline-canvas" data-agent-id="${agent.id}" width="60" height="20"></canvas>
        </div>
      </div>
      ${agent.taskDescription ? `<div class="task-desc" title="${escapeAttr(agent.taskDescription)}">${escapeHtml(truncate(agent.taskDescription, 48))}</div>` : ''}
      <div class="zone">${zone?.icon ?? ''} ${zoneName} · ${toolText}</div>
      <div class="card-tokens">${agent.contextTokens > 0 ? (() => {
        const ctxWindow = getContextWindow(agent.model);
        const pct = Math.round(agent.contextTokens / ctxWindow * 100);
        const color = pct >= 90 ? '#ef4444' : pct >= 75 ? '#f97316' : pct >= 50 ? '#eab308' : '#22c55e';
        const newTok = agent.contextTokens - agent.contextCacheTokens;
        const fmtK = (n: number) => n >= 1000 ? `${Math.round(n / 1000)}k` : `${n}`;
        return `<span class="detail-ctx-bar" title="Context window: ${pct}% full&#10;${newTok.toLocaleString()} new + ${agent.contextCacheTokens.toLocaleString()} cached = ${agent.contextTokens.toLocaleString()} / ${ctxWindow.toLocaleString()}"><span class="detail-ctx-breakdown">${fmtK(newTok)} new · ${fmtK(agent.contextCacheTokens)} cached</span><span class="detail-ctx-track"><span class="detail-ctx-fill" style="width:${pct}%;background:${color}"></span></span><span class="detail-ctx-label" style="color:${color}">${pct}%</span></span>`;
      })() : `<span>${tokens}</span>`}</div>
    </div>`;
  }

  private getToolVelocityBars(agentId: string): number[] {
    const metrics = this._metrics.get(agentId);
    if (!metrics || metrics.toolTimestamps.length === 0) return [];

    const now = Date.now();
    const windowSize = 30_000; // 30 seconds per window
    const numWindows = 10;
    const bars: number[] = new Array(numWindows).fill(0);

    for (const ts of metrics.toolTimestamps) {
      const age = now - ts;
      const windowIndex = Math.floor(age / windowSize);
      if (windowIndex >= 0 && windowIndex < numWindows) {
        // Reverse so index 0 = oldest, index 9 = most recent
        bars[numWindows - 1 - windowIndex]++;
      }
    }

    return bars;
  }

  private drawToolVelocitySparkline(canvas: HTMLCanvasElement, agentId: string): void {
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const w = canvas.width;
    const h = canvas.height;
    ctx.clearRect(0, 0, w, h);

    const bars = this.getToolVelocityBars(agentId);
    if (bars.length === 0) return;

    const maxVal = Math.max(...bars, 1);
    const numBars = 10;
    const barWidth = Math.floor(w / numBars) - 1;
    const gap = 1;

    // Get the agent palette color
    const colorIndexStr = canvas.dataset.colorIndex;
    const colorIndex = colorIndexStr ? parseInt(colorIndexStr, 10) : 0;
    const palette = AGENT_PALETTES[colorIndex % AGENT_PALETTES.length];
    const barColor = hexToCss(palette.body);

    for (let i = 0; i < numBars; i++) {
      const val = bars[i] ?? 0;
      const barHeight = Math.max(val > 0 ? 2 : 0, Math.round((val / maxVal) * (h - 2)));
      const x = i * (barWidth + gap);
      const y = h - barHeight;
      ctx.fillStyle = barColor;
      ctx.globalAlpha = val > 0 ? 0.8 : 0.15;
      ctx.fillRect(x, y, barWidth, barHeight);
    }
    ctx.globalAlpha = 1.0;
  }

  private drawSparkline(canvas: HTMLCanvasElement, agentId: string): void {
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const hist = this.tokenHistory.get(agentId);
    if (!hist || hist.samples.length < 2) return;

    const w = canvas.width;
    const h = canvas.height;
    ctx.clearRect(0, 0, w, h);

    const deltas: number[] = [];
    for (let i = 1; i < hist.samples.length; i++) {
      deltas.push(Math.max(0, hist.samples[i] - hist.samples[i - 1]));
    }

    const maxDelta = Math.max(...deltas, 1);
    const stepX = w / Math.max(deltas.length - 1, 1);

    ctx.beginPath();
    ctx.moveTo(0, h);
    for (let i = 0; i < deltas.length; i++) {
      const x = i * stepX;
      const y = h - (deltas[i] / maxDelta) * (h - 2) - 1;
      ctx.lineTo(x, y);
    }
    ctx.lineTo((deltas.length - 1) * stepX, h);
    ctx.closePath();
    ctx.fillStyle = 'rgba(74, 222, 128, 0.15)';
    ctx.fill();

    ctx.beginPath();
    for (let i = 0; i < deltas.length; i++) {
      const x = i * stepX;
      const y = h - (deltas[i] / maxDelta) * (h - 2) - 1;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.strokeStyle = '#4ade80';
    ctx.lineWidth = 1.5;
    ctx.stroke();
  }

  private async cleanDoneAgents(): Promise<void> {
    try {
      const res = await fetch('/api/agents/clean-done', { method: 'POST' });
      if (res.ok) {
        this.renderFilters();
        this.renderAgents();
      }
    } catch (err) {
      console.error('Failed to clean done agents:', err);
    }
  }

  dispose(): void {
    clearInterval(this.refreshTimer);
    clearInterval(this.sparklineSampleTimer);
    this.store.off('agent:spawn', this.scheduleRender);
    this.store.off('agent:update', this.onAgentUpdate);
    this.store.off('agent:idle', this.scheduleRender);
    this.store.off('agent:shutdown', this.scheduleRender);
    this.store.off('state:reset', this.scheduleRender);
  }
}
