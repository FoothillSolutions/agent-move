import type { AgentState, TimelineEvent, ZoneId } from '@agent-move/shared';
import { AGENT_PALETTES } from '@agent-move/shared';
import type { StateStore } from '../connection/state-store.js';

/** Event type categories for filtering */
type EventCategory = 'tool' | 'zone' | 'idle' | 'lifecycle';

/** Map event types to filter categories */
function getEventCategory(event: TimelineEvent): EventCategory {
  switch (event.type) {
    case 'agent:spawn':
    case 'agent:shutdown':
      return 'lifecycle';
    case 'agent:idle':
      return 'idle';
    case 'agent:update': {
      // If the agent has a currentTool, it's a tool event; otherwise zone change
      if (event.agent.currentTool) return 'tool';
      return 'zone';
    }
  }
}

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
  private activeFilters = new Set<EventCategory>(['tool', 'zone', 'idle', 'lifecycle']);
  private visibleAgents = new Set<string>(); // empty = show all
  private filterContainer: HTMLElement;
  private agentFilterContainer: HTMLElement;
  private swimLabelsEl: HTMLElement;
  private trackWrapper: HTMLElement;

  // Bound event handlers (stored for cleanup)
  private resizeHandler = () => this.resizeCanvas();

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
    document.getElementById('app')!.appendChild(this.el);

    this.canvas = this.el.querySelector('#timeline-canvas')! as HTMLCanvasElement;
    this.ctx = this.canvas.getContext('2d')!;
    this.playBtn = this.el.querySelector('#timeline-play')! as HTMLButtonElement;
    this.liveBtn = this.el.querySelector('#timeline-live')! as HTMLButtonElement;
    this.timeLabel = this.el.querySelector('#timeline-time')!;
    this.expandBtn = this.el.querySelector('.timeline-expand-btn')! as HTMLButtonElement;
    this.filterContainer = this.el.querySelector('.timeline-filters')!;
    this.agentFilterContainer = this.el.querySelector('.timeline-agent-filters')!;
    this.swimLabelsEl = this.el.querySelector('.timeline-swim-labels')!;
    this.trackWrapper = this.el.querySelector('.timeline-track')!;

    const speedBtn = this.el.querySelector('#timeline-speed')! as HTMLElement;

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
        const cat = (pill as HTMLElement).dataset.category as EventCategory;
        if (this.activeFilters.has(cat)) {
          this.activeFilters.delete(cat);
          pill.classList.remove('active');
        } else {
          this.activeFilters.add(cat);
          pill.classList.add('active');
        }
        this.render();
      });
    });

    // When new timeline snapshot arrives, re-render
    this.store.on('timeline:snapshot', () => {
      this.updateAgentFilters();
      this.render();
    });

    // Update agent filters when agents spawn/shutdown
    this.store.on('agent:spawn', () => this.updateAgentFilters());
    this.store.on('agent:shutdown', () => this.updateAgentFilters());

    // Re-render periodically while live
    this.liveRenderTimer = setInterval(() => {
      if (this.isLive) this.render();
    }, 1000);
  }

  setReplayCallback(cb: (agents: Map<string, AgentState>) => void): void {
    this.onReplayState = cb;
  }

  dispose(): void {
    if (this.liveRenderTimer) clearInterval(this.liveRenderTimer);
    if (this.animId) cancelAnimationFrame(this.animId);
    window.removeEventListener('resize', this.resizeHandler);
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
    this.updateAgentFilters();
    // Need to delay resize slightly for CSS transition
    requestAnimationFrame(() => {
      this.resizeCanvas();
    });
  }

  /** Build the agent filter pills based on known agents in timeline */
  private updateAgentFilters(): void {
    const agents = this.getUniqueAgents();
    this.agentFilterContainer.innerHTML = '';

    if (agents.length === 0) return;

    for (const agent of agents) {
      const palette = AGENT_PALETTES[agent.colorIndex % AGENT_PALETTES.length];
      const color = '#' + palette.body.toString(16).padStart(6, '0');
      const pill = document.createElement('button');
      pill.className = 'tl-agent-pill';
      // Show as active if visibleAgents is empty (show all) or this agent is in the set
      if (this.visibleAgents.size === 0 || this.visibleAgents.has(agent.id)) {
        pill.classList.add('active');
      }
      pill.innerHTML = `<span class="tl-agent-dot" style="background:${color}"></span>${agent.name}`;
      pill.title = `Toggle ${agent.name}`;
      pill.addEventListener('click', () => {
        this.toggleAgentFilter(agent.id);
      });
      this.agentFilterContainer.appendChild(pill);
    }
  }

  private toggleAgentFilter(agentId: string): void {
    const agents = this.getUniqueAgents();

    if (this.visibleAgents.size === 0) {
      // Currently showing all. Clicking one means "show only this one"
      // But if there's only 1 agent, toggling does nothing useful
      if (agents.length <= 1) return;
      // Set to show only the clicked agent
      this.visibleAgents.clear();
      this.visibleAgents.add(agentId);
    } else if (this.visibleAgents.has(agentId)) {
      this.visibleAgents.delete(agentId);
      // If none remain, go back to "show all"
      if (this.visibleAgents.size === 0) {
        // Already empty = show all
      }
    } else {
      this.visibleAgents.add(agentId);
      // If all are now selected, clear to "show all" mode
      if (this.visibleAgents.size >= agents.length) {
        this.visibleAgents.clear();
      }
    }

    this.updateAgentFilters();
    this.render();
  }

  /** Get unique agents from timeline events, preserving order */
  private getUniqueAgents(): { id: string; name: string; colorIndex: number }[] {
    const events = this.store.getTimeline();
    const seen = new Map<string, { id: string; name: string; colorIndex: number }>();
    for (const e of events) {
      if (!seen.has(e.agent.id)) {
        seen.set(e.agent.id, {
          id: e.agent.id,
          name: e.agent.agentName || e.agent.projectName || e.agent.id.slice(0, 8),
          colorIndex: e.agent.colorIndex,
        });
      }
    }
    return Array.from(seen.values());
  }

  /** Get the filtered list of agents to show in swim lanes */
  private getSwimLaneAgents(): { id: string; name: string; colorIndex: number }[] {
    const all = this.getUniqueAgents();
    if (this.visibleAgents.size === 0) return all;
    return all.filter((a) => this.visibleAgents.has(a.id));
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
      const color = this.getEventColor(event);
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
    this.drawTimeTicks(w, h, ctx, start, end, range);

    // Draw playback position
    this.drawPlayhead(w, h, ctx, start, range);
  }

  /** Expanded swim-lane render: one row per agent */
  private renderExpanded(w: number, h: number, ctx: CanvasRenderingContext2D): void {
    const LABEL_WIDTH = 60;
    const agents = this.getSwimLaneAgents();
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
      this.drawPlayhead(w, h, ctx, start, range);
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
      if (!this.activeFilters.has(cat)) continue;

      // Check agent filter
      const row = agentRowMap.get(event.agent.id);
      if (row === undefined) continue;

      const x = drawX + ((event.timestamp - start) / range) * drawW;
      const y = row * rowH;
      const color = this.getEventColor(event);
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
    const tickInterval = this.getTickInterval(range);
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

  /** Draw time ticks (shared by compact mode) */
  private drawTimeTicks(w: number, h: number, ctx: CanvasRenderingContext2D, start: number, end: number, range: number): void {
    ctx.fillStyle = 'rgba(255,255,255,0.15)';
    ctx.font = '9px monospace';
    ctx.textAlign = 'center';
    const tickInterval = this.getTickInterval(range);
    const firstTick = Math.ceil(start / tickInterval) * tickInterval;
    for (let t = firstTick; t <= end; t += tickInterval) {
      const x = ((t - start) / range) * w;
      ctx.fillRect(x, 0, 1, 3);
      const d = new Date(t);
      ctx.fillText(d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }), x, h - 1);
    }
  }

  /** Draw the playback position indicator (shared by compact mode) */
  private drawPlayhead(w: number, h: number, ctx: CanvasRenderingContext2D, start: number, range: number): void {
    if (!this.isLive) {
      const px = this.playbackPosition * w;
      ctx.strokeStyle = '#e94560';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(px, 0);
      ctx.lineTo(px, h);
      ctx.stroke();

      // Timestamp label
      const posTime = start + this.playbackPosition * range;
      this.timeLabel.textContent = new Date(posTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    } else {
      // Live indicator line at the end
      ctx.strokeStyle = '#4ade80';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(w - 1, 0);
      ctx.lineTo(w - 1, h);
      ctx.stroke();

      this.timeLabel.textContent = 'LIVE';
    }
  }

  private getTickInterval(rangeMs: number): number {
    if (rangeMs < 5 * 60 * 1000) return 60 * 1000; // 1 min ticks for <5min range
    if (rangeMs < 15 * 60 * 1000) return 2 * 60 * 1000;
    return 5 * 60 * 1000; // 5 min ticks
  }

  private getEventColor(event: TimelineEvent): string {
    switch (event.type) {
      case 'agent:spawn': return '#a855f7';
      case 'agent:shutdown': return '#f87171';
      case 'agent:idle': return '#6b7280';
      case 'agent:update': {
        const palette = AGENT_PALETTES[event.agent.colorIndex % AGENT_PALETTES.length];
        return '#' + palette.body.toString(16).padStart(6, '0');
      }
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
