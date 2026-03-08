import type { AgentState } from '@agent-move/shared';
import { TOOL_ICONS } from '@agent-move/shared';
import type { SpeechMessage } from './agent-sprite.js';

/** Build rich speech messages from agent state */
export function buildSpeechMessages(agent: AgentState): SpeechMessage[] {
  const messages: SpeechMessage[] = [];

  // Input-needed check
  if (agent.currentTool === 'AskUserQuestion') {
    messages.push({
      text: 'Waiting for input...',
      type: 'input-needed',
      icon: '\u{23F3}',
    });
    return messages;
  }

  // Tool message with details
  if (agent.currentTool) {
    const icon = TOOL_ICONS[agent.currentTool] || '\u{2699}\uFE0F';
    let detail = agent.currentTool;

    // Add file path or command info
    if (agent.currentActivity) {
      const activity = agent.currentActivity;
      // Extract meaningful short form
      if (activity.length <= 50) {
        detail = `${agent.currentTool}: ${activity}`;
      } else {
        // Try to extract just filename from path
        const parts = activity.replace(/\\/g, '/').split('/');
        const shortPath = parts.length > 2
          ? `.../${parts.slice(-2).join('/')}`
          : activity.slice(0, 45);
        detail = `${agent.currentTool}: ${shortPath}`;
      }
    }

    messages.push({ text: detail, type: 'tool', icon });
  }

  // Planning mode indicator (shown alongside tool usage)
  if (agent.isPlanning && agent.currentTool !== 'EnterPlanMode' && agent.currentTool !== 'ExitPlanMode') {
    messages.push({
      text: 'Planning...',
      type: 'tool',
      icon: '\u{1F4DD}',
    });
  }

  // Text/speech message
  if (agent.speechText) {
    messages.push({
      text: agent.speechText,
      type: 'text',
      icon: '\u{1F4AD}',
    });
  }

  return messages;
}
