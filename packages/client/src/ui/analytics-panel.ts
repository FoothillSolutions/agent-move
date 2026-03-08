import type { AgentState, ZoneId, ToolChainData } from '@agent-move/shared';
import { AGENT_PALETTES, ZONE_MAP, getModelPricing, computeAgentCost } from '@agent-move/shared';
import type { StateStore } from '../connection/state-store.js';
import { escapeHtml, hexToCss, formatTokens, formatDuration } from '../utils/formatting.js';

/**
 * Analytics Panel — renders into a provided container element.
 * Shows real-time cost estimation, per-agent breakdown, token velocity, and more.
 */

interface AgentSnapshot {
  id: string;
  name: string;
  model: string | null;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheCreationTokens: number;
  colorIndex: number;
  zone: ZoneId;
  isIdle: boolean;
  spawnedAt: number;
}

interface TokenSample {
  timestamp: number;
  totalTokens: number;
}

const VELOCITY_WINDOW = 60_000;
const SAMPLE_INTERVAL = 2_000;
const MAX_SAMPLES = 180;

export class AnalyticsPanel {
  private containerEl: HTMLElement;
  private contentEl: HTMLElement;
  private store: StateStore;
  private isVisible = false;
  private refreshTimer: ReturnType<typeof setInterval>;
  private sampleTimer: ReturnType<typeof setInterval>;
  private tokenSamples: TokenSample[] = [];
  private costThreshold = 5.0;
  private thresholdAlerted = false;
  private thresholdFocused = false;
  private alertEl: HTMLElement | null = null;
  private toolChainData: ToolChainData | null = null;
  private zoneTime = new Map<ZoneId, number>();
  private _customizationLookup: ((agent: AgentState) => { displayName: string; colorIndex: number }) | null = null;
  private onAgentUpdateBound: (agent: AgentState) => void;
  private onToolChainBound: (data: ToolChainData) => void;

  setCustomizationLookup(lookup: (agent: AgentState) => { displayName: string; colorIndex: number }): void {
    this._customizationLookup = lookup;
  }

  constructor(store: StateStore, container: HTMLElement) {
    this.store = store;
    this.containerEl = container;

    // Create content wrapper
    this.contentEl = document.createElement('div');
    this.contentEl.id = 'analytics-content';
    this.contentEl.style.display = 'none';
    this.containerEl.appendChild(this.contentEl);

    // Create alert element
    this.alertEl = document.createElement('div');
    this.alertEl.id = 'cost-alert';
    this.alertEl.style.display = 'none';
    document.body.appendChild(this.alertEl);

    // Refresh panel contents
    this.refreshTimer = setInterval(() => {
      if (this.isVisible) this.render();
    }, 1000);

    // Sample token totals
    this.sampleTimer = setInterval(() => this.takeSample(), SAMPLE_INTERVAL);

    // Listen for updates
    this.onAgentUpdateBound = (agent: AgentState) => {
      this.checkThreshold();
    };
    this.onToolChainBound = (data: ToolChainData) => {
      this.toolChainData = data;
    };
    this.store.on('agent:update', this.onAgentUpdateBound);
    this.store.on('toolchain:snapshot', this.onToolChainBound);
  }

  show(): void {
    this.isVisible = true;
    this.contentEl.style.display = '';
    this.render();
  }

  hide(): void {
    this.isVisible = false;
    this.contentEl.style.display = 'none';
  }

  /** Legacy toggle for command palette compatibility */
  toggle(): void {
    if (this.isVisible) this.hide();
    else this.show();
  }

  private takeSample(): void {
    const agents = Array.from(this.store.getAgents().values());
    let total = 0;
    for (const a of agents) {
      total += a.totalInputTokens + a.totalOutputTokens + a.cacheReadTokens + a.cacheCreationTokens;
      // Accumulate zone time (in seconds)
      const zoneKey: ZoneId = a.isIdle ? 'idle' as ZoneId : a.currentZone;
      const prev = this.zoneTime.get(zoneKey) ?? 0;
      this.zoneTime.set(zoneKey, prev + SAMPLE_INTERVAL / 1000);
    }
    this.tokenSamples.push({ timestamp: Date.now(), totalTokens: total });
    if (this.tokenSamples.length > MAX_SAMPLES) {
      this.tokenSamples.shift();
    }
  }

