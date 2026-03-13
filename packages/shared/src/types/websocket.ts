import type { AgentState, ActivityEntry, AgentPhase } from './agent.js';
import type { AnomalyEvent } from './anomaly.js';
import type { ToolChainData } from './tool-chain.js';
import type { TaskGraphData } from './task-graph.js';
import type { PendingPermission } from './hooks.js';

/** Server → Client messages */
export type ServerMessage =
  | FullStateMessage
  | AgentSpawnMessage
  | AgentUpdateMessage
  | AgentIdleMessage
  | AgentShutdownMessage
  | AgentHistoryMessage
  | TimelineSnapshotMessage
  | AnomalyAlertMessage
  | ToolChainSnapshotMessage
  | TaskGraphSnapshotMessage
  | PermissionRequestMessage
  | PermissionResolvedMessage
  | SessionPhaseMessage
  | HooksStatusMessage
  | TaskCompletedNotification;

export interface FullStateMessage {
  type: 'full_state';
  agents: AgentState[];
  timeline: TimelineEvent[];
  toolchain: ToolChainData;
  taskgraph: TaskGraphData;
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

export interface AgentHistoryMessage {
  type: 'agent:history';
  agentId: string;
  entries: ActivityEntry[];
  timestamp: number;
}

/** Timeline event as stored in the global buffer */
export interface TimelineEvent {
  type: 'agent:spawn' | 'agent:update' | 'agent:idle' | 'agent:shutdown';
  agent: AgentState;
  timestamp: number;
}

export interface TimelineSnapshotMessage {
  type: 'timeline:snapshot';
  events: TimelineEvent[];
  timestamp: number;
}

export interface AnomalyAlertMessage {
  type: 'anomaly:alert';
  anomaly: AnomalyEvent;
  timestamp: number;
}

export interface ToolChainSnapshotMessage {
  type: 'toolchain:snapshot';
  data: ToolChainData;
  timestamp: number;
}

export interface TaskGraphSnapshotMessage {
  type: 'taskgraph:snapshot';
  data: TaskGraphData;
  timestamp: number;
}

/** A pending permission request pushed to clients for approval */
export interface PermissionRequestMessage {
  type: 'permission:request';
  permission: PendingPermission;
  timestamp: number;
}

/** A permission request was resolved (from terminal or UI) */
export interface PermissionResolvedMessage {
  type: 'permission:resolved';
  permissionId: string;
  decision: 'allow' | 'deny';
  timestamp: number;
}

/** Broadcast whenever any hook event is received — lets the client know hooks are working */
export interface HooksStatusMessage {
  type: 'hooks:status';
  timestamp: number;
}

/** Agent session phase changed (idle / running / compacting) */
export interface SessionPhaseMessage {
  type: 'session:phase';
  sessionId: string;
  agentId: string;
  phase: AgentPhase;
  timestamp: number;
}

/** Fired when a background task completes (hook-sourced) */
export interface TaskCompletedNotification {
  type: 'task:completed';
  taskId: string;
  taskSubject: string;
  agentId: string;
  timestamp: number;
}

/** Client → Server messages */
export type ClientMessage =
  | PingMessage
  | RequestHistoryMessage
  | RequestToolChainMessage
  | RequestTaskGraphMessage
  | PermissionApproveMessage
  | PermissionDenyMessage
  | PermissionApproveAlwaysMessage;

export interface PingMessage {
  type: 'ping';
}

export interface RequestHistoryMessage {
  type: 'request:history';
  agentId: string;
}

export interface RequestToolChainMessage {
  type: 'request:toolchain';
}

export interface RequestTaskGraphMessage {
  type: 'request:taskgraph';
}

/** Approve a pending permission request */
export interface PermissionApproveMessage {
  type: 'permission:approve';
  permissionId: string;
  /** Modified tool input (e.g. AskUserQuestion answers, ExitPlanMode feedback) */
  updatedInput?: unknown;
}

/** Deny a pending permission request */
export interface PermissionDenyMessage {
  type: 'permission:deny';
  permissionId: string;
}

/** Approve with "always allow" rules */
export interface PermissionApproveAlwaysMessage {
  type: 'permission:approve-always';
  permissionId: string;
  rules: unknown[];
}
