/**
 * Unified export data model and assemblers for session export.
 * Collects all session data from either live or recorded sessions
 * into a common shape consumed by both markdown and JSON formatters.
 */

import type {
  AgentState,
  RecordedSession,
  RecordedTimelineEvent,
  ToolChainData,
  TaskGraphData,
  ZoneId,
  ActivityEntry,
} from '@agent-move/shared';
import { ZONE_MAP, computeAgentCost, getFunnyName } from '@agent-move/shared';
import type { StateStore } from '../../connection/state-store.js';

/* ── Export data shape ── */

export interface AgentExportData {
  id: string;
  name: string;
  role: string;
  model: string | null;
  status: 'active' | 'idle' | 'done';
  zone: string;
  zoneId: ZoneId;
  cost: number;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheCreationTokens: number;
  toolUseCount: number;
  duration: number;
  spawnedAt: number;
  endedAt: number | null;
}

export interface TimelineExportEntry {
  timestamp: number;
  elapsed: number;
  agentId: string;
  agentName: string;
  kind: string;
  zone?: string;
  tool?: string;
  toolArgs?: string;
  inputTokens?: number;
  outputTokens?: number;
}

export interface DiffExportEntry {
  filePath: string;
  oldText: string;
  newText: string;
  timestamp: number;
  agentId: string;
}

export interface AnomalyExportEntry {
  kind: string;
  description: string;
  agentId: string;
  timestamp: number;
}

export interface SessionExportData {
  meta: {
    exportedAt: string;
    source: 'live' | 'recorded';
    version: string;
  };
  overview: {
    projectName: string;
    projectPath: string;
    source: string;
    model: string | null;
    duration: number;
    startedAt: number;
    endedAt: number | null;
    label: string | null;
    tags: string[];
  };
  totals: {
    cost: number;
    inputTokens: number;
    outputTokens: number;
    cacheReadTokens: number;
    cacheCreationTokens: number;
    toolUses: number;
    agentCount: number;
    activeCount: number;
    idleCount: number;
    doneCount: number;
  };
  agents: AgentExportData[];
  timeline: TimelineExportEntry[];
  toolChain: ToolChainData | null;
  taskGraph: TaskGraphData | null;
  diffs: DiffExportEntry[];
  anomalies: AnomalyExportEntry[];
  zoneDistribution: Record<string, number>;
}

/* ── Assemblers ── */

/**
 * Assemble export data from a live session.
 * Requires the StateStore and the root session ID.
 */
export function assembleFromLive(
  store: StateStore,
  rootSessionId: string,
  customizationLookup?: (agent: AgentState) => { displayName: string; colorIndex: number },
  options?: {
    shutdownTotals?: { cost: number; input: number; output: number; tools: number };
    activityEntries?: Map<string, ActivityEntry[]>;
    toolChain?: ToolChainData | null;
    taskGraph?: TaskGraphData | null;
  },
): SessionExportData {
  const now = Date.now();
  const agents: AgentState[] = [];
  for (const ag of store.getAgents().values()) {
    if (ag.rootSessionId === rootSessionId) agents.push(ag);
  }

  const earliest = agents.length > 0 ? Math.min(...agents.map(a => a.spawnedAt)) : now;
  const shutdownTotals = options?.shutdownTotals ?? { cost: 0, input: 0, output: 0, tools: 0 };

  // Aggregate totals
  let totalCost = shutdownTotals.cost;
  let totalInput = shutdownTotals.input;
  let totalOutput = shutdownTotals.output;
  let totalToolUses = shutdownTotals.tools;
  let totalCacheRead = 0;
  let totalCacheCreation = 0;
  const models = new Set<string>();

  const agentExports: AgentExportData[] = [];
  for (const ag of agents) {
    const cost = computeAgentCost(ag);
    totalCost += cost;
    totalInput += ag.totalInputTokens ?? 0;
    totalOutput += ag.totalOutputTokens ?? 0;
    totalCacheRead += ag.cacheReadTokens ?? 0;
    totalCacheCreation += ag.cacheCreationTokens ?? 0;
    totalToolUses += ag.toolUseCount ?? 0;
    if (ag.model) models.add(ag.model);

    const zone = ZONE_MAP.get(ag.currentZone);
    agentExports.push({
      id: ag.id,
      name: customizationLookup?.(ag)?.displayName || ag.agentName || getFunnyName(ag.id),
      role: ag.role,
      model: ag.model,
      status: ag.isDone ? 'done' : ag.isIdle ? 'idle' : 'active',
      zone: zone?.label ?? ag.currentZone,
      zoneId: ag.currentZone,
      cost,
      inputTokens: ag.totalInputTokens,
      outputTokens: ag.totalOutputTokens,
      cacheReadTokens: ag.cacheReadTokens,
      cacheCreationTokens: ag.cacheCreationTokens,
      toolUseCount: ag.toolUseCount,
      duration: now - ag.spawnedAt,
      spawnedAt: ag.spawnedAt,
      endedAt: ag.isDone ? ag.lastActivityAt : null,
    });
  }
  agentExports.sort((a, b) => b.cost - a.cost);

  // Zone distribution
  const zoneDistribution: Record<string, number> = {};
  for (const ag of agents) {
    const label = ZONE_MAP.get(ag.currentZone)?.label ?? ag.currentZone;
    zoneDistribution[label] = (zoneDistribution[label] ?? 0) + 1;
  }

  // Timeline from activity entries
  const timelineExport: TimelineExportEntry[] = [];
  const activityEntries = options?.activityEntries;
  if (activityEntries) {
    for (const [agentId, entries] of activityEntries) {
      const agent = store.getAgent(agentId);
      const agentName = agent
        ? (customizationLookup?.(agent)?.displayName || agent.agentName || getFunnyName(agent.id))
        : getFunnyName(agentId);

      for (const e of entries) {
        const zone = e.zone ? (ZONE_MAP.get(e.zone)?.label ?? e.zone) : undefined;
        timelineExport.push({
          timestamp: e.timestamp,
          elapsed: e.timestamp - earliest,
          agentId,
          agentName,
          kind: e.kind,
          zone,
          tool: e.tool,
          toolArgs: e.toolArgs,
          inputTokens: e.inputTokens,
          outputTokens: e.outputTokens,
        });
      }
    }
    timelineExport.sort((a, b) => a.timestamp - b.timestamp);
  }

  // Diffs from agent recentDiffs
  const diffs: DiffExportEntry[] = [];
  for (const ag of agents) {
    for (const d of ag.recentDiffs ?? []) {
      diffs.push({
        filePath: d.filePath,
        oldText: d.oldText,
        newText: d.newText,
        timestamp: d.timestamp,
        agentId: ag.id,
      });
    }
  }
  diffs.sort((a, b) => a.timestamp - b.timestamp);

  // Determine project info from first agent
  const firstAgent = agents[0];

  return {
    meta: {
      exportedAt: new Date().toISOString(),
      source: 'live',
      version: '1.0.0',
    },
    overview: {
      projectName: firstAgent?.projectName ?? 'Unknown',
      projectPath: firstAgent?.projectPath ?? '',
      source: firstAgent?.agentType ?? 'unknown',
      model: models.size > 0 ? [...models].join(', ') : null,
      duration: now - earliest,
      startedAt: earliest,
      endedAt: null,
      label: null,
      tags: [],
    },
    totals: {
      cost: totalCost,
      inputTokens: totalInput,
      outputTokens: totalOutput,
      cacheReadTokens: totalCacheRead,
      cacheCreationTokens: totalCacheCreation,
      toolUses: totalToolUses,
      agentCount: agents.length,
      activeCount: agents.filter(a => !a.isIdle && !a.isDone).length,
      idleCount: agents.filter(a => a.isIdle && !a.isDone).length,
      doneCount: agents.filter(a => a.isDone).length,
    },
    agents: agentExports,
    timeline: timelineExport,
    toolChain: options?.toolChain ?? null,
    taskGraph: options?.taskGraph ?? null,
    diffs,
    anomalies: [],
    zoneDistribution,
  };
}

