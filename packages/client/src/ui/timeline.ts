import type { AgentState, TimelineEvent } from '@agent-move/shared';
import { AGENT_PALETTES } from '@agent-move/shared';
import type { StateStore } from '../connection/state-store.js';
import { drawPlayhead, drawTimeTicks, getEventCategory, getEventColor, getTickInterval } from './timeline-canvas.js';
import { TimelineFilter } from './timeline-filter.js';

/**
 * Timeline bar at the bottom of the canvas.
 * Shows a scrubber over the buffered event history.
 * Supports replay mode (stepping through past events) and live mode.
 * Expanded mode shows per-agent swim lanes with event filtering.
 */
export class Timeline {
  private el: HTMLElement;
  private store: StateStore;
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private playBtn: HTMLButtonElement;
  private liveBtn: HTMLButtonElement;
  private timeLabel: HTMLElement;
  private expandBtn: HTMLButtonElement;

  private liveRenderTimer: ReturnType<typeof setInterval> | null = null;

  private isLive = true;
  private isPlaying = false;
  private playbackPosition = 0; // 0..1 normalized
  private playbackSpeed = 1;
  private lastFrameTime = 0;
  private animId: number | null = null;

  // Expanded swim-lane state
  private expanded = false;
  private filter: TimelineFilter;
  private filterContainer: HTMLElement;
  private swimLabelsEl: HTMLElement;
  private trackWrapper: HTMLElement;

  private _customizationLookup: ((agent: AgentState) => { displayName: string; colorIndex: number }) | null = null;

  // Bound event handlers (stored for cleanup)
  private resizeHandler = () => this.resizeCanvas();
  private onTimelineBound: () => void;
  private onSpawnBound: () => void;
  private onShutdownBound: () => void;

  // Replay state
  private replayAgents = new Map<string, AgentState>();
  private onReplayState: ((agents: Map<string, AgentState>) => void) | null = null;

