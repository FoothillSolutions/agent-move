import type { JsonlMessage, ContentBlock, ToolUseBlock, TextBlock } from '@agentflow/shared';

export interface ParsedActivity {
  type: 'tool_use' | 'text' | 'token_usage';
  toolName?: string;
  toolInput?: Record<string, unknown>;
  text?: string;
  inputTokens?: number;
  outputTokens?: number;
  model?: string;
  sessionId?: string;
}

export class JsonlParser {
  parseLine(line: string): ParsedActivity | null {
    try {
      const msg: JsonlMessage = JSON.parse(line);
      return this.extractActivity(msg);
    } catch {
      return null;
    }
  }

  private extractActivity(msg: JsonlMessage): ParsedActivity | null {
    // Only process messages that have an assistant message with content
    if (!msg.message?.content || !Array.isArray(msg.message.content)) {
      return null;
    }

    // Only process assistant messages
    if (msg.message.role !== 'assistant') {
      return null;
    }

    const content = msg.message.content;
    const sessionId = msg.sessionId;

    // Prioritize tool_use blocks
    for (const block of content) {
      if (block.type === 'tool_use') {
        const toolBlock = block as ToolUseBlock;
        return {
          type: 'tool_use',
          toolName: toolBlock.name,
          toolInput: toolBlock.input,
          model: msg.message.model,
          sessionId,
        };
      }
    }

    // Look for short text blocks (for speech bubbles) — skip thinking blocks
    for (const block of content) {
      if (block.type === 'text') {
        const textBlock = block as TextBlock;
        const text = textBlock.text.trim();
        if (text.length > 0 && text.length < 200) {
          return {
            type: 'text',
            text: text.slice(0, 80),
            model: msg.message.model,
            sessionId,
          };
        }
      }
    }

    // Extract token usage
    if (msg.message.usage) {
      return {
        type: 'token_usage',
        inputTokens: msg.message.usage.input_tokens,
        outputTokens: msg.message.usage.output_tokens,
        model: msg.message.model,
        sessionId,
      };
    }

    return null;
  }
}
