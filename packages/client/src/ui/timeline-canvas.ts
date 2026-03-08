import type { TimelineEvent } from '@agent-move/shared';
import { AGENT_PALETTES } from '@agent-move/shared';

/** Event type categories for filtering */
export type EventCategory = 'tool' | 'zone' | 'idle' | 'lifecycle';

/** Map event types to filter categories */
export function getEventCategory(event: TimelineEvent): EventCategory {
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

export function getEventColor(event: TimelineEvent): string {
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

export function getTickInterval(rangeMs: number): number {
  if (rangeMs < 5 * 60 * 1000) return 60 * 1000; // 1 min ticks for <5min range
  if (rangeMs < 15 * 60 * 1000) return 2 * 60 * 1000;
  return 5 * 60 * 1000; // 5 min ticks
}

/** Draw time ticks (used by compact mode) */
export function drawTimeTicks(
  w: number,
  h: number,
  ctx: CanvasRenderingContext2D,
  start: number,
  end: number,
  range: number,
): void {
  ctx.fillStyle = 'rgba(255,255,255,0.15)';
  ctx.font = '9px monospace';
  ctx.textAlign = 'center';
  const tickInterval = getTickInterval(range);
  const firstTick = Math.ceil(start / tickInterval) * tickInterval;
  for (let t = firstTick; t <= end; t += tickInterval) {
    const x = ((t - start) / range) * w;
    ctx.fillRect(x, 0, 1, 3);
    const d = new Date(t);
    ctx.fillText(d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }), x, h - 1);
  }
}

/** Draw the playback position indicator (used by compact mode) */
export function drawPlayhead(
  w: number,
  h: number,
  ctx: CanvasRenderingContext2D,
  start: number,
  range: number,
  isLive: boolean,
  playbackPosition: number,
  timeLabel: HTMLElement,
): void {
  if (!isLive) {
    const px = playbackPosition * w;
    ctx.strokeStyle = '#e94560';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(px, 0);
    ctx.lineTo(px, h);
    ctx.stroke();

    // Timestamp label
    const posTime = start + playbackPosition * range;
    timeLabel.textContent = new Date(posTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  } else {
    // Live indicator line at the end
    ctx.strokeStyle = '#4ade80';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(w - 1, 0);
    ctx.lineTo(w - 1, h);
    ctx.stroke();

    timeLabel.textContent = 'LIVE';
  }
}
