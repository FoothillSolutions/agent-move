import type { ZoneId } from '../types/zone.js';

/** Maps Claude Code tool names to activity zones */
export const TOOL_ZONE_MAP: Record<string, ZoneId> = {
  // Files zone
  Read: 'files',
  Write: 'files',
  Edit: 'files',
  Glob: 'files',
  NotebookEdit: 'files',

  // Terminal zone
  Bash: 'terminal',

  // Search zone
  Grep: 'search',
  WebSearch: 'search',

  // Web zone
  WebFetch: 'web',
  mcp__chrome_devtools__navigate_page: 'web',
  mcp__chrome_devtools__click: 'web',
  mcp__chrome_devtools__fill: 'web',
  mcp__chrome_devtools__take_screenshot: 'web',
  mcp__chrome_devtools__take_snapshot: 'web',
  mcp__chrome_devtools__evaluate_script: 'web',

  // Thinking zone
  EnterPlanMode: 'thinking',
  ExitPlanMode: 'thinking',
  AskUserQuestion: 'thinking',

  // Messaging zone
  SendMessage: 'messaging',

  // Tasks zone
  TaskCreate: 'tasks',
  TaskUpdate: 'tasks',
  TaskList: 'tasks',
  TaskGet: 'tasks',

  // Spawn zone
  Agent: 'spawn',
  TeamCreate: 'spawn',
  TeamDelete: 'spawn',
};

/** Get the zone for a tool, defaulting to 'thinking' for unknown tools */
export function getZoneForTool(toolName: string): ZoneId {
  // Handle MCP tools with varying names
  if (toolName.startsWith('mcp__chrome')) return 'web';
  if (toolName.startsWith('mcp__')) return 'web';
  return TOOL_ZONE_MAP[toolName] ?? 'thinking';
}
