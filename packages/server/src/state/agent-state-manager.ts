import { EventEmitter } from 'events';
import type { AgentState, AgentEvent, ZoneId } from '@agentflow/shared';
import { getZoneForTool } from '@agentflow/shared';
import { config } from '../config.js';
import type { ParsedActivity } from '../watcher/jsonl-parser.js';
import type { SessionInfo } from '../watcher/claude-paths.js';

export class AgentStateManager extends EventEmitter {
  private agents = new Map<string, AgentState>();
  private idleTimers = new Map<string, ReturnType<typeof setTimeout>>();
  private colorCounter = 0;

  getAll(): AgentState[] {
    return Array.from(this.agents.values());
  }

  get(id: string): AgentState | undefined {
    return this.agents.get(id);
  }

  processMessage(sessionId: string, activity: ParsedActivity, sessionInfo: SessionInfo) {
    let agent = this.agents.get(sessionId);
    const now = Date.now();

    if (!agent) {
      // Spawn new agent
      agent = {
        id: sessionId,
        sessionId,
        projectPath: sessionInfo.projectPath,
        projectName: sessionInfo.projectName,
        role: this.determineRole(activity, sessionInfo),
        parentId: null,
        teamName: null,
        currentZone: 'spawn',
        currentTool: null,
        speechText: null,
        lastActivityAt: now,
        spawnedAt: now,
        isIdle: false,
        totalInputTokens: 0,
        totalOutputTokens: 0,
        model: activity.model ?? null,
        colorIndex: this.colorCounter++ % 12,
      };
      this.agents.set(sessionId, agent);
      this.emit('agent:spawn', { type: 'agent:spawn', agent: { ...agent }, timestamp: now } satisfies AgentEvent);
    }

    // Update agent based on activity
    agent.lastActivityAt = now;
    agent.isIdle = false;

    if (activity.model) {
      agent.model = activity.model;
    }

    switch (activity.type) {
      case 'tool_use':
        agent.currentTool = activity.toolName ?? null;
        agent.currentZone = getZoneForTool(activity.toolName ?? '');

        // Detect team-related tools
        if (activity.toolName === 'TeamCreate' && activity.toolInput) {
          agent.teamName = (activity.toolInput as Record<string, unknown>).team_name as string ?? null;
          agent.role = 'team-lead';
        }
        if (activity.toolName === 'SendMessage') {
          agent.currentZone = 'messaging';
        }
        break;

      case 'text':
        agent.speechText = activity.text ?? null;
        break;

      case 'token_usage':
        agent.totalInputTokens += activity.inputTokens ?? 0;
        agent.totalOutputTokens += activity.outputTokens ?? 0;
        break;
    }

    // Reset idle timer
    this.resetIdleTimer(sessionId);

    this.emit('agent:update', { type: 'agent:update', agent: { ...agent }, timestamp: now } satisfies AgentEvent);
  }

  private determineRole(_activity: ParsedActivity, sessionInfo: SessionInfo): AgentState['role'] {
    if (sessionInfo.isSubagent) return 'subagent';
    return 'main';
  }

  private resetIdleTimer(sessionId: string) {
    const existing = this.idleTimers.get(sessionId);
    if (existing) clearTimeout(existing);

    const timer = setTimeout(() => {
      const agent = this.agents.get(sessionId);
      if (agent) {
        agent.isIdle = true;
        agent.currentZone = 'idle';
        agent.currentTool = null;
        agent.speechText = null;
        this.emit('agent:idle', {
          type: 'agent:idle',
          agent: { ...agent },
          timestamp: Date.now(),
        } satisfies AgentEvent);
      }
    }, config.idleTimeoutMs);

    this.idleTimers.set(sessionId, timer);
  }

  shutdown(sessionId: string) {
    const timer = this.idleTimers.get(sessionId);
    if (timer) clearTimeout(timer);
    this.idleTimers.delete(sessionId);
    this.agents.delete(sessionId);

    this.emit('agent:shutdown', {
      type: 'agent:shutdown',
      agent: { id: sessionId } as AgentState,
      timestamp: Date.now(),
    });
  }
}