/**
 * Assemble export data from a recorded session.
 */
export function assembleFromRecorded(
  session: RecordedSession,
  timeline: RecordedTimelineEvent[],
): SessionExportData {
  // Build agent name lookup
  const agentNameMap = new Map<string, string>();
  for (const ag of session.agents) {
    agentNameMap.set(ag.agentId, ag.agentName || getFunnyName(ag.agentId));
  }

  const agentExports: AgentExportData[] = session.agents.map(ag => {
    return {
      id: ag.agentId,
      name: ag.agentName || getFunnyName(ag.agentId),
      role: ag.role,
      model: ag.model,
      status: 'done' as const,
      zone: '',
      zoneId: 'thinking' as ZoneId,
      cost: ag.cost,
      inputTokens: ag.totalInputTokens,
      outputTokens: ag.totalOutputTokens,
      cacheReadTokens: ag.cacheReadTokens,
      cacheCreationTokens: ag.cacheCreationTokens,
      toolUseCount: ag.toolUseCount,
      duration: ag.endedAt - ag.spawnedAt,
      spawnedAt: ag.spawnedAt,
      endedAt: ag.endedAt,
    };
  });
  agentExports.sort((a, b) => b.cost - a.cost);

  // Zone distribution from timeline
  const zoneDistribution: Record<string, number> = {};
  for (const e of timeline) {
    if (e.kind === 'zone-change' && e.zone) {
      const label = ZONE_MAP.get(e.zone)?.label ?? e.zone;
      zoneDistribution[label] = (zoneDistribution[label] ?? 0) + 1;
    }
  }

  // Timeline export
  const timelineExport: TimelineExportEntry[] = timeline.map(e => {
    const zone = e.zone ? (ZONE_MAP.get(e.zone)?.label ?? e.zone) : undefined;
    return {
      timestamp: e.timestamp,
      elapsed: e.timestamp - session.startedAt,
      agentId: e.agentId,
      agentName: agentNameMap.get(e.agentId) ?? getFunnyName(e.agentId),
      kind: e.kind,
      zone,
      tool: e.tool,
      toolArgs: e.toolArgs,
      inputTokens: e.inputTokens,
      outputTokens: e.outputTokens,
    };
  });

  return {
    meta: {
      exportedAt: new Date().toISOString(),
      source: 'recorded',
      version: '1.0.0',
    },
    overview: {
      projectName: session.projectName,
      projectPath: session.projectPath,
      source: session.source,
      model: session.model,
      duration: session.durationMs,
      startedAt: session.startedAt,
      endedAt: session.endedAt,
      label: session.label,
      tags: session.tags,
    },
    totals: {
      cost: session.totalCost,
      inputTokens: session.totalInputTokens,
      outputTokens: session.totalOutputTokens,
      cacheReadTokens: session.totalCacheReadTokens,
      cacheCreationTokens: session.totalCacheCreationTokens,
      toolUses: session.totalToolUses,
      agentCount: session.agentCount,
      activeCount: 0,
      idleCount: 0,
      doneCount: session.agentCount,
    },
    agents: agentExports,
    timeline: timelineExport,
    toolChain: session.toolChain ?? null,
    taskGraph: null,
    diffs: [],
    anomalies: [],
    zoneDistribution,
  };
}
