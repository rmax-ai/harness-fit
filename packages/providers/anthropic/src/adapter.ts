/**
 * Anthropic provider adapter.
 *
 * Normalizes Anthropic's Messages API to the common ModelProvider interface.
 */
import type {
  ModelProvider,
  NormalizedModelRequest,
  NormalizedModelResponse,
  NormalizedUsage,
  Money,
  ProviderCapabilities,
  StopReason,
  Message,
  MessageContent,
  ToolDefinition,
} from '@harnessfit/core';

export class AnthropicProvider implements ModelProvider {
  private readonly apiKey: string;
  private readonly baseUrl: string;

  constructor(apiKey?: string, baseUrl?: string) {
    this.apiKey = apiKey || Bun.env.ANTHROPIC_API_KEY || '';
    this.baseUrl = baseUrl || 'https://api.anthropic.com/v1';
  }

  async generate(request: NormalizedModelRequest): Promise<NormalizedModelResponse> {
    const body = this.buildRequest(request);

    const response = await fetch(`${this.baseUrl}/messages`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': this.apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Anthropic API error ${response.status}: ${text}`);
    }

    const data = await response.json() as Record<string, unknown>;
    return this.normalizeResponse(data);
  }

  private buildRequest(req: NormalizedModelRequest): Record<string, unknown> {
    // Anthropic separates system from messages
    const body: Record<string, unknown> = {
      model: req.model,
      system: req.system,
      messages: (req.messages as Message[])
        .filter((m) => m.role !== 'system')
        .map((m) => ({
          role: m.role,
          content: typeof m.content === 'string' ? m.content : this.convertContent(m.content),
        })),
      max_tokens: req.maxOutputTokens,
    };

    if (req.tools.length > 0) {
      body.tools = req.tools.map((t: ToolDefinition) => ({
        name: t.name,
        description: t.description,
        input_schema: {
          type: 'object',
          properties: Object.fromEntries(
            Object.entries(t.parameters).map(([key, param]) => [
              key,
              {
                type: param.type,
                description: param.description,
                ...(param.enum ? { enum: param.enum } : {}),
              },
            ]),
          ),
          required: Object.entries(t.parameters)
            .filter(([, p]) => p.required)
            .map(([key]) => key),
        },
      }));
    }

    return body;
  }

  private convertContent(content: readonly MessageContent[]): unknown {
    const parts: Record<string, unknown>[] = [];
    for (const part of content) {
      if (part.type === 'text') parts.push({ type: 'text', text: part.text });
      if (part.type === 'tool_result') {
        parts.push({
          type: 'tool_result',
          tool_use_id: part.toolCallId,
          content: part.result,
          is_error: part.isError,
        });
      }
    }
    return parts;
  }

  private normalizeResponse(data: Record<string, unknown>): NormalizedModelResponse {
    const content: MessageContent[] = [];
    const rawContent = data.content as Record<string, unknown>[] | undefined;

    if (rawContent) {
      for (const block of rawContent) {
        if (block.type === 'text') {
          content.push({ type: 'text', text: block.text as string });
        } else if (block.type === 'tool_use') {
          content.push({
            type: 'tool_call',
            id: block.id as string,
            name: block.name as string,
            arguments: block.input as Record<string, unknown>,
          });
        }
      }
    }

    const stopReason: StopReason =
      data.stop_reason === 'tool_use'
        ? 'tool_use'
        : data.stop_reason === 'max_tokens'
          ? 'max_tokens'
          : 'end_turn';

    const usage = data.usage as Record<string, number> | undefined;

    return {
      stopReason,
      content,
      usage: {
        inputTokens: usage?.input_tokens ?? 0,
        outputTokens: usage?.output_tokens ?? 0,
        cachedTokens: usage?.cache_creation_input_tokens ?? 0,
      },
      native: data,
    };
  }

  estimateCost(usage: NormalizedUsage): Money {
    // Claude Haiku 4.5 pricing
    const inputPricePerM = 0.8;
    const outputPricePerM = 4.0;

    const inputCost = (usage.inputTokens / 1_000_000) * inputPricePerM;
    const outputCost = (usage.outputTokens / 1_000_000) * outputPricePerM;

    return { amount: inputCost + outputCost, currency: 'USD' };
  }

  capabilities(): ProviderCapabilities {
    return {
      supportsStreaming: true,
      supportsToolUse: true,
      supportsSeeding: false, // Anthropic doesn't support seeding
      supportsCaching: true,
      maxContextTokens: 200_000,
    };
  }
}
