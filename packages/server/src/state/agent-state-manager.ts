import { EventEmitter } from 'events';
import type { AgentState, AgentEvent, AgentPhase, ZoneId, ActivityEntry, TimelineEvent, AnomalyEvent, ToolChainData, TaskGraphData } from '@agent-move/shared';
import { getZoneForTool, getProjectColorIndex } from '@agent-move/shared';
import { config } from '../config.js';
import type { ParsedActivity } from '../watcher/jsonl-parser.js';
import type { SessionInfo } from '../watcher/claude-paths.js';
import { getGitBranch } from '../watcher/git-info.js';
import { AnomalyDetector } from './anomaly-detector.js';
import { ToolChainTracker } from './tool-chain-tracker.js';
import { TaskGraphManager } from './task-graph-manager.js';

const MAX_HISTORY_PER_AGENT = 500;
const MAX_HISTORY_AGE_MS = 30 * 60 * 1000; // 30 minutes
const MAX_TIMELINE_EVENTS = 5000;
/** How long to wait for identity before promoting a hidden agent (ms) */
const IDENTITY_TIMEOUT_MS = 15_000;

export class AgentStateManager extends EventEmitter {
  private agents = new Map<string, AgentState>();
  private idleTimers = new Map<string, ReturnType<typeof setTimeout>>();
  private shutdownTimers = new Map<string, ReturnType<typeof setTimeout>>();
  /** Agents with a pending tool call (waiting for result) */
  private pendingTool = new Set<string>();
  private colorCounter = 0;
  private activityHistory = new Map<string, ActivityEntry[]>();
  private timelineBuffer: TimelineEvent[] = [];
  /** Queue of task descriptions from Agent tool calls, keyed by parent agent ID */
  private pendingSubagentTasks = new Map<string, string[]>();
  /** Queue of agent names from Agent tool calls, keyed by parent agent ID */
  private pendingSubagentNames = new Map<string, string[]>();
  /** Queue of team names from Agent tool calls, keyed by parent agent ID */
  private pendingSubagentTeams = new Map<string, string[]>();
  /** Maps sessionId → canonical agent ID (for merging multiple sessions into one agent) */
  private sessionToAgent = new Map<string, string>();
  /** Maps rootSessionId:agentName → canonical agent ID (scoped per terminal session) */
  private namedAgentMap = new Map<string, string>();
  /** Agents that are hidden pending identity confirmation — no events emitted */
  private hiddenAgents = new Set<string>();
  /** Timers to promote hidden agents after timeout */
  private identityTimers = new Map<string, ReturnType<typeof setTimeout>>();
  /** Queued recipient names from SendMessage calls: rootSessionId → [{sender, recipient}] */
  private pendingRecipients = new Map<string, Array<{ sender: string; recipient: string }>>();

  /** Anomaly detection for token spikes, retry loops, stuck agents */
  public readonly anomalyDetector = new AnomalyDetector();
  /** Tool chain transition tracking */
  public readonly toolChainTracker = new ToolChainTracker();
  /** Task dependency graph tracking */
  public readonly taskGraphManager = new TaskGraphManager();

  constructor() {
    super();
    // Start stuck-agent detection (checks every 30s)
    this.anomalyDetector.startStuckDetection(() =>
      Array.from(this.agents.values())
        .filter(a => !this.hiddenAgents.has(a.id))
        .map(a => ({ id: a.id, lastActivityAt: a.lastActivityAt, isIdle: a.isIdle }))
    );
  }

  getAll(): AgentState[] {
    // Exclude hidden agents from public state
    return Array.from(this.agents.values()).filter(a => !this.hiddenAgents.has(a.id));
  }

  get(id: string): AgentState | undefined {
    return this.agents.get(id);
  }

  /** Flush pending name/task/team queues — call after initial replay to prevent stale matches */
  flushPendingQueues(): void {
    const nameCount = Array.from(this.pendingSubagentNames.values()).reduce((n, q) => n + q.length, 0);
    const taskCount = Array.from(this.pendingSubagentTasks.values()).reduce((n, q) => n + q.length, 0);
    const teamCount = Array.from(this.pendingSubagentTeams.values()).reduce((n, q) => n + q.length, 0);
    const recipientCount = Array.from(this.pendingRecipients.values()).reduce((n, q) => n + q.length, 0);
    this.pendingSubagentNames.clear();
    this.pendingSubagentTasks.clear();
    this.pendingSubagentTeams.clear();
    this.pendingRecipients.clear();
    if (nameCount + taskCount + teamCount + recipientCount > 0) {
      console.log(`Flushed ${nameCount} pending names, ${taskCount} pending tasks, ${teamCount} pending teams, ${recipientCount} pending recipients from replay`);
    }
  }

  getHistory(agentId: string): ActivityEntry[] {
    return this.activityHistory.get(agentId) ?? [];
  }

  getTimeline(): TimelineEvent[] {
    return this.timelineBuffer;
  }

  getToolChainSnapshot(): ToolChainData {
    return this.toolChainTracker.getSnapshot();
  }

  getTaskGraphSnapshot(): TaskGraphData {
    return this.taskGraphManager.getSnapshot();
  }

  /** Check if any named agents exist for a given root session */
  private hasNamedAgentsForRoot(rootSessionId: string): boolean {
    for (const key of this.namedAgentMap.keys()) {
      if (key.startsWith(rootSessionId + ':')) return true;
    }
    return false;
  }

