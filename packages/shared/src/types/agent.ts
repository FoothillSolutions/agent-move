import type { ZoneId } from './zone.js';

export type AgentRole = 'main' | 'subagent' | 'team-lead' | 'team-member';

/** CLI tool that produced this agent session */
export type AgentType = 'claude' | 'opencode' | 'pi' | 'codex';

/** Precise session lifecycle phase (hook-sourced when available, inferred otherwise) */
export type AgentPhase = 'idle' | 'running' | 'compacting';

export interface AgentState {
  id: string;
  sessionId: string;
  agentType: AgentType;
  /** Root session ID — the top-level main agent's sessionId in this hierarchy.
   *  Used to scope all lookups so agents from different terminal sessions don't interact. */
  rootSessionId: string;
  projectPath: string;
  projectName: string;
  /** Logical team agent name (e.g., "alice", "bob") — used to merge multiple sessions into one agent */
  agentName: string | null;
  role: AgentRole;
  parentId: string | null;
  teamName: string | null;
  currentZone: ZoneId;
  currentTool: string | null;
  currentActivity: string | null;
  /** Name of the agent being messaged (for SendMessage flow visualization) */
  messageTarget: string | null;
  taskDescription: string | null; // high-level task summary (e.g. "Implement dark mode")
  speechText: string | null;
  lastActivityAt: number;
  spawnedAt: number;
  isIdle: boolean;
  /** Agent has been idle long enough to be considered finished/done */
  isDone: boolean;
  /** Agent is in planning mode (between EnterPlanMode and ExitPlanMode) */
  isPlanning: boolean;
  /** Agent is blocked waiting for user input (AskUserQuestion, permission confirmation) */
  isWaitingForUser: boolean;
  /** Precise lifecycle phase. Set by hook events when available; mirrors isIdle otherwise. */
  phase: AgentPhase;
  /** Result of the most recent tool execution (hook-sourced) */
  lastToolOutcome: 'success' | 'failure' | null;
  totalInputTokens: number;
  totalOutputTokens: number;
  cacheReadTokens: number;
  cacheCreationTokens: number;
  /** Total context fill for the most recent request: input_tokens + cache_read_input_tokens */
  contextTokens: number;
  /** Cache-read portion of contextTokens — how much of the context came from the prompt cache */
  contextCacheTokens: number;
  model: string | null;
  colorIndex: number;
  /** Total number of tool_use events processed (for leaderboard) */
  toolUseCount: number;
  /** Current git branch for the agent's project */
  gitBranch: string | null;
  /** Last N file paths touched by the agent */
  recentFiles: string[];
  /** Recent Edit diffs (newest first, max 10) */
  recentDiffs: Array<{ filePath: string; oldText: string; newText: string; timestamp: number }>;
}

export interface AgentEvent {
  type: 'agent:spawn' | 'agent:update' | 'agent:idle' | 'agent:shutdown';
  agent: AgentState;
  timestamp: number;
}

/** A single activity entry in the agent's history feed */
export interface ActivityEntry {
  timestamp: number;
  kind: 'tool' | 'text' | 'zone-change' | 'idle' | 'spawn' | 'shutdown' | 'tokens';
  zone?: ZoneId;
  prevZone?: ZoneId;
  tool?: string;
  toolArgs?: string; // truncated summary of tool input
  text?: string;
  /** Diff data from Edit tool calls */
  diff?: { filePath: string; oldText: string; newText: string };
  inputTokens?: number;
  outputTokens?: number;
}
