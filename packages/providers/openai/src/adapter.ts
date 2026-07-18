/**
 * OpenAI provider adapter.
 *
 * Normalizes OpenAI's chat completions API to the common ModelProvider interface.
 *
 * Uses Bun's built-in fetch — no openai SDK dependency needed for MVP.
 * The SDK can be swapped in later for better error handling and streaming.
 */
import type {
  ModelProvider, NormalizedModelRequest, NormalizedModelResponse,
  NormalizedUsage, Money, ProviderCapabilities, StopReason,
  Message, MessageContent,
  ToolDefinition, ToolCallContent,
} from '@harnessfit/core';

export class OpenAIProvider implements ModelProvider {
  private readonly apiKey: string;
  private readonly baseUrl: string;

  constructor(apiKey?: string, baseUrl?: string) {
    this.apiKey = apiKey || Bun.env.OPENAI_API_KEY || '';
    this.baseUrl = baseUrl || 'https://api.openai.com/v1';
  }

  async generate(request: NormalizedModelRequest): Promise<NormalizedModelResponse> {
    const body = this.buildRequest(request);

    const response = await fetch(`${this.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`OpenAI API error ${response.status}: ${text}`);
    }

    const data = await response.json();
    return this.normalizeResponse(data);
  }

  private buildRequest(req: NormalizedModelRequest): Record<string, unknown> {
    return {
      model: req.model,
      messages: req.messages.map((m) => this.convertMessage(m)),
      tools: req.tools.length > 0 ? req.tools.map((t) => this.convertTool(t)) : undefined,
      max_tokens: req.maxOutputTokens,
      temperature: req.temperature,
    };
  }

  private convertMessage(msg: Message): Record<string, unknown> {
    if (typeof msg.content === 'string') {
      return { role: msg.role, content: msg.content };
    }

    // Multi-part content
    const parts: Record<string, unknown>[] = [];
    const toolCalls: Record<string, unknown>[] = [];

    for (const part of msg.content) {
      switch (part.type) {
        case 'text':
          parts.push({ type: 'text', text: part.text });
          break;
        case 'tool_call':
          toolCalls.push({
            id: part.id,
            type: 'function',
            function: { name: part.name, arguments: JSON.stringify(part.arguments) },
          });
          break;
        case 'tool_result':
          // OpenAI expects tool results in a separate message with role 'tool'
          break;
      }
    }

    return { role: msg.role, content: parts, tool_calls: toolCalls.length > 0 ? toolCalls : undefined };
  }

  private convertTool(tool: ToolDefinition): Record<string, unknown> {
    return {
      type: 'function',
      function: {
        name: tool.name,
        description: tool.description,
        parameters: {
          type: 'object',
          properties: Object.fromEntries(
            Object.entries(tool.parameters).map(([key, param]) => [
              key,
              {
                type: param.type,
                description: param.description,
                ...(param.enum ? { enum: param.enum } : {}),
              },
            ]),
          ),
          required: Object.entries(tool.parameters)
            .filter(([, p]) => p.required)
            .map(([key]) => key),
        },
      },
    };
  }

  private normalizeResponse(data: Record<string, unknown>): NormalizedModelResponse {
    const choice = (data.choices as Record<string, unknown>[])?.[0];
    const message = choice?.message as Record<string, unknown> | undefined;
    const usage = data.usage as Record<string, number> | undefined;

    const content: MessageContent[] = [];

    // Text content
    if (message?.content && typeof message.content === 'string' && message.content.length > 0) {
      content.push({ type: 'text', text: message.content });
    }

    // Tool calls
    const rawToolCalls = message?.tool_calls as Record<string, unknown>[] | undefined;
    if (rawToolCalls) {
      for (const tc of rawToolCalls) {
        const fn = tc.function as Record<string, unknown>;
        content.push({
          type: 'tool_call',
          id: tc.id as string,
          name: fn?.name as string,
          arguments: typeof fn?.arguments === 'string'
            ? JSON.parse(fn.arguments)
            : (fn?.arguments || {}),
        } as ToolCallContent);
      }
    }

    const stopReason: StopReason = content.some((c) => c.type === 'tool_call')
      ? 'tool_use'
      : (choice?.finish_reason as string) === 'length'
        ? 'max_tokens'
        : 'end_turn';

    return {
      stopReason,
      content,
      usage: {
        inputTokens: usage?.prompt_tokens ?? 0,
        outputTokens: usage?.completion_tokens ?? 0,
        cachedTokens: usage?.cached_tokens ?? 0,
      },
      native: data,
    };
  }

  estimateCost(usage: NormalizedUsage): Money {
    // GPT-5.6 Luna pricing (approximate — replace with actual)
    const inputPricePerM = 2.0;  // $2 per million input tokens
    const outputPricePerM = 8.0; // $8 per million output tokens

    const inputCost = (usage.inputTokens / 1_000_000) * inputPricePerM;
    const outputCost = (usage.outputTokens / 1_000_000) * outputPricePerM;

    return { amount: inputCost + outputCost, currency: 'USD' };
  }

  capabilities(): ProviderCapabilities {
    return {
      supportsStreaming: true,
      supportsToolUse: true,
      supportsSeeding: true,
      supportsCaching: true,
      maxContextTokens: 128_000,
    };
  }
}