  private recordTimeline(event: AgentEvent): void {
    this.timelineBuffer.push({
      type: event.type,
      agent: { ...event.agent },
      timestamp: event.timestamp,
    });

    const cutoff = Date.now() - MAX_HISTORY_AGE_MS;
    const firstValid = this.timelineBuffer.findIndex(e => e.timestamp >= cutoff);
    if (firstValid > 0) {
      this.timelineBuffer.splice(0, firstValid);
    } else if (firstValid === -1 && this.timelineBuffer.length > 0) {
      this.timelineBuffer.length = 0;
    }
    if (this.timelineBuffer.length > MAX_TIMELINE_EVENTS) {
      this.timelineBuffer.splice(0, this.timelineBuffer.length - MAX_TIMELINE_EVENTS);
    }
  }

  private addHistory(agentId: string, entry: ActivityEntry): void {
    let entries = this.activityHistory.get(agentId);
    if (!entries) {
      entries = [];
      this.activityHistory.set(agentId, entries);
    }
    entries.push(entry);

    const cutoff = Date.now() - MAX_HISTORY_AGE_MS;
    const firstValid = entries.findIndex(e => e.timestamp >= cutoff);
    if (firstValid > 0) {
      entries.splice(0, firstValid);
    } else if (firstValid === -1 && entries.length > 0) {
      entries.length = 0;
    }
    if (entries.length > MAX_HISTORY_PER_AGENT) {
      entries.splice(0, entries.length - MAX_HISTORY_PER_AGENT);
    }
  }

  /** Tools that can block for a long time waiting for results (e.g. shell commands, browser actions). */
  private static readonly LONG_RUNNING_TOOLS = new Set([
    'Bash',
    'Agent',
    'WebFetch',
    'WebSearch',
    // Tools that block waiting for user input
    'AskUserQuestion',
    // Browser/playwright tools that wait for navigation or network
    'mcp__playwright__browser_navigate',
    'mcp__playwright__browser_wait_for',
    'mcp__playwright__browser_run_code',
    'mcp__chrome-devtools__navigate_page',
    'mcp__chrome-devtools__wait_for',
    'mcp__chrome-devtools__evaluate_script',
    'mcp__chrome-devtools__performance_start_trace',
    'mcp__chrome-devtools__performance_stop_trace',
  ]);

  /** Tools that block specifically waiting for user input/confirmation */
  private static readonly USER_BLOCKING_TOOLS = new Set([
    'AskUserQuestion',
  ]);

  private isLongRunningTool(toolName: string): boolean {
    return AgentStateManager.LONG_RUNNING_TOOLS.has(toolName);
  }

  private summarizeToolInput(input: unknown): string {
    if (!input) return '';
    try {
      const obj = input as Record<string, unknown>;
      const summary = obj.command ?? obj.file_path ?? obj.pattern ?? obj.query ?? obj.url ?? obj.content;
      if (typeof summary === 'string') {
        return summary.length > 120 ? summary.slice(0, 117) + '...' : summary;
      }
      const json = JSON.stringify(input);
      return json.length > 120 ? json.slice(0, 117) + '...' : json;
    } catch {
      return '';
    }
  }

  /**
   * Resolve a sessionId to its canonical agent ID.
   */
  private resolveAgentId(sessionId: string): string {
    return this.sessionToAgent.get(sessionId) ?? sessionId;
  }

  /**
   * Compute the rootSessionId for a new agent.
   * - Main agents are their own root.
   * - Subagents inherit from their parent (or fallback to parentId/own sessionId).
   */
  private computeRootSessionId(sessionId: string, parentId: string | null, sessionInfo: SessionInfo): string {
    if (!sessionInfo.isSubagent) return sessionId;
    if (parentId) {
      const parent = this.agents.get(parentId);
      return parent?.rootSessionId ?? parentId;
    }
    return sessionId; // orphan
  }

  /** Transfer token counts from source agent to target and remove the source. */
  private transferAndRemove(sourceId: string, target: AgentState, redirectSessionId: string): void {
    const source = this.agents.get(sourceId);
    if (source) {
      target.totalInputTokens += source.totalInputTokens;
      target.totalOutputTokens += source.totalOutputTokens;
      target.cacheReadTokens += source.cacheReadTokens;
      target.cacheCreationTokens += source.cacheCreationTokens;
    }
    this.agents.delete(sourceId);
    this.hiddenAgents.delete(sourceId);
    this.clearTimers(sourceId);
    this.sessionToAgent.set(redirectSessionId, target.id);
    target.isIdle = false;
    target.isDone = false;
    target.lastActivityAt = Date.now();
  }

  /**
   * Merge a hidden agent into an existing named agent.
   * Returns the existing agent if merged, or null.
   */
  private mergeIntoNamed(hiddenId: string, agentName: string): AgentState | null {
    const hidden = this.agents.get(hiddenId);
    if (!hidden) return null;

    const key = `${hidden.rootSessionId}:${agentName}`;
    const existingId = this.namedAgentMap.get(key);

    if (!existingId || existingId === hiddenId) return null;

    const existing = this.agents.get(existingId);
    if (!existing) return null;

    this.transferAndRemove(hiddenId, existing, hiddenId);

    console.log(`Merged session ${hiddenId.slice(0, 12)}… into agent "${agentName}" (${existingId.slice(0, 12)}…)`);
    return existing;
  }

