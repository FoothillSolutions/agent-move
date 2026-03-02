import type { ZoneId } from './zone.js';

export type AgentRole = 'main' | 'subagent' | 'team-lead' | 'team-member';

export interface AgentState {
  id: string;
  sessionId: string;
  projectPath: string;
  projectName: string;
  role: AgentRole;
  parentId: string | null;
  teamName: string | null;
  currentZone: ZoneId;
  currentTool: string | null;
  speechText: string | null;
  lastActivityAt: number;
  spawnedAt: number;
  isIdle: boolean;
  totalInputTokens: number;
  totalOutputTokens: number;
  model: string | null;
  colorIndex: number;
}

export interface AgentEvent {
  type: 'agent:spawn' | 'agent:update' | 'agent:idle' | 'agent:shutdown';
  agent: AgentState;
  timestamp: number;
}
