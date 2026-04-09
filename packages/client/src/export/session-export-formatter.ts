/**
 * Session Export Formatter — Pure functions that produce Markdown and JSON
 * from a normalized ExportableSession shape. No DOM, no side effects.
 */

import { formatTokens, formatDuration } from '../utils/formatting.js';

// ─── Exportable Data Shapes ───────────────────────────────────

/** Normalized data shape fed into formatters (works for both live + recorded) */
export interface ExportableSession {
  source: string;
  projectName: string;
  projectPath?: string;
  rootSessionId: string;
  model: string | null;
  label?: string | null;
  startedAt: number;
  endedAt: number | null;       // null for live sessions
  durationMs: number;
  totalCost: number;
  totalInputTokens: number;
  totalOutputTokens: number;
  totalCacheReadTokens: number;
  totalCacheCreationTokens: number;
  totalToolUses: number;
  agents: ExportableAgent[];
  timeline: ExportableTimelineEvent[];
  toolCounts: Record<string, number>;
}

export interface ExportableAgent {
  agentId: string;
  name: string;
  role: string;
  model: string | null;
  cost: number;
  totalInputTokens: number;
  totalOutputTokens: number;
  cacheReadTokens: number;
  cacheCreationTokens: number;
  toolUseCount: number;
  durationMs: number;
  status?: 'active' | 'idle' | 'done';  // live sessions only
}

export interface ExportableTimelineEvent {
  timestamp: number;
  elapsedMs: number;
  agentName: string;
  kind: string;
  zone?: string;
  tool?: string;
  toolArgs?: string;
  inputTokens?: number;
  outputTokens?: number;
}

// ─── Markdown Formatter ───────────────────────────────────────

const MD_TIMELINE_LIMIT = 200;

/** Generate markdown export string */
export function formatSessionMarkdown(session: ExportableSession): string {
  const lines: string[] = [];
  const isLive = session.endedAt === null;

  lines.push('# AgentMove Session Export');
  lines.push(`> Generated ${new Date().toISOString()}`);
  lines.push('');

  // Overview
  lines.push('## Overview');
  lines.push('| Metric | Value |');
  lines.push('|--------|-------|');
  lines.push(`| Source | ${sourceLabel(session.source)} |`);
  if (session.model) lines.push(`| Model | ${session.model} |`);
  if (session.label) lines.push(`| Label | ${session.label} |`);
  lines.push(`| Duration | ${formatDuration(session.durationMs)} |`);
  lines.push(`| Total Cost | $${session.totalCost.toFixed(4)} |`);
  lines.push(`| Input Tokens | ${formatTokens(session.totalInputTokens)} |`);
  lines.push(`| Output Tokens | ${formatTokens(session.totalOutputTokens)} |`);
  lines.push(`| Cache Read | ${formatTokens(session.totalCacheReadTokens)} |`);
  lines.push(`| Cache Created | ${formatTokens(session.totalCacheCreationTokens)} |`);
  lines.push(`| Total Tool Uses | ${session.totalToolUses} |`);
  if (isLive) lines.push(`| Status | Live |`);
  lines.push('');

  // Agents
  if (session.agents.length > 0) {
    lines.push('## Agents');
    lines.push('| Agent | Role | Model | Cost | Tokens | Tools | Duration |');
    lines.push('|-------|------|-------|------|--------|-------|----------|');
    const sorted = [...session.agents].sort((a, b) => b.cost - a.cost);
    for (const a of sorted) {
      const totalTok = a.totalInputTokens + a.totalOutputTokens;
      lines.push(`| ${a.name} | ${a.role} | ${a.model ?? '-'} | $${a.cost.toFixed(4)} | ${formatTokens(totalTok)} | ${a.toolUseCount} | ${formatDuration(a.durationMs)} |`);
    }
    lines.push('');
  } else {
    lines.push('## Agents');
    lines.push('No agents recorded.');
    lines.push('');
  }

  // Tool Usage
  const toolEntries = Object.entries(session.toolCounts).sort((a, b) => b[1] - a[1]);
  if (toolEntries.length > 0) {
    lines.push('## Tool Usage');
    lines.push('| Tool | Count |');
    lines.push('|------|-------|');
    for (const [tool, count] of toolEntries) {
      lines.push(`| ${tool} | ${count} |`);
    }
    lines.push('');
  }

  // Timeline
  if (session.timeline.length > 0) {
    const events = session.timeline.slice(-MD_TIMELINE_LIMIT);
    const truncated = session.timeline.length > MD_TIMELINE_LIMIT;
    lines.push(`## Timeline (${truncated ? `last ${MD_TIMELINE_LIMIT} of ${session.timeline.length}` : `${session.timeline.length}`} events)`);
    lines.push('| Time | Agent | Event |');
    lines.push('|------|-------|-------|');
    for (const e of events) {
      const time = `+${formatDuration(e.elapsedMs)}`;
      const event = formatTimelineEventMd(e);
      lines.push(`| ${time} | ${e.agentName} | ${event} |`);
    }
    lines.push('');
  }

  lines.push('---');
  lines.push('*Exported by AgentMove*');

  return lines.join('\n');
}