  /**
   * Promote a hidden agent to visible (emit spawn event).
   */
  private promoteAgent(agentId: string): void {
    this.hiddenAgents.delete(agentId);
    const idTimer = this.identityTimers.get(agentId);
    if (idTimer) clearTimeout(idTimer);
    this.identityTimers.delete(agentId);

    const agent = this.agents.get(agentId);
    if (!agent) return;

    console.log(`Promoting hidden agent ${agentId.slice(0, 12)}… (name: ${agent.agentName ?? 'unknown'})`);
    const now = Date.now();
    const spawnEvent = { type: 'agent:spawn', agent: { ...agent }, timestamp: now } satisfies AgentEvent;
    this.recordTimeline(spawnEvent);
    this.emit('agent:spawn', spawnEvent);

    // Also emit current state as an update
    const updateEvent = { type: 'agent:update', agent: { ...agent }, timestamp: now } satisfies AgentEvent;
    this.recordTimeline(updateEvent);
    this.emit('agent:update', updateEvent);
  }

  /**
   * Determine the role for a named subagent based on its parent.
   * Only direct children of a team-lead become team-members.
   * All others stay as subagents (even if they have a name).
   */
  private determineRoleForNamed(parentId: string | null, pendingTeam: string | null): AgentState['role'] {
    // Only explicit team assignment (Agent tool's team_name parameter) makes a team-member.
    // Sub-agents spawned by the team-lead without team_name stay as subagents.
    if (pendingTeam) return 'team-member';
    return 'subagent';
  }

  /**
   * Called when ANY new bytes appear in a session's JSONL file,
   * even if the parser doesn't extract a meaningful activity.
   * This keeps the agent alive during long-running tool executions
   * (e.g. Bash commands) where the tool result writes to the file
   * but doesn't produce a ParsedActivity.
   */
  heartbeat(sessionId: string): void {
    const canonicalId = this.resolveAgentId(sessionId);
    const agent = this.agents.get(canonicalId);
    if (!agent || this.hiddenAgents.has(canonicalId)) return;

    // Only reset the idle timer — don't change agent state or emit events.
    // This keeps pending-tool agents alive while their tool runs.
    if (this.pendingTool.has(canonicalId)) {
      agent.lastActivityAt = Date.now();
      this.resetIdleTimer(canonicalId);
    }
  }

