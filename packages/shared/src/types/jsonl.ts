/** Raw JSONL message types from Claude Code session files */

export interface JsonlMessage {
  /** Top-level type: various internal types */
  type?: string;
  /** Session ID at the top level */
  sessionId?: string;
  parentUuid?: string;
  isSidechain?: boolean;
  userType?: string;
  cwd?: string;
  version?: string;
  /** The actual API message */
  message?: AssistantMessage;
  /** Tool result content */
  tool_use_id?: string;
  content?: string | ContentBlock[];
}

export interface AssistantMessage {
  id: string;
  type: 'message';
  role: 'assistant' | 'user';
  content: ContentBlock[];
  model?: string;
  usage?: TokenUsage;
}

export type ContentBlock = TextBlock | ToolUseBlock | ToolResultBlock | ThinkingBlock;

export interface TextBlock {
  type: 'text';
  text: string;
}

export interface ThinkingBlock {
  type: 'thinking';
  thinking: string;
}

export interface ToolUseBlock {
  type: 'tool_use';
  id: string;
  name: string;
  input: Record<string, unknown>;
}

export interface ToolResultBlock {
  type: 'tool_result';
  tool_use_id: string;
  content: string | ContentBlock[];
}

export interface TokenUsage {
  input_tokens: number;
  output_tokens: number;
  cache_creation_input_tokens?: number;
  cache_read_input_tokens?: number;
}
