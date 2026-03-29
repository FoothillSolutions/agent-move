/**
 * Markdown report formatter for session export data.
 * Generates a comprehensive, human-readable markdown document.
 */

import type { SessionExportData } from './session-export-data.js';
import { formatTokens, formatDuration } from '../../utils/formatting.js';

const MAX_TIMELINE_ENTRIES = 200;

export function formatMarkdown(data: SessionExportData): string {
  const lines: string[] = [];

  // Header
  lines.push(`# AgentMove Session Export`);
  lines.push(`> Generated ${data.meta.exportedAt} | Source: ${data.meta.source}`);
  lines.push('');

  // Overview
  lines.push(`## Overview`);
  lines.push('');
  lines.push(`| Metric | Value |`);
  lines.push(`|--------|-------|`);
  lines.push(`| Project | ${data.overview.projectName} |`);
  if (data.overview.projectPath) {
    lines.push(`| Path | \`${data.overview.projectPath}\` |`);
  }
  lines.push(`| CLI | ${data.overview.source} |`);
  if (data.overview.model) {
    lines.push(`| Model | ${data.overview.model} |`);
  }
  lines.push(`| Duration | ${formatDuration(data.overview.duration)} |`);
  lines.push(`| Started | ${new Date(data.overview.startedAt).toLocaleString()} |`);
  if (data.overview.endedAt) {
    lines.push(`| Ended | ${new Date(data.overview.endedAt).toLocaleString()} |`);
  }
  if (data.overview.label) {
    lines.push(`| Label | ${data.overview.label} |`);
  }
  if (data.overview.tags.length > 0) {
    lines.push(`| Tags | ${data.overview.tags.join(', ')} |`);
  }
  lines.push('');

  // Totals
  lines.push(`## Token Summary`);
  lines.push('');
  lines.push(`| Metric | Value |`);
  lines.push(`|--------|-------|`);
  lines.push(`| Total Cost | $${data.totals.cost.toFixed(4)} |`);
  lines.push(`| Input Tokens | ${formatTokens(data.totals.inputTokens)} |`);
  lines.push(`| Output Tokens | ${formatTokens(data.totals.outputTokens)} |`);
  lines.push(`| Cache Read | ${formatTokens(data.totals.cacheReadTokens)} |`);
  lines.push(`| Cache Created | ${formatTokens(data.totals.cacheCreationTokens)} |`);
  lines.push(`| Tool Uses | ${data.totals.toolUses} |`);
  lines.push(`| Agents | ${data.totals.agentCount} (${data.totals.activeCount} active, ${data.totals.idleCount} idle, ${data.totals.doneCount} done) |`);
  lines.push('');

  // Agents
  if (data.agents.length > 0) {
    lines.push(`## Agents`);
    lines.push('');
    lines.push(`| Agent | Role | Status | Zone | Cost | Tokens | Tools | Duration |`);
    lines.push(`|-------|------|--------|------|------|--------|-------|----------|`);
    for (const a of data.agents) {
      const tokens = formatTokens(a.inputTokens + a.outputTokens);
      lines.push(`| ${a.name} | ${a.role} | ${a.status} | ${a.zone} | $${a.cost.toFixed(4)} | ${tokens} | ${a.toolUseCount} | ${formatDuration(a.duration)} |`);
    }
    lines.push('');
  }

  // Zone Distribution
  const zoneEntries = Object.entries(data.zoneDistribution).sort((a, b) => b[1] - a[1]);
  if (zoneEntries.length > 0) {
    lines.push(`## Zone Distribution`);
    lines.push('');
    lines.push(`| Zone | Count |`);
    lines.push(`|------|-------|`);
    for (const [zone, count] of zoneEntries) {
      lines.push(`| ${zone} | ${count} |`);
    }
    lines.push('');
  }

  // Timeline
  if (data.timeline.length > 0) {
    const truncated = data.timeline.length > MAX_TIMELINE_ENTRIES;
    const entries = truncated ? data.timeline.slice(-MAX_TIMELINE_ENTRIES) : data.timeline;
    lines.push(`## Activity Timeline (${data.timeline.length} events${truncated ? `, showing last ${MAX_TIMELINE_ENTRIES}` : ''})`);
    lines.push('');

    for (const e of entries) {
      const elapsed = formatDuration(e.elapsed);
      const prefix = `- \`${elapsed}\` **${e.agentName}**`;

      switch (e.kind) {
        case 'tool':
          lines.push(`${prefix} used \`${e.tool ?? 'unknown'}\`${e.toolArgs ? ` — ${truncateStr(e.toolArgs, 80)}` : ''}`);
          break;
        case 'spawn':
          lines.push(`${prefix} spawned`);
          break;
        case 'shutdown':
          lines.push(`${prefix} shut down`);
          break;
        case 'idle':
          lines.push(`${prefix} went idle`);
          break;
        case 'zone-change':
          lines.push(`${prefix} moved to ${e.zone ?? 'unknown'}`);
          break;
        case 'tokens':
          lines.push(`${prefix} +${formatTokens(e.inputTokens ?? 0)} in / +${formatTokens(e.outputTokens ?? 0)} out`);
          break;
        default:
          lines.push(`${prefix} ${e.kind}`);
      }
    }
    if (truncated) {
      lines.push('');
      lines.push(`> *${data.timeline.length - MAX_TIMELINE_ENTRIES} earlier events omitted for readability. Use JSON export for the full timeline.*`);
    }
    lines.push('');
  }

  // Tool Chain Analytics
  if (data.toolChain) {
    const tc = data.toolChain;
    lines.push(`## Tool Chain Analytics`);
    lines.push('');

    // Tool usage counts
    const toolCounts = Object.entries(tc.toolCounts).sort((a, b) => b[1] - a[1]);
    if (toolCounts.length > 0) {
      lines.push(`### Tool Usage`);
      lines.push('');
      lines.push(`| Tool | Count | Success | Failure | Avg Duration |`);
      lines.push(`|------|-------|---------|---------|--------------|`);
      for (const [tool, count] of toolCounts) {
        const successes = tc.toolSuccesses?.[tool] ?? '-';
        const failures = tc.toolFailures?.[tool] ?? '-';
        const avgDur = tc.toolAvgDuration?.[tool] != null ? `${tc.toolAvgDuration[tool].toFixed(0)}ms` : '-';
        lines.push(`| ${tool} | ${count} | ${successes} | ${failures} | ${avgDur} |`);
      }
      lines.push('');
    }

    // Top transitions
    if (tc.transitions.length > 0) {
      const topTransitions = tc.transitions.slice().sort((a, b) => b.count - a.count).slice(0, 20);
      lines.push(`### Top Tool Transitions`);
      lines.push('');
      lines.push(`| From | To | Count |`);
      lines.push(`|------|----|-------|`);
      for (const t of topTransitions) {
        lines.push(`| ${t.from} | ${t.to} | ${t.count} |`);
      }
      lines.push('');
    }
  }

  // Task Graph
  if (data.taskGraph && data.taskGraph.tasks.length > 0) {
    lines.push(`## Task Graph`);
    lines.push('');
    lines.push(`| Task | Status | Owner | Blocked By |`);
    lines.push(`|------|--------|-------|------------|`);
    for (const task of data.taskGraph.tasks) {
      const blocked = task.blockedBy.length > 0 ? task.blockedBy.join(', ') : '-';
      lines.push(`| ${truncateStr(task.subject, 60)} | ${task.status} | ${task.agentName ?? task.owner ?? '-'} | ${blocked} |`);
    }
    lines.push('');
  }

  // File Changes (Diffs)
  if (data.diffs.length > 0) {
    lines.push(`## File Changes (${data.diffs.length} edits)`);
    lines.push('');
    for (const d of data.diffs.slice(0, 30)) {
      lines.push(`### \`${d.filePath}\``);
      lines.push('');
      if (d.oldText) {
        lines.push('```diff');
        lines.push(`- ${truncateStr(d.oldText, 200)}`);
        lines.push(`+ ${truncateStr(d.newText, 200)}`);
        lines.push('```');
      } else {
        lines.push('```');
        lines.push(truncateStr(d.newText, 300));
        lines.push('```');
      }
      lines.push('');
    }
    if (data.diffs.length > 30) {
      lines.push(`> *${data.diffs.length - 30} additional edits omitted.*`);
      lines.push('');
    }
  }

  // Anomalies
  if (data.anomalies.length > 0) {
    lines.push(`## Anomalies`);
    lines.push('');
    for (const a of data.anomalies) {
      lines.push(`- **${a.kind}**: ${a.description} (agent: ${a.agentId})`);
    }
    lines.push('');
  }

  lines.push('---');
  lines.push('*Generated by AgentMove*');

  return lines.join('\n');
}

function truncateStr(s: string, max: number): string {
  if (s.length <= max) return s;
  return s.slice(0, max - 1) + '\u2026';
}
