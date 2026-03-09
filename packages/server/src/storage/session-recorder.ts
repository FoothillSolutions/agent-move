import { randomUUID } from 'crypto';
import type {
  AgentEvent,
  AgentState,
  ActivityEntry,
  RecordedSession,
  RecordedAgent,
  RecordedTimelineEvent,
  ToolChainData,
} from '@agent-move/shared';
import { computeAgentCost } from '@agent-move/shared';
import type { AgentStateManager } from '../state/agent-state-manager.js';
import { SessionStore } from './session-store.js';

/** Timeout before finalizing a session after last agent shuts down (ms) */
const FINALIZE_DELAY_MS = 3_000;

/** How often to flush agent state snapshots to the live_sessions table (ms) */
const AGENT_FLUSH_INTERVAL_MS = 30_000;

/** In-flight data for a session being recorded */
interface StagingSession {
  rootSessionId: string;
  sessionId: string; // pre-generated UUID for this recording
  projectName: string;
  projectPath: string;
  source: 'claude' | 'opencode';
  startedAt: number;
  agents: Map<string, StagingAgent>;
  toolChain: ToolChainData | null;
  finalizeTimer: ReturnType<typeof setTimeout> | null;
}

interface StagingAgent {
  state: AgentState;
  history: ActivityEntry[];
  endedAt: number;
}

/**
 * Listens to AgentStateManager events and records sessions to SQLite.
 *
 * **Crash-safe design:**
 * - Timeline events are written incrementally to `live_timeline_events` as they happen
 * - Agent state snapshots are flushed to `live_sessions` periodically
 * - On clean shutdown/finalize, data moves to the permanent `sessions` table
 * - On startup, orphaned live sessions are recovered and finalized
 */
export class SessionRecorder {
  private store: SessionStore;
  private staging = new Map<string, StagingSession>();
  private stateManager: AgentStateManager;
  private flushTimer: ReturnType<typeof setInterval>;

  constructor(stateManager: AgentStateManager) {
    this.stateManager = stateManager;
    this.store = new SessionStore();

    // Recover any orphaned live sessions from a previous crash
    this.recoverOrphans();

    // Listen to all agent lifecycle events
    stateManager.on('agent:spawn', (event: AgentEvent) => this.onSpawn(event));
    stateManager.on('agent:update', (event: AgentEvent) => this.onUpdate(event));
    stateManager.on('agent:idle', (event: AgentEvent) => this.onIdle(event));
    stateManager.on('agent:shutdown', (event: AgentEvent) => this.onShutdown(event));

    // Periodically flush agent state to DB
    this.flushTimer = setInterval(() => this.flushAllAgentStates(), AGENT_FLUSH_INTERVAL_MS);
  }

  getStore(): SessionStore {
    return this.store;
  }

  /** Record the currently active session (manual trigger) */
  recordCurrentSession(rootSessionId: string): string | null {
    const staging = this.staging.get(rootSessionId);
    if (!staging) return null;

    // Snapshot current live agents into staging
    for (const agent of this.stateManager.getAll()) {
      if (agent.rootSessionId === rootSessionId) {
        const history = this.stateManager.getHistory(agent.id);
        staging.agents.set(agent.id, {
          state: { ...agent },
          history: [...history],
          endedAt: Date.now(),
        });
      }
    }

    staging.toolChain = this.stateManager.getToolChainSnapshot();
    return this.finalize(rootSessionId);
  }

