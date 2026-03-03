import type { AgentState, ZoneId } from '@agentflow/shared';
import { AGENT_PALETTES, ZONE_MAP, ZONES } from '@agentflow/shared';
import type { StateStore, ConnectionStatus } from '../connection/state-store.js';
import { escapeHtml, escapeAttr, truncate, formatTokenPair, hexToCss } from '../utils/formatting.js';

type FilterMode = 'all' | 'active' | 'idle' | 'done' | ZoneId;

/** Token sample for sparkline rendering */
interface TokenHistory {
  samples: number[]; // rolling buffer of total tokens at each sample time
}

export class Overlay {
  private store: StateStore;
  private agentListEl: HTMLElement;
  private statusEl: HTMLElement;
  private filterEl: HTMLElement;
  private refreshTimer: ReturnType<typeof setInterval>;
  private onAgentClick: ((agentId: string) => void) | null = null;
  private currentFilter: FilterMode = 'all';
  private collapsedGroups = new Set<string>();

  // Sparkline data: per-agent rolling token history (sampled every 2s, last 30 samples = 1min)
  private tokenHistory = new Map<string, TokenHistory>();
  private sparklineSampleTimer: ReturnType<typeof setInterval>;

  setAgentClickHandler(handler: (agentId: string) => void): void {
    this.onAgentClick = handler;
  }

  constructor(store: StateStore) {
    this.store = store;
    this.agentListEl = document.getElementById('agent-list')!;
    this.statusEl = document.getElementById('connection-status')!;

    // Create filter pills
    this.filterEl = document.createElement('div');
    this.filterEl.id = 'filter-pills';
    this.agentListEl.parentElement!.insertBefore(this.filterEl, this.agentListEl);
    this.renderFilters();

    // Listen for connection changes
    this.store.on('connection:status', (status) => this.updateConnectionStatus(status));

    // Listen to agent events for immediate updates
    this.store.on('agent:spawn', () => this.renderAgents());
    this.store.on('agent:update', () => this.renderAgents());
    this.store.on('agent:idle', () => this.renderAgents());
    this.store.on('agent:shutdown', () => this.renderAgents());
    this.store.on('state:reset', () => this.renderAgents());

    // Also refresh periodically for token count updates
    this.refreshTimer = setInterval(() => this.renderAgents(), 500);

    // Sample sparkline data every 2 seconds
    this.sparklineSampleTimer = setInterval(() => this.sampleSparklines(), 2000);
  }