  private getSnapshots(): AgentSnapshot[] {
    return Array.from(this.store.getAgents().values()).map((a) => {
      const custom = this._customizationLookup?.(a);
      return {
        id: a.id,
        name: custom?.displayName || a.agentName || a.projectName || a.sessionId.slice(0, 10),
        model: a.model,
        inputTokens: a.totalInputTokens,
        outputTokens: a.totalOutputTokens,
        cacheReadTokens: a.cacheReadTokens,
        cacheCreationTokens: a.cacheCreationTokens,
        colorIndex: custom?.colorIndex ?? a.colorIndex,
        zone: a.currentZone,
        isIdle: a.isIdle,
        spawnedAt: a.spawnedAt,
      };
    });
  }

  private calculateCost(agent: AgentSnapshot): number {
    return computeAgentCost({
      totalInputTokens: agent.inputTokens,
      totalOutputTokens: agent.outputTokens,
      cacheReadTokens: agent.cacheReadTokens,
      cacheCreationTokens: agent.cacheCreationTokens,
      model: agent.model,
    });
  }

  private getTokenVelocity(): number {
    if (this.tokenSamples.length < 2) return 0;
    const now = Date.now();
    const cutoff = now - VELOCITY_WINDOW;
    const recentSamples = this.tokenSamples.filter((s) => s.timestamp >= cutoff);
    if (recentSamples.length < 2) return 0;

    const first = recentSamples[0];
    const last = recentSamples[recentSamples.length - 1];
    const elapsed = (last.timestamp - first.timestamp) / 60_000;
    if (elapsed < 0.01) return 0;
    return (last.totalTokens - first.totalTokens) / elapsed;
  }

  private getVelocityTrend(): 'up' | 'down' | 'stable' {
    if (this.tokenSamples.length < 10) return 'stable';
    const mid = Math.floor(this.tokenSamples.length / 2);
    const firstHalf = this.tokenSamples.slice(0, mid);
    const secondHalf = this.tokenSamples.slice(mid);

    const avgFirst = this.avgDelta(firstHalf);
    const avgSecond = this.avgDelta(secondHalf);

    if (avgSecond > avgFirst * 1.2) return 'up';
    if (avgSecond < avgFirst * 0.8) return 'down';
    return 'stable';
  }

  private avgDelta(samples: TokenSample[]): number {
    if (samples.length < 2) return 0;
    let total = 0;
    for (let i = 1; i < samples.length; i++) {
      total += samples[i].totalTokens - samples[i - 1].totalTokens;
    }
    return total / (samples.length - 1);
  }

  private checkThreshold(): void {
    const snapshots = this.getSnapshots();
    const totalCost = snapshots.reduce((sum, a) => sum + this.calculateCost(a), 0);
    if (totalCost >= this.costThreshold && !this.thresholdAlerted) {
      this.thresholdAlerted = true;
      this.showAlert(totalCost);
    }
  }

  private showAlert(cost: number): void {
    if (!this.alertEl) return;
    this.alertEl.textContent = `Warning: Cost threshold exceeded: $${cost.toFixed(2)}`;
    this.alertEl.style.display = 'block';
    this.alertEl.classList.add('flash');
    setTimeout(() => {
      if (this.alertEl) {
        this.alertEl.classList.remove('flash');
        setTimeout(() => {
          if (this.alertEl) this.alertEl.style.display = 'none';
        }, 5000);
      }
    }, 3000);
  }

