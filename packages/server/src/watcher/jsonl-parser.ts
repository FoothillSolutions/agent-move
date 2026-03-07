import { basename } from 'path';
import type { JsonlMessage, ToolUseBlock, TextBlock } from '@agent-move/shared';
import type { SessionProvider } from './session-info.js';

export interface ParsedActivity {
  type: 'tool_use' | 'text' | 'token_usage';
  toolName?: string;
  toolInput?: Record<string, unknown>;
  text?: string;
  inputTokens?: number;
  outputTokens?: number;
  cacheReadTokens?: number;
  cacheCreationTokens?: number;
  model?: string;
  sessionId?: string;
  /** Logical agent name discovered from SendMessage routing */
  agentName?: string;
  /** Sender name from <teammate-message teammate_id="X"> tags */
  messageSender?: string;
  projectPath?: string;
  projectName?: string;
  parentSessionId?: string | null;
}

interface OpenCodeRow {
  session_id: string;
  directory: string;
  title: string;
  parent_id: string | null;
  data: string;
}

function safeJsonParse<T>(value: string): T | null {
  try {
    return JSON.parse(value) as T;
  } catch {
    return null;
  }
}

function summarizeText(text: string): string | undefined {
  const trimmed = text.trim();
  if (!trimmed) return undefined;
  return trimmed.length > 80 ? trimmed.slice(0, 77) + '...' : trimmed;
}

function normalizeToolName(toolName: string): string {
  const aliases: Record<string, string> = {
    bash: 'Bash',
    read: 'Read',
    write: 'Write',
    edit: 'Edit',
    glob: 'Glob',
    grep: 'Grep',
    webfetch: 'WebFetch',
    websearch: 'WebSearch',
    askuserquestion: 'AskUserQuestion',
    update_plan: 'EnterPlanMode',
    request_user_input: 'AskUserQuestion',
    apply_patch: 'Edit',
    exec_command: 'Bash',
    write_stdin: 'Bash',
    todowrite: 'TaskUpdate',
  };

  const canonical = aliases[toolName] ?? aliases[toolName.toLowerCase()];
  if (canonical) return canonical;
  if (!toolName) return toolName;
  return toolName.slice(0, 1).toUpperCase() + toolName.slice(1);
}

function projectNameFromPath(projectPath: string): string {
  const cleaned = projectPath.replace(/\\/g, '/').replace(/\/+$/, '');
  return basename(cleaned) || 'Unknown';
}

export class JsonlParser {
  parseLine(line: string, provider: SessionProvider): ParsedActivity | null {
    switch (provider) {
      case 'claude':
        return this.parseClaudeLine(line);
      case 'codex':
        return this.parseCodexLine(line);
      case 'pi':
        return this.parsePiLine(line);
      default:
        return null;
    }
  }

  parseOpenCodeMessage(row: OpenCodeRow): ParsedActivity | null {
    const msg = safeJsonParse<Record<string, any>>(row.data);
    if (!msg || msg.role !== 'assistant') return null;

    return {
      type: 'token_usage',
      sessionId: row.session_id,
      parentSessionId: row.parent_id,
      projectPath: row.directory,
      projectName: projectNameFromPath(row.directory),
      agentName: typeof msg.agent === 'string' ? msg.agent : undefined,
      model: typeof msg.modelID === 'string' ? msg.modelID : undefined,
      inputTokens: msg.tokens?.input ?? 0,
      outputTokens: msg.tokens?.output ?? 0,
      cacheReadTokens: msg.tokens?.cache?.read ?? 0,
      cacheCreationTokens: msg.tokens?.cache?.write ?? 0,
    };
  }

  parseOpenCodePart(row: OpenCodeRow): ParsedActivity | null {
    const part = safeJsonParse<Record<string, any>>(row.data);
    if (!part || typeof part.type !== 'string') return null;

    const base = {
      sessionId: row.session_id,
      parentSessionId: row.parent_id,
      projectPath: row.directory,
      projectName: projectNameFromPath(row.directory),
      agentName: row.parent_id ? row.title.replace(/\s+\(@[^)]+\s+subagent\)$/i, '') : undefined,
    };

    if (part.type === 'tool') {
      const toolName = typeof part.tool === 'string' ? normalizeToolName(part.tool) : undefined;
      const toolInput = typeof part.state?.input === 'object' && part.state?.input
        ? part.state.input as Record<string, unknown>
        : {};
      return { type: 'tool_use', ...base, toolName, toolInput };
    }

    if (part.type === 'text' && typeof part.text === 'string') {
      return { type: 'text', ...base, text: summarizeText(part.text) };
    }

