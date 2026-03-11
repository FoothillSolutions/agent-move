import type { AgentType } from '@agent-move/shared';

export interface SessionInfo {
  agentType: AgentType;
  projectPath: string;
  projectName: string;
  isSubagent: boolean;
  /** The encoded project directory (shared by main + subagents of the same project) */
  projectDir: string;
  /** The parent session ID extracted from the path (for subagents) */
  parentSessionId: string | null;
}

/** Create a minimal fallback SessionInfo for when session metadata is unavailable */
export function createFallbackSession(agentType: AgentType, name: string): SessionInfo {
  return {
    agentType,
    projectPath: name,
    projectName: name,
    isSubagent: false,
    projectDir: name,
    parentSessionId: null,
  };
}

export interface ParsedActivity {
  type: 'tool_use' | 'text' | 'token_usage';
  toolName?: string;
  toolInput?: Record<string, unknown>;
  text?: string;
  inputTokens?: number;
  outputTokens?: number;
  cacheReadTokens?: number;
  cacheCreationTokens?: number;
  model?: string;
  sessionId?: string;
  /** Logical agent name discovered from SendMessage routing */
  agentName?: string;
  /** Sender name from <teammate-message teammate_id="X"> tags */
  messageSender?: string;
}
