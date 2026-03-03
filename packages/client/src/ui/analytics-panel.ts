import type { AgentState, ZoneId } from '@agent-move/shared';
import { AGENT_PALETTES, ZONES, ZONE_MAP, getModelPricing } from '@agent-move/shared';
import type { StateStore } from '../connection/state-store.js';
import { escapeHtml, hexToCss, formatTokens, formatDuration } from '../utils/formatting.js';

/**
 * Feature 3: Session Cost Tracker & Analytics Dashboard
 * Toggleable panel showing real-time cost estimation, per-agent breakdown,
 * token velocity, cost-by-zone, and threshold alerts.
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

const VELOCITY_WINDOW = 60_000; // 1 minute for velocity calculation
const SAMPLE_INTERVAL = 2_000;  // sample every 2 seconds
const MAX_SAMPLES = 180;        // 6 minutes of samples

export class AnalyticsPanel {
  private panelEl: HTMLElement;
  private store: StateStore;
  private isOpen = false;
  private refreshTimer: ReturnType<typeof setInterval>;
  private sampleTimer: ReturnType<typeof setInterval>;
  private tokenSamples: TokenSample[] = [];
  private costThreshold = 5.0; // dollars
  private thresholdAlerted = false;
  private alertEl: HTMLElement | null = null;
  /** Tool usage frequency tracker: toolName -> count */
  private toolCounts = new Map<string, number>();

  constructor(store: StateStore) {
    this.store = store;

    // Create panel
    this.panelEl = document.createElement('div');
    this.panelEl.id = 'analytics-panel';
    this.panelEl.innerHTML = `
      <div class="analytics-header">
        <button id="analytics-close">&times;</button>
        <div class="analytics-title">📊 Analytics & Cost Tracker</div>
      </div>
      <div id="analytics-content"></div>
    `;
    document.body.appendChild(this.panelEl);

    // Close button
    this.panelEl.querySelector('#analytics-close')!.addEventListener('click', () => this.close());

    // Create alert element
    this.alertEl = document.createElement('div');
    this.alertEl.id = 'cost-alert';
    this.alertEl.style.display = 'none';
    document.body.appendChild(this.alertEl);

    // Refresh panel contents
    this.refreshTimer = setInterval(() => {
      if (this.isOpen) this.render();
    }, 1000);

    // Sample token totals for velocity calculation
    this.sampleTimer = setInterval(() => this.takeSample(), SAMPLE_INTERVAL);

    // Listen for updates to check threshold and track tools
    this.store.on('agent:update', (agent: AgentState) => {
      this.checkThreshold();
      // Track tool usage frequency
      if (agent.currentTool) {
        const count = this.toolCounts.get(agent.currentTool) ?? 0;
        this.toolCounts.set(agent.currentTool, count + 1);
      }
    });
  }

  open(): void {
    this.isOpen = true;
    this.panelEl.classList.add('open');
    this.render();
  }

  close(): void {
    this.isOpen = false;
    this.panelEl.classList.remove('open');
  }

  toggle(): void {
    if (this.isOpen) this.close();
    else this.open();
  }

  private takeSample(): void {
    const agents = Array.from(this.store.getAgents().values());
    let total = 0;
    for (const a of agents) {
      total += a.totalInputTokens + a.totalOutputTokens;
    }
    this.tokenSamples.push({ timestamp: Date.now(), totalTokens: total });
    if (this.tokenSamples.length > MAX_SAMPLES) {
      this.tokenSamples.shift();
    }
  }

  private getSnapshots(): AgentSnapshot[] {
    return Array.from(this.store.getAgents().values()).map((a) => ({
      id: a.id,
      name: a.agentName || a.projectName || a.sessionId.slice(0, 10),
      model: a.model,
      inputTokens: a.totalInputTokens,
      outputTokens: a.totalOutputTokens,
      cacheReadTokens: a.cacheReadTokens,
      cacheCreationTokens: a.cacheCreationTokens,
      colorIndex: a.colorIndex,
      zone: a.currentZone,
      isIdle: a.isIdle,
      spawnedAt: a.spawnedAt,
    }));
  }

  private calculateCost(agent: AgentSnapshot): number {
    const pricing = getModelPricing(agent.model);
    return (agent.inputTokens / 1_000_000) * pricing.input +
           (agent.outputTokens / 1_000_000) * pricing.output;
  }

  private getTokenVelocity(): number {
    if (this.tokenSamples.length < 2) return 0;
    const now = Date.now();
    const cutoff = now - VELOCITY_WINDOW;
    const recentSamples = this.tokenSamples.filter((s) => s.timestamp >= cutoff);
    if (recentSamples.length < 2) return 0;

    const first = recentSamples[0];
    const last = recentSamples[recentSamples.length - 1];
    const elapsed = (last.timestamp - first.timestamp) / 60_000; // minutes
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
    this.alertEl.textContent = `⚠ Cost threshold exceeded: $${cost.toFixed(2)}`;
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
    const content = this.panelEl.querySelector('#analytics-content')!;
    const snapshots = this.getSnapshots();
    const totalCost = snapshots.reduce((sum, a) => sum + this.calculateCost(a), 0);
    const totalInput = snapshots.reduce((sum, a) => sum + a.inputTokens, 0);
    const totalOutput = snapshots.reduce((sum, a) => sum + a.outputTokens, 0);
    const totalCacheRead = snapshots.reduce((sum, a) => sum + a.cacheReadTokens, 0);
    const totalCacheCreation = snapshots.reduce((sum, a) => sum + a.cacheCreationTokens, 0);
    const velocity = this.getTokenVelocity();
    const trend = this.getVelocityTrend();
    const trendIcon = trend === 'up' ? '↑' : trend === 'down' ? '↓' : '→';
    const trendColor = trend === 'up' ? '#f87171' : trend === 'down' ? '#4ade80' : '#888';

    // Cache efficiency: cacheRead / (totalInput + cacheRead) * 100
    const cacheTotal = totalInput + totalCacheRead;
    const cacheHitRate = cacheTotal > 0 ? (totalCacheRead / cacheTotal) * 100 : 0;
    // Estimate savings: cache reads cost ~90% less than normal input tokens
    const avgPricing = getModelPricing(snapshots[0]?.model ?? null);
    const cacheSavings = (totalCacheRead / 1_000_000) * avgPricing.input * 0.9;

    // Per-zone cost
    const zoneCosts = new Map<ZoneId, number>();
    // We approximate zone cost by distributing agent cost equally across their time
    // (simplified: assign full cost to current zone)
    for (const a of snapshots) {
      const cost = this.calculateCost(a);
      zoneCosts.set(a.zone, (zoneCosts.get(a.zone) ?? 0) + cost);
    }

    // Sort agents by cost descending
    const sortedAgents = [...snapshots].sort(
      (a, b) => this.calculateCost(b) - this.calculateCost(a)
    );

    // Velocity sparkline
    const sparkSvg = this.renderVelocitySparkline();

    content.innerHTML = `
      <!-- Summary Cards -->
      <div class="analytics-cards">
        <div class="analytics-card total-cost">
          <div class="card-label">Total Cost</div>
          <div class="card-value">$${totalCost.toFixed(4)}</div>
          <div class="card-sub">${formatTokens(totalInput)} in / ${formatTokens(totalOutput)} out</div>
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
          <div class="card-value">${cacheHitRate.toFixed(1)}<span class="card-unit">%</span></div>
          <div class="card-sub">${formatTokens(totalCacheRead)} read / ${formatTokens(totalCacheCreation)} created</div>
          <div class="cache-savings">~$${cacheSavings.toFixed(4)} saved</div>
        </div>
      </div>

      <!-- Velocity Sparkline -->
      <div class="analytics-section">
        <div class="section-title">Token Rate (last ${Math.round(this.tokenSamples.length * SAMPLE_INTERVAL / 60000)}min)</div>
        <div class="sparkline-container">${sparkSvg}</div>
      </div>

      <!-- Per-Agent Breakdown -->
      <div class="analytics-section">
        <div class="section-title">Cost by Agent</div>
        ${sortedAgents.map((a) => this.renderAgentBar(a, totalCost)).join('')}
      </div>

      <!-- Zone Distribution -->
      <div class="analytics-section">
        <div class="section-title">Cost by Zone (current)</div>
        ${this.renderZoneBars(zoneCosts, totalCost)}
      </div>

      <!-- Tool Usage Distribution -->
      <div class="analytics-section">
        <div class="section-title">Tool Usage Distribution</div>
        ${this.renderToolUsageBars()}
      </div>

      <!-- Session Duration -->
      <div class="analytics-section">
        <div class="section-title">Session Duration</div>
        ${this.renderSessionDurations(snapshots)}
      </div>

      <!-- Threshold Setting -->
      <div class="analytics-section threshold-section">
        <div class="section-title">Alert Threshold</div>
        <div class="threshold-row">
          <span>$</span>
          <input type="number" id="cost-threshold" value="${this.costThreshold}" min="0.1" step="0.5" />
          <span class="threshold-status">${this.thresholdAlerted ? '⚠ Exceeded' : '✓ Under'}</span>
        </div>
      </div>
    `;

    // Bind threshold input
    const thresholdInput = content.querySelector('#cost-threshold') as HTMLInputElement;
    thresholdInput?.addEventListener('change', () => {
      this.costThreshold = parseFloat(thresholdInput.value) || 5.0;
      this.thresholdAlerted = false;
    });
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
        <span class="agent-bar-cost">$${cost.toFixed(4)}</span>
      </div>
      <div class="agent-bar-track">
        <div class="agent-bar-fill" style="width:${Math.max(2, pct)}%;background:${color}"></div>
      </div>
    </div>`;
  }

  private renderZoneBars(zoneCosts: Map<ZoneId, number>, totalCost: number): string {
    const entries = Array.from(zoneCosts.entries())
      .sort((a, b) => b[1] - a[1]);

    if (entries.length === 0) {
      return '<div class="analytics-empty">No zone data yet</div>';
    }

    return entries.map(([zoneId, cost]) => {
      const zone = ZONE_MAP.get(zoneId);
      const pct = totalCost > 0 ? (cost / totalCost) * 100 : 0;
      const color = zone ? hexToCss(zone.color) : '#666';

      return `<div class="zone-bar">
        <div class="zone-bar-label">
          <span>${zone?.icon ?? ''} ${zone?.label ?? zoneId}</span>
          <span class="zone-bar-cost">$${cost.toFixed(4)} (${pct.toFixed(0)}%)</span>
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

    // Calculate deltas (tokens per sample interval)
    const deltas: number[] = [];
    for (let i = 1; i < samples.length; i++) {
      deltas.push(Math.max(0, samples[i].totalTokens - samples[i - 1].totalTokens));
    }

    if (deltas.length === 0) return '';

    const maxDelta = Math.max(...deltas, 1);
    const stepX = width / Math.max(deltas.length - 1, 1);

    // Build SVG path
    const points = deltas.map((d, i) => {
      const x = i * stepX;
      const y = height - (d / maxDelta) * (height - 4) - 2;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    });

    const pathD = points.map((p, i) => (i === 0 ? `M${p}` : `L${p}`)).join(' ');

    // Area fill path
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
    if (this.toolCounts.size === 0) {
      return '<div class="analytics-empty">No tool usage data yet</div>';
    }

    // Sort by count descending, take top 10
    const sorted = Array.from(this.toolCounts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10);

    const maxCount = sorted[0][1];

    return sorted.map(([tool, count]) => {
      const pct = maxCount > 0 ? (count / maxCount) * 100 : 0;
      // Color based on tool type
      const color = tool.startsWith('mcp__') ? '#60a5fa' : '#a78bfa';

      return `<div class="tool-bar">
        <div class="tool-bar-label">
          <span class="tool-bar-name">${escapeHtml(tool)}</span>
          <span class="tool-bar-count">${count}</span>
        </div>
        <div class="tool-bar-track">
          <div class="tool-bar-fill" style="width:${Math.max(2, pct)}%;background:${color}"></div>
        </div>
      </div>`;
    }).join('');
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
    this.panelEl.remove();
    this.alertEl?.remove();
  }
}
