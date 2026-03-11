import type { AgentState, ZoneId } from '@agent-move/shared';
import { AGENT_PALETTES, ZONE_MAP, computeAgentCost } from '@agent-move/shared';
import type { StateStore } from '../connection/state-store.js';
import { formatTokens, formatDuration } from '../utils/formatting.js';

/**
 * Session Summary / Export — generates a markdown report of the current session
 * and copies it to clipboard or downloads as a file.
 */

export class SessionExport {
  private el: HTMLElement;
  private store: StateStore;
  private isOpen = false;
  private _customizationLookup: ((agent: AgentState) => { displayName: string; colorIndex: number }) | null = null;

  constructor(store: StateStore) {
    this.store = store;

    this.el = document.createElement('div');
    this.el.id = 'session-export';
    this.el.innerHTML = `
      <div class="se-backdrop"></div>
      <div class="se-modal">
        <div class="se-header">
          <span class="se-title">Session Summary</span>
          <button class="se-close">&times;</button>
        </div>
        <div class="se-body">
          <pre class="se-content"></pre>
        </div>
        <div class="se-footer">
          <button class="se-copy-btn">Copy to Clipboard</button>
          <button class="se-download-btn">Download .md</button>
        </div>
      </div>
    `;
    document.body.appendChild(this.el);

    this.el.querySelector('.se-backdrop')!.addEventListener('click', () => this.close());
    this.el.querySelector('.se-close')!.addEventListener('click', () => this.close());
    this.el.querySelector('.se-copy-btn')!.addEventListener('click', () => this.copyToClipboard());
    this.el.querySelector('.se-download-btn')!.addEventListener('click', () => this.download());
  }

  setCustomizationLookup(fn: (agent: AgentState) => { displayName: string; colorIndex: number }): void {
    this._customizationLookup = fn;
  }

  toggle(): void {
    if (this.isOpen) this.close();
    else this.open();
  }

  open(): void {
    this.isOpen = true;
    this.el.classList.add('open');
    this.render();
  }

  close(): void {
    this.isOpen = false;
    this.el.classList.remove('open');
  }

  private generateReport(): string {
    const agents = Array.from(this.store.getAgents().values());
    const now = Date.now();

    // Session metadata
    const earliest = agents.length > 0
      ? Math.min(...agents.map(a => a.spawnedAt))
      : now;
    const sessionDuration = now - earliest;

    // Cost calculation
    let totalCost = 0;
    let totalInput = 0;
    let totalOutput = 0;
    let totalCacheRead = 0;

    const agentStats: { name: string; cost: number; tokens: number; duration: number; role: string; zone: string; status: string }[] = [];

    for (const a of agents) {
      const cost = computeAgentCost(a);
      totalCost += cost;
      totalInput += a.totalInputTokens;
      totalOutput += a.totalOutputTokens;
      totalCacheRead += a.cacheReadTokens;

      const zone = ZONE_MAP.get(a.currentZone);
      agentStats.push({
        name: this._customizationLookup?.(a)?.displayName || a.agentName || a.projectName || a.sessionId.slice(0, 10),
        cost,
        tokens: a.totalInputTokens + a.totalOutputTokens,
        duration: now - a.spawnedAt,
        role: a.role,
        zone: zone?.label ?? a.currentZone,
        status: a.isDone ? 'Done' : a.isIdle ? 'Idle' : 'Active',
      });
    }

    agentStats.sort((a, b) => b.cost - a.cost);

    // Build markdown
    const lines: string[] = [];
    lines.push(`# AgentMove Session Summary`);
    lines.push(`> Generated ${new Date().toISOString()}`);
    lines.push('');
    lines.push(`## Overview`);
    lines.push(`| Metric | Value |`);
    lines.push(`|--------|-------|`);
    lines.push(`| Duration | ${formatDuration(sessionDuration)} |`);
    lines.push(`| Total Agents | ${agents.length} |`);
    lines.push(`| Active | ${agents.filter(a => !a.isIdle && !a.isDone).length} |`);
    lines.push(`| Idle | ${agents.filter(a => a.isIdle && !a.isDone).length} |`);
    lines.push(`| Done | ${agents.filter(a => a.isDone).length} |`);
    lines.push(`| Total Cost | $${totalCost.toFixed(4)} |`);
    lines.push(`| Input Tokens | ${formatTokens(totalInput)} |`);
    lines.push(`| Output Tokens | ${formatTokens(totalOutput)} |`);
    lines.push(`| Cache Reads | ${formatTokens(totalCacheRead)} |`);
    lines.push('');

    if (agentStats.length > 0) {
      lines.push(`## Agents`);
      lines.push(`| Agent | Role | Status | Zone | Cost | Tokens | Duration |`);
      lines.push(`|-------|------|--------|------|------|--------|----------|`);
      for (const a of agentStats) {
        lines.push(`| ${a.name} | ${a.role} | ${a.status} | ${a.zone} | $${a.cost.toFixed(4)} | ${formatTokens(a.tokens)} | ${formatDuration(a.duration)} |`);
      }
      lines.push('');
    }

    // Zone usage
    const zoneCounts = new Map<string, number>();
    for (const a of agents) {
      const label = ZONE_MAP.get(a.currentZone)?.label ?? a.currentZone;
      zoneCounts.set(label, (zoneCounts.get(label) ?? 0) + 1);
    }
    if (zoneCounts.size > 0) {
      lines.push(`## Zone Distribution`);
      lines.push(`| Zone | Agents |`);
      lines.push(`|------|--------|`);
      for (const [zone, count] of Array.from(zoneCounts.entries()).sort((a, b) => b[1] - a[1])) {
        lines.push(`| ${zone} | ${count} |`);
      }
      lines.push('');
    }

    lines.push('---');
    lines.push('*Generated by AgentMove*');

    return lines.join('\n');
  }

  private render(): void {
    const content = this.el.querySelector('.se-content')!;
    content.textContent = this.generateReport();
  }

  private async copyToClipboard(): Promise<void> {
    const report = this.generateReport();
    try {
      await navigator.clipboard.writeText(report);
      const btn = this.el.querySelector('.se-copy-btn') as HTMLButtonElement;
      btn.textContent = 'Copied!';
      setTimeout(() => { btn.textContent = 'Copy to Clipboard'; }, 2000);
    } catch {
      // Fallback
      const textarea = document.createElement('textarea');
      textarea.value = report;
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand('copy');
      textarea.remove();
    }
  }

  private download(): void {
    const report = this.generateReport();
    const blob = new Blob([report], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `agent-move-session-${new Date().toISOString().slice(0, 19).replace(/:/g, '-')}.md`;
    a.click();
    URL.revokeObjectURL(url);
  }

  dispose(): void {
    this.el.remove();
  }
}
