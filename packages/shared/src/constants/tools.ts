import type { ZoneId } from '../types/zone.js';

/** Tool name -> icon mapping for speech bubbles */
export const TOOL_ICONS: Record<string, string> = {
  Read: '\u{1F4D6}',       // open book
  Write: '\u{270F}\uFE0F', // pencil
  Edit: '\u{1F527}',       // wrench
  Patch: '\u{1F527}',      // wrench (unified diff)
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
  TodoRead: '\u{1F4CB}',   // clipboard
  TodoWrite: '\u{2705}',   // check
  AskUserQuestion: '\u{2753}', // question
  EnterPlanMode: '\u{1F4DD}',  // memo
  ExitPlanMode: '\u{1F4DD}',   // memo
};

/** Maps canonical tool names to activity zones */
export const TOOL_ZONE_MAP: Record<string, ZoneId> = {
  // Files zone
  Read: 'files',
  Write: 'files',
  Edit: 'files',
  Patch: 'files',
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
  TodoRead: 'tasks',
  TodoWrite: 'tasks',

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

/**
 * Agent-specific tool name → canonical PascalCase name.
 * Each agent parser calls normalizeToolName() before emitting ParsedActivity,
 * so the rest of the pipeline only ever sees canonical names.
 */
const TOOL_NAME_MAP: Record<string, string> = {
  // OpenCode / pi lowercase → canonical PascalCase
  read: 'Read',
  write: 'Write',
  edit: 'Edit',
  patch: 'Patch',
  glob: 'Glob',
  bash: 'Bash',
  grep: 'Grep',
  websearch: 'WebSearch',
  webfetch: 'WebFetch',
  todoread: 'TodoRead',
  todowrite: 'TodoWrite',
  // pi-specific tool names
  'edit-diff': 'Patch',
  find: 'Glob',
  ls: 'Bash',
  truncate: 'Write',
  // Codex CLI tool names
  shell_command: 'Bash',
  exec_command: 'Bash',
  read_file: 'Read',
  apply_patch: 'Patch',
  list_dir: 'Bash',
  grep_files: 'Grep',
  web_search: 'WebSearch',
  js_repl: 'Bash',
  js_repl_reset: 'Bash',
  spawn_agent: 'Agent',
  send_input: 'Agent',
  wait: 'Agent',
  close_agent: 'Agent',
  resume_agent: 'Agent',
  spawn_agents_on_csv: 'Agent',
  report_agent_job_result: 'Agent',
  request_user_input: 'AskUserQuestion',
  request_permissions: 'AskUserQuestion',
  update_plan: 'TodoWrite',
  view_image: 'Read',
  image_generation: 'Write',
  write_stdin: 'Bash',
  search_apps: 'WebSearch',
};

/** Normalize an agent-specific tool name to the canonical form. */
export function normalizeToolName(name: string): string {
  return TOOL_NAME_MAP[name] ?? name;
}

/**
 * Normalize agent-specific tool input field names to snake_case.
 * Called by each agent parser so activity-processor always receives snake_case.
 */
export function normalizeToolInput(
  input: Record<string, unknown>,
): Record<string, unknown> {
  if (!('filePath' in input) && !('oldString' in input) && !('newString' in input) && !('replaceAll' in input)) {
    return input;
  }
  const out = { ...input };
  if ('filePath' in out)  { out.file_path  = out.filePath;  delete out.filePath; }
  if ('oldString' in out) { out.old_string = out.oldString; delete out.oldString; }
  if ('newString' in out) { out.new_string = out.newString; delete out.newString; }
  if ('replaceAll' in out) { out.replace_all = out.replaceAll; delete out.replaceAll; }
  return out;
}

/** Canonical tool names that write/modify files */
export const FILE_WRITE_TOOLS = new Set(['Edit', 'Write', 'NotebookEdit']);

/** Canonical tool names that read/search files */
export const FILE_READ_TOOLS = new Set(['Read', 'Glob', 'Grep']);
