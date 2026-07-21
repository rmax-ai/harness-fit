/**
 * Provider integration tests — hit real APIs.
 *
 * Gate: set HARNESSFIT_LIVE_TEST=1 to run.
 * Requires: OPENAI_API_KEY, ANTHROPIC_API_KEY, or GOOGLE_API_KEY in environment.
 *
 * Run: HARNESSFIT_LIVE_TEST=1 bun test packages/core/tests/providers.integration.test.ts
 */
import { describe, expect, it } from 'bun:test';
import type { Message, ModelProvider, ToolDefinition } from '../src/types/index';

const LIVE = Bun.env.HARNESSFIT_LIVE_TEST === '1';
const OPENAI_MODEL = Bun.env.HARNESSFIT_OPENAI_MODEL || 'gpt-5.6-luna';
const ANTHROPIC_MODEL = Bun.env.HARNESSFIT_ANTHROPIC_MODEL || 'claude-haiku-4-5';
const GOOGLE_MODEL = Bun.env.HARNESSFIT_GOOGLE_MODEL || 'gemini-3.5-flash';

const READ_FILE_TOOL: ToolDefinition = {
  name: 'read_file',
  description: 'Read a text file from the repository.',
  parameters: {
    path: { type: 'string', description: 'Relative path to the file.', required: true },
  },
};

// Dynamic imports so we don't fail on module resolution when keys aren't set
async function getProviders() {
  const { OpenAIProvider } = await import('@harnessfit/providers-openai');
  const { AnthropicProvider } = await import('@harnessfit/providers-anthropic');
  const { GoogleProvider } = await import('@harnessfit/providers-google');
  return { OpenAIProvider, AnthropicProvider, GoogleProvider };
}

function skipIfNoKey(key: string): boolean {
  if (!LIVE) return true;
  return !Bun.env[key];
}

async function runToolResultRoundTrip(
  provider: ModelProvider,
  model: string,
  toolCallId: string,
): Promise<void> {
  const messages: Message[] = [
    { role: 'user', content: 'Read README.md and summarize the result.' },
    {
      role: 'assistant',
      content: [
        {
          type: 'tool_call',
          id: toolCallId,
          name: 'read_file',
          arguments: { path: 'README.md' },
          providerMetadata: { thoughtSignature: 'skip_thought_signature_validator' },
        },
      ],
    },
    {
      role: 'tool',
      content: [
        {
          type: 'tool_result',
          toolCallId,
          result: '# HarnessFit\nTool round-trip smoke result.',
        },
      ],
    },
  ];
  const response = await provider.generate({
    model,
    system: 'Summarize tool results for the user.',
    messages,
    tools: [READ_FILE_TOOL],
    maxOutputTokens: 256,
    temperature: 0,
  });

  expect(response.stopReason).toBeOneOf(['end_turn', 'max_tokens', 'tool_use']);
  expect(response.usage.inputTokens).toBeGreaterThan(0);
}

