import type { AgentState, AgentEvent } from '@agent-move/shared';
import type { ToolChainTracker } from './tool-chain-tracker.js';

export interface IdentityManagerDeps {
  agents: Map<string, AgentState>;
  hiddenAgents: Set<string>;
  sessionToAgent: Map<string, string>;
  namedAgentMap: Map<string, string>;
  identityTimers: Map<string, ReturnType<typeof setTimeout>>;
  toolChainTracker: ToolChainTracker;
  clearTimers: (agentId: string) => void;
  recordTimeline: (event: AgentEvent) => void;
  emit: (event: string, ...args: unknown[]) => void;
}

/**
 * Resolve a sessionId to its canonical agent ID.
 */
export function resolveAgentId(sessionToAgent: Map<string, string>, sessionId: string): string {
  return sessionToAgent.get(sessionId) ?? sessionId;
}

/**
 * Transfer token counts from source agent to target and remove the source.
 */
export function transferAndRemove(
  deps: IdentityManagerDeps,
  sourceId: string,
  target: AgentState,
  redirectSessionId: string,
): void {
  const { agents, hiddenAgents, sessionToAgent, toolChainTracker, clearTimers } = deps;
  const source = agents.get(sourceId);
  if (source) {
    target.totalInputTokens += source.totalInputTokens;
    target.totalOutputTokens += source.totalOutputTokens;
    target.cacheReadTokens += source.cacheReadTokens;
    target.cacheCreationTokens += source.cacheCreationTokens;
  }
  agents.delete(sourceId);
  hiddenAgents.delete(sourceId);
  clearTimers(sourceId);
  toolChainTracker.migrateAgent(sourceId, target.id);
  sessionToAgent.set(redirectSessionId, target.id);
  target.isIdle = false;
  target.isDone = false;
  target.lastActivityAt = Date.now();
}

/**
 * Merge a hidden agent into an existing named agent.
 * Returns the existing agent if merged, or null.
 */
export function mergeIntoNamed(
  deps: IdentityManagerDeps,
  hiddenId: string,
  agentName: string,
): AgentState | null {
  const { agents, namedAgentMap } = deps;
  const hidden = agents.get(hiddenId);
  if (!hidden) return null;

  const key = `${hidden.rootSessionId}:${agentName}`;
  const existingId = namedAgentMap.get(key);

  if (!existingId || existingId === hiddenId) return null;

  const existing = agents.get(existingId);
  if (!existing) return null;

  transferAndRemove(deps, hiddenId, existing, hiddenId);

  console.log(`Merged session ${hiddenId.slice(0, 12)}… into agent "${agentName}" (${existingId.slice(0, 12)}…)`);
  return existing;
}

/**
 * Promote a hidden agent to visible (emit spawn event).
 */
export function promoteAgent(deps: IdentityManagerDeps, agentId: string): void {
  const { agents, hiddenAgents, identityTimers, recordTimeline, emit } = deps;

  hiddenAgents.delete(agentId);
  const idTimer = identityTimers.get(agentId);
  if (idTimer) clearTimeout(idTimer);
  identityTimers.delete(agentId);

  const agent = agents.get(agentId);
  if (!agent) return;

  console.log(`Promoting hidden agent ${agentId.slice(0, 12)}… (name: ${agent.agentName ?? 'unknown'})`);
  const now = Date.now();
  const spawnEvent = { type: 'agent:spawn', agent: { ...agent }, timestamp: now } satisfies AgentEvent;
  recordTimeline(spawnEvent);
  emit('agent:spawn', spawnEvent);

  // Also emit current state as an update
  const updateEvent = { type: 'agent:update', agent: { ...agent }, timestamp: now } satisfies AgentEvent;
  recordTimeline(updateEvent);
  emit('agent:update', updateEvent);
}
