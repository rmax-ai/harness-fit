/**
 * Core types for the agent runtime — provider-agnostic.
 * Based on SPEC.md §9, §20, §22.
 *
 * These types define the normalized interface that all provider adapters
 * must conform to. The agent runtime operates exclusively on these types.
 */

// ── Identifiers ──────────────────────────────────────────────

declare const RunIdBrand: unique symbol;
export type RunId = string & { readonly [RunIdBrand]: never };

declare const ModelIdBrand: unique symbol;
export type ModelId = string & { readonly [ModelIdBrand]: never };

declare const TaskIdBrand: unique symbol;
export type TaskId = string & { readonly [TaskIdBrand]: never };

declare const ConfigHashBrand: unique symbol;
export type ConfigHash = string & { readonly [ConfigHashBrand]: never };

export function createRunId(): RunId {
  return crypto.randomUUID() as RunId;
}

// ── Money ────────────────────────────────────────────────────

export interface Money {
  readonly amount: number;
  readonly currency: string;
}

// ── Messages ──────────────────────────────────────────────────

export type MessageRole = 'system' | 'user' | 'assistant' | 'tool';

export interface TextContent {
  readonly type: 'text';
  readonly text: string;
}

export interface ToolCallContent {
  readonly type: 'tool_call';
  readonly id: string;
  readonly name: string;
  readonly arguments: Record<string, unknown>;
  /** Provider-specific metadata that must survive a tool-result round trip. */
  readonly providerMetadata?: Record<string, unknown>;
}

export interface ToolResultContent {
  readonly type: 'tool_result';
  readonly toolCallId: string;
  readonly result: string;
  readonly isError?: boolean;
}

export type MessageContent = TextContent | ToolCallContent | ToolResultContent;

export interface Message {
  readonly role: MessageRole;
  readonly content: string | readonly MessageContent[];
}

// ── Tool Definitions ──────────────────────────────────────────

export const ToolNames = [
  'list_files',
  'read_file',
  'search_files',
  'write_file',
  'apply_patch',
  'run_command',
  'git_diff',
  'finish',
] as const;

export type ToolName = (typeof ToolNames)[number];

export interface ToolParameter {
  readonly type: string;
  readonly description: string;
  readonly required?: boolean;
  readonly enum?: readonly string[];
}

export interface ToolDefinition {
  readonly name: ToolName;
  readonly description: string;
  readonly parameters: Record<string, ToolParameter>;
}

// ── Normalized Model Interface ────────────────────────────────

export interface NormalizedModelRequest {
  readonly model: string;
  readonly system: string;
  readonly messages: readonly Message[];
  readonly tools: readonly ToolDefinition[];
  readonly maxOutputTokens: number;
  readonly temperature?: number;
}

export type StopReason = 'end_turn' | 'max_tokens' | 'tool_use' | 'stop_sequence' | 'error';

export interface NormalizedUsage {
  readonly inputTokens: number;
  readonly outputTokens: number;
  readonly cachedTokens: number;
}

export interface NormalizedModelResponse {
  readonly stopReason: StopReason;
  readonly content: readonly MessageContent[];
  readonly usage: NormalizedUsage;
  /** Provider-native response preserved for post-hoc analysis. */
  readonly native: unknown;
}

// ── Provider Capabilities ─────────────────────────────────────

export interface ProviderCapabilities {
  readonly supportsStreaming: boolean;
  readonly supportsToolUse: boolean;
  readonly supportsSeeding: boolean;
  readonly supportsCaching: boolean;
  readonly maxContextTokens: number;
}

// ── Model Provider Interface ──────────────────────────────────

export interface ModelProvider {
  /** Send a normalized request to the model and receive a normalized response. */
  generate(request: NormalizedModelRequest): Promise<NormalizedModelResponse>;

  /** Estimate cost in USD based on token usage. */
  estimateCost(usage: NormalizedUsage): Money;

  /** Return the provider's capabilities. */
  capabilities(): ProviderCapabilities;
}

// ── Provider Error ────────────────────────────────────────────

export class ProviderError extends Error {
  constructor(
    message: string,
    public readonly isRetryable: boolean,
    public readonly providerCode?: string,
  ) {
    super(message);
    this.name = 'ProviderError';
  }
}

// ── Run Events (SPEC.md §22) ──────────────────────────────────

export type RunEventType =
  | 'run.started'
  | 'model.requested'
  | 'model.responded'
  | 'tool.requested'
  | 'tool.completed'
  | 'file.changed'
  | 'validation.started'
  | 'validation.completed'
  | 'retry.started'
  | 'limit.reached'
  | 'run.completed';

export interface RunEvent {
  readonly type: RunEventType;
  readonly runId: RunId;
  readonly sequenceNumber: number;
  readonly timestamp: string;
  readonly data: Record<string, unknown>;
}

// ── Runtime Limits ────────────────────────────────────────────

export interface RunLimits {
  readonly maxTurns: number;
  readonly maxToolCalls: number;
  readonly maxWallTimeSeconds: number;
  readonly maxOutputTokens: number;
  readonly maxCostUsd: number;
}

export const DEFAULT_LIMITS: RunLimits = {
  maxTurns: 24,
  maxToolCalls: 40,
  maxWallTimeSeconds: 600,
  maxOutputTokens: 32000,
  maxCostUsd: 5,
};

// ── Failure Labels (SPEC.md §27) ──────────────────────────────

export const FailureLabels = [
  'ENVIRONMENT_FAILURE',
  'PROVIDER_FAILURE',
  'INVALID_TOOL_CALL',
  'TOOL_LOOP',
  'CONTEXT_EXHAUSTION',
  'BUDGET_EXHAUSTION',
  'PREMATURE_COMPLETION',
  'TEST_FAILURE',
  'REGRESSION',
  'CONSTRAINT_VIOLATION',
  'VALIDATION_MANIPULATION',
  'NO_PATCH',
  'UNRELATED_PATCH',
] as const;

export type FailureLabel = (typeof FailureLabels)[number];

// ── Run Result ────────────────────────────────────────────────

export type RunTermination =
  | 'completed'
  | 'turn_limit'
  | 'tool_call_limit'
  | 'wall_time_limit'
  | 'cost_limit'
  | 'provider_error'
  | 'internal_error';

export interface RunResult {
  readonly runId: RunId;
  readonly modelId: ModelId;
  readonly taskId: TaskId;
  readonly configHash: ConfigHash;
  readonly seed: number;
  readonly trialNumber: number;
  readonly termination: RunTermination;
  readonly failureLabel?: FailureLabel;
  readonly patch?: string;
  readonly startTime: string;
  readonly endTime: string;
  readonly durationMs: number;
  readonly turns: number;
  readonly toolCalls: number;
  readonly inputTokens: number;
  readonly outputTokens: number;
  readonly cachedTokens: number;
  readonly costUsd: number;
  readonly events: readonly RunEvent[];
}

// ── Utility ───────────────────────────────────────────────────

export type Result<T, E = Error> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly error: E };
