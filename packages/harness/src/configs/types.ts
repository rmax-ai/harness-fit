/**
 * Harness configuration types per SPEC.md §10.
 *
 * A HarnessConfig is a typed, serializable object with 8 sub-configs.
 * It represents the full parameter space for how an agent harness
 * interacts with a model — prompts, planning, tools, context,
 * feedback, validation, retry, and completion.
 */

// ── Prompt ────────────────────────────────────────────────────

export type InstructionStyle = 'minimal' | 'contract' | 'procedural' | 'principles';
export type PromptStructure = 'markdown' | 'xml' | 'plain';
export type InstructionPosition = 'prefix' | 'prefix-and-suffix';

export interface PromptConfig {
  readonly instructionStyle: InstructionStyle;
  readonly structure: PromptStructure;
  readonly includeExamples: boolean;
  readonly repeatConstraints: boolean;
  readonly explicitSuccessCriteria: boolean;
  readonly instructionPosition: InstructionPosition;
}

// ── Planning ──────────────────────────────────────────────────

export type PlanningMode = 'none' | 'implicit' | 'explicit';
export type MaxPlanItems = 3 | 5 | 8;

export interface PlanningConfig {
  readonly mode: PlanningMode;
  readonly requirePlanBeforeTools: boolean;
  readonly requirePlanUpdateAfterFailure: boolean;
  readonly maxPlanItems: MaxPlanItems;
}

// ── Tools ─────────────────────────────────────────────────────

export type ToolDescriptionStyle = 'minimal' | 'detailed' | 'detailed-with-examples';
export type SchemaStrictness = 'permissive' | 'strict';
export type ReturnFormat = 'plain' | 'structured';

export interface ToolConfig {
  readonly descriptionStyle: ToolDescriptionStyle;
  readonly schemaStrictness: SchemaStrictness;
  readonly returnFormat: ReturnFormat;
  readonly includeUsageGuidance: boolean;
  readonly exposeToolErrorsVerbatim: boolean;
}

// ── Context ───────────────────────────────────────────────────

export type RepositoryMap = 'none' | 'compact' | 'detailed';
export type InitialFileStrategy = 'none' | 'retrieved' | 'task-hints';
export type ToolResultCompaction = 'none' | 'truncate' | 'summarize';

export interface ContextConfig {
  readonly repositoryMap: RepositoryMap;
  readonly initialFileStrategy: InitialFileStrategy;
  readonly toolResultCompaction: ToolResultCompaction;
  readonly includePreviousFailures: boolean;
  readonly maxContextTokens: number;
}

// ── Feedback ──────────────────────────────────────────────────

export type CommandOutput = 'raw' | 'normalized' | 'diagnostic';
export type FailureFraming = 'neutral' | 'diagnostic' | 'directive';

export interface FeedbackConfig {
  readonly commandOutput: CommandOutput;
  readonly includeDiffAfterEdit: boolean;
  readonly includeRemainingBudget: boolean;
  readonly failureFraming: FailureFraming;
}

// ── Validation ────────────────────────────────────────────────

export type ValidationMode = 'final-only' | 'after-edit' | 'adaptive';

export interface ValidationConfig {
  readonly validationMode: ValidationMode;
  readonly requireTestsBeforeFinish: boolean;
  readonly requireLintBeforeFinish: boolean;
  readonly requireTypecheckBeforeFinish: boolean;
  readonly rejectTestDeletion: boolean;
  readonly rejectValidationWeakening: boolean;
}

// ── Retry ─────────────────────────────────────────────────────

export type RetryCount = 0 | 1 | 2;
export type RetryMode = 'same-context' | 'failure-summary' | 'fresh-context';

export interface RetryConfig {
  readonly retries: RetryCount;
  readonly retryMode: RetryMode;
  readonly critiqueBeforeRetry: boolean;
}

// ── Completion ────────────────────────────────────────────────