  /** Recover orphaned live sessions from DB (previous crash/restart) */
  private recoverOrphans(): void {
    const orphans = this.store.getOrphanedLiveSessions();
    for (const orphan of orphans) {
      console.log(`Recovering orphaned session: ${orphan.projectName} (root: ${orphan.rootSessionId.slice(0, 12)}...)`);

      // Build a RecordedSession from the orphan data
      let agents: RecordedAgent[] = [];
      try {
        agents = JSON.parse(orphan.agentsJson);
      } catch { /* empty */ }

      const timeline = this.store.getLiveTimeline(orphan.rootSessionId);
      const endedAt = orphan.lastActivityAt;

      // Compute aggregates from agent data
      let totalInputTokens = 0;
      let totalOutputTokens = 0;
      let totalCacheRead = 0;
      let totalCacheCreation = 0;
      let totalToolUses = 0;
      let primaryModel: string | null = null;

      for (const ag of agents) {
        totalInputTokens += ag.totalInputTokens;
        totalOutputTokens += ag.totalOutputTokens;
        totalCacheRead += ag.cacheReadTokens;
        totalCacheCreation += ag.cacheCreationTokens;
        totalToolUses += ag.toolUseCount;
        if (!primaryModel && ag.model) primaryModel = ag.model;
      }

      // Skip sessions with no agent data — nothing useful to record
      if (agents.length === 0) {
        this.store.removeLiveSession(orphan.rootSessionId);
        console.log(`Skipped empty orphaned session: ${orphan.rootSessionId.slice(0, 12)}...`);
        continue;
      }

      // If no agent snapshots were saved, count tool events from timeline
      totalToolUses = agents.length > 0
        ? agents.reduce((n, ag) => n + ag.toolUseCount, 0)
        : timeline.filter(e => e.kind === 'tool').length;

      const sessionId = randomUUID();
      // Sum per-agent costs (each agent uses its own model's pricing)
      const totalCost = agents.reduce((sum, ag) => sum + ag.cost, 0);

      const recorded: RecordedSession = {
        id: sessionId,
        source: orphan.source,
        rootSessionId: orphan.rootSessionId,
        projectName: orphan.projectName,
        projectPath: orphan.projectPath,
        startedAt: orphan.startedAt,
        endedAt,
        durationMs: endedAt - orphan.startedAt,
        totalCost,
        totalInputTokens,
        totalOutputTokens,
        totalCacheReadTokens: totalCacheRead,
        totalCacheCreationTokens: totalCacheCreation,
        totalToolUses,
        agentCount: agents.length,
        model: primaryModel,
        agents,
        toolChain: { transitions: [], tools: [], toolCounts: {}, toolSuccesses: {}, toolFailures: {}, toolAvgDuration: {} },
        label: '(recovered)',
        tags: [],
      };

      try {
        this.store.saveSession(recorded, timeline);
        console.log(`Recovered session: ${sessionId} (${orphan.projectName}, ${timeline.length} events)`);
      } catch (err) {
        console.error('Failed to recover session:', err);
      }

      this.store.removeLiveSession(orphan.rootSessionId);
    }
  }

  private getOrCreateStaging(agent: AgentState): StagingSession {
    const rootId = agent.rootSessionId;
    let session = this.staging.get(rootId);
    if (!session) {
      const sessionId = randomUUID();
      const source: 'claude' | 'opencode' = rootId.startsWith('oc:') ? 'opencode' : 'claude';
      session = {
        rootSessionId: rootId,
        sessionId,
        projectName: agent.projectName,
        projectPath: agent.projectPath,
        source,
        startedAt: agent.spawnedAt,
        agents: new Map(),
        toolChain: null,
        finalizeTimer: null,
      };
      this.staging.set(rootId, session);

      // Write to live_sessions DB immediately
      this.store.upsertLiveSession(rootId, {
        sessionId,
        source,
        projectName: agent.projectName,
        projectPath: agent.projectPath,
        startedAt: agent.spawnedAt,
      });
    }
    return session;
  }

  private onSpawn(event: AgentEvent): void {
    const agent = event.agent;
    const session = this.getOrCreateStaging(agent);

    // Cancel any pending finalize timer (new agent joined)
    if (session.finalizeTimer) {
      clearTimeout(session.finalizeTimer);
      session.finalizeTimer = null;
    }

    // Write to DB incrementally
    const timelineEvent: RecordedTimelineEvent = {
      timestamp: event.timestamp,
      agentId: agent.id,
      kind: 'spawn',
      zone: agent.currentZone,
    };
    this.store.appendLiveTimelineEvent(session.rootSessionId, timelineEvent);
  }

  private onUpdate(event: AgentEvent): void {
    const agent = event.agent;
    const session = this.staging.get(agent.rootSessionId);
    if (!session) return;

    // Only record tool use events (not every update)
    if (agent.currentTool) {
      const timelineEvent: RecordedTimelineEvent = {
        timestamp: event.timestamp,
        agentId: agent.id,
        kind: 'tool',
        zone: agent.currentZone,
        tool: agent.currentTool,
        toolArgs: agent.currentActivity ?? undefined,
      };
      this.store.appendLiveTimelineEvent(session.rootSessionId, timelineEvent);
    }
  }