  processMessage(sessionId: string, activity: ParsedActivity, sessionInfo: SessionInfo) {
    // Check if this session has already been merged into another agent
    const canonicalId = this.resolveAgentId(sessionId);
    if (canonicalId !== sessionId) {
      // This session was merged — route to the canonical agent
      const agent = this.agents.get(canonicalId);
      if (agent) {
        this.applyActivity(agent, activity, Date.now(), sessionInfo);
        return;
      }
    }

    let agent = this.agents.get(canonicalId);
    const now = Date.now();

    // --- Handle identity discovery for hidden agents ---
    if (agent && this.hiddenAgents.has(canonicalId)) {
      // Try to discover identity from multiple sources
      let discoveredName = activity.agentName ?? null;

      // If no direct identity, try matching messageSender against queued recipients
      if (!discoveredName && activity.messageSender) {
        discoveredName = this.popRecipientBySender(agent.rootSessionId, activity.messageSender);
      }

      if (discoveredName) {
        // Identity discovered! Try to merge into existing named agent
        const merged = this.mergeIntoNamed(canonicalId, discoveredName);
        if (merged) {
          this.applyActivity(merged, activity, now, sessionInfo);
          return;
        }
        // No existing agent with this name — register and promote
        agent.agentName = discoveredName;
        const role = this.determineRoleForNamed(agent.parentId, null);
        agent.role = role;
        agent.teamName = role === 'team-member'
          ? (agent.teamName || this.getParentTeamName(agent.rootSessionId))
          : null;
        this.namedAgentMap.set(`${agent.rootSessionId}:${discoveredName}`, canonicalId);
        this.promoteAgent(canonicalId);
        this.applyActivity(agent, activity, now, sessionInfo);
        return;
      }
      // Still hidden — accumulate state silently (no events emitted)
      this.applyActivitySilent(agent, activity, now, sessionInfo);
      return;
    }

    // --- Handle identity discovery for already-visible agents ---
    if (agent && activity.agentName && !agent.agentName) {
      const key = `${agent.rootSessionId}:${activity.agentName}`;
      const existingId = this.namedAgentMap.get(key);
      if (existingId && existingId !== canonicalId) {
        // There's already a different agent with this name — merge into it
        const existing = this.agents.get(existingId);
        if (existing) {
          this.transferAndRemove(canonicalId, existing, sessionId);

          // Shutdown the duplicate sprite on clients
          this.emit('agent:shutdown', {
            type: 'agent:shutdown',
            agent: { id: canonicalId } as AgentState,
            timestamp: now,
          } satisfies AgentEvent);

          console.log(`Late-merged agent ${canonicalId.slice(0, 12)}… into "${activity.agentName}" (${existingId.slice(0, 12)}…)`);
          this.applyActivity(existing, activity, now, sessionInfo);
          return;
        }
      }
      // No conflict — just register the name
      agent.agentName = activity.agentName;
      const role = this.determineRoleForNamed(agent.parentId, null);
      agent.role = role;
      agent.teamName = role === 'team-member'
        ? (agent.teamName || this.getParentTeamName(agent.rootSessionId))
        : agent.teamName;
      this.namedAgentMap.set(key, canonicalId);
      console.log(`Agent ${canonicalId.slice(0, 12)}… identified as "${activity.agentName}"`);
    }

    // --- Handle new session ---
    if (!agent) {
      // Use parentSessionId from path when available (precise), fallback to project-wide search
      const parentId = sessionInfo.isSubagent
        ? (sessionInfo.parentSessionId
            ? this.resolveAgentId(sessionInfo.parentSessionId)
            : this.findParentId(sessionInfo.projectDir))
        : null;

      // Compute rootSessionId (scopes all lookups to this terminal session)
      const rootSessionId = this.computeRootSessionId(sessionId, parentId, sessionInfo);

      const taskDescription = parentId ? this.popPendingTask(parentId) : null;
      const pendingTeam = parentId ? this.popPendingTeam(parentId) : null;

      // Try multiple sources for agent name: pending queue, routing sender, message recipient matching
      let agentName = (parentId ? this.popPendingName(parentId) : null) ?? activity.agentName ?? null;
      if (!agentName && activity.messageSender) {
        agentName = this.popRecipientBySender(rootSessionId, activity.messageSender);
      }

      // If we have a name and it matches an existing agent in the same session, merge immediately
      if (agentName) {
        const key = `${rootSessionId}:${agentName}`;
        const existingId = this.namedAgentMap.get(key);
        if (existingId) {
          const existing = this.agents.get(existingId);
          if (existing) {
            this.sessionToAgent.set(sessionId, existingId);
            existing.isIdle = false;
            existing.isDone = false;
            existing.lastActivityAt = now;
            console.log(`Immediate merge: session ${sessionId.slice(0, 12)}… → agent "${agentName}" (${existingId.slice(0, 12)}…)`);
            this.applyActivity(existing, activity, now, sessionInfo);
            return;
          }
        }
      }

      // Determine role based on parent and team context
      const role = agentName
        ? this.determineRoleForNamed(parentId, pendingTeam)
        : this.determineRole(activity, sessionInfo);
      const teamName = role === 'team-member'
        ? (pendingTeam || this.getParentTeamName(rootSessionId))
        : null;

      // Create the agent
      agent = {
        id: sessionId,
        sessionId,
        rootSessionId,
        projectPath: sessionInfo.projectPath,
        projectName: sessionInfo.projectName,
        agentName,
        role,
        parentId,
        teamName,
        currentZone: 'spawn',
        currentTool: null,
        currentActivity: null,
        messageTarget: null,
        taskDescription,
        speechText: null,
        lastActivityAt: now,
        spawnedAt: now,
        isIdle: false,
        isDone: false,
        isPlanning: false,
        isWaitingForUser: false,
        phase: 'running' as AgentPhase,
        lastToolOutcome: null,
        totalInputTokens: 0,
        totalOutputTokens: 0,
        cacheReadTokens: 0,
        cacheCreationTokens: 0,
        model: activity.model ?? null,
        colorIndex: this.colorCounter++ % 12,
        toolUseCount: 0,
        gitBranch: null,
        recentFiles: [],
        recentDiffs: [],
      };
      this.agents.set(sessionId, agent);
      this.sessionToAgent.set(sessionId, sessionId);

      // Decide whether to hide or show immediately
      const shouldHide = sessionInfo.isSubagent
        && !agentName
        && this.hasNamedAgentsForRoot(rootSessionId);

      if (shouldHide) {
        // Hide this agent — don't emit spawn until we know who it is
        this.hiddenAgents.add(sessionId);
        console.log(`Hiding new session ${sessionId.slice(0, 12)}… (pending identity)`);

        // Timeout: silently discard if identity not discovered in time
        const timer = setTimeout(() => {
          if (this.hiddenAgents.has(sessionId)) {
            console.log(`Identity timeout for ${sessionId.slice(0, 12)}… — discarding (unidentified)`);
            this.hiddenAgents.delete(sessionId);
            this.agents.delete(sessionId);
            this.clearTimers(sessionId);
          }
        }, IDENTITY_TIMEOUT_MS);
        this.identityTimers.set(sessionId, timer);

        // Accumulate state silently
        this.applyActivitySilent(agent, activity, now, sessionInfo);
        return;
      }

      // Register named agent (scoped to root session)
      if (agentName) {
        this.namedAgentMap.set(`${rootSessionId}:${agentName}`, sessionId);
      }

      // Visible spawn
      this.addHistory(sessionId, { timestamp: now, kind: 'spawn', zone: 'spawn' });
      const spawnEvent = { type: 'agent:spawn', agent: { ...agent }, timestamp: now } satisfies AgentEvent;
      this.recordTimeline(spawnEvent);
      this.emit('agent:spawn', spawnEvent);
    }

    this.applyActivity(agent, activity, now, sessionInfo);
  }

  /** Apply activity and emit update event (for visible agents) */
  private applyActivity(agent: AgentState, activity: ParsedActivity, now: number, sessionInfo: SessionInfo) {
    this.mutateAgentState(agent, activity, now, sessionInfo);

    // Reset idle timer
    this.resetIdleTimer(agent.id);

    const updateEvent = { type: 'agent:update', agent: { ...agent }, timestamp: now } satisfies AgentEvent;
    this.recordTimeline(updateEvent);
    this.emit('agent:update', updateEvent);
  }

  /** Apply activity silently — no events emitted (for hidden agents) */
  private applyActivitySilent(agent: AgentState, activity: ParsedActivity, now: number, sessionInfo: SessionInfo) {
    this.mutateAgentState(agent, activity, now, sessionInfo);
  }