  private render(): void {
    const snapshots = this.getSnapshots();
    const totalCost = snapshots.reduce((sum, a) => sum + this.calculateCost(a), 0);
    const totalInput = snapshots.reduce((sum, a) => sum + a.inputTokens, 0);
    const totalOutput = snapshots.reduce((sum, a) => sum + a.outputTokens, 0);
    const totalCacheRead = snapshots.reduce((sum, a) => sum + a.cacheReadTokens, 0);
    const totalCacheCreation = snapshots.reduce((sum, a) => sum + a.cacheCreationTokens, 0);
    const velocity = this.getTokenVelocity();
    const trend = this.getVelocityTrend();
    const trendIcon = trend === 'up' ? '\u2191' : trend === 'down' ? '\u2193' : '\u2192';
    const trendColor = trend === 'up' ? '#f87171' : trend === 'down' ? '#4ade80' : '#888';

    const allInput = totalInput + totalCacheRead + totalCacheCreation;
    const cacheHitRate = allInput > 0 ? (totalCacheRead / allInput) * 100 : 0;
    const cacheSavings = snapshots.reduce((sum, a) => {
      const pricing = getModelPricing(a.model);
      return sum + (a.cacheReadTokens / 1_000_000) * pricing.input * 0.9;
    }, 0);

    const sortedAgents = [...snapshots].sort(
      (a, b) => this.calculateCost(b) - this.calculateCost(a)
    );

    const sparkSvg = this.renderVelocitySparkline();

    this.contentEl.innerHTML = `
      <div class="analytics-cards">
        <div class="analytics-card total-cost">
          <div class="card-label">Total Cost</div>
          <div class="card-value">$${totalCost.toFixed(2)}</div>
          <div class="card-sub">${formatTokens(allInput)} in / ${formatTokens(totalOutput)} out</div>
        </div>
        <div class="analytics-card velocity">
          <div class="card-label">Token Velocity</div>
          <div class="card-value">${formatTokens(Math.round(velocity))}<span class="card-unit">/min</span></div>
          <div class="card-sub" style="color:${trendColor}">${trendIcon} ${trend}</div>
        </div>
        <div class="analytics-card agents-count">
          <div class="card-label">Active Agents</div>
          <div class="card-value">${snapshots.filter((a) => !a.isIdle).length}<span class="card-unit">/${snapshots.length}</span></div>
          <div class="card-sub">${snapshots.filter((a) => a.isIdle).length} idle</div>
        </div>
        <div class="analytics-card cache-card">
          <div class="card-label">Cache Efficiency</div>
          <div class="card-value">${Math.min(cacheHitRate, 100).toFixed(1)}<span class="card-unit">%</span></div>
          <div class="card-sub">${formatTokens(totalCacheRead)} read / ${formatTokens(totalCacheCreation)} created</div>
          <div class="cache-savings">~$${cacheSavings.toFixed(2)} saved</div>
        </div>
      </div>

      <div class="analytics-section">
        <div class="section-title">Token Rate (last ${Math.round(this.tokenSamples.length * SAMPLE_INTERVAL / 60000)}min)</div>
        <div class="sparkline-container">${sparkSvg}</div>
      </div>

      <div class="analytics-section">
        <div class="section-title">Cost by Agent</div>
        ${sortedAgents.length > 0 ? sortedAgents.map((a) => this.renderAgentBar(a, totalCost)).join('') : '<div class="analytics-empty">No agents active</div>'}
      </div>

      <div class="analytics-section">
        <div class="section-title">Time Spent by Zone</div>
        ${this.renderZoneTimeBars()}
      </div>

      <div class="analytics-section">
        <div class="section-title">Tool Usage Distribution</div>
        ${this.renderToolUsageBars()}
      </div>

      <div class="analytics-section">
        <div class="section-title">Cost Efficiency</div>
        ${this.renderCostEfficiency(snapshots, totalCost)}
      </div>

      <div class="analytics-section">
        <div class="section-title">Session Duration</div>
        ${this.renderSessionDurations(snapshots)}
      </div>

      <div class="analytics-section threshold-section">
        <div class="section-title">Alert Threshold</div>
        <div class="threshold-row">
          <span>$</span>
          <input type="number" id="cost-threshold" name="cost-threshold" autocomplete="off" value="${this.costThreshold}" min="0.1" step="0.5" />
          <span class="threshold-status">${this.thresholdAlerted ? 'Exceeded' : 'Under'}</span>
        </div>
      </div>
    `;

    const thresholdInput = this.contentEl.querySelector('#cost-threshold') as HTMLInputElement;
    if (thresholdInput) {
      thresholdInput.addEventListener('change', () => {
        this.costThreshold = parseFloat(thresholdInput.value) || 5.0;
        this.thresholdAlerted = false;
      });
      if (this.thresholdFocused) {
        thresholdInput.focus();
      }
      thresholdInput.addEventListener('focus', () => { this.thresholdFocused = true; });
      thresholdInput.addEventListener('blur', () => { this.thresholdFocused = false; });
    }
  }