  private sampleSparklines(): void {
    const agents = this.store.getAgents();
    for (const [id, agent] of agents) {
      let hist = this.tokenHistory.get(id);
      if (!hist) {
        hist = { samples: [] };
        this.tokenHistory.set(id, hist);
      }
      hist.samples.push(agent.totalInputTokens + agent.totalOutputTokens);
      // Keep last 30 samples (1 minute at 2s intervals)
      if (hist.samples.length > 30) hist.samples.shift();
    }
    // Clean up removed agents
    for (const id of this.tokenHistory.keys()) {
      if (!agents.has(id)) this.tokenHistory.delete(id);
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

    // Count done agents for badge
    const doneCount = Array.from(this.store.getAgents().values()).filter(a => a.isDone).length;

    this.filterEl.innerHTML = filters.map(f => {
      const badge = f.value === 'done' && doneCount > 0 ? ` <span class="filter-badge">${doneCount}</span>` : '';
      return `<button class="filter-pill${this.currentFilter === f.value ? ' active' : ''}" data-filter="${f.value}">${f.label}${badge}</button>`;
    }).join('') + `
      <select class="filter-zone-select" title="Filter by zone">
        <option value="">Zone...</option>
        ${ZONES.map(z => `<option value="${z.id}" ${this.currentFilter === z.id ? 'selected' : ''}>${z.icon} ${z.label}</option>`).join('')}
      </select>
      ${doneCount > 0 ? `<button class="clean-done-btn" title="Remove ${doneCount} done agent${doneCount > 1 ? 's' : ''}">Clean up (${doneCount})</button>` : ''}
    `;

    // Bind filter clicks
    this.filterEl.querySelectorAll('.filter-pill').forEach(btn => {
      btn.addEventListener('click', () => {
        this.currentFilter = (btn as HTMLElement).dataset.filter as FilterMode;
        (this.filterEl.querySelector('.filter-zone-select') as HTMLSelectElement).value = '';
        this.renderFilters();
        this.renderAgents();
      });
    });

    // Bind zone select
    const zoneSelect = this.filterEl.querySelector('.filter-zone-select') as HTMLSelectElement;
    zoneSelect.addEventListener('change', () => {
      if (zoneSelect.value) {
        this.currentFilter = zoneSelect.value as ZoneId;
      } else {
        this.currentFilter = 'all';
      }
      this.renderFilters();
      this.renderAgents();
    });

    // Bind clean-up button
    const cleanBtn = this.filterEl.querySelector('.clean-done-btn');
    if (cleanBtn) {
      cleanBtn.addEventListener('click', () => this.cleanDoneAgents());
    }
  }

  private updateConnectionStatus(status: ConnectionStatus): void {
    this.statusEl.textContent = status === 'connected' ? 'Connected' : 'Disconnected';
    this.statusEl.className = status === 'connected' ? 'connected' : 'disconnected';
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
    switch (this.currentFilter) {
      case 'all':
        return agents;
      case 'active':
        return agents.filter(a => !a.isIdle && !a.isDone);
      case 'idle':
        return agents.filter(a => a.isIdle && !a.isDone);
      case 'done':
        return agents.filter(a => a.isDone);
      default:
        // Zone filter
        return agents.filter(a => a.currentZone === this.currentFilter);
    }
  }

  private renderAgents(): void {
    let agents = Array.from(this.store.getAgents().values());
    const totalCount = agents.length;

    // Apply filter
    agents = this.filterAgents(agents);

    if (agents.length === 0) {
      const filterMsg = this.currentFilter !== 'all'
        ? `No ${this.currentFilter} agents (${totalCount} total)`
        : 'No active agents';
      this.agentListEl.innerHTML = `<div style="color: #666; font-style: italic;">${filterMsg}</div>`;
      return;
    }

    // Sort: active first, then idle, then done, then by spawn time
    agents.sort((a, b) => {
      if (a.isDone !== b.isDone) return a.isDone ? 1 : -1;
      if (a.isIdle !== b.isIdle) return a.isIdle ? 1 : -1;
      return a.spawnedAt - b.spawnedAt;
    });

    const allAgentsMap = this.store.getAgents();

    // Separate subagents from others
    const subAgents = agents.filter(a => a.role === 'subagent');
    const nonSubAgents = agents.filter(a => a.role !== 'subagent');
    const orphanSubs: AgentState[] = [];

    // Map parentId -> subagents in filtered list (only nest if parent is visible)
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

    // Count actual subagents per parent (exclude team members who share parentId)
    const totalSubCountOf = new Map<string, number>();
    for (const a of allAgentsMap.values()) {
      if (a.parentId && a.role === 'subagent') {
        totalSubCountOf.set(a.parentId, (totalSubCountOf.get(a.parentId) ?? 0) + 1);
      }
    }

    // Group non-subagents by rootSessionId:teamName (prevents cross-session grouping)
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

    // Render team groups
    for (const [groupKey, members] of teamGroups) {
      // Extract display name (strip rootSessionId prefix)
      const colonIdx = groupKey.indexOf(':');
      const teamName = colonIdx >= 0 ? groupKey.slice(colonIdx + 1) : groupKey;
      const rootId = members[0]?.rootSessionId;

      // Sort: lead first, then by spawn time
      members.sort((a, b) => {
        if (a.role === 'team-lead' && b.role !== 'team-lead') return -1;
        if (a.role !== 'team-lead' && b.role === 'team-lead') return 1;
        return 0;
      });

      // Count total team members from full state (scoped to same session)
      let totalTeamCount = 0;
      for (const a of allAgentsMap.values()) {
        if (a.teamName === teamName && a.rootSessionId === rootId) totalTeamCount++;
      }

      const groupId = `team:${groupKey}`;
      const isCollapsed = this.collapsedGroups.has(groupId);

      html += `<div class="agent-group${isCollapsed ? ' collapsed' : ''}">`;
      html += `<div class="group-header" data-group-id="${escapeAttr(groupId)}">
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

    // Render standalone agents
    for (const agent of standalone) {
      html += this.renderAgentWithSubs(agent, childrenOf, totalSubCountOf);
    }

    // Orphan subagents (parent not visible or not found)
    for (const orphan of orphanSubs) {
      html += this.renderCard(orphan, true);
    }

    this.agentListEl.innerHTML = html;

    // Bind group header toggle handlers
    this.agentListEl.querySelectorAll('.group-header').forEach(el => {
      el.addEventListener('click', () => {
        const groupId = (el as HTMLElement).dataset.groupId;
        if (groupId) this.toggleGroup(groupId);
      });
    });

    // Bind sub-collapse-bar handlers (separate toggle bar below parent cards)
    this.agentListEl.querySelectorAll('.sub-collapse-bar').forEach(el => {
      el.addEventListener('click', () => {
        const groupId = (el as HTMLElement).dataset.groupId;
        if (groupId) this.toggleGroup(groupId);
      });
    });

    // Attach card click handlers
    this.agentListEl.querySelectorAll('.agent-card[data-agent-id]').forEach((el) => {
      el.addEventListener('click', () => {
        const id = (el as HTMLElement).dataset.agentId;
        if (id && this.onAgentClick) this.onAgentClick(id);
      });
    });

    // Attach kill button handlers
    this.agentListEl.querySelectorAll('.card-kill-btn').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const id = (btn as HTMLElement).dataset.killId;
        if (id) this.killAgent(id);
      });
    });

    // Render sparklines onto canvases
    this.agentListEl.querySelectorAll('.sparkline-canvas').forEach((canvas) => {
      const agentId = (canvas as HTMLElement).dataset.agentId;
      if (agentId) this.drawSparkline(canvas as HTMLCanvasElement, agentId);
    });
  }

  /** Render an agent card with its collapsible subagent children */
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

      // Don't show sub badge on card — the collapse bar handles the count
      html += this.renderCard(agent, isChild, 0);

      // Separate clickable collapse bar below the card
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

  private renderCard(agent: AgentState, isChild = false, subCount = 0): string {
    const palette = AGENT_PALETTES[agent.colorIndex % AGENT_PALETTES.length];
    const borderColor = hexToCss(palette.body);
    const zone = ZONE_MAP.get(agent.currentZone);
    const zoneName = zone ? zone.label : agent.currentZone;
    const toolText = agent.currentTool ?? 'none';
    const tokens = formatTokenPair(agent.totalInputTokens, agent.totalOutputTokens);
    const name = agent.agentName || agent.projectName || this.shortenId(agent.sessionId);
    const opacity = agent.isDone ? '0.4' : agent.isIdle ? '0.6' : '1';
    const childClass = isChild ? ' agent-card-child' : '';
    const doneClass = agent.isDone ? ' agent-card-done' : '';
    const doneBadge = agent.isDone ? '<span style="background:#66666633;color:#888;padding:1px 6px;border-radius:3px;font-size:10px;font-weight:bold;margin-left:6px;">DONE</span>' : '';
    const subBadge = subCount > 0 ? `<span class="sub-count" title="${subCount} subagent${subCount > 1 ? 's' : ''}">${subCount} sub${subCount > 1 ? 's' : ''}</span>` : '';

    return `<div class="agent-card${childClass}${doneClass}" data-agent-id="${agent.id}" style="border-left: 3px solid ${borderColor}; opacity: ${opacity};">
      <div class="card-top-row">
        <div class="name">${isChild ? '<span class="child-connector">└</span>' : ''}${name}${this.roleBadge(agent.role)}${doneBadge}${subBadge}</div>
        <div class="card-actions">
          <canvas class="sparkline-canvas" data-agent-id="${agent.id}" width="60" height="20"></canvas>
          <button class="card-kill-btn" data-kill-id="${agent.id}" title="Kill agent">&times;</button>
        </div>
      </div>
      ${agent.taskDescription ? `<div class="task-desc" title="${escapeAttr(agent.taskDescription)}">${escapeHtml(truncate(agent.taskDescription, 48))}</div>` : ''}
      <div class="zone">${zone?.icon ?? ''} ${zoneName} · ${toolText}</div>
      <div style="color: #666; font-size: 11px; margin-top: 3px;">${tokens}</div>
    </div>`;
  }

  private drawSparkline(canvas: HTMLCanvasElement, agentId: string): void {
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const hist = this.tokenHistory.get(agentId);
    if (!hist || hist.samples.length < 2) return;

    const w = canvas.width;
    const h = canvas.height;
    ctx.clearRect(0, 0, w, h);

    // Calculate deltas (token increments per sample)
    const deltas: number[] = [];
    for (let i = 1; i < hist.samples.length; i++) {
      deltas.push(Math.max(0, hist.samples[i] - hist.samples[i - 1]));
    }

    const maxDelta = Math.max(...deltas, 1);
    const stepX = w / Math.max(deltas.length - 1, 1);

    // Draw area fill
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

    // Draw line
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

  private async killAgent(agentId: string): Promise<void> {
    try {
      const res = await fetch(`/api/agents/${agentId}/shutdown`, { method: 'POST' });
      if (res.ok) {
        this.renderFilters();
        this.renderAgents();
      }
    } catch (err) {
      console.error('Failed to kill agent:', err);
    }
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
  }
}
