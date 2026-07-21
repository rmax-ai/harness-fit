import { EventStore } from '../events/event-store';
import type { ToolRegistry } from '../tools/registry';
import type {
  ConfigHash,
  Message,
  MessageContent,
  ModelId,
  ModelProvider,
  NormalizedModelRequest,
  NormalizedModelResponse,
  RunLimits,
  RunResult,
  RunTermination,
  TaskId,
  ToolDefinition,
} from '../types/index';
import { DEFAULT_LIMITS, createRunId } from '../types/index';

/**
 * Agent edit loop — the core runtime per SPEC.md §9.
 *
 * Flow: Task init → Context → Model → Tools → Feedback → Validate → Complete/Retry
 *
 * The agent loop is provider-agnostic. It operates on normalized types
 * and delegates to the ModelProvider and ToolRegistry.
 */

export interface AgentLoopConfig {
  readonly model: ModelProvider;
  readonly modelId: ModelId;
  /** Provider-facing model identifier; distinct from the stable experiment model ID. */
  readonly providerModel: string;
  readonly tools: ToolRegistry;
  readonly limits?: Partial<RunLimits>;
  readonly systemPrompt: string;
}

export interface TaskContext {
  readonly taskId: TaskId;
  readonly repoPath: string;
  readonly taskDescription: string;
  readonly configHash: ConfigHash;
  readonly seed: number;
  readonly trialNumber: number;
}

export class AgentLoop {
  private readonly model: ModelProvider;
  private readonly modelId: ModelId;
  private readonly providerModel: string;
  private readonly tools: ToolRegistry;
  private readonly limits: RunLimits;
  private readonly systemPrompt: string;

  constructor(config: AgentLoopConfig) {
    this.model = config.model;
    this.modelId = config.modelId;
    this.providerModel = config.providerModel;
    this.tools = config.tools;
    this.limits = { ...DEFAULT_LIMITS, ...config.limits };
    this.systemPrompt = config.systemPrompt;
  }

