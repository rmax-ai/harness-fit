import type { HarnessConfig, PromptConfig, ToolConfig, ValidationConfig, RetryConfig } from '../configs/types';
import type { ToolDefinition } from '@harnessfit/core';
import type { ToolDescriptionStyle, ValidationMode, RetryMode, PlanningMode } from '../configs/types';

/**
 * Compiled harness — the runtime artifact produced by the compiler.
 * Same config → same CompiledHarness (deterministic per SPEC.md §21).
 */
export interface CompiledHarness {
  readonly systemPrompt: string;
  readonly toolDefinitions: readonly ToolDefinition[];
  readonly runtimePolicy: RuntimePolicy;
  readonly validationPolicy: ValidationPolicy;
  readonly retryPolicy: RetryPolicy;
  readonly hash: string;
}

export interface RuntimePolicy {
  readonly planningMode: PlanningMode;
  readonly requirePlanBeforeTools: boolean;
  readonly maxPlanItems: number;
  readonly maxContextTokens: number;
  readonly toolResultCompaction: 'none' | 'truncate' | 'summarize';
}

export interface ValidationPolicy {
  readonly mode: ValidationMode;
  readonly requireTestsBeforeFinish: boolean;
  readonly requireLintBeforeFinish: boolean;
  readonly requireTypecheckBeforeFinish: boolean;
}

export interface RetryPolicy {
  readonly maxRetries: number;
  readonly mode: RetryMode;
  readonly critiqueBeforeRetry: boolean;
}

/**
 * Compile a HarnessConfig into a CompiledHarness.
 *
 * This is DETERMINISTIC: same input → same output.
 * Uses the config hash from hashConfig().
 */
export function compileHarness(
  config: HarnessConfig,
  baseToolDefinitions: readonly ToolDefinition[],
  configHash: string,
): CompiledHarness {
  return {
    systemPrompt: buildSystemPrompt(config.prompt),
    toolDefinitions: buildToolDefinitions(config.tools, baseToolDefinitions),
    runtimePolicy: buildRuntimePolicy(config),
    validationPolicy: buildValidationPolicy(config.validation),
    retryPolicy: buildRetryPolicy(config.retry),
    hash: configHash,
  };
}

function buildSystemPrompt(prompt: PromptConfig): string {
  const parts: string[] = [];

  switch (prompt.instructionStyle) {
    case 'minimal':
      parts.push('You are an AI coding agent. Complete the task using the available tools. Be concise.');
      break;
    case 'contract':
      parts.push('You are an AI coding agent. Your task is clearly defined below.');
      parts.push('You MUST fulfill all stated requirements. You MUST NOT modify test files.');
      parts.push('Before finishing, verify your changes against the acceptance criteria.');
      break;
    case 'procedural':
      parts.push('You are an AI coding agent. Follow this procedure:');
      parts.push('1. Understand the task');
      parts.push('2. Explore relevant files');
      parts.push('3. Implement the solution');
      parts.push('4. Verify with tests');
      parts.push('5. Report completion');
      break;
    case 'principles':
      parts.push('You are an AI coding agent guided by these principles:');
      parts.push('- Correctness over speed');
      parts.push('- Tests are the source of truth');
      parts.push('- Minimal changes, maximum effect');
      parts.push('- Understand before modifying');
      break;
  }

  if (prompt.includeExamples) {
    parts.push('\nExample workflow: read relevant files → identify the fix → apply changes → run tests → report.');
  }

  if (prompt.repeatConstraints) {
    parts.push('\nCONSTRAINTS: Do not modify test files. Do not add dependencies. Preserve the public API. Run tests before finishing.');
  }

  if (prompt.explicitSuccessCriteria) {
    parts.push('\nSuccess criteria: All existing tests pass. TypeScript compiles without errors. The task requirements are fully met.');
  }

  const body = parts.join('\n');

  if (prompt.structure === 'xml') {
    return `<system><instruction>${body}</instruction></system>`;
  }

  if (prompt.structure === 'plain') {
    return body.replace(/[*_#]/g, '');
  }

  // markdown (default)
  return body;
}

function buildToolDefinitions(
  config: ToolConfig,
  baseDefinitions: readonly ToolDefinition[],
): readonly ToolDefinition[] {
  return baseDefinitions.map((def) => ({
    ...def,
    description: buildToolDescription(def, config.descriptionStyle),
  }));
}

function buildToolDescription(def: ToolDefinition, style: ToolDescriptionStyle): string {
  switch (style) {
    case 'minimal':
      return def.name;
    case 'detailed':
      return def.description;
    case 'detailed-with-examples':
      return `${def.description}\nExample: ${getToolExample(def.name)}`;
  }
}

function getToolExample(name: string): string {
  const examples: Record<string, string> = {
    list_files: 'list_files(path="src/")',
    read_file: 'read_file(path="src/index.ts")',
    search_files: 'search_files(pattern="TODO", path=".")',
    write_file: 'write_file(path="src/fix.ts", content="...")',
    apply_patch: 'apply_patch(patch="@@ -1,3 +1,4 @@ ...")',
    run_command: 'run_command(command="bun test")',
    git_diff: 'git_diff()',
    finish: 'finish(summary="Fixed the bug in ...")',
  };
  return examples[name] ?? `${name}()`;
}

function buildRuntimePolicy(config: HarnessConfig): RuntimePolicy {
  return {
    planningMode: config.planning.mode,
    requirePlanBeforeTools: config.planning.requirePlanBeforeTools,
    maxPlanItems: config.planning.maxPlanItems,
    maxContextTokens: config.context.maxContextTokens,
    toolResultCompaction: config.context.toolResultCompaction === 'summarize' ? 'summarize' :
      config.context.toolResultCompaction === 'truncate' ? 'truncate' : 'none',
  };
}

function buildValidationPolicy(validation: ValidationConfig): ValidationPolicy {
  return {
    mode: validation.validationMode,
    requireTestsBeforeFinish: validation.requireTestsBeforeFinish,
    requireLintBeforeFinish: validation.requireLintBeforeFinish,
    requireTypecheckBeforeFinish: validation.requireTypecheckBeforeFinish,
  };
}

function buildRetryPolicy(retry: RetryConfig): RetryPolicy {
  return {
    maxRetries: retry.retries,
    mode: retry.retryMode,
    critiqueBeforeRetry: retry.critiqueBeforeRetry,
  };
}
