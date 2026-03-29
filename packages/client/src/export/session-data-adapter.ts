/**
 * Session Data Adapter — Maps live and recorded session data
 * into the unified ExportableSession shape used by formatters.
 */

import type { RecordedSession, RecordedTimelineEvent, AgentState, ActivityEntry } from '@agent-move/shared';
import { computeAgentCost, ZONE_MAP } from '@agent-move/shared';
import type { ExportableSession, ExportableAgent, ExportableTimelineEvent } from './session-export-formatter.js';

// ─── Recorded Session Adapter ─────────────────────────────────

/** Adapt a recorded session + timeline into ExportableSession */
export function adaptRecordedSession(
  session: RecordedSession,
  timeline: RecordedTimelineEvent[],
  resolveAgentName: (agentId: string) => string,
): ExportableSession {
  const agents: ExportableAgent[] = session.agents.map(ag => ({
    agentId: ag.agentId,
    name: resolveAgentName(ag.agentId),
    role: ag.role,
    model: ag.model,
    cost: ag.cost,
    totalInputTokens: ag.totalInputTokens,
    totalOutputTokens: ag.totalOutputTokens,
    cacheReadTokens: ag.cacheReadTokens,
    cacheCreationTokens: ag.cacheCreationTokens,
    toolUseCount: ag.toolUseCount,
    durationMs: ag.endedAt - ag.spawnedAt,
  }));

  const startedAt = session.startedAt;
  const timelineEvents: ExportableTimelineEvent[] = timeline.map(e => ({
    timestamp: e.timestamp,
    elapsedMs: e.timestamp - startedAt,
    agentName: resolveAgentName(e.agentId),
    kind: e.kind,
    zone: e.zone ? (ZONE_MAP.get(e.zone)?.label ?? e.zone) : undefined,
    tool: e.tool,
    toolArgs: e.toolArgs,
    inputTokens: e.inputTokens,
    outputTokens: e.outputTokens,
  }));

  // Tool counts from toolchain data or from timeline
  const toolCounts: Record<string, number> = session.toolChain?.toolCounts
    ? { ...session.toolChain.toolCounts }
    : buildToolCountsFromTimeline(timeline);

  return {
    source: session.source,
    projectName: session.projectName,
    projectPath: session.projectPath,
    rootSessionId: session.rootSessionId,
    model: session.model,
    label: session.label,
    startedAt: session.startedAt,
    endedAt: session.endedAt,
    durationMs: session.durationMs,
    totalCost: session.totalCost,
    totalInputTokens: session.totalInputTokens,
    totalOutputTokens: session.totalOutputTokens,
    totalCacheReadTokens: session.totalCacheReadTokens,
    totalCacheCreationTokens: session.totalCacheCreationTokens,
    totalToolUses: session.totalToolUses,
    agents,
    timeline: timelineEvents,
    toolCounts,
  };
}

function buildToolCountsFromTimeline(timeline: RecordedTimelineEvent[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const e of timeline) {
    if (e.kind === 'tool' && e.tool) {
      counts[e.tool] = (counts[e.tool] ?? 0) + 1;
    }
  }
  return counts;
}

// ─── Live Session Adapter ─────────────────────────────────────

/** Adapt live session data into ExportableSession */
export function adaptLiveSession(
  liveAgents: AgentState[],
  shutdownTotals: { cost: number; input: number; output: number; tools: number },
  activityEntries: Map<string, ActivityEntry[]>,
  resolveAgentName: (agentId: string) => string,
): ExportableSession {
  const now = Date.now();

  // Determine earliest spawn time for session start
  const startedAt = liveAgents.length > 0
    ? Math.min(...liveAgents.map(a => a.spawnedAt))
    : now;

  // Build per-agent export data
  const agents: ExportableAgent[] = liveAgents.map(ag => {
    const cost = computeAgentCost(ag);
    const status: 'active' | 'idle' | 'done' = ag.isDone ? 'done' : ag.isIdle ? 'idle' : 'active';
    return {
      agentId: ag.id,
      name: resolveAgentName(ag.id),
      role: ag.role,
      model: ag.model ?? null,
      cost,
      totalInputTokens: ag.totalInputTokens ?? 0,
      totalOutputTokens: ag.totalOutputTokens ?? 0,
      cacheReadTokens: ag.cacheReadTokens ?? 0,
      cacheCreationTokens: ag.cacheCreationTokens ?? 0,
      toolUseCount: ag.toolUseCount ?? 0,
      durationMs: now - ag.spawnedAt,
      status,
    };
  });

  // Aggregate totals (live agents + shutdown agents)
  let totalCost = shutdownTotals.cost;
  let totalInput = shutdownTotals.input;
  let totalOutput = shutdownTotals.output;
  let totalToolUses = shutdownTotals.tools;
  let totalCacheRead = 0;
  let totalCacheCreation = 0;
  const models = new Set<string>();

  for (const ag of liveAgents) {
    totalCost += computeAgentCost(ag);
    totalInput += ag.totalInputTokens ?? 0;
    totalOutput += ag.totalOutputTokens ?? 0;
    totalCacheRead += ag.cacheReadTokens ?? 0;
    totalCacheCreation += ag.cacheCreationTokens ?? 0;
    totalToolUses += ag.toolUseCount ?? 0;
    if (ag.model) models.add(ag.model);
  }

  // Build timeline from activity entries
  const allEntries: ExportableTimelineEvent[] = [];
  for (const [agentId, entries] of activityEntries) {
    const agentName = resolveAgentName(agentId);
    for (const e of entries) {
      allEntries.push({
        timestamp: e.timestamp,
        elapsedMs: e.timestamp - startedAt,
        agentName,
        kind: e.kind,
        zone: e.zone ? (ZONE_MAP.get(e.zone)?.label ?? e.zone) : undefined,
        tool: e.tool,
        toolArgs: e.toolArgs,
        inputTokens: e.inputTokens,
        outputTokens: e.outputTokens,
      });
    }
  }
  allEntries.sort((a, b) => a.timestamp - b.timestamp);

  // Build tool counts from activity entries
  const toolCounts: Record<string, number> = {};
  for (const e of allEntries) {
    if (e.kind === 'tool' && e.tool) {
      toolCounts[e.tool] = (toolCounts[e.tool] ?? 0) + 1;
    }
  }

  // Determine the primary model
  const modelStr = models.size > 0 ? [...models].join(', ') : null;

  // Determine the project name from agents
  const projectName = liveAgents.length > 0
    ? (liveAgents[0].projectName ?? 'Unknown Project')
    : 'Unknown Project';

  return {
    source: liveAgents.length > 0 ? liveAgents[0].agentType : 'unknown',
    projectName,
    rootSessionId: liveAgents.length > 0 ? liveAgents[0].rootSessionId : 'unknown',
    model: modelStr,
    startedAt,
    endedAt: null, // live session
    durationMs: now - startedAt,
    totalCost,
    totalInputTokens: totalInput,
    totalOutputTokens: totalOutput,
    totalCacheReadTokens: totalCacheRead,
    totalCacheCreationTokens: totalCacheCreation,
    totalToolUses,
    agents,
    timeline: allEntries,
    toolCounts,
  };
}
