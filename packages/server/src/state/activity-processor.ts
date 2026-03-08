import type { AgentState, ActivityEntry } from '@agent-move/shared';
import { getZoneForTool } from '@agent-move/shared';
import type { ParsedActivity } from '../watcher/jsonl-parser.js';
import { getGitBranch } from '../watcher/git-info.js';
import type { AnomalyDetector } from './anomaly-detector.js';
import type { ToolChainTracker } from './tool-chain-tracker.js';
import type { TaskGraphManager } from './task-graph-manager.js';

/** Tools that can block for a long time waiting for results. */
export const LONG_RUNNING_TOOLS = new Set([
  'Bash',
  'Agent',
  'WebFetch',
  'WebSearch',
  // Tools that block waiting for user input
  'AskUserQuestion',
  // Reasoning / extended thinking pseudo-tool (emitted for OpenCode reasoning parts)
  'thinking',
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

/** Tools that block specifically waiting for user input/confirmation. */
export const USER_BLOCKING_TOOLS = new Set([
  'AskUserQuestion',
]);

export interface ActivityProcessorDeps {
  pendingTool: Set<string>;
  anomalyDetector: AnomalyDetector;
  toolChainTracker: ToolChainTracker;
  taskGraphManager: TaskGraphManager;
  namedAgentMap: Map<string, string>;
  addHistory: (agentId: string, entry: ActivityEntry) => void;
  summarizeToolInput: (input: unknown) => string;
  queuePendingInfo: (parentId: string, info: { name: string | null; task: string | null; team: string | null }) => void;
  queueRecipient: (rootSessionId: string, sender: string, recipient: string) => void;
  emit: (event: string, ...args: unknown[]) => void;
}

/**
 * Process a tool activity event, mutating agent state and firing side-effects.
 * Extracted from the `tool_use` case of AgentStateManager.mutateAgentState().
 */
function processToolUseActivity(
  deps: ActivityProcessorDeps,
  agent: AgentState,
  activity: ParsedActivity,
  now: number,
): void {
  const {
    pendingTool, anomalyDetector, toolChainTracker, taskGraphManager,
    namedAgentMap, addHistory, summarizeToolInput, queuePendingInfo, queueRecipient, emit,
  } = deps;

  const agentId = agent.id;
  const toolName = activity.toolName ?? '';

  if (LONG_RUNNING_TOOLS.has(toolName)) {
    pendingTool.add(agentId);
  } else {
    pendingTool.delete(agentId);
  }

  // Track user-blocking state
  agent.isWaitingForUser = USER_BLOCKING_TOOLS.has(toolName);

  const prevZone = agent.currentZone;
  agent.currentTool = activity.toolName ?? null;
  agent.currentActivity = summarizeToolInput(activity.toolInput) || null;
  agent.currentZone = getZoneForTool(activity.toolName ?? '');
  agent.toolUseCount++;

  // Anomaly & analytics tracking
  anomalyDetector.setAgentName(agentId, agent.agentName ?? agent.projectName ?? agentId.slice(0, 10));
  anomalyDetector.checkToolUse(agentId, toolName);
  toolChainTracker.recordToolUse(agentId, toolName);

  // Task graph tracking
  if (toolName === 'TaskCreate' || toolName === 'TaskUpdate') {
    const graphChanged = taskGraphManager.processToolUse(
      agentId,
      agent.agentName ?? agentId.slice(0, 10),
      toolName,
      activity.toolInput,
      agent.projectName,
      agent.rootSessionId,
    );
    if (graphChanged) {
      emit('taskgraph:changed', { data: taskGraphManager.getSnapshot(), timestamp: Date.now() });
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
    namedAgentMap.set(`${agent.rootSessionId}:team-lead`, agentId);
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
        queueRecipient(agent.rootSessionId, senderIdentity, recipient);
      }
    }
  } else {
    agent.messageTarget = null;
  }

  // Queue name + description + team for incoming subagent (as compound object)
  if (activity.toolName === 'Agent' && activity.toolInput) {
    const input = activity.toolInput as Record<string, unknown>;
    const desc = (input.description ?? input.prompt ?? '') as string;
    const name = (input.name as string | undefined) ?? null;
    const teamName = (input.team_name as string | undefined) ?? null;
    queuePendingInfo(agentId, {
      name,
      task: desc ? (desc.length > 80 ? desc.slice(0, 77) + '...' : desc) : null,
      team: teamName,
    });
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

  addHistory(agentId, {
    timestamp: now,
    kind: 'tool',
    tool: activity.toolName ?? undefined,
    toolArgs: summarizeToolInput(activity.toolInput),
    zone: agent.currentZone,
    diff: diffData,
  });

  if (prevZone !== agent.currentZone) {
    addHistory(agentId, {
      timestamp: now,
      kind: 'zone-change',
      zone: agent.currentZone,
      prevZone,
    });
  }

  // Accumulate token usage included in this message (parser attaches usage to tool_use)
  if (activity.inputTokens !== undefined || activity.outputTokens !== undefined) {
    agent.totalInputTokens += activity.inputTokens ?? 0;
    agent.totalOutputTokens += activity.outputTokens ?? 0;
    agent.cacheReadTokens += activity.cacheReadTokens ?? 0;
    agent.cacheCreationTokens += activity.cacheCreationTokens ?? 0;
    // Context fill = new tokens + cached tokens read (input_tokens alone excludes cache reads)
    if (activity.inputTokens !== undefined) {
      agent.contextTokens = (activity.inputTokens) + (activity.cacheReadTokens ?? 0);
      agent.contextCacheTokens = activity.cacheReadTokens ?? 0;
    }
  }
}

/**
 * Process a parsed activity, mutating agent state.
 * Replaces the switch statement in AgentStateManager.mutateAgentState().
 */
export function processToolActivity(
  deps: ActivityProcessorDeps,
  agent: AgentState,
  activity: ParsedActivity,
  now: number,
): void {
  const { pendingTool, anomalyDetector, addHistory } = deps;
  const agentId = agent.id;

  switch (activity.type) {
    case 'tool_use': {
      processToolUseActivity(deps, agent, activity, now);
      break;
    }

    case 'text':
      // Text from assistant = Claude has responded, tool is no longer pending
      pendingTool.delete(agentId);
      agent.isWaitingForUser = false;
      if (activity.text) {
        agent.speechText = activity.text;
        agent.currentActivity = activity.text;
        if (!agent.taskDescription) {
          agent.taskDescription = activity.text;
        }
        addHistory(agentId, {
          timestamp: now,
          kind: 'text',
          text: activity.text,
        });
      }
      // Accumulate token usage included in this message
      if (activity.inputTokens !== undefined || activity.outputTokens !== undefined) {
        agent.totalInputTokens += activity.inputTokens ?? 0;
        agent.totalOutputTokens += activity.outputTokens ?? 0;
        agent.cacheReadTokens += activity.cacheReadTokens ?? 0;
        agent.cacheCreationTokens += activity.cacheCreationTokens ?? 0;
        if (activity.inputTokens !== undefined) {
          agent.contextTokens = (activity.inputTokens) + (activity.cacheReadTokens ?? 0);
      agent.contextCacheTokens = activity.cacheReadTokens ?? 0;
        }
      }
      break;

    case 'token_usage':
      // Token usage = message finished, tool is no longer pending
      pendingTool.delete(agentId);
      agent.isWaitingForUser = false;
      agent.totalInputTokens += activity.inputTokens ?? 0;
      agent.totalOutputTokens += activity.outputTokens ?? 0;
      agent.cacheReadTokens += activity.cacheReadTokens ?? 0;
      agent.cacheCreationTokens += activity.cacheCreationTokens ?? 0;
      if (activity.inputTokens !== undefined) {
        agent.contextTokens = (activity.inputTokens) + (activity.cacheReadTokens ?? 0);
      agent.contextCacheTokens = activity.cacheReadTokens ?? 0;
      }
      anomalyDetector.checkTokenUsage(agentId, activity.inputTokens ?? 0, activity.outputTokens ?? 0);
      addHistory(agentId, {
        timestamp: now,
        kind: 'tokens',
        inputTokens: activity.inputTokens ?? 0,
        outputTokens: activity.outputTokens ?? 0,
      });
      break;
  }
}