function formatTimelineEventMd(e: ExportableTimelineEvent): string {
  switch (e.kind) {
    case 'tool':
      return `Tool: ${e.tool ?? 'unknown'}${e.toolArgs ? ` ${truncateMd(e.toolArgs, 50)}` : ''}`;
    case 'spawn':
      return 'Spawned';
    case 'shutdown':
      return 'Shut down';
    case 'idle':
      return 'Idle';
    case 'zone-change':
      return `Zone: ${e.zone ?? 'unknown'}`;
    case 'tokens':
      return `Tokens: +${formatTokens(e.inputTokens ?? 0)} in / +${formatTokens(e.outputTokens ?? 0)} out`;
    default:
      return e.kind;
  }
}

function truncateMd(s: string, max: number): string {
  // Remove pipe chars to prevent table breakage
  const clean = s.replace(/\|/g, '/').replace(/\n/g, ' ');
  return clean.length > max ? clean.slice(0, max - 1) + '\u2026' : clean;
}

function sourceLabel(source: string): string {
  const labels: Record<string, string> = {
    claude: 'Claude Code',
    opencode: 'OpenCode',
    pi: 'pi',
    codex: 'Codex CLI',
  };
  return labels[source] ?? source;
}

// ─── JSON Formatter ───────────────────────────────────────────

const JSON_TIMELINE_LIMIT = 500;

export interface SessionExportJSON {
  version: number;
  exportedAt: string;
  session: {
    source: string;
    projectName: string;
    projectPath?: string;
    rootSessionId: string;
    model: string | null;
    label?: string | null;
    startedAt: number;
    endedAt: number | null;
    durationMs: number;
    isLive: boolean;
  };
  cost: {
    total: number;
    currency: string;
  };
  tokens: {
    totalInput: number;
    totalOutput: number;
    totalCacheRead: number;
    totalCacheCreation: number;
  };
  agents: Array<{
    id: string;
    name: string;
    role: string;
    model: string | null;
    cost: number;
    tokens: {
      input: number;
      output: number;
      cacheRead: number;
      cacheCreation: number;
    };
    toolUseCount: number;
    durationMs: number;
    status?: string;
  }>;
  toolUsage: Record<string, number>;
  timeline: Array<{
    timestamp: number;
    elapsedMs: number;
    agent: string;
    kind: string;
    tool?: string;
    zone?: string;
    inputTokens?: number;
    outputTokens?: number;
  }>;
}

/** Generate structured JSON export object */
export function formatSessionJSON(session: ExportableSession): SessionExportJSON {
  const isLive = session.endedAt === null;
  const timelineEvents = session.timeline.slice(-JSON_TIMELINE_LIMIT);

  return {
    version: 1,
    exportedAt: new Date().toISOString(),
    session: {
      source: session.source,
      projectName: session.projectName,
      ...(session.projectPath ? { projectPath: session.projectPath } : {}),
      rootSessionId: session.rootSessionId,
      model: session.model,
      ...(session.label ? { label: session.label } : {}),
      startedAt: session.startedAt,
      endedAt: session.endedAt,
      durationMs: session.durationMs,
      isLive,
    },
    cost: {
      total: session.totalCost,
      currency: 'USD',
    },
    tokens: {
      totalInput: session.totalInputTokens,
      totalOutput: session.totalOutputTokens,
      totalCacheRead: session.totalCacheReadTokens,
      totalCacheCreation: session.totalCacheCreationTokens,
    },
    agents: session.agents.map(a => ({
      id: a.agentId,
      name: a.name,
      role: a.role,
      model: a.model,
      cost: a.cost,
      tokens: {
        input: a.totalInputTokens,
        output: a.totalOutputTokens,
        cacheRead: a.cacheReadTokens,
        cacheCreation: a.cacheCreationTokens,
      },
      toolUseCount: a.toolUseCount,
      durationMs: a.durationMs,
      ...(a.status ? { status: a.status } : {}),
    })),
    toolUsage: { ...session.toolCounts },
    timeline: timelineEvents.map(e => ({
      timestamp: e.timestamp,
      elapsedMs: e.elapsedMs,
      agent: e.agentName,
      kind: e.kind,
      ...(e.tool ? { tool: e.tool } : {}),
      ...(e.zone ? { zone: e.zone } : {}),
      ...(e.inputTokens != null ? { inputTokens: e.inputTokens } : {}),
      ...(e.outputTokens != null ? { outputTokens: e.outputTokens } : {}),
    })),
  };
}