    return null;
  }

  private parseClaudeLine(line: string): ParsedActivity | null {
    const msg = safeJsonParse<JsonlMessage>(line);
    if (!msg) return null;
    return this.extractClaudeActivity(msg);
  }

  private extractClaudeActivity(msg: JsonlMessage): ParsedActivity | null {
    const sessionId = msg.sessionId;

    if (msg.toolUseResult?.routing?.sender) {
      const agentName = msg.toolUseResult.routing.sender;
      if (msg.message?.role === 'user' || msg.type === 'user') {
        return { type: 'text', text: undefined, agentName, sessionId };
      }
    }

    if ((msg.message?.role === 'user' || msg.type === 'user') && msg.message?.content) {
      const content = typeof msg.message.content === 'string'
        ? msg.message.content
        : Array.isArray(msg.message.content)
          ? msg.message.content.map((b: any) => b.text ?? '').join('')
          : '';

      if (content.includes('<teammate-message')) {
        const senderMatch = content.match(/<teammate-message\s+teammate_id="([^"]+)"/);
        if (senderMatch) {
          return { type: 'text', text: undefined, messageSender: senderMatch[1], sessionId };
        }
      }
    }

    if (!msg.message?.content || !Array.isArray(msg.message.content)) return null;
    if (msg.message.role !== 'assistant') return null;

    for (const block of msg.message.content) {
      if (block.type === 'tool_use') {
        const toolBlock = block as ToolUseBlock;
        return {
          type: 'tool_use',
          toolName: toolBlock.name,
          toolInput: toolBlock.input,
          model: msg.message.model,
          sessionId,
          inputTokens: msg.message.usage?.input_tokens,
          outputTokens: msg.message.usage?.output_tokens,
          cacheReadTokens: msg.message.usage?.cache_read_input_tokens,
          cacheCreationTokens: msg.message.usage?.cache_creation_input_tokens,
        };
      }
    }

    for (const block of msg.message.content) {
      if (block.type === 'text') {
        const textBlock = block as TextBlock;
        const text = summarizeText(textBlock.text);
        if (text) {
          return {
            type: 'text',
            text,
            model: msg.message.model,
            sessionId,
            inputTokens: msg.message.usage?.input_tokens,
            outputTokens: msg.message.usage?.output_tokens,
            cacheReadTokens: msg.message.usage?.cache_read_input_tokens,
            cacheCreationTokens: msg.message.usage?.cache_creation_input_tokens,
          };
        }
      }
    }

    if (msg.message.usage) {
      return {
        type: 'token_usage',
        inputTokens: msg.message.usage.input_tokens,
        outputTokens: msg.message.usage.output_tokens,
        cacheReadTokens: msg.message.usage.cache_read_input_tokens,
        cacheCreationTokens: msg.message.usage.cache_creation_input_tokens,
        model: msg.message.model,
        sessionId,
      };
    }

    return null;
  }

  private parseCodexLine(line: string): ParsedActivity | null {
    const entry = safeJsonParse<Record<string, any>>(line);
    if (!entry || typeof entry.type !== 'string') return null;

    if (entry.type === 'session_meta') {
      const cwd = entry.payload?.cwd;
      const sessionId = entry.payload?.id;
      if (typeof cwd === 'string') {
        return {
          type: 'text',
          text: undefined,
          sessionId,
          projectPath: cwd,
          projectName: projectNameFromPath(cwd),
        };
      }
    }

    if (entry.type === 'response_item' && entry.payload?.type === 'function_call') {
      const toolName = typeof entry.payload.name === 'string'
        ? normalizeToolName(entry.payload.name)
        : undefined;
      const toolInput = typeof entry.payload.arguments === 'string'
        ? safeJsonParse<Record<string, unknown>>(entry.payload.arguments) ?? { raw: entry.payload.arguments }
        : {};

      return { type: 'tool_use', toolName, toolInput };
    }

    if (entry.type === 'response_item' && entry.payload?.type === 'message') {
      const content = Array.isArray(entry.payload.content) ? entry.payload.content : [];
      for (const block of content) {
        if (block.type === 'output_text' && typeof block.text === 'string') {
          const text = summarizeText(block.text);
          if (text) return { type: 'text', text };
        }
      }
    }

    if (entry.type === 'event_msg' && entry.payload?.type === 'token_count') {
      const usage = entry.payload.info?.last_token_usage;
      if (usage) {
        return {
          type: 'token_usage',
          inputTokens: usage.input_tokens ?? 0,
          outputTokens: usage.output_tokens ?? 0,
          cacheReadTokens: usage.cached_input_tokens ?? 0,
        };
      }
    }

    return null;
  }

  private parsePiLine(line: string): ParsedActivity | null {
    const entry = safeJsonParse<Record<string, any>>(line);
    if (!entry || typeof entry.type !== 'string') return null;

    if (entry.type === 'session' && typeof entry.cwd === 'string') {
      return {
        type: 'text',
        text: undefined,
        sessionId: entry.id,
        projectPath: entry.cwd,
        projectName: projectNameFromPath(entry.cwd),
      };
    }

    if (entry.type !== 'message' || !entry.message) return null;

    if (entry.message.role === 'assistant' && Array.isArray(entry.message.content)) {
      for (const block of entry.message.content) {
        if (block.type === 'toolCall') {
          return {
            type: 'tool_use',
            toolName: typeof block.name === 'string' ? normalizeToolName(block.name) : undefined,
            toolInput: typeof block.arguments === 'object' && block.arguments ? block.arguments : {},
            model: entry.message.model,
          };
        }
      }

      for (const block of entry.message.content) {
        if (block.type === 'text' && typeof block.text === 'string') {
          const text = summarizeText(block.text);
          if (text) return { type: 'text', text, model: entry.message.model };
        }
      }

      if (entry.message.usage) {
        return {
          type: 'token_usage',
          inputTokens: entry.message.usage.input ?? 0,
          outputTokens: entry.message.usage.output ?? 0,
          cacheReadTokens: entry.message.usage.cacheRead ?? 0,
          cacheCreationTokens: entry.message.usage.cacheWrite ?? 0,
          model: entry.message.model,
        };
      }
    }

    if (entry.message.role === 'toolResult' && Array.isArray(entry.message.content)) {
      const text = entry.message.content
        .filter((block: any) => block.type === 'text' && typeof block.text === 'string')
        .map((block: any) => block.text)
        .join('\n');
      const summary = summarizeText(text);
      if (summary) return { type: 'text', text: summary };
    }

    return null;
  }
}