describe('Provider Integration (live API)', () => {
  // ── OpenAI ──────────────────────────────────────

  const runOpenAI = !skipIfNoKey('OPENAI_API_KEY');
  (runOpenAI ? it : it.skip)('OpenAI: generates a response', async () => {
    const { OpenAIProvider } = await getProviders();
    const provider = new OpenAIProvider();

    const response = await provider.generate({
      model: OPENAI_MODEL,
      system: 'Reply with exactly "OK".',
      messages: [{ role: 'user', content: 'Say OK' }],
      tools: [],
      maxOutputTokens: 10,
      temperature: 0,
    });

    expect(response.stopReason).toBe('end_turn');
    expect(response.content.length).toBeGreaterThan(0);
    expect(response.content[0]?.type).toBe('text');
    expect(response.usage.inputTokens).toBeGreaterThan(0);
    expect(response.usage.outputTokens).toBeGreaterThan(0);
  });

  (runOpenAI ? it : it.skip)('OpenAI: returns valid cost estimate', async () => {
    const { OpenAIProvider } = await getProviders();
    const provider = new OpenAIProvider();

    const cost = provider.estimateCost({
      inputTokens: 1_000_000,
      outputTokens: 500_000,
      cachedTokens: 0,
    });

    expect(cost.amount).toBeGreaterThan(0);
    expect(cost.currency).toBe('USD');
  });

  (runOpenAI ? it : it.skip)('OpenAI: capabilities are correct', async () => {
    const { OpenAIProvider } = await getProviders();
    const provider = new OpenAIProvider();

    const caps = provider.capabilities();
    expect(caps.supportsStreaming).toBe(true);
    expect(caps.supportsToolUse).toBe(true);
    expect(caps.maxContextTokens).toBeGreaterThan(0);
  });

  (runOpenAI ? it : it.skip)('OpenAI: accepts a serialized tool-result round trip', async () => {
    const { OpenAIProvider } = await getProviders();
    await runToolResultRoundTrip(new OpenAIProvider(), OPENAI_MODEL, 'call_harnessfit_smoke');
  });

  // ── Anthropic ───────────────────────────────────

  const runAnthropic = !skipIfNoKey('ANTHROPIC_API_KEY');
  (runAnthropic ? it : it.skip)('Anthropic: generates a response', async () => {
    const { AnthropicProvider } = await getProviders();
    const provider = new AnthropicProvider();

    const response = await provider.generate({
      model: ANTHROPIC_MODEL,
      system: 'Reply with exactly "OK".',
      messages: [{ role: 'user', content: 'Say OK' }],
      tools: [],
      maxOutputTokens: 10,
      temperature: 0,
    });

    expect(response.stopReason).toBe('end_turn');
    expect(response.content.length).toBeGreaterThan(0);
    expect(response.usage.inputTokens).toBeGreaterThan(0);
    expect(response.usage.outputTokens).toBeGreaterThan(0);
  });

  (runAnthropic ? it : it.skip)('Anthropic: returns valid cost estimate', async () => {
    const { AnthropicProvider } = await getProviders();
    const provider = new AnthropicProvider();

    const cost = provider.estimateCost({
      inputTokens: 1_000_000,
      outputTokens: 500_000,
      cachedTokens: 0,
    });

    expect(cost.amount).toBeGreaterThan(0);
    expect(cost.currency).toBe('USD');
  });

  (runAnthropic ? it : it.skip)(
    'Anthropic: accepts a serialized tool-result round trip',
    async () => {
      const { AnthropicProvider } = await getProviders();
      await runToolResultRoundTrip(
        new AnthropicProvider(),
        ANTHROPIC_MODEL,
        'toolu_01HarnessFitSmoke',
      );
    },
  );

  // ── Google ──────────────────────────────────────

  const runGoogle = !skipIfNoKey('GOOGLE_API_KEY');
  (runGoogle ? it : it.skip)('Google: generates a response', async () => {
    const { GoogleProvider } = await getProviders();
    const provider = new GoogleProvider();

    const response = await provider.generate({
      model: GOOGLE_MODEL,
      system: 'Reply with exactly "OK".',
      messages: [{ role: 'user', content: 'Say OK' }],
      tools: [],
      maxOutputTokens: 256,
      temperature: 0,
    });

    expect(response.stopReason).toBeOneOf(['end_turn', 'max_tokens']);
    expect(response.content.length).toBeGreaterThan(0);
    expect(response.usage.inputTokens).toBeGreaterThan(0);
  });

  (runGoogle ? it : it.skip)('Google: returns valid cost estimate', async () => {
    const { GoogleProvider } = await getProviders();
    const provider = new GoogleProvider();

    const cost = provider.estimateCost({
      inputTokens: 1_000_000,
      outputTokens: 500_000,
      cachedTokens: 0,
    });

    expect(cost.amount).toBeGreaterThan(0);
    expect(cost.currency).toBe('USD');
  });

  (runGoogle ? it : it.skip)('Google: accepts a serialized tool-result round trip', async () => {
    const { GoogleProvider } = await getProviders();
    await runToolResultRoundTrip(new GoogleProvider(), GOOGLE_MODEL, 'gemini-harnessfit-smoke');
  });
});
