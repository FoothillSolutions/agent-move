import type { ParsedActivity } from '../jsonl-parser.js';
import { normalizeToolName, normalizeToolInput } from '@agent-move/shared';

// ── Pi JSONL entry types ──────────────────────────────────────────────────────

interface PiAssistantMessage {
  role: 'assistant';
  content: PiContentBlock[];
  provider?: string;
  model?: string;
  usage?: PiUsage;
  stopReason?: string;
  timestamp: number;
}

type PiContentBlock = PiTextContent | PiThinkingContent | PiToolCall;

interface PiTextContent {
  type: 'text';
  text: string;
}

interface PiThinkingContent {
  type: 'thinking';
  thinking: string;
}

interface PiToolCall {
  type: 'toolCall';
  id: string;
  name: string;
  arguments: Record<string, unknown>;
}

interface PiUsage {
  input: number;
  output: number;
  cacheRead?: number;
  cacheWrite?: number;
  totalTokens?: number;
  cost?: {
    input: number;
    output: number;
    cacheRead: number;
    cacheWrite: number;
    total: number;
  };
}

// ── Parser ────────────────────────────────────────────────────────────────────

export class PiParser {
  /**
   * Parse a single JSONL line from a pi session file into a raw object.
   * Returns the parsed JSON, or null on parse error.
   */
  parseRaw(line: string): Record<string, unknown> | null {
    try {
      return JSON.parse(line);
    } catch {
      return null;
    }
  }

  /**
   * Extract a ParsedActivity from a pre-parsed JSONL entry.
   * Returns null for non-actionable entries (session header, user messages, etc.).
   */
  parseEntry(entry: Record<string, unknown>): ParsedActivity | null {
    if (entry.type !== 'message') return null;

    const msg = entry.message as { role?: string } | undefined;
    if (!msg || msg.role !== 'assistant') return null;

    return this.parseAssistantMessage(msg as PiAssistantMessage);
  }

  /**
   * Check if a pre-parsed entry is a session header.
   */
  isSessionHeader(entry: Record<string, unknown>): boolean {
    return entry.type === 'session';
  }

  private parseAssistantMessage(msg: PiAssistantMessage): ParsedActivity | null {
    const content = msg.content;
    if (!Array.isArray(content)) return null;

    // Prioritize toolCall blocks
    for (const block of content) {
      if (block.type === 'toolCall') {
        const tool = block as PiToolCall;
        return {
          type: 'tool_use',
          toolName: normalizeToolName(tool.name),
          toolInput: normalizeToolInput(tool.arguments ?? {}),
          model: msg.model,
          inputTokens: msg.usage?.input,
          outputTokens: msg.usage?.output,
          cacheReadTokens: msg.usage?.cacheRead,
          cacheCreationTokens: msg.usage?.cacheWrite,
        };
      }
    }

    // Short text blocks for speech bubbles
    for (const block of content) {
      if (block.type === 'text') {
        const text = (block as PiTextContent).text?.trim() ?? '';
        if (text.length > 0 && text.length < 200) {
          return {
            type: 'text',
            text,
            model: msg.model,
            inputTokens: msg.usage?.input,
            outputTokens: msg.usage?.output,
            cacheReadTokens: msg.usage?.cacheRead,
            cacheCreationTokens: msg.usage?.cacheWrite,
          };
        }
      }
    }

    // Thinking blocks → thinking zone
    for (const block of content) {
      if (block.type === 'thinking') {
        const thinking = (block as PiThinkingContent).thinking?.trim() ?? '';
        return {
          type: 'tool_use',
          toolName: 'thinking',
          toolInput: thinking.length > 0 ? { thought: thinking.slice(0, 120) } : undefined,
          model: msg.model,
          inputTokens: msg.usage?.input,
          outputTokens: msg.usage?.output,
          cacheReadTokens: msg.usage?.cacheRead,
          cacheCreationTokens: msg.usage?.cacheWrite,
        };
      }
    }

    // Token usage only
    if (msg.usage && (msg.usage.input || msg.usage.output)) {
      return {
        type: 'token_usage',
        inputTokens: msg.usage.input,
        outputTokens: msg.usage.output,
        cacheReadTokens: msg.usage.cacheRead,
        cacheCreationTokens: msg.usage.cacheWrite,
        model: msg.model,
      };
    }

    return null;
  }
}