  constructor(store: StateStore) {
    this.store = store;

    // Create timeline bar
    this.el = document.createElement('div');
    this.el.id = 'timeline-bar';
    this.el.innerHTML = `
      <div class="timeline-top-bar">
        <div class="timeline-controls">
          <button id="timeline-play" title="Play/Pause">&#9654;</button>
          <button id="timeline-live" class="active" title="Jump to Live">LIVE</button>
          <span id="timeline-time">--:--</span>
          <span id="timeline-speed" title="Click to change speed">1x</span>
        </div>
        <div class="timeline-filters">
          <button class="tl-filter-pill active" data-category="tool" title="Tool calls">
            <span class="tl-filter-icon">&#128295;</span> Tools
          </button>
          <button class="tl-filter-pill active" data-category="zone" title="Zone changes">
            <span class="tl-filter-icon">&#127970;</span> Zones
          </button>
          <button class="tl-filter-pill active" data-category="idle" title="Idle events">
            <span class="tl-filter-icon">&#9749;</span> Idle
          </button>
          <button class="tl-filter-pill active" data-category="lifecycle" title="Spawn / Shutdown">
            <span class="tl-filter-icon">&#11088;</span> Life
          </button>
        </div>
        <div class="timeline-agent-filters"></div>
        <button class="timeline-expand-btn" title="Expand swim lanes">&#9650;</button>
      </div>
      <div class="timeline-track" style="position:relative;">
        <div class="timeline-swim-labels"></div>
        <canvas id="timeline-canvas"></canvas>
      </div>
    `;
    (document.getElementById('canvas-container') ?? document.getElementById('app')!).appendChild(this.el);

    this.canvas = this.el.querySelector('#timeline-canvas')! as HTMLCanvasElement;
    this.ctx = this.canvas.getContext('2d')!;
    this.playBtn = this.el.querySelector('#timeline-play')! as HTMLButtonElement;
    this.liveBtn = this.el.querySelector('#timeline-live')! as HTMLButtonElement;
    this.timeLabel = this.el.querySelector('#timeline-time')!;
    this.expandBtn = this.el.querySelector('.timeline-expand-btn')! as HTMLButtonElement;
    this.filterContainer = this.el.querySelector('.timeline-filters')!;
    const agentFilterContainer = this.el.querySelector('.timeline-agent-filters') as HTMLElement;
    this.swimLabelsEl = this.el.querySelector('.timeline-swim-labels')!;
    this.trackWrapper = this.el.querySelector('.timeline-track')!;

    const speedBtn = this.el.querySelector('#timeline-speed')! as HTMLElement;

    // Instantiate the filter helper
    this.filter = new TimelineFilter(
      agentFilterContainer,
      () => this.store.getTimeline(),
      () => this.render(),
    );

    // Resize canvas
    this.resizeCanvas();
    window.addEventListener('resize', this.resizeHandler);

    // Click on track to scrub
    this.canvas.addEventListener('mousedown', (e) => this.onTrackClick(e));
    this.canvas.addEventListener('mousemove', (e) => {
      if (e.buttons === 1) this.onTrackClick(e);
    });

    // Play/pause
    this.playBtn.addEventListener('click', () => {
      if (this.isLive) {
        // Switch to replay mode at current position
        this.isLive = false;
        this.liveBtn.classList.remove('active');
        this.playbackPosition = 1;
      }
      this.isPlaying = !this.isPlaying;
      this.playBtn.innerHTML = this.isPlaying ? '&#9646;&#9646;' : '&#9654;';
      if (this.isPlaying) {
        this.lastFrameTime = performance.now();
        this.startPlayback();
      } else {
        this.stopPlayback();
      }
    });

    // Live button
    this.liveBtn.addEventListener('click', () => this.goLive());

    // Speed toggle
    speedBtn.addEventListener('click', () => {
      const speeds = [0.5, 1, 2, 4, 8];
      const idx = speeds.indexOf(this.playbackSpeed);
      this.playbackSpeed = speeds[(idx + 1) % speeds.length];
      speedBtn.textContent = `${this.playbackSpeed}x`;
    });

    // Expand/collapse toggle
    this.expandBtn.addEventListener('click', () => this.toggleExpanded());

    // Event type filter pills
    this.filterContainer.querySelectorAll('.tl-filter-pill').forEach((pill) => {
      pill.addEventListener('click', () => {
        const cat = (pill as HTMLElement).dataset.category as Parameters<TimelineFilter['toggleCategory']>[0];
        this.filter.toggleCategory(cat, pill);
      });
    });

    // When new timeline snapshot arrives, re-render
    this.onTimelineBound = () => {
      this.filter.updateAgentFilters();
      this.render();
    };
    this.store.on('timeline:snapshot', this.onTimelineBound);

    // Update agent filters when agents spawn/shutdown
    this.onSpawnBound = () => this.filter.updateAgentFilters();
    this.onShutdownBound = () => this.filter.updateAgentFilters();
    this.store.on('agent:spawn', this.onSpawnBound);
    this.store.on('agent:shutdown', this.onShutdownBound);

    // Re-render periodically while live
    this.liveRenderTimer = setInterval(() => {
      if (this.isLive) this.render();
    }, 1000);
  }

  setCustomizationLookup(fn: (agent: AgentState) => { displayName: string; colorIndex: number }): void {
    this._customizationLookup = fn;
    this.filter.setCustomizationLookup(fn);
  }

  setReplayCallback(cb: (agents: Map<string, AgentState>) => void): void {
    this.onReplayState = cb;
  }

  dispose(): void {
    if (this.liveRenderTimer) clearInterval(this.liveRenderTimer);
    if (this.animId) cancelAnimationFrame(this.animId);
    window.removeEventListener('resize', this.resizeHandler);
    this.store.off('timeline:snapshot', this.onTimelineBound);
    this.store.off('agent:spawn', this.onSpawnBound);
    this.store.off('agent:shutdown', this.onShutdownBound);
    this.el.remove();
  }