  private onIdle(event: AgentEvent): void {
    const agent = event.agent;
    const session = this.staging.get(agent.rootSessionId);
    if (!session) return;

    this.store.appendLiveTimelineEvent(session.rootSessionId, {
      timestamp: event.timestamp,
      agentId: agent.id,
      kind: 'idle',
      zone: 'idle',
    });
  }

  private onShutdown(event: AgentEvent): void {
    const agent = event.agent;
    const rootId = agent.rootSessionId;
    const session = this.staging.get(rootId);
    if (!session) return;

    // Archive agent data before it's deleted from state manager
    const history = this.stateManager.getHistory(agent.id);
    session.agents.set(agent.id, {
      state: { ...agent },
      history: [...history],
      endedAt: event.timestamp,
    });

    // Capture tool chain snapshot
    session.toolChain = this.stateManager.getToolChainSnapshot();

    // Write shutdown event to DB
    this.store.appendLiveTimelineEvent(rootId, {
      timestamp: event.timestamp,
      agentId: agent.id,
      kind: 'shutdown',
    });

    // Flush agent state to DB
    this.flushAgentState(session);

    // Check if any agents remain active for this root session
    const activeAgents = this.stateManager.getAll()
      .filter(a => a.rootSessionId === rootId && a.id !== agent.id);

    if (activeAgents.length === 0) {
      // All agents done — schedule finalization
      if (session.finalizeTimer) clearTimeout(session.finalizeTimer);
      session.finalizeTimer = setTimeout(() => {
        this.finalize(rootId);
      }, FINALIZE_DELAY_MS);
    }
  }

  /** Flush agent state snapshots to DB for crash safety */
  private flushAgentState(session: StagingSession): void {
    const agents: RecordedAgent[] = [];
    for (const [, staging] of session.agents) {
      const s = staging.state;
      agents.push({
        agentId: s.id,
        agentName: s.agentName,
        role: s.role,
        model: s.model,
        spawnedAt: s.spawnedAt,
        endedAt: staging.endedAt,
        totalInputTokens: s.totalInputTokens,
        totalOutputTokens: s.totalOutputTokens,
        cacheReadTokens: s.cacheReadTokens,
        cacheCreationTokens: s.cacheCreationTokens,
        toolUseCount: s.toolUseCount,
        cost: computeAgentCost(s),
      });
    }

    // Also snapshot any still-live agents
    for (const agent of this.stateManager.getAll()) {
      if (agent.rootSessionId === session.rootSessionId && !session.agents.has(agent.id)) {
        agents.push({
          agentId: agent.id,
          agentName: agent.agentName,
          role: agent.role,
          model: agent.model,
          spawnedAt: agent.spawnedAt,
          endedAt: Date.now(),
          totalInputTokens: agent.totalInputTokens,
          totalOutputTokens: agent.totalOutputTokens,
          cacheReadTokens: agent.cacheReadTokens,
          cacheCreationTokens: agent.cacheCreationTokens,
          toolUseCount: agent.toolUseCount,
          cost: computeAgentCost(agent),
        });
      }
    }

    this.store.updateLiveAgents(session.rootSessionId, JSON.stringify(agents));
  }

  /** Periodically flush all active sessions' agent states */
  private flushAllAgentStates(): void {
    for (const session of this.staging.values()) {
      this.flushAgentState(session);
    }
  }