  /** Mutate agent state based on activity (shared between silent and loud paths) */
  private mutateAgentState(agent: AgentState, activity: ParsedActivity, now: number, _sessionInfo: SessionInfo) {
    const agentId = agent.id;
    agent.lastActivityAt = now;
    agent.isIdle = false;
    agent.isDone = false;
    if (agent.phase === 'idle') agent.phase = 'running';

    if (activity.model) {
      agent.model = activity.model;
    }

    switch (activity.type) {
      case 'tool_use': {
        // Only mark as pending for tools that can genuinely run for a long time.
        // Instant tools (messaging, task management, reads, edits) complete quickly
        // and should NOT prevent idle detection.
        const toolName = activity.toolName ?? '';
        if (this.isLongRunningTool(toolName)) {
          this.pendingTool.add(agentId);
        } else {
          this.pendingTool.delete(agentId);
        }
        // Track user-blocking state
        agent.isWaitingForUser = AgentStateManager.USER_BLOCKING_TOOLS.has(toolName);

        const prevZone = agent.currentZone;
        agent.currentTool = activity.toolName ?? null;
        agent.currentActivity = this.summarizeToolInput(activity.toolInput) || null;
        agent.currentZone = getZoneForTool(activity.toolName ?? '');
        agent.toolUseCount++;

        // Anomaly & analytics tracking
        this.anomalyDetector.setAgentName(agentId, agent.agentName ?? agent.projectName ?? agentId.slice(0, 10));
        this.anomalyDetector.checkToolUse(agentId, toolName);
        this.toolChainTracker.recordToolUse(agentId, toolName);

        // Task graph tracking
        if (toolName === 'TaskCreate' || toolName === 'TaskUpdate') {
          const graphChanged = this.taskGraphManager.processToolUse(
            agentId,
            agent.agentName ?? agentId.slice(0, 10),
            toolName,
            activity.toolInput,
            agent.projectName,
            agent.rootSessionId,
          );
          if (graphChanged) {
            this.emit('taskgraph:changed', { data: this.taskGraphManager.getSnapshot(), timestamp: Date.now() });
          }
        }

        // Update git branch (getGitBranch has its own 30s cache)
        if (agent.projectPath) {
          agent.gitBranch = getGitBranch(agent.projectPath);
        }

        // Extract file paths from file-related tools
        if (activity.toolInput) {
          const input = activity.toolInput as Record<string, unknown>;
          const filePath = input.file_path as string | undefined;
          if (filePath) {
            agent.recentFiles = [filePath, ...agent.recentFiles.filter(f => f !== filePath)].slice(0, 10);
          }
        }

        if (activity.toolName === 'EnterPlanMode') {
          agent.isPlanning = true;
        } else if (activity.toolName === 'ExitPlanMode') {
          agent.isPlanning = false;
        }

        if (activity.toolName === 'TeamCreate' && activity.toolInput) {
          agent.teamName = (activity.toolInput as Record<string, unknown>).team_name as string ?? null;
          agent.role = 'team-lead';
          // Register as "team-lead" so message-handling sessions merge into this agent
          // instead of creating a duplicate "team-lead" member
          if (!agent.agentName) {
            agent.agentName = 'team-lead';
          }
          this.namedAgentMap.set(`${agent.rootSessionId}:team-lead`, agentId);
        }
        if (activity.toolName === 'SendMessage') {
          agent.currentZone = 'messaging';
          if (activity.toolInput) {
            const input = activity.toolInput as Record<string, unknown>;
            const recipient = input.recipient as string | undefined;
            // Set messageTarget for client-side flow visualization
            agent.messageTarget = recipient ?? null;
            // Queue recipient name so the incoming session can be identified
            // Scoped to rootSessionId so cross-session messages don't collide
            const senderIdentity = agent.agentName || (agent.role === 'team-lead' ? 'team-lead' : null);
            if (recipient && senderIdentity) {
              this.queueRecipient(agent.rootSessionId, senderIdentity, recipient);
            }
          }
        } else {
          agent.messageTarget = null;
        }

        // Queue name + description + team for incoming subagent
        if (activity.toolName === 'Agent' && activity.toolInput) {
          const input = activity.toolInput as Record<string, unknown>;
          const desc = (input.description ?? input.prompt ?? '') as string;
          if (desc) {
            this.queuePendingTask(agentId, desc.length > 80 ? desc.slice(0, 77) + '...' : desc);
          }
          const name = input.name as string | undefined;
          if (name) {
            this.queuePendingName(agentId, name);
          }
          // Capture team_name from Agent tool to identify team members
          const teamName = input.team_name as string | undefined;
          if (teamName) {
            this.queuePendingTeam(agentId, teamName);
          }
        }

        // Capture diff from Edit tool
        let diffData: { filePath: string; oldText: string; newText: string } | undefined;
        if (activity.toolName === 'Edit' && activity.toolInput) {
          const input = activity.toolInput as Record<string, unknown>;
          const fp = (input.file_path as string) ?? '';
          const oldStr = (input.old_string as string) ?? '';
          const newStr = (input.new_string as string) ?? '';
          if (fp && (oldStr || newStr)) {
            diffData = {
              filePath: fp,
              oldText: oldStr.length > 500 ? oldStr.slice(0, 500) + '...' : oldStr,
              newText: newStr.length > 500 ? newStr.slice(0, 500) + '...' : newStr,
            };
          }
        }

        // Accumulate recent diffs (newest first, max 10)
        if (diffData) {
          agent.recentDiffs.unshift({ ...diffData, timestamp: now });
          if (agent.recentDiffs.length > 10) agent.recentDiffs.pop();
        }

        this.addHistory(agentId, {
          timestamp: now,
          kind: 'tool',
          tool: activity.toolName ?? undefined,
          toolArgs: this.summarizeToolInput(activity.toolInput),
          zone: agent.currentZone,
          diff: diffData,
        });

        if (prevZone !== agent.currentZone) {
          this.addHistory(agentId, {
            timestamp: now,
            kind: 'zone-change',
            zone: agent.currentZone,
            prevZone,
          });
        }
        break;
      }

      case 'text':
        // Text from assistant = Claude has responded, tool is no longer pending
        this.pendingTool.delete(agentId);
        agent.isWaitingForUser = false;
        if (activity.text) {
          agent.speechText = activity.text;
          agent.currentActivity = activity.text;
          if (!agent.taskDescription) {
            agent.taskDescription = activity.text;
          }
          this.addHistory(agentId, {
            timestamp: now,
            kind: 'text',
            text: activity.text,
          });
        }
        break;

      case 'token_usage':
        // Token usage = message finished, tool is no longer pending
        this.pendingTool.delete(agentId);
        agent.isWaitingForUser = false;
        agent.totalInputTokens += activity.inputTokens ?? 0;
        agent.totalOutputTokens += activity.outputTokens ?? 0;
        agent.cacheReadTokens += activity.cacheReadTokens ?? 0;
        agent.cacheCreationTokens += activity.cacheCreationTokens ?? 0;
        this.anomalyDetector.checkTokenUsage(agentId, activity.inputTokens ?? 0, activity.outputTokens ?? 0);
        this.addHistory(agentId, {
          timestamp: now,
          kind: 'tokens',
          inputTokens: activity.inputTokens ?? 0,
          outputTokens: activity.outputTokens ?? 0,
        });
        break;
    }
  }