  private toggleExpanded(): void {
    this.expanded = !this.expanded;
    if (this.expanded) {
      this.el.classList.add('expanded');
      this.expandBtn.classList.add('active');
      this.expandBtn.innerHTML = '&#9660;'; // down arrow = collapse
      this.expandBtn.title = 'Collapse swim lanes';
    } else {
      this.el.classList.remove('expanded');
      this.expandBtn.classList.remove('active');
      this.expandBtn.innerHTML = '&#9650;'; // up arrow = expand
      this.expandBtn.title = 'Expand swim lanes';
    }
    this.filter.updateAgentFilters();
    // Need to delay resize slightly for CSS transition
    requestAnimationFrame(() => {
      this.resizeCanvas();
    });
  }

  private resizeCanvas(): void {
    const track = this.canvas.parentElement!;
    const rect = track.getBoundingClientRect();
    this.canvas.width = rect.width * window.devicePixelRatio;
    this.canvas.height = rect.height * window.devicePixelRatio;
    this.canvas.style.width = `${rect.width}px`;
    this.canvas.style.height = `${rect.height}px`;
    this.ctx.setTransform(1, 0, 0, 1, 0, 0);
    this.ctx.scale(window.devicePixelRatio, window.devicePixelRatio);
    this.render();
  }

  private getTimeRange(): { start: number; end: number } {
    const events = this.store.getTimeline();
    if (events.length === 0) {
      const now = Date.now();
      return { start: now - 60000, end: now };
    }
    return { start: events[0].timestamp, end: Math.max(events[events.length - 1].timestamp, Date.now()) };
  }

  render(): void {
    const w = this.canvas.width / window.devicePixelRatio;
    const h = this.canvas.height / window.devicePixelRatio;
    const ctx = this.ctx;
    ctx.clearRect(0, 0, w, h);

    if (this.expanded) {
      this.renderExpanded(w, h, ctx);
    } else {
      this.renderCompact(w, h, ctx);
    }
  }

  /** The original compact single-track render */
  private renderCompact(w: number, h: number, ctx: CanvasRenderingContext2D): void {
    // Hide swim labels
    this.swimLabelsEl.style.display = 'none';
    this.canvas.style.paddingLeft = '0';

    const events = this.store.getTimeline();
    const { start, end } = this.getTimeRange();
    const range = end - start || 1;

    // Draw background track
    ctx.fillStyle = 'rgba(255,255,255,0.04)';
    ctx.fillRect(0, 4, w, h - 8);

    // Draw event markers
    for (const event of events) {
      const x = ((event.timestamp - start) / range) * w;
      const color = getEventColor(event);
      ctx.fillStyle = color;

      if (event.type === 'agent:spawn') {
        // Taller marker for spawns
        ctx.fillRect(x - 1, 2, 3, h - 4);
      } else if (event.type === 'agent:shutdown') {
        ctx.fillRect(x - 1, 2, 3, h - 4);
      } else {
        // Small dot for updates
        ctx.globalAlpha = 0.6;
        ctx.fillRect(x, h / 2 - 2, 2, 4);
        ctx.globalAlpha = 1;
      }
    }

    // Draw time ticks
    drawTimeTicks(w, h, ctx, start, end, range);

    // Draw playback position
    drawPlayhead(w, h, ctx, start, range, this.isLive, this.playbackPosition, this.timeLabel);
  }

