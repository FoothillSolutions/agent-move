import type { AgentState } from '@agent-move/shared';
import type { ParsedActivity } from '../watcher/jsonl-parser.js';
import type { SessionInfo } from '../watcher/claude-paths.js';

/**
 * Determine the role for an agent based on session info alone (unnamed agents).
 */
export function determineRole(_activity: ParsedActivity, sessionInfo: SessionInfo): AgentState['role'] {
  if (sessionInfo.isSubagent) return 'subagent';
  return 'main';
}

/**
 * Determine the role for a named subagent based on team assignment.
 * Only explicit team assignment (Agent tool's team_name parameter) makes a team-member.
 * Sub-agents spawned by the team-lead without team_name stay as subagents.
 */
export function determineRoleForNamed(
  _parentId: string | null,
  pendingTeam: string | null,
): AgentState['role'] {
  if (pendingTeam) return 'team-member';
  return 'subagent';
}

/**
 * Find the parent agent ID for a new subagent given its project directory.
 * Priority: team-lead → main session → any non-leaf agent.
 */
export function findParentId(
  agents: Map<string, AgentState>,
  projectDir: string,
): string | null {
  // Priority 1: team-lead (the designated orchestrator for team scenarios)
  for (const [id, agent] of agents) {
    if (agent.projectPath === projectDir && agent.role === 'team-lead') {
      return id;
    }
  }
  // Priority 2: main session
  for (const [id, agent] of agents) {
    if (agent.projectPath === projectDir && agent.role === 'main') {
      return id;
    }
  }
  // Priority 3: any non-leaf agent (fallback)
  for (const [id, agent] of agents) {
    if (agent.projectPath === projectDir && agent.role !== 'subagent' && agent.role !== 'team-member') {
      return id;
    }
  }
  return null;
}

/**
 * Inherit teamName from any agent in the same session hierarchy.
 */
export function getParentTeamName(
  agents: Map<string, AgentState>,
  rootSessionId: string,
): string | null {
  for (const agent of agents.values()) {
    if (agent.rootSessionId === rootSessionId && agent.teamName) {
      return agent.teamName;
    }
  }
  return null;
}