  /** Inherit teamName from parent agent in the same session hierarchy */
  private getParentTeamName(rootSessionId: string): string | null {
    for (const agent of this.agents.values()) {
      if (agent.rootSessionId === rootSessionId && agent.teamName) {
        return agent.teamName;
      }
    }
    return null;
  }

  private determineRole(_activity: ParsedActivity, sessionInfo: SessionInfo): AgentState['role'] {
    if (sessionInfo.isSubagent) return 'subagent';
    return 'main';
  }

  private findParentId(projectDir: string): string | null {
    // Priority 1: team-lead (the designated orchestrator for team scenarios)
    for (const [id, agent] of this.agents) {
      if (agent.projectPath === projectDir && agent.role === 'team-lead') {
        return id;
      }
    }
    // Priority 2: main session
    for (const [id, agent] of this.agents) {
      if (agent.projectPath === projectDir && agent.role === 'main') {
        return id;
      }
    }
    // Priority 3: any non-leaf agent (fallback)
    for (const [id, agent] of this.agents) {
      if (agent.projectPath === projectDir && agent.role !== 'subagent' && agent.role !== 'team-member') {
        return id;
      }
    }
    return null;
  }

  private enqueue(map: Map<string, string[]>, key: string, value: string): void {
    let queue = map.get(key);
    if (!queue) { queue = []; map.set(key, queue); }
    queue.push(value);
  }

  private dequeue(map: Map<string, string[]>, key: string): string | null {
    const queue = map.get(key);
    if (!queue || queue.length === 0) return null;
    return queue.shift()!;
  }

  private queuePendingTask(parentId: string, description: string): void {
    this.enqueue(this.pendingSubagentTasks, parentId, description);
  }

  private popPendingTask(parentId: string): string | null {
    return this.dequeue(this.pendingSubagentTasks, parentId);
  }

  private queuePendingName(parentId: string, name: string): void {
    this.enqueue(this.pendingSubagentNames, parentId, name);
  }

  private popPendingName(parentId: string): string | null {
    return this.dequeue(this.pendingSubagentNames, parentId);
  }

  private queuePendingTeam(parentId: string, teamName: string): void {
    this.enqueue(this.pendingSubagentTeams, parentId, teamName);
  }

  private popPendingTeam(parentId: string): string | null {
    return this.dequeue(this.pendingSubagentTeams, parentId);
  }

  private queueRecipient(rootSessionId: string, sender: string, recipient: string): void {
    let queue = this.pendingRecipients.get(rootSessionId);
    if (!queue) { queue = []; this.pendingRecipients.set(rootSessionId, queue); }
    queue.push({ sender, recipient });
    // Keep queue bounded
    if (queue.length > 50) queue.shift();
  }

  /** Pop a queued recipient name matching a specific sender */
  private popRecipientBySender(rootSessionId: string, sender: string): string | null {
    const queue = this.pendingRecipients.get(rootSessionId);
    if (!queue) return null;
    const idx = queue.findIndex(e => e.sender === sender);
    if (idx === -1) return null;
    const entry = queue.splice(idx, 1)[0];
    return entry.recipient;
  }

  private clearTimers(agentId: string): void {
    const idle = this.idleTimers.get(agentId);
    if (idle) clearTimeout(idle);
    this.idleTimers.delete(agentId);
    const shutdown = this.shutdownTimers.get(agentId);
    if (shutdown) clearTimeout(shutdown);
    this.shutdownTimers.delete(agentId);
    const identity = this.identityTimers.get(agentId);
    if (identity) clearTimeout(identity);
    this.identityTimers.delete(agentId);
  }

