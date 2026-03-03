import type { ZoneId } from './zone.js';

export type AgentRole = 'main' | 'subagent' | 'team-lead' | 'team-member';

export interface AgentState {
  id: string;
  sessionId: string;
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
  totalInputTokens: number;
  totalOutputTokens: number;
  cacheReadTokens: number;
  cacheCreationTokens: number;
  model: string | null;
  colorIndex: number;
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
  inputTokens?: number;
  outputTokens?: number;
}