  private renderAgentBar(agent: AgentSnapshot, totalCost: number): string {
    const cost = this.calculateCost(agent);
    const pct = totalCost > 0 ? (cost / totalCost) * 100 : 0;
    const palette = AGENT_PALETTES[agent.colorIndex % AGENT_PALETTES.length];
    const color = hexToCss(palette.body);

    return `<div class="agent-bar">
      <div class="agent-bar-label">
        <span class="agent-dot" style="background:${color}"></span>
        <span class="agent-bar-name">${escapeHtml(agent.name)}</span>
        <span class="agent-bar-cost">$${cost.toFixed(2)}</span>
      </div>
      <div class="agent-bar-track">
        <div class="agent-bar-fill" style="width:${Math.max(2, pct)}%;background:${color}"></div>
      </div>
    </div>`;
  }

  private renderZoneTimeBars(): string {
    if (this.zoneTime.size === 0) {
      return '<div class="analytics-empty">Collecting data...</div>';
    }

    const totalTime = Array.from(this.zoneTime.values()).reduce((a, b) => a + b, 0);
    const entries = Array.from(this.zoneTime.entries())
      .sort((a, b) => b[1] - a[1]);

    return entries.map(([zoneId, seconds]) => {
      const zone = ZONE_MAP.get(zoneId);
      const isIdle = zoneId === 'idle';
      const pct = totalTime > 0 ? (seconds / totalTime) * 100 : 0;
      const color = isIdle ? '#6b7280' : (zone ? hexToCss(zone.color) : '#666');
      const label = isIdle ? 'Idle' : (zone?.label ?? zoneId);
      const icon = isIdle ? '\u{1F4A4}' : (zone?.icon ?? '');

      return `<div class="zone-bar">
        <div class="zone-bar-label">
          <span>${icon} ${label}</span>
          <span class="zone-bar-cost">${formatDuration(seconds * 1000)} (${pct.toFixed(0)}%)</span>
        </div>
        <div class="zone-bar-track">
          <div class="zone-bar-fill" style="width:${Math.max(2, pct)}%;background:${color}"></div>
        </div>
      </div>`;
    }).join('');
  }

  private renderVelocitySparkline(): string {
    if (this.tokenSamples.length < 2) {
      return '<div class="analytics-empty">Collecting data...</div>';
    }

    const width = 260;
    const height = 50;
    const samples = this.tokenSamples;

    const deltas: number[] = [];
    for (let i = 1; i < samples.length; i++) {
      deltas.push(Math.max(0, samples[i].totalTokens - samples[i - 1].totalTokens));
    }

    if (deltas.length === 0) return '';

    const maxDelta = Math.max(...deltas, 1);
    const stepX = width / Math.max(deltas.length - 1, 1);

    const points = deltas.map((d, i) => {
      const x = i * stepX;
      const y = height - (d / maxDelta) * (height - 4) - 2;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    });

    const pathD = points.map((p, i) => (i === 0 ? `M${p}` : `L${p}`)).join(' ');
    const areaD = `${pathD} L${((deltas.length - 1) * stepX).toFixed(1)},${height} L0,${height} Z`;

    return `<svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" class="velocity-spark">
      <defs>
        <linearGradient id="sparkGrad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="#4ade80" stop-opacity="0.3"/>
          <stop offset="100%" stop-color="#4ade80" stop-opacity="0"/>
        </linearGradient>
      </defs>
      <path d="${areaD}" fill="url(#sparkGrad)"/>
      <path d="${pathD}" fill="none" stroke="#4ade80" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
    </svg>`;
  }