  private resetIdleTimer(agentId: string) {
    const existing = this.idleTimers.get(agentId);
    if (existing) clearTimeout(existing);

    const existingShutdown = this.shutdownTimers.get(agentId);
    if (existingShutdown) clearTimeout(existingShutdown);

    const timer = setTimeout(() => {
      const agent = this.agents.get(agentId);
      if (agent && !this.hiddenAgents.has(agentId)) {
        // If a tool is pending (waiting for result), don't go idle — reschedule
        if (this.pendingTool.has(agentId)) {
          this.resetIdleTimer(agentId);
          return;
        }
        agent.isIdle = true;
        agent.isPlanning = false;
        agent.isWaitingForUser = false;
        agent.phase = 'idle';
        agent.currentZone = 'idle';
        agent.currentTool = null;
        agent.currentActivity = null;
        agent.speechText = null;
        const ts = Date.now();
        this.addHistory(agentId, { timestamp: ts, kind: 'idle', zone: 'idle' });
        const idleEvent = {
          type: 'agent:idle',
          agent: { ...agent },
          timestamp: ts,
        } satisfies AgentEvent;
        this.recordTimeline(idleEvent);
        this.emit('agent:idle', idleEvent);

        this.startShutdownTimer(agentId);
      }
    }, config.idleTimeoutMs);

    this.idleTimers.set(agentId, timer);
  }

  private startShutdownTimer(agentId: string) {
    const existing = this.shutdownTimers.get(agentId);
    if (existing) clearTimeout(existing);

    const timer = setTimeout(() => {
      const agent = this.agents.get(agentId);
      if (agent && agent.isIdle && !agent.isDone) {
        agent.isDone = true;
        console.log(`Agent marked done: ${agentId} (idle for ${config.shutdownTimeoutMs / 1000}s)`);
        const ts = Date.now();
        const updateEvent = { type: 'agent:update', agent: { ...agent }, timestamp: ts } satisfies AgentEvent;
        this.recordTimeline(updateEvent);
        this.emit('agent:update', updateEvent);
      }
    }, config.shutdownTimeoutMs);

    this.shutdownTimers.set(agentId, timer);
  }

  removeDone(): string[] {
    const removed: string[] = [];
    const doneIds = [...this.agents.entries()]
      .filter(([, a]) => a.isDone)
      .map(([id]) => id);
    for (const id of doneIds) {
      if (this.agents.has(id)) {
        removed.push(id);
        this.shutdown(id); // shutdown cascades to children
      }
    }
    return removed;
  }

  shutdown(sessionId: string) {
    // Cascade: collect all child agents before removing this one
    const childIds = [...this.agents.entries()]
      .filter(([id, a]) => a.parentId === sessionId && id !== sessionId)
      .map(([id]) => id);

    this.clearTimers(sessionId);
    this.hiddenAgents.delete(sessionId);
    this.pendingTool.delete(sessionId);

    const ts = Date.now();
    this.addHistory(sessionId, { timestamp: ts, kind: 'shutdown' });

    const agent = this.agents.get(sessionId);

    // Record timeline event before deleting — capture the full agent state
    const shutdownEvent = {
      type: 'agent:shutdown',
      agent: agent ? { ...agent } : { id: sessionId } as AgentState,
      timestamp: ts,
    } satisfies AgentEvent;
    this.recordTimeline(shutdownEvent);
    this.emit('agent:shutdown', shutdownEvent);

    if (agent?.agentName) {
      const key = `${agent.rootSessionId}:${agent.agentName}`;
      if (this.namedAgentMap.get(key) === sessionId) {
        this.namedAgentMap.delete(key);
      }
    }

    for (const [sid, target] of this.sessionToAgent) {
      if (target === sessionId) {
        this.sessionToAgent.delete(sid);
      }
    }

    this.agents.delete(sessionId);
    this.activityHistory.delete(sessionId);
    this.pendingSubagentTasks.delete(sessionId);
    this.pendingSubagentNames.delete(sessionId);
    this.pendingSubagentTeams.delete(sessionId);
    this.anomalyDetector.removeAgent(sessionId);
    this.toolChainTracker.resetAgent(sessionId);
    // If no agents remain, fully clear tool chain data
    if (!this.toolChainTracker.hasActiveAgents() && this.agents.size === 0) {
      this.toolChainTracker.reset();
    }
    this.emit('toolchain:changed', { data: this.toolChainTracker.getSnapshot(), timestamp: Date.now() });

    // Clean up pendingRecipients if no more agents share this rootSessionId
    if (agent?.rootSessionId) {
      const rootId = agent.rootSessionId;
      const hasRelated = [...this.agents.values()].some(a => a.rootSessionId === rootId);
      if (!hasRelated) {
        this.pendingRecipients.delete(rootId);
      }
    }

    // Clean up tasks owned by this agent
    if (this.taskGraphManager.removeAgentTasks(sessionId)) {
      this.emit('taskgraph:changed', { data: this.taskGraphManager.getSnapshot(), timestamp: Date.now() });
    }

    // Recursively shutdown all children
    for (const childId of childIds) {
      if (this.agents.has(childId)) {
        console.log(`Cascading shutdown: child ${childId.slice(0, 12)}… (parent ${sessionId.slice(0, 12)}… removed)`);
        this.shutdown(childId);
      }
    }
  }

  // ---------------------------------------------------------------------------
  // Hook-based lifecycle methods (Phase B: merge event sources)
  // ---------------------------------------------------------------------------

  /** Hook: new Claude Code session started */
  hookSessionStart(sessionId: string, _cwd: string): void {
    // If agent already exists (from JSONL), reset it to running
    const canonicalId = this.resolveAgentId(sessionId);
    const agent = this.agents.get(canonicalId);
    if (agent) {
      agent.isIdle = false;
      agent.isDone = false;
      agent.phase = 'running';
      agent.lastActivityAt = Date.now();
      this.resetIdleTimer(canonicalId);
    }
    // If not yet known, JSONL will spawn it when the first message arrives
  }