  /** Expanded swim-lane render: one row per agent */
  private renderExpanded(w: number, h: number, ctx: CanvasRenderingContext2D): void {
    const LABEL_WIDTH = 60;
    const agents = this.filter.getSwimLaneAgents();
    const events = this.store.getTimeline();
    const { start, end } = this.getTimeRange();
    const range = end - start || 1;

    // The drawable area for events (right of labels)
    const drawW = w - LABEL_WIDTH;
    const drawX = LABEL_WIDTH;

    // If no agents, show a placeholder
    if (agents.length === 0) {
      this.swimLabelsEl.style.display = 'none';
      this.canvas.style.paddingLeft = '0';
      ctx.fillStyle = 'rgba(255,255,255,0.04)';
      ctx.fillRect(0, 4, w, h - 8);
      ctx.fillStyle = '#555';
      ctx.font = '11px Inter, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('No agent activity yet', w / 2, h / 2 + 4);
      drawPlayhead(w, h, ctx, start, range, this.isLive, this.playbackPosition, this.timeLabel);
      return;
    }

    // Compute row height (leave 16px at bottom for time ticks)
    const tickAreaH = 14;
    const laneAreaH = h - tickAreaH;
    const rowH = Math.max(14, Math.min(28, laneAreaH / agents.length));
    const totalLanesH = rowH * agents.length;

    // Build agent index map for fast lookup
    const agentRowMap = new Map<string, number>();
    agents.forEach((a, i) => agentRowMap.set(a.id, i));

    // Update HTML swim labels
    this.swimLabelsEl.style.display = 'flex';
    this.swimLabelsEl.innerHTML = '';
    for (const agent of agents) {
      const palette = AGENT_PALETTES[agent.colorIndex % AGENT_PALETTES.length];
      const color = '#' + palette.body.toString(16).padStart(6, '0');
      const label = document.createElement('div');
      label.className = 'swim-label';
      label.style.height = `${rowH}px`;
      label.style.color = color;
      label.textContent = agent.name;
      this.swimLabelsEl.appendChild(label);
    }

    // Draw background: alternating lane stripes
    for (let i = 0; i < agents.length; i++) {
      const y = i * rowH;
      ctx.fillStyle = i % 2 === 0 ? 'rgba(255,255,255,0.02)' : 'rgba(255,255,255,0.04)';
      ctx.fillRect(drawX, y, drawW, rowH);

      // Lane separator line
      if (i > 0) {
        ctx.strokeStyle = 'rgba(255,255,255,0.04)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(drawX, y);
        ctx.lineTo(w, y);
        ctx.stroke();
      }
    }

    // Draw left label background
    ctx.fillStyle = 'rgba(14, 16, 32, 0.8)';
    ctx.fillRect(0, 0, LABEL_WIDTH, totalLanesH);

    // Draw event markers in swim lanes
    for (const event of events) {
      // Check event type filter
      const cat = getEventCategory(event);
      if (!this.filter.isEventVisible(event, cat)) continue;

      // Check agent filter
      const row = agentRowMap.get(event.agent.id);
      if (row === undefined) continue;

      const x = drawX + ((event.timestamp - start) / range) * drawW;
      const y = row * rowH;
      const color = getEventColor(event);
      ctx.fillStyle = color;

      const cy = y + rowH / 2;

      if (event.type === 'agent:spawn') {
        // Vertical bar for spawn
        ctx.fillRect(x - 1, y + 1, 3, rowH - 2);
      } else if (event.type === 'agent:shutdown') {
        // Vertical bar for shutdown
        ctx.fillRect(x - 1, y + 1, 3, rowH - 2);
      } else if (event.type === 'agent:idle') {
        // Diamond for idle
        ctx.globalAlpha = 0.5;
        ctx.beginPath();
        ctx.moveTo(x, cy - 3);
        ctx.lineTo(x + 3, cy);
        ctx.lineTo(x, cy + 3);
        ctx.lineTo(x - 3, cy);
        ctx.closePath();
        ctx.fill();
        ctx.globalAlpha = 1;
      } else {
        // Circle for tool / zone change
        ctx.globalAlpha = 0.7;
        ctx.beginPath();
        ctx.arc(x, cy, 2.5, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = 1;
      }
    }

    // Time ticks at the bottom
    const tickY = totalLanesH;
    ctx.fillStyle = 'rgba(255,255,255,0.15)';
    ctx.font = '9px monospace';
    ctx.textAlign = 'center';
    const tickInterval = getTickInterval(range);
    const firstTick = Math.ceil(start / tickInterval) * tickInterval;
    for (let t = firstTick; t <= end; t += tickInterval) {
      const x = drawX + ((t - start) / range) * drawW;
      ctx.fillRect(x, tickY, 1, 3);
      const d = new Date(t);
      ctx.fillText(d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }), x, tickY + 12);
    }

