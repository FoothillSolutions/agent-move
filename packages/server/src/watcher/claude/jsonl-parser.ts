import type { JsonlMessage, ToolUseBlock, TextBlock } from '@agent-move/shared';
import type { ParsedActivity } from '../types.js';

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
    const sessionId = msg.sessionId;

    // Extract agent identity from SendMessage tool results (user messages)
    if (msg.toolUseResult?.routing?.sender) {
      const agentName = msg.toolUseResult.routing.sender;
      if (msg.message?.role === 'user' || msg.type === 'user') {
        return {
          type: 'text',
          text: undefined,
          agentName,
          sessionId,
        };
      }
    }

    // Parse <teammate-message> from user messages to extract sender identity
    if ((msg.message?.role === 'user' || msg.type === 'user') && msg.message?.content) {
      const content = typeof msg.message.content === 'string'
        ? msg.message.content
        : Array.isArray(msg.message.content)
          ? msg.message.content.map((b: any) => b.text ?? '').join('')
          : '';

      if (content.includes('<teammate-message')) {
        const senderMatch = content.match(/<teammate-message\s+teammate_id="([^"]+)"/);
        if (senderMatch) {
          return {
            type: 'text',
            text: undefined,
            messageSender: senderMatch[1],
            sessionId,
          };
        }
      }
    }

    // Only process messages that have a message with content array
    if (!msg.message?.content || !Array.isArray(msg.message.content)) {
      return null;
    }

    // Only process assistant messages for tools/text/tokens
    if (msg.message.role !== 'assistant') {
      return null;
    }

    const content = msg.message.content;

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
          inputTokens: msg.message.usage?.input_tokens,
          outputTokens: msg.message.usage?.output_tokens,
          cacheReadTokens: msg.message.usage?.cache_read_input_tokens,
          cacheCreationTokens: msg.message.usage?.cache_creation_input_tokens,
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

    // Extract token usage
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
}