export interface CompletionConfig {
  readonly requireStructuredSummary: boolean;
  readonly requireEvidenceReferences: boolean;
  readonly requireChangedFiles: boolean;
  readonly requireResidualRisk: boolean;
}

// ── Master Config ─────────────────────────────────────────────

export interface HarnessConfig {
  readonly prompt: PromptConfig;
  readonly planning: PlanningConfig;
  readonly tools: ToolConfig;
  readonly context: ContextConfig;
  readonly feedback: FeedbackConfig;
  readonly validation: ValidationConfig;
  readonly retry: RetryConfig;
  readonly completion: CompletionConfig;
}

// ── Default / Generic Harness (Phase 0 baseline) ──────────────

export const GENERIC_HARNESS: HarnessConfig = {
  prompt: {
    instructionStyle: 'contract',
    structure: 'markdown',
    includeExamples: true,
    repeatConstraints: true,
    explicitSuccessCriteria: true,
    instructionPosition: 'prefix',
  },
  planning: {
    mode: 'implicit',
    requirePlanBeforeTools: false,
    requirePlanUpdateAfterFailure: false,
    maxPlanItems: 5,
  },
  tools: {
    descriptionStyle: 'detailed',
    schemaStrictness: 'strict',
    returnFormat: 'structured',
    includeUsageGuidance: true,
    exposeToolErrorsVerbatim: true,
  },
  context: {
    repositoryMap: 'compact',
    initialFileStrategy: 'task-hints',
    toolResultCompaction: 'truncate',
    includePreviousFailures: true,
    maxContextTokens: 128_000,
  },
  feedback: {
    commandOutput: 'diagnostic',
    includeDiffAfterEdit: true,
    includeRemainingBudget: true,
    failureFraming: 'diagnostic',
  },
  validation: {
    validationMode: 'final-only',
    requireTestsBeforeFinish: true,
    requireLintBeforeFinish: false,
    requireTypecheckBeforeFinish: false,
    rejectTestDeletion: true,
    rejectValidationWeakening: true,
  },
  retry: {
    retries: 1,
    retryMode: 'failure-summary',
    critiqueBeforeRetry: true,
  },
  completion: {
    requireStructuredSummary: true,
    requireEvidenceReferences: false,
    requireChangedFiles: true,
    requireResidualRisk: false,
  },
};

/** All configurable parameter paths for hill climbing. */
export const PARAMETER_KEYS = [
  'prompt.instructionStyle',
  'prompt.structure',
  'prompt.includeExamples',
  'prompt.repeatConstraints',
  'prompt.explicitSuccessCriteria',
  'prompt.instructionPosition',
  'planning.mode',
  'planning.requirePlanBeforeTools',
  'planning.requirePlanUpdateAfterFailure',
  'planning.maxPlanItems',
  'tools.descriptionStyle',
  'tools.schemaStrictness',
  'tools.returnFormat',
  'tools.includeUsageGuidance',
  'tools.exposeToolErrorsVerbatim',
  'context.repositoryMap',
  'context.initialFileStrategy',
  'context.toolResultCompaction',
  'context.includePreviousFailures',
  'context.maxContextTokens',
  'feedback.commandOutput',
  'feedback.includeDiffAfterEdit',
  'feedback.includeRemainingBudget',
  'feedback.failureFraming',
  'validation.validationMode',
  'validation.requireTestsBeforeFinish',
  'validation.requireLintBeforeFinish',
  'validation.requireTypecheckBeforeFinish',
  'validation.rejectTestDeletion',
  'validation.rejectValidationWeakening',
  'retry.retries',
  'retry.retryMode',
  'retry.critiqueBeforeRetry',
  'completion.requireStructuredSummary',
  'completion.requireEvidenceReferences',
  'completion.requireChangedFiles',
  'completion.requireResidualRisk',
] as const;

export type ParameterKey = (typeof PARAMETER_KEYS)[number];
