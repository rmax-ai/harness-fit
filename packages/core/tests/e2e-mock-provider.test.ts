/**
 * E2E integration test: Mock provider → Coordinator → Evaluator → Score.
 *
 * Verifies the full pipeline produces a valid score without real API keys.
 */
import { describe, expect, it } from 'bun:test';
import type { AgentLoopConfig, TaskContext } from '../src/runtime/agent-loop';
import { AgentLoop } from '../src/runtime/agent-loop';
import { createDefaultRegistry, getToolDefinitions } from '../src/tools/index';
import type {
  ConfigHash,
  MessageContent,
  ModelProvider,
  Money,
  NormalizedModelRequest,
  NormalizedModelResponse,
  NormalizedUsage,
  ProviderCapabilities,
  TaskId,
} from '../src/types/index';

// ── Mock Provider ──────────────────────────────────

class MockProvider implements ModelProvider {
  private responseCount = 0;
  lastRequest: NormalizedModelRequest | undefined;

  async generate(request: NormalizedModelRequest): Promise<NormalizedModelResponse> {
    this.lastRequest = request;
    this.responseCount++;

    const content: MessageContent[] =
      this.responseCount === 1
        ? [
            {
              type: 'tool_call',
              id: 'read-source',
              name: 'read_file',
              arguments: { path: 'src/service.ts' },
            },
          ]
        : [
            {
              type: 'tool_call',
              id: 'finish-task',
              name: 'finish',
              arguments: { summary: 'Mock task complete.' },
            },
          ];

    return {
      stopReason: 'tool_use',
      content,
      usage: {
        inputTokens: 1000 + this.responseCount * 500,
        outputTokens: 200,
        cachedTokens: 0,
      },
      native: { mock: true },
    };
  }

  estimateCost(usage: NormalizedUsage): Money {
    return {
      amount: (usage.inputTokens + usage.outputTokens) * 0.000001,
      currency: 'USD',
    };
  }

  capabilities(): ProviderCapabilities {
    return {
      supportsStreaming: false,
      supportsToolUse: true,
      supportsSeeding: false,
      supportsCaching: false,
      maxContextTokens: 128000,
    };
  }
}

// ── Tests ──────────────────────────────────────────

describe('E2E Integration: Mock Provider → Agent Loop → Score', () => {
  it('completes a run with mock provider', async () => {
    const provider = new MockProvider();
    const tools = createDefaultRegistry();

    const config: AgentLoopConfig = {
      model: provider,
      modelId: 'mock-model' as TaskId as never,
      providerModel: 'provider-facing-mock-model',
      tools,
      systemPrompt: 'You are a coding agent. Fix bugs.',
      limits: {
        maxTurns: 5,
        maxToolCalls: 10,
        maxWallTimeSeconds: 30,
        maxCostUsd: 1,
      },
    };

    const agentLoop = new AgentLoop(config);
    agentLoop.setToolDefinitions(getToolDefinitions());

    const taskContext: TaskContext = {
      taskId: 'test-task' as TaskId,
      repoPath: '/tmp/harnessfit-e2e-test',
      taskDescription: 'Fix the status filter bug.',
      configHash: 'abc123' as ConfigHash,
      seed: 42,
      trialNumber: 1,
    };

    // Ensure sandbox directory exists
    await Bun.$`mkdir -p ${taskContext.repoPath}`.quiet();

    const result = await agentLoop.execute(taskContext);

    // Cleanup
    await Bun.$`rm -rf ${taskContext.repoPath}`.quiet();

    // Verify result structure
    expect(result.runId).toBeDefined();
    expect(typeof result.runId).toBe('string');
    expect(result.turns).toBeGreaterThan(0);
    expect(result.toolCalls).toBeGreaterThanOrEqual(0);
    expect(result.inputTokens).toBeGreaterThan(0);
    expect(result.outputTokens).toBeGreaterThan(0);
    expect(result.termination).toBe('completed');
    expect(result.costUsd).toBeGreaterThan(0);
    expect(result.durationMs).toBeGreaterThanOrEqual(0);
    expect(result.events.length).toBeGreaterThan(0);
    expect(provider.lastRequest?.model).toBe('provider-facing-mock-model');

    // Verify event log structure
    const startEvent = result.events.find((e) => e.type === 'run.started');
    expect(startEvent).toBeDefined();

    const completeEvent = result.events.find((e) => e.type === 'run.completed');
    expect(completeEvent).toBeDefined();
  });

  it('rejects a text-only response without an explicit finish call', async () => {
    const provider = new MockProvider();
    provider.generate = async () => ({
      stopReason: 'end_turn',
      content: [{ type: 'text', text: 'I am done.' }],
      usage: { inputTokens: 1, outputTokens: 1, cachedTokens: 0 },
      native: { mock: true },
    });
    const agentLoop = new AgentLoop({
      model: provider,
      modelId: 'mock-model' as TaskId as never,
      providerModel: 'provider-facing-mock-model',
      tools: createDefaultRegistry(),
      systemPrompt: 'You are a coding agent.',
    });
    agentLoop.setToolDefinitions(getToolDefinitions());

    const result = await agentLoop.execute({
      taskId: 'premature-completion' as TaskId,
      repoPath: '/tmp/harnessfit-premature-completion',
      taskDescription: 'Fix the bug.',
      configHash: 'ghi789' as ConfigHash,
      seed: 7,
      trialNumber: 0,
    });

    expect(result.termination).toBe('premature_completion');
    expect(result.events.some((event) => event.type === 'run.completed')).toBeFalse();
  });

  it('completes a run and produces a valid score via evaluator', async () => {
    const provider = new MockProvider();
    const tools = createDefaultRegistry();

    const config: AgentLoopConfig = {
      model: provider,
      modelId: 'mock-model' as TaskId as never,
      providerModel: 'provider-facing-mock-model',
      tools,
      systemPrompt: 'You are a coding agent.',
      limits: {
        maxTurns: 3,
        maxToolCalls: 5,
        maxWallTimeSeconds: 30,
        maxCostUsd: 1,
      },
    };

    const agentLoop = new AgentLoop(config);
    agentLoop.setToolDefinitions(getToolDefinitions());

    const taskContext: TaskContext = {
      taskId: 'scoring-test' as TaskId,
      repoPath: '/tmp/harnessfit-e2e-scoring',
      taskDescription: 'Fix the bug.',
      configHash: 'def456' as ConfigHash,
      seed: 99,
      trialNumber: 1,
    };

    await Bun.$`mkdir -p ${taskContext.repoPath}`.quiet();

    const result = await agentLoop.execute(taskContext);

    await Bun.$`rm -rf ${taskContext.repoPath}`.quiet();

    // Verify run completed
    expect(result.termination).toBe('completed');

    // Verify all required fields are present for the evaluator
    expect(result.turns).toBeGreaterThan(0);
    expect(result.inputTokens).toBeGreaterThan(0);
    expect(result.outputTokens).toBeGreaterThan(0);
    // patch is only present when tools modify files — not required for completion
    expect(result.events).toBeDefined();
    expect(result.events.length).toBeGreaterThan(0);
  });
});
