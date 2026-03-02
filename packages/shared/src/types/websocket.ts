import type { AgentState } from './agent.js';

/** Server → Client messages */
export type ServerMessage =
  | FullStateMessage
  | AgentSpawnMessage
  | AgentUpdateMessage
  | AgentIdleMessage
  | AgentShutdownMessage;

export interface FullStateMessage {
  type: 'full_state';
  agents: AgentState[];
  timestamp: number;
}

export interface AgentSpawnMessage {
  type: 'agent:spawn';
  agent: AgentState;
  timestamp: number;
}

export interface AgentUpdateMessage {
  type: 'agent:update';
  agent: AgentState;
  timestamp: number;
}

export interface AgentIdleMessage {
  type: 'agent:idle';
  agent: AgentState;
  timestamp: number;
}

export interface AgentShutdownMessage {
  type: 'agent:shutdown';
  agentId: string;
  timestamp: number;
}

/** Client → Server messages */
export type ClientMessage = PingMessage;

export interface PingMessage {
  type: 'ping';
}
