/**
 * Shared formatting utilities used across UI components.
 * Centralizes HTML escaping, color conversion, token/duration formatting.
 */

/** Escape HTML special characters for safe innerHTML insertion */
export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

/** Escape for HTML attribute values (includes quotes) */
export function escapeAttr(s: string): string {
  return escapeHtml(s).replace(/"/g, '&quot;');
}

/** Escape HTML and convert newlines to <br> tags */
export function escapeHtmlWithBreaks(s: string): string {
  return escapeHtml(s).replace(/\n/g, '<br>');
}

/** Convert a numeric hex color (0xRRGGBB) to a CSS color string (#RRGGBB) */
export function hexToCss(hex: number): string {
  return '#' + hex.toString(16).padStart(6, '0');
}

/** Format a token count as a human-readable string (e.g. 1.2M, 3.5K, 42) */
export function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return `${n}`;
}

/** Format token pair as "X in / Y out" */
export function formatTokenPair(input: number, output: number): string {
  const total = input + output;
  if (total >= 1_000_000) return `${(total / 1_000_000).toFixed(1)}M tokens`;
  if (total >= 1_000) return `${(total / 1_000).toFixed(1)}K tokens`;
  return `${total} tokens`;
}

/** Format millisecond duration as human-readable (e.g. "2h 15m", "3m 42s", "5s") */
export function formatDuration(ms: number): string {
  const totalSec = Math.floor(ms / 1000);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

/** Truncate a string to max length with ellipsis */
export function truncate(s: string, max: number): string {
  return s.length > max ? s.slice(0, max - 1) + '\u2026' : s;
}

import type { AgentType, RecordedAgent } from '@agent-move/shared';
import { getFunnyName } from '@agent-move/shared';

/** CLI type badge config keyed by AgentType */
const CLI_BADGES: Record<AgentType, { label: string; color: string; title: string }> = {
  claude:   { label: 'CC', color: '#a78bfa', title: 'Claude Code' },
  opencode: { label: 'OC', color: '#22d3ee', title: 'OpenCode' },
  pi:       { label: 'PI', color: '#f59e0b', title: 'pi coding agent' },
  codex:    { label: 'CX', color: '#10b981', title: 'Codex CLI' },
};

/** Return an HTML badge string indicating the CLI type (CC, OC, PI) */
export function getCliBadge(agentType: AgentType): string {
  const match = CLI_BADGES[agentType];
  return `<span class="cli-badge" title="${match.title}" style="
    background: ${match.color}22;
    color: ${match.color};
    border: 1px solid ${match.color}44;
    padding: 0 3px;
    border-radius: 3px;
    font-size: 8px;
    font-weight: 700;
    letter-spacing: 0.5px;
    margin-left: 4px;
    vertical-align: middle;
  ">${match.label}</span>`;
}

/** Get source icon abbreviation (CC, OC, etc.) from source/agentType string */
export function getSourceIcon(source: string): string {
  return CLI_BADGES[source as AgentType]?.label ?? source.toUpperCase().slice(0, 2);
}

/** Get source display label (Claude Code, OpenCode, etc.) from source/agentType string */
export function getSourceLabel(source: string): string {
  return CLI_BADGES[source as AgentType]?.title ?? source;
}

/** Cached agent customizations from localStorage */
let _customizationsCache: Record<string, { displayName?: string }> | null = null;
let _customizationsCacheTime = 0;
const CUSTOMIZATIONS_CACHE_TTL = 2000; // 2s

function getCustomizations(): Record<string, { displayName?: string }> {
  const now = Date.now();
  if (_customizationsCache && (now - _customizationsCacheTime) < CUSTOMIZATIONS_CACHE_TTL) {
    return _customizationsCache;
  }
  try {
    _customizationsCache = JSON.parse(localStorage.getItem('agent-customizations') ?? '{}');
    _customizationsCacheTime = now;
  } catch {
    _customizationsCache = {};
  }
  return _customizationsCache!;
}

/** Resolve display name for a recorded agent using customizations or funny names */
export function resolveAgentName(ag: RecordedAgent): string {
  const customs = getCustomizations();
  const custom = customs[ag.agentId];
  if (custom?.displayName) return custom.displayName;
  return ag.agentName || getFunnyName(ag.agentId);
}