  /** Hook: session ended — definitively shut down the agent */
  hookSessionEnd(sessionId: string): void {
    const canonicalId = this.resolveAgentId(sessionId);
    if (this.agents.has(canonicalId)) {
      this.shutdown(canonicalId);
    }
  }

  /** Hook: user submitted a prompt — agent is now running */
  hookUserPromptSubmit(sessionId: string): void {
    this.setPhase(sessionId, 'running');
  }

  /** Hook: agent finished responding (Stop event) */
  hookStop(sessionId: string, lastMessage?: string): void {
    const canonicalId = this.resolveAgentId(sessionId);
    const agent = this.agents.get(canonicalId);
    if (!agent || this.hiddenAgents.has(canonicalId)) return;

    agent.phase = 'idle';
    agent.isIdle = true;
    agent.isPlanning = false;
    agent.isWaitingForUser = false;
    agent.currentZone = 'idle';
    agent.currentTool = null;
    agent.currentActivity = null;
    if (lastMessage) {
      agent.speechText = lastMessage.length > 200 ? lastMessage.slice(0, 197) + '...' : lastMessage;
    }

    const now = Date.now();
    this.addHistory(canonicalId, { timestamp: now, kind: 'idle', zone: 'idle' });
    const idleEvent = { type: 'agent:idle', agent: { ...agent }, timestamp: now } satisfies AgentEvent;
    this.recordTimeline(idleEvent);
    this.emit('agent:idle', idleEvent);

    // Reset idle timer — it will still eventually trigger shutdown
    this.resetIdleTimer(canonicalId);
  }

  /** Hook: context compaction is starting */
  hookPreCompact(sessionId: string): void {
    this.setPhase(sessionId, 'compacting');
  }

  /** Hook: tool is about to execute (PreToolUse) */
  hookPreToolUse(sessionId: string, toolName: string, toolInput: unknown, _toolUseId: string): void {
    const canonicalId = this.resolveAgentId(sessionId);
    const agent = this.agents.get(canonicalId);
    if (!agent || this.hiddenAgents.has(canonicalId)) return;

    agent.phase = 'running';
    agent.lastToolOutcome = null;
    // Zone + currentTool will be set when JSONL tool_use arrives (richer data)
    // but we can set it here as a fast preview if JSONL hasn't arrived yet
    agent.currentTool = toolName;
    agent.currentZone = getZoneForTool(toolName);
    if (toolInput) {
      agent.currentActivity = this.summarizeToolInput(toolInput);
    }
    agent.lastActivityAt = Date.now();
    this.resetIdleTimer(canonicalId);
    this.toolChainTracker.recordToolStart(canonicalId, toolName);

    const now = Date.now();
    const updateEvent = { type: 'agent:update', agent: { ...agent }, timestamp: now } satisfies AgentEvent;
    this.recordTimeline(updateEvent);
    this.emit('agent:update', updateEvent);
  }

  /** Hook: background task completed (TaskCompleted event) */
  hookTaskCompleted(sessionId: string, taskId: string, taskSubject?: string): void {
    const canonicalId = this.resolveAgentId(sessionId);
    const agent = this.agents.get(canonicalId);
    const root = agent?.rootSessionId ?? canonicalId;

    const changed = this.taskGraphManager.processTaskCompleted(taskId, root);
    if (changed) {
      this.emit('taskgraph:changed', { data: this.taskGraphManager.getSnapshot(), timestamp: Date.now() });
    }
    this.emit('task:completed', {
      taskId,
      taskSubject: taskSubject ?? `Task ${taskId}`,
      agentId: canonicalId,
    });
  }

  /** Hook: tool completed (PostToolUse = success, PostToolUseFailure = failure) */
  hookPostToolUse(sessionId: string, _toolName: string, _toolUseId: string, success: boolean): void {
    const canonicalId = this.resolveAgentId(sessionId);
    const agent = this.agents.get(canonicalId);
    if (!agent || this.hiddenAgents.has(canonicalId)) return;

    agent.lastToolOutcome = success ? 'success' : 'failure';
    this.toolChainTracker.recordToolOutcome(canonicalId, success);
    agent.lastActivityAt = Date.now();
    this.resetIdleTimer(canonicalId);

    const now = Date.now();
    const updateEvent = { type: 'agent:update', agent: { ...agent }, timestamp: now } satisfies AgentEvent;
    this.recordTimeline(updateEvent);
    this.emit('agent:update', updateEvent);
  }

  private setPhase(sessionId: string, phase: AgentPhase): void {
    const canonicalId = this.resolveAgentId(sessionId);
    const agent = this.agents.get(canonicalId);
    if (!agent || this.hiddenAgents.has(canonicalId)) return;

    agent.phase = phase;
    if (phase === 'running') {
      agent.isIdle = false;
      agent.isDone = false;
      agent.lastActivityAt = Date.now();
      this.resetIdleTimer(canonicalId);
    }

    const now = Date.now();
    const updateEvent = { type: 'agent:update', agent: { ...agent }, timestamp: now } satisfies AgentEvent;
    this.recordTimeline(updateEvent);
    this.emit('agent:update', updateEvent);
  }

  dispose(): void {
    this.anomalyDetector.dispose();
    this.clearAllTimers();
  }

  private clearAllTimers(): void {
    for (const timer of this.idleTimers.values()) clearTimeout(timer);
    this.idleTimers.clear();
    for (const timer of this.shutdownTimers.values()) clearTimeout(timer);
    this.shutdownTimers.clear();
    for (const timer of this.identityTimers.values()) clearTimeout(timer);
    this.identityTimers.clear();
  }
}