  /** Finalize and persist a staged session. Returns the session ID. */
  private finalize(rootSessionId: string): string | null {
    const session = this.staging.get(rootSessionId);
    if (!session) {
      this.staging.delete(rootSessionId);
      return null;
    }

    if (session.finalizeTimer) {
      clearTimeout(session.finalizeTimer);
      session.finalizeTimer = null;
    }

    const sessionId = session.sessionId;
    const now = Date.now();

    // Build agent summaries
    const agents: RecordedAgent[] = [];
    let totalInputTokens = 0;
    let totalOutputTokens = 0;
    let totalCacheRead = 0;
    let totalCacheCreation = 0;
    let totalToolUses = 0;
    let primaryModel: string | null = null;
    let earliestSpawn = Infinity;
    let latestEnd = 0;

    for (const [, staging] of session.agents) {
      const s = staging.state;
      const cost = computeAgentCost(s);

      agents.push({
        agentId: s.id,
        agentName: s.agentName,
        role: s.role,
        model: s.model,
        spawnedAt: s.spawnedAt,
        endedAt: staging.endedAt,
        totalInputTokens: s.totalInputTokens,
        totalOutputTokens: s.totalOutputTokens,
        cacheReadTokens: s.cacheReadTokens,
        cacheCreationTokens: s.cacheCreationTokens,
        toolUseCount: s.toolUseCount,
        cost,
      });

      totalInputTokens += s.totalInputTokens;
      totalOutputTokens += s.totalOutputTokens;
      totalCacheRead += s.cacheReadTokens;
      totalCacheCreation += s.cacheCreationTokens;
      totalToolUses += s.toolUseCount;
      if (s.spawnedAt < earliestSpawn) earliestSpawn = s.spawnedAt;
      if (staging.endedAt > latestEnd) latestEnd = staging.endedAt;
      if (s.role === 'main' && s.model) primaryModel = s.model;
      if (!primaryModel && s.model) primaryModel = s.model;
    }

    // If no agents were archived (edge case), nothing to save
    if (agents.length === 0) {
      this.store.removeLiveSession(rootSessionId);
      this.staging.delete(rootSessionId);
      return null;
    }

    const endedAt = latestEnd || now;
    const startedAt = earliestSpawn === Infinity ? session.startedAt : earliestSpawn;

    const recorded: RecordedSession = {
      id: sessionId,
      source: session.source,
      rootSessionId: session.rootSessionId,
      projectName: session.projectName,
      projectPath: session.projectPath,
      startedAt,
      endedAt,
      durationMs: endedAt - startedAt,
      // Sum per-agent costs (each agent already computed with its own model's pricing)
      totalCost: agents.reduce((sum, ag) => sum + ag.cost, 0),
      totalInputTokens,
      totalOutputTokens,
      totalCacheReadTokens: totalCacheRead,
      totalCacheCreationTokens: totalCacheCreation,
      totalToolUses,
      agentCount: agents.length,
      model: primaryModel,
      agents,
      toolChain: session.toolChain ?? {
        transitions: [],
        tools: [],
        toolCounts: {},
        toolSuccesses: {},
        toolFailures: {},
        toolAvgDuration: {},
      },
      label: null,
      tags: [],
    };

    // Get timeline from DB (already written incrementally) + merge with agent histories
    const liveTimeline = this.store.getLiveTimeline(rootSessionId);
    const historyTimeline = this.buildTimelineFromHistory(session);

    // Merge: use history timeline (richer) if available, fall back to live events
    const timeline = historyTimeline.length > 0 ? historyTimeline : liveTimeline;

    try {
      this.store.saveSession(recorded, timeline);
      this.store.removeLiveSession(rootSessionId);
      console.log(`Session recorded: ${sessionId} (${session.projectName}, ${agents.length} agents, ${totalToolUses} tools, $${recorded.totalCost.toFixed(4)})`);
    } catch (err) {
      console.error('Failed to save session:', err);
    }

    this.staging.delete(rootSessionId);
    return sessionId;
  }

  /** Build a merged timeline from all agents' activity histories */
  private buildTimelineFromHistory(session: StagingSession): RecordedTimelineEvent[] {
    const events: RecordedTimelineEvent[] = [];

    for (const [agentId, staging] of session.agents) {
      for (const entry of staging.history) {
        events.push({
          timestamp: entry.timestamp,
          agentId,
          kind: entry.kind,
          ...(entry.zone && { zone: entry.zone }),
          ...(entry.tool && { tool: entry.tool }),
          ...(entry.toolArgs && { toolArgs: entry.toolArgs }),
          ...(entry.text && { text: entry.text }),
          ...(entry.inputTokens != null && { inputTokens: entry.inputTokens }),
          ...(entry.outputTokens != null && { outputTokens: entry.outputTokens }),
        });
      }
    }

    events.sort((a, b) => a.timestamp - b.timestamp);
    return events;
  }

  dispose(): void {
    clearInterval(this.flushTimer);

    // Flush all in-progress sessions before shutting down
    for (const session of this.staging.values()) {
      if (session.finalizeTimer) clearTimeout(session.finalizeTimer);
      this.flushAgentState(session);
    }

    this.staging.clear();
    this.store.close();
  }
}