    // Draw playback position (across entire height, offset for label area)
    if (!this.isLive) {
      const px = drawX + this.playbackPosition * drawW;
      ctx.strokeStyle = '#e94560';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(px, 0);
      ctx.lineTo(px, h);
      ctx.stroke();

      const posTime = start + this.playbackPosition * range;
      this.timeLabel.textContent = new Date(posTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    } else {
      // Live indicator line at the right edge
      ctx.strokeStyle = '#4ade80';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(w - 1, 0);
      ctx.lineTo(w - 1, h);
      ctx.stroke();

      this.timeLabel.textContent = 'LIVE';
    }
  }

  private onTrackClick(e: MouseEvent): void {
    const rect = this.canvas.getBoundingClientRect();
    let x = e.clientX - rect.left;

    // In expanded mode, account for the label area
    if (this.expanded) {
      const LABEL_WIDTH = 60;
      const drawW = rect.width - LABEL_WIDTH;
      x = x - LABEL_WIDTH;
      if (x < 0) return; // Clicked on the label area
      const pos = Math.max(0, Math.min(1, x / drawW));
      this.isLive = false;
      this.liveBtn.classList.remove('active');
      this.playbackPosition = pos;
    } else {
      const pos = Math.max(0, Math.min(1, x / rect.width));
      this.isLive = false;
      this.liveBtn.classList.remove('active');
      this.playbackPosition = pos;
    }

    this.isPlaying = false;
    this.playBtn.innerHTML = '&#9654;';
    this.stopPlayback();

    this.reconstructState();
    this.render();
  }

  private goLive(): void {
    this.isLive = true;
    this.isPlaying = false;
    this.playBtn.innerHTML = '&#9654;';
    this.liveBtn.classList.add('active');
    this.stopPlayback();

    // Signal to restore live state
    if (this.onReplayState) {
      this.onReplayState(this.store.getAgents());
    }
    this.render();
  }

  private startPlayback(): void {
    if (this.animId) return;
    this.lastFrameTime = performance.now();
    const tick = () => {
      const now = performance.now();
      const dt = now - this.lastFrameTime;
      this.lastFrameTime = now;

      const { start, end } = this.getTimeRange();
      const range = end - start || 1;
      // Advance by dt * speed in timeline space
      const advance = (dt * this.playbackSpeed) / range;
      this.playbackPosition = Math.min(1, this.playbackPosition + advance);

      if (this.playbackPosition >= 1) {
        // Reached the end -> go live
        this.goLive();
        return;
      }

      this.reconstructState();
      this.render();
      this.animId = requestAnimationFrame(tick);
    };
    this.animId = requestAnimationFrame(tick);
  }

  private stopPlayback(): void {
    if (this.animId) {
      cancelAnimationFrame(this.animId);
      this.animId = null;
    }
  }

  /**
   * Reconstruct agent state at the current playback position
   * by replaying events from the timeline buffer.
   */
  private reconstructState(): void {
    const events = this.store.getTimeline();
    const { start, end } = this.getTimeRange();
    const range = end - start || 1;
    const targetTime = start + this.playbackPosition * range;

    this.replayAgents.clear();

    for (const event of events) {
      if (event.timestamp > targetTime) break;

      switch (event.type) {
        case 'agent:spawn':
        case 'agent:update':
        case 'agent:idle':
          this.replayAgents.set(event.agent.id, { ...event.agent });
          break;
        case 'agent:shutdown':
          this.replayAgents.delete(event.agent.id);
          break;
      }
    }

    if (this.onReplayState) {
      this.onReplayState(this.replayAgents);
    }
  }
}