  private renderToolUsageBars(): string {
    const counts = this.toolChainData?.toolCounts ?? {};
    const entries = Object.entries(counts);
    if (entries.length === 0) {
      return '<div class="analytics-empty">No tool usage data yet</div>';
    }

    const sorted = entries.sort((a, b) => b[1] - a[1]).slice(0, 10);
    const maxCount = sorted[0][1];

    return sorted.map(([tool, count]) => {
      const pct = maxCount > 0 ? (count / maxCount) * 100 : 0;
      const color = tool.startsWith('mcp__') ? '#60a5fa' : '#a78bfa';
      // Shorten long MCP tool names: mcp__server__tool → server / tool
      let displayName = tool;
      if (tool.startsWith('mcp__')) {
        const parts = tool.slice(5).split('__');
        if (parts.length >= 2) {
          const server = parts.slice(0, -1).join('/');
          const method = parts[parts.length - 1];
          displayName = `${server} / ${method}`;
        }
      }

      return `<div class="tool-bar">
        <div class="tool-bar-label">
          <span class="tool-bar-name" title="${escapeHtml(tool)}">${escapeHtml(displayName)}</span>
          <span class="tool-bar-count">${count}</span>
        </div>
        <div class="tool-bar-track">
          <div class="tool-bar-fill" style="width:${Math.max(2, pct)}%;background:${color}"></div>
        </div>
      </div>`;
    }).join('');
  }

  private renderCostEfficiency(snapshots: AgentSnapshot[], totalCost: number): string {
    const totalToolUses = Object.values(this.toolChainData?.toolCounts ?? {}).reduce((a, b) => a + b, 0);
    const costPerTool = totalToolUses > 0 ? totalCost / totalToolUses : 0;
    const totalTokens = snapshots.reduce((s, a) => s + a.inputTokens + a.outputTokens + a.cacheReadTokens + a.cacheCreationTokens, 0);
    const tokensPerTool = totalToolUses > 0 ? totalTokens / totalToolUses : 0;

    // Cost per agent per minute
    const now = Date.now();
    const agentRates = snapshots
      .map(a => {
        const mins = Math.max((now - a.spawnedAt) / 60_000, 0.5);
        const cost = this.calculateCost(a);
        return { name: a.name, rate: cost / mins, cost };
      })
      .filter(a => a.cost > 0.001)
      .sort((a, b) => b.rate - a.rate);

    return `
      <div class="analytics-cards" style="margin-bottom:8px">
        <div class="analytics-card">
          <div class="card-label">Cost / Tool Use</div>
          <div class="card-value">$${costPerTool.toFixed(4)}</div>
          <div class="card-sub">${totalToolUses} total uses</div>
        </div>
        <div class="analytics-card">
          <div class="card-label">Tokens / Tool Use</div>
          <div class="card-value">${formatTokens(Math.round(tokensPerTool))}</div>
          <div class="card-sub">${formatTokens(totalTokens)} total</div>
        </div>
      </div>
      ${agentRates.length > 0 ? `<div class="cost-rate-header">Cost rate ($/min)</div>` +
        agentRates.slice(0, 5).map(a =>
          `<div class="cost-rate-row">
            <span class="cost-rate-name">${escapeHtml(a.name)}</span>
            <span class="cost-rate-value">$${a.rate.toFixed(4)}/min</span>
          </div>`
        ).join('') : ''}
    `;
  }

  private renderSessionDurations(snapshots: AgentSnapshot[]): string {
    if (snapshots.length === 0) {
      return '<div class="analytics-empty">No active sessions</div>';
    }

    const now = Date.now();
    return snapshots.map((a) => {
      const duration = now - a.spawnedAt;
      const palette = AGENT_PALETTES[a.colorIndex % AGENT_PALETTES.length];
      const color = hexToCss(palette.body);

      return `<div class="session-row">
        <span class="agent-dot" style="background:${color}"></span>
        <span class="session-name">${escapeHtml(a.name)}</span>
        <span class="session-duration">${formatDuration(duration)}</span>
        <span class="session-status ${a.isIdle ? 'idle' : 'active'}">${a.isIdle ? 'idle' : 'active'}</span>
      </div>`;
    }).join('');
  }

  dispose(): void {
    clearInterval(this.refreshTimer);
    clearInterval(this.sampleTimer);
    this.store.off('agent:update', this.onAgentUpdateBound);
    this.store.off('toolchain:snapshot', this.onToolChainBound);
    this.contentEl.remove();
    this.alertEl?.remove();
  }
}
