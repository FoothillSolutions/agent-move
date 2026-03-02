import type { AgentState } from '@agentflow/shared';
import { AGENT_PALETTES, ZONE_MAP } from '@agentflow/shared';
import type { StateStore, ConnectionStatus } from '../connection/state-store.js';

export class Overlay {
  private store: StateStore;
  private agentListEl: HTMLElement;
  private statusEl: HTMLElement;
  private refreshTimer: ReturnType<typeof setInterval>;

  constructor(store: StateStore) {
    this.store = store;
    this.agentListEl = document.getElementById('agent-list')!;
    this.statusEl = document.getElementById('connection-status')!;

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
  }

  private updateConnectionStatus(status: ConnectionStatus): void {
    this.statusEl.textContent = status === 'connected' ? 'Connected' : 'Disconnected';
    this.statusEl.className = status === 'connected' ? 'connected' : 'disconnected';
  }

  private shortenId(id: string): string {
    // Show first 8 chars of session ID
    return id.length > 8 ? id.slice(0, 8) : id;
  }

  private formatTokens(input: number, output: number): string {
    const total = input + output;
    if (total >= 1_000_000) return `${(total / 1_000_000).toFixed(1)}M tokens`;
    if (total >= 1_000) return `${(total / 1_000).toFixed(1)}K tokens`;
    return `${total} tokens`;
  }

  private hexToCSS(hex: number): string {
    return '#' + hex.toString(16).padStart(6, '0');
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

  private renderAgents(): void {
    const agents = Array.from(this.store.getAgents().values());

    if (agents.length === 0) {
      this.agentListEl.innerHTML = '<div style="color: #666; font-style: italic;">No active agents</div>';
      return;
    }

    // Sort: non-idle first, then by spawn time
    agents.sort((a, b) => {
      if (a.isIdle !== b.isIdle) return a.isIdle ? 1 : -1;
      return a.spawnedAt - b.spawnedAt;
    });

    this.agentListEl.innerHTML = agents.map((agent) => this.renderCard(agent)).join('');
  }

  private renderCard(agent: AgentState): string {
    const palette = AGENT_PALETTES[agent.colorIndex % AGENT_PALETTES.length];
    const borderColor = this.hexToCSS(palette.body);
    const zone = ZONE_MAP.get(agent.currentZone);
    const zoneName = zone ? zone.label : agent.currentZone;
    const toolText = agent.currentTool ?? 'none';
    const tokens = this.formatTokens(agent.totalInputTokens, agent.totalOutputTokens);
    const name = agent.projectName || this.shortenId(agent.sessionId);
    const opacity = agent.isIdle ? '0.6' : '1';

    return `<div class="agent-card" style="border-left: 3px solid ${borderColor}; opacity: ${opacity};">
      <div class="name">${name}${this.roleBadge(agent.role)}</div>
      <div class="zone">${zone?.icon ?? ''} ${zoneName}</div>
      <div class="tool">Tool: ${toolText}</div>
      <div style="color: #666; font-size: 11px; margin-top: 3px;">${tokens}</div>
    </div>`;
  }

  dispose(): void {
    clearInterval(this.refreshTimer);
  }
}
