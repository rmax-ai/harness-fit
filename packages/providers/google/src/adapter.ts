/**
 * Google Gemini provider adapter.
 *
 * Normalizes Gemini's generateContent API to the common ModelProvider interface.
 */
import type {
  ModelProvider,
  NormalizedModelRequest,
  NormalizedModelResponse,
  NormalizedUsage,
  Money,
  ProviderCapabilities,
  StopReason,
  MessageContent,
} from '@harnessfit/core';

export class GoogleProvider implements ModelProvider {
  private readonly apiKey: string;
  private readonly baseUrl: string;

  constructor(apiKey?: string, baseUrl?: string) {
    this.apiKey = apiKey || Bun.env.GOOGLE_API_KEY || '';
    this.baseUrl = baseUrl || 'https://generativelanguage.googleapis.com/v1beta';
  }

  async generate(request: NormalizedModelRequest): Promise<NormalizedModelResponse> {
    const body = this.buildRequest(request);

    const response = await fetch(
      `${this.baseUrl}/models/${request.model}:generateContent?key=${this.apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      },
    );

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Gemini API error ${response.status}: ${text}`);
    }

    const data = (await response.json()) as Record<string, unknown>;
    return this.normalizeResponse(data);
  }

  private buildRequest(req: NormalizedModelRequest): Record<string, unknown> {
    const contents: Record<string, unknown>[] = [];
    const systemInstruction = req.system ? { parts: [{ text: req.system }] } : undefined;

    for (const msg of req.messages) {
      if (msg.role === 'system') continue;

      let role = 'user';
      if (msg.role === 'assistant') role = 'model';

      const parts: Record<string, unknown>[] = [];

      if (typeof msg.content === 'string') {
        parts.push({ text: msg.content });
      } else {
        for (const part of msg.content) {
          if (part.type === 'text') {
            parts.push({ text: part.text });
          } else if (part.type === 'tool_call') {
            parts.push({
              functionCall: {
                name: part.name,
                args: part.arguments,
              },
            });
          } else if (part.type === 'tool_result') {
            parts.push({
              functionResponse: {
                name: 'tool',
                response: { result: part.result },
              },
            });
          }
        }
      }

      contents.push({ role, parts });
    }

    const body: Record<string, unknown> = {
      contents,
      generationConfig: {
        maxOutputTokens: req.maxOutputTokens,
        temperature: req.temperature,
      },
    };

    if (systemInstruction) {
      body.systemInstruction = systemInstruction;
    }

    // Gemini tool declarations
    if (req.tools.length > 0) {
      body.tools = [
        {
          functionDeclarations: req.tools.map((t) => ({
            name: t.name,
            description: t.description,
            parameters: {
              type: 'object',
              properties: Object.fromEntries(
                Object.entries(t.parameters).map(([key, param]) => [
                  key,
                  { type: param.type.toUpperCase(), description: param.description },
                ]),
              ),
              required: Object.entries(t.parameters)
                .filter(([, p]) => p.required)
                .map(([key]) => key),
            },
          })),
        },
      ];
    }

    return body;
  }

  private normalizeResponse(data: Record<string, unknown>): NormalizedModelResponse {
    const content: MessageContent[] = [];
    const candidates = data.candidates as Record<string, unknown>[] | undefined;
    const candidate = candidates?.[0];
    const parts = (candidate?.content as Record<string, unknown> | undefined)?.parts as
      | Record<string, unknown>[]
      | undefined;
    const finishReason = candidate?.finishReason as string | undefined;

    if (parts) {
      for (const part of parts) {
        if (part.text) {
          content.push({ type: 'text', text: part.text as string });
        }
        if (part.functionCall) {
          const fc = part.functionCall as Record<string, unknown>;
          content.push({
            type: 'tool_call',
            id: `gemini-${Math.random().toString(36).slice(2)}`,
            name: fc.name as string,
            arguments: fc.args as Record<string, unknown>,
          });
        }
      }
    }

    const stopReason: StopReason =
      finishReason === 'STOP'
        ? 'end_turn'
        : finishReason === 'MAX_TOKENS'
          ? 'max_tokens'
          : content.some((c) => c.type === 'tool_call')
            ? 'tool_use'
            : 'end_turn';

    const usageMeta = data.usageMetadata as Record<string, number> | undefined;

    return {
      stopReason,
      content,
      usage: {
        inputTokens: usageMeta?.promptTokenCount ?? 0,
        outputTokens: usageMeta?.candidatesTokenCount ?? 0,
        cachedTokens: usageMeta?.cachedContentTokenCount ?? 0,
      },
      native: data,
    };
  }

  estimateCost(usage: NormalizedUsage): Money {
    // Gemini 3.5 Flash pricing
    const inputPricePerM = 0.075;
    const outputPricePerM = 0.3;

    const inputCost = (usage.inputTokens / 1_000_000) * inputPricePerM;
    const outputCost = (usage.outputTokens / 1_000_000) * outputPricePerM;

    return { amount: inputCost + outputCost, currency: 'USD' };
  }

  capabilities(): ProviderCapabilities {
    return {
      supportsStreaming: true,
      supportsToolUse: true,
      supportsSeeding: false,
      supportsCaching: true,
      maxContextTokens: 1_000_000,
    };
  }
}
