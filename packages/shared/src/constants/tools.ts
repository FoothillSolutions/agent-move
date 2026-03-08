import type { ZoneId } from '../types/zone.js';

/** Tool name -> icon mapping for speech bubbles */
export const TOOL_ICONS: Record<string, string> = {
  Read: '\u{1F4D6}',       // open book
  Write: '\u{270F}\uFE0F', // pencil
  Edit: '\u{1F527}',       // wrench
  Bash: '\u{1F4BB}',       // terminal
  Glob: '\u{1F50D}',       // search
  Grep: '\u{1F50E}',       // search right
  WebSearch: '\u{1F310}',  // globe
  WebFetch: '\u{1F310}',   // globe
  Agent: '\u{1F916}',      // robot
  TeamCreate: '\u{1F465}', // people
  SendMessage: '\u{1F4AC}',// speech
  TaskCreate: '\u{1F4CB}', // clipboard
  TaskUpdate: '\u{2705}',  // check
  AskUserQuestion: '\u{2753}', // question
  EnterPlanMode: '\u{1F4DD}',  // memo
  ExitPlanMode: '\u{1F4DD}',   // memo
};

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
  // Handle MCP tools with varying names — all route to web zone
  if (toolName.startsWith('mcp__')) return 'web';
  return TOOL_ZONE_MAP[toolName] ?? 'thinking';
}