  /**
   * Execute a single run of the agent loop against a task.
   */
  async execute(task: TaskContext): Promise<RunResult> {
    const runId = createRunId();
    const events = new EventStore(runId);
    const startTime = new Date();

    events.emit('run.started', {
      modelId: this.modelId,
      taskId: task.taskId,
      configHash: task.configHash,
      seed: task.seed,
      trialNumber: task.trialNumber,
    });

    const messages: Message[] = [
      { role: 'system', content: this.systemPrompt },
      { role: 'user', content: task.taskDescription },
    ];

    let turns = 0;
    let totalToolCalls = 0;
    let totalInputTokens = 0;
    let totalOutputTokens = 0;
    let totalCachedTokens = 0;
    let totalCostUsd = 0;
    let termination: RunTermination = 'completed';

    try {
      for (turns = 0; turns < this.limits.maxTurns; turns++) {
        // Check wall time
        const elapsed = (Date.now() - startTime.getTime()) / 1000;
        if (elapsed > this.limits.maxWallTimeSeconds) {
          termination = 'wall_time_limit';
          events.emit('limit.reached', { limit: 'wall_time', elapsed });
          break;
        }

        // Check cost
        if (totalCostUsd >= this.limits.maxCostUsd) {
          termination = 'cost_limit';
          events.emit('limit.reached', { limit: 'cost', cost: totalCostUsd });
          break;
        }

        const toolDefs = this.getToolDefinitions();

        const request: NormalizedModelRequest = {
          model: this.providerModel,
          system: this.systemPrompt,
          messages,
          tools: toolDefs,
          maxOutputTokens: this.limits.maxOutputTokens,
        };

        events.emit('model.requested', {
          turn: turns,
          messageCount: messages.length,
          toolCount: toolDefs.length,
        });

        let response: NormalizedModelResponse;
        try {
          response = await this.model.generate(request);
        } catch (err) {
          termination = 'provider_error';
          events.emit('limit.reached', {
            limit: 'provider_error',
            error: err instanceof Error ? err.message : String(err),
          });
          break;
        }

        totalInputTokens += response.usage.inputTokens;
        totalOutputTokens += response.usage.outputTokens;
        totalCachedTokens += response.usage.cachedTokens;
        totalCostUsd += this.model.estimateCost(response.usage).amount;

        events.emit('model.responded', {
          turn: turns,
          stopReason: response.stopReason,
          inputTokens: response.usage.inputTokens,
          outputTokens: response.usage.outputTokens,
          cost: totalCostUsd,
        });

        // Process tool calls
        if (response.stopReason === 'tool_use') {
          const toolCalls = response.content.filter(
            (c): c is MessageContent & { type: 'tool_call' } => c.type === 'tool_call',
          );

          // Add assistant message with tool calls
          messages.push({ role: 'assistant', content: response.content });

          for (const toolCall of toolCalls) {
            if (totalToolCalls >= this.limits.maxToolCalls) {
              termination = 'tool_call_limit';
              events.emit('limit.reached', { limit: 'tool_calls', count: totalToolCalls });
              break;
            }

            events.emit('tool.requested', {
              name: toolCall.name,
              arguments: toolCall.arguments,
            });

            const result = await this.tools.execute(
              toolCall.name,
              toolCall.arguments,
              task.repoPath,
            );

            totalToolCalls++;
            events.emit('tool.completed', {
              name: toolCall.name,
              success: !result.startsWith('Error'),
              resultLength: result.length,
            });

            // Add tool result message
            messages.push({
              role: 'tool',
              content: [
                {
                  type: 'tool_result',
                  toolCallId: toolCall.id,
                  result,
                },
              ],
            });
          }

          if (termination === 'tool_call_limit') break;
          continue;
        }

        // No tool calls — model is done
        // Check for finish signal
        const finishContent = response.content.find(
          (c) => c.type === 'tool_call' && c.name === 'finish',
        );

        if (finishContent) {
          termination = 'completed';
          events.emit('run.completed', {
            turns,
            toolCalls: totalToolCalls,
            cost: totalCostUsd,
          });
        } else {
          termination = 'completed';
          events.emit('run.completed', {
            turns,
            toolCalls: totalToolCalls,
            cost: totalCostUsd,
            note: 'model_ended_without_finish',
          });
        }
        break;
      }

      if (turns >= this.limits.maxTurns) {
        termination = 'turn_limit';
        events.emit('limit.reached', { limit: 'turns', count: turns });
      }
    } catch (err) {
      termination = 'internal_error';
      events.emit('limit.reached', {
        limit: 'internal_error',
        error: err instanceof Error ? err.message : String(err),
      });
    }

    const endTime = new Date();
    const durationMs = endTime.getTime() - startTime.getTime();

    return {
      runId,
      modelId: this.modelId,
      taskId: task.taskId,
      configHash: task.configHash,
      seed: task.seed,
      trialNumber: task.trialNumber,
      termination,
      startTime: startTime.toISOString(),
      endTime: endTime.toISOString(),
      durationMs,
      turns,
      toolCalls: totalToolCalls,
      inputTokens: totalInputTokens,
      outputTokens: totalOutputTokens,
      cachedTokens: totalCachedTokens,
      costUsd: round(totalCostUsd),
      events: events.getAll(),
    };
  }

  /** Tool definitions passed in from the harness compiler. */
  private toolDefinitions: readonly ToolDefinition[] = [];

  /** Set the tool definitions (called by harness compiler before execute). */
  setToolDefinitions(defs: readonly ToolDefinition[]): void {
    this.toolDefinitions = defs;
  }

  private getToolDefinitions(): readonly ToolDefinition[] {
    if (this.toolDefinitions.length > 0) return this.toolDefinitions;
    return [];
  }
}

function round(value: number): number {
  return Math.round(value * 10000) / 10000;
}
