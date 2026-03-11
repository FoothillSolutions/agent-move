import type { ParsedActivity } from '../types.js';
import { normalizeToolName, normalizeToolInput } from '@agent-move/shared';
import type { CodexSessionMeta } from './codex-paths.js';

// ── Codex JSONL envelope ────────────────────────────────────────────────────

export interface CodexEnvelope {
  timestamp: string;
  type: string;
  payload: Record<string, unknown>;
}

// ── Payload types ───────────────────────────────────────────────────────────

interface FunctionCallPayload {
  type: 'function_call';
  name: string;
  arguments: string; // JSON string
  call_id: string;
}


interface TokenCountInfo {
  total_token_usage?: {
    input_tokens?: number;
    cached_input_tokens?: number;
    output_tokens?: number;
    reasoning_output_tokens?: number;
    total_tokens?: number;
  };
  last_token_usage?: {
    input_tokens?: number;
    cached_input_tokens?: number;
    output_tokens?: number;
    reasoning_output_tokens?: number;
  };
  model_context_window?: number;
}

// ── Parser (stateless) ─────────────────────────────────────────────────────

export class CodexParser {
  /**
   * Parse a single JSONL line into the envelope structure.
   */
  parseRaw(line: string): CodexEnvelope | null {
    try {
      const obj = JSON.parse(line);
      if (obj && typeof obj.type === 'string') {
        return obj as CodexEnvelope;
      }
      return null;
    } catch {
      return null;
    }
  }

  /**
   * Try to extract session_meta payload. Returns null if not a session_meta envelope.
   */
  tryGetSessionMeta(envelope: CodexEnvelope): CodexSessionMeta | null {
    if (envelope.type !== 'session_meta') return null;
    return envelope.payload as unknown as CodexSessionMeta;
  }

  /**
   * Try to extract model from a turn_context envelope. Returns null otherwise.
   */
  tryGetModel(envelope: CodexEnvelope): string | null {
    if (envelope.type !== 'turn_context') return null;
    const model = envelope.payload?.model as string | undefined;
    return model ?? null;
  }

  /**
   * Parse a Codex JSONL envelope into a ParsedActivity.
   * Model is passed in from the watcher (tracked per-file).
   * Returns null for non-actionable entries.
   */
  parseEntry(envelope: CodexEnvelope, model: string | null): ParsedActivity | null {
    if (envelope.type === 'response_item') {
      return this.parseResponseItem(envelope.payload, model);
    }
    if (envelope.type === 'event_msg') {
      return this.parseEventMsg(envelope.payload, model);
    }
    return null;
  }

  private parseResponseItem(payload: Record<string, unknown>, model: string | null): ParsedActivity | null {
    const itemType = payload.type as string;

    // Function call → tool_use
    if (itemType === 'function_call') {
      const fc = payload as unknown as FunctionCallPayload;
      let toolInput: Record<string, unknown> = {};
      try {
        toolInput = JSON.parse(fc.arguments);
      } catch { /* empty args */ }

      return {
        type: 'tool_use',
        toolName: normalizeToolName(fc.name),
        toolInput: normalizeToolInput(toolInput),
        model: model ?? undefined,
      };
    }

    // Skip response_item/message — assistant text is handled by event_msg/agent_message
    // (agent_message always precedes the assistant message and carries the actual text)

    // Native tool calls (web_search_call, file_search_call, code_interpreter_call, etc.)
    if (itemType.endsWith('_call') && itemType !== 'function_call') {
      // Extract the tool name from the type (e.g., web_search_call → web_search)
      const nativeName = itemType.replace(/_call$/, '');
      const toolInput: Record<string, unknown> = {};
      // Extract query/action details if present
      const action = payload.action as Record<string, unknown> | undefined;
      if (action?.query) toolInput.query = action.query;
      return {
        type: 'tool_use',
        toolName: normalizeToolName(nativeName),
        toolInput,
        model: model ?? undefined,
      };
    }

    // Skip response_item/reasoning — already handled by event_msg/agent_reasoning
    // (agent_reasoning always precedes reasoning in the stream and carries the same text)

    return null;
  }

  private parseEventMsg(payload: Record<string, unknown>, model: string | null): ParsedActivity | null {
    const eventType = payload.type as string;

    // Token count
    if (eventType === 'token_count') {
      const info = payload.info as TokenCountInfo | undefined;
      if (!info?.last_token_usage) return null;

      const usage = info.last_token_usage;
      return {
        type: 'token_usage',
        inputTokens: usage.input_tokens,
        outputTokens: (usage.output_tokens ?? 0) + (usage.reasoning_output_tokens ?? 0),
        cacheReadTokens: usage.cached_input_tokens,
        model: model ?? undefined,
      };
    }

    // Agent message (short text) → speech bubble
    if (eventType === 'agent_message') {
      const text = (payload.message as string)?.trim();
      if (text && text.length > 0 && text.length < 200) {
        return { type: 'text', text, model: model ?? undefined };
      }
    }

    // Agent reasoning → thinking zone
    if (eventType === 'agent_reasoning') {
      const text = (payload.text as string)?.trim();
      if (!text) return null;
      return {
        type: 'tool_use',
        toolName: 'thinking',
        toolInput: { thought: text.slice(0, 120) },
        model: model ?? undefined,
      };
    }

    return null;
  }
}
