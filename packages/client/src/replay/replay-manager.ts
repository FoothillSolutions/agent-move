import type { TimelineEvent, ReplayTimelineEvent, AgentState, ZoneId } from '@agent-move/shared';
import type { StateStore } from '../connection/state-store.js';
import type { WsClient } from '../connection/ws-client.js';
import type { Timeline } from '../ui/timeline.js';
import { fetchReplayEvents } from '../connection/session-api.js';

/**
 * Orchestrates the enter/exit replay flow:
 * - Fetches replay events from the server
 * - Pauses the WebSocket connection
 * - Injects events into StateStore replay mode
 * - Coordinates with Timeline for replay UI
 */
export class ReplayManager {
  private _isReplaying = false;

  constructor(
    private store: StateStore,
    private wsClient: WsClient,
    private timeline: Timeline,
  ) {}

  get isReplaying(): boolean {
    return this._isReplaying;
  }

  /** Start replaying a recorded session */
  async startReplay(sessionId: string): Promise<void> {
    if (this._isReplaying) {
      this.exitReplay();
    }

    // 1. Fetch replay events from server
    const { events, session, hasReplayData } = await fetchReplayEvents(sessionId);

    if (!hasReplayData || events.length === 0) {
      throw new Error('This session has no replay data');
    }

    // 2. Convert ReplayTimelineEvent[] → TimelineEvent[]
    const timelineEvents = this.convertToTimelineEvents(events);

    if (timelineEvents.length === 0) {
      throw new Error('No replayable events found');
    }

    // 3. Pause WebSocket
    this.wsClient.pause();

    // 4. Enter replay mode in StateStore
    this.store.enterReplayMode(timelineEvents);

    // 5. Tell Timeline to enter recording replay
    const label = session.label || session.projectName;
    this.timeline.enterRecordingReplay(label);

    this._isReplaying = true;
  }

  /** Exit replay and return to live mode */
  exitReplay(): void {
    if (!this._isReplaying) return;

    // 1. Tell Timeline to exit recording replay
    this.timeline.exitRecordingReplay();

    // 2. Exit replay mode in StateStore (restores saved state)
    this.store.exitReplayMode();

    // 3. Reconnect WebSocket
    this.wsClient.reconnect();

    this._isReplaying = false;
  }

  /** Convert ReplayTimelineEvent[] (server format) → TimelineEvent[] (client format) */
  private convertToTimelineEvents(events: ReplayTimelineEvent[]): TimelineEvent[] {
    const result: TimelineEvent[] = [];
    // Track last known state per agent for shutdown events
    const lastKnownState = new Map<string, AgentState>();

    for (const evt of events) {
      let type: TimelineEvent['type'];
      switch (evt.kind) {
        case 'spawn': type = 'agent:spawn'; break;
        case 'tool': type = 'agent:update'; break;
        case 'zone-change': type = 'agent:update'; break;
        case 'idle': type = 'agent:idle'; break;
        case 'shutdown': type = 'agent:shutdown'; break;
        case 'text': type = 'agent:update'; break;
        case 'tokens': type = 'agent:update'; break;
        default: continue;
      }

      // Use stored AgentState if available, otherwise build a minimal one
      let agent: AgentState;
      if (evt.agentState) {
        agent = {
          ...evt.agentState,
          // Ensure stripped fields have defaults
          recentFiles: evt.agentState.recentFiles ?? [],
          recentDiffs: evt.agentState.recentDiffs ?? [],
        };
        lastKnownState.set(evt.agentId, agent);
      } else if (lastKnownState.has(evt.agentId)) {
        // For shutdown or events without state, use last known
        agent = { ...lastKnownState.get(evt.agentId)! };
        if (evt.zone) agent.currentZone = evt.zone as ZoneId;
        if (evt.tool) agent.currentTool = evt.tool;
      } else {
        // Minimal fallback — shouldn't happen for well-formed recordings
        agent = this.buildMinimalAgent(evt);
      }

      result.push({ type, agent, timestamp: evt.timestamp });
    }

    return result;
  }

  /** Build a minimal AgentState from a ReplayTimelineEvent (fallback) */
  private buildMinimalAgent(evt: ReplayTimelineEvent): AgentState {
    return {
      id: evt.agentId,
      sessionId: evt.agentId,
      agentType: 'claude',
      rootSessionId: '',
      projectPath: '',
      projectName: '',
      agentName: null,
      role: 'main',
      parentId: null,
      teamName: null,
      currentZone: (evt.zone as ZoneId) ?? 'thinking',
      currentTool: evt.tool ?? null,
      currentActivity: evt.toolArgs ?? null,
      messageTarget: null,
      taskDescription: null,
      speechText: null,
      lastActivityAt: evt.timestamp,
      spawnedAt: evt.timestamp,
      isIdle: evt.kind === 'idle',
      isDone: false,
      isPlanning: false,
      isWaitingForUser: false,
      phase: evt.kind === 'idle' ? 'idle' : 'running',
      lastToolOutcome: null,
      totalInputTokens: 0,
      totalOutputTokens: 0,
      cacheReadTokens: 0,
      cacheCreationTokens: 0,
      contextTokens: 0,
      contextCacheTokens: 0,
      model: null,
      colorIndex: 0,
      toolUseCount: 0,
      gitBranch: null,
      recentFiles: [],
      recentDiffs: [],
    };
  }
}
