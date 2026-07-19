/**
 * Experiment coordinator — orchestrates the full pipeline:
 * Task loading → Sandbox setup → Agent loop execution → Storage → Evaluation
 *
 * SPEC.md §9, §18, §25
 */

import type { ModelProvider } from '@harnessfit/core';
import type { HarnessConfig } from '@harnessfit/harness';
import { AgentLoop, createDefaultRegistry } from '@harnessfit/core';
import type { AgentLoopConfig, TaskContext } from '@harnessfit/core';
import { compileHarness } from '@harnessfit/harness';
import { HarnessDB } from '@harnessfit/storage';
import { computeScore } from '@harnessfit/evaluator';
import type { ScoringInput } from '@harnessfit/evaluator';
import { DEFAULT_LIMITS } from '@harnessfit/core';
import type { RunLimits, ModelId, TaskId, ConfigHash } from '@harnessfit/core';

// ── Types ────────────────────────────────────────────

export interface TaskDefinition {
  readonly id: string;
  readonly category: string;
  readonly difficulty: string;
  readonly title: string;
  readonly description: string;
  readonly repository: string;
  readonly hiddenTestCommand?: string;
}

export interface ModelSpec {
  readonly id: string;
  readonly provider: 'openai' | 'anthropic' | 'google';
  readonly model: string;
  readonly adapter: ModelProvider;
}

export interface ExperimentSpec {
  readonly id: string;
  readonly models: readonly ModelSpec[];
  readonly tasks: readonly TaskDefinition[];
  readonly trials: number;
  readonly harness: HarnessConfig;
  readonly limits?: Partial<{
    maxTurns: number;
    maxToolCalls: number;
    maxWallTimeSeconds: number;
    maxCostUsdPerRun: number;
  }>;
  readonly dbPath?: string;
}

export interface TrialResult {
  readonly runId: string;
  readonly modelId: string;
  readonly taskId: string;
  readonly trialNumber: number;
  readonly success: boolean;
  readonly score: number;
  readonly durationMs: number;
  readonly turns: number;
  readonly toolCalls: number;
  readonly costUsd: number;
  readonly termination: string;
}

export interface ExperimentResult {
  readonly experimentId: string;
  readonly runs: readonly TrialResult[];
  readonly byModel: Map<string, readonly TrialResult[]>;
  readonly byTask: Map<string, readonly TrialResult[]>;
  readonly summary: ExperimentSummary;
}

export interface ExperimentSummary {
  readonly totalRuns: number;
  readonly completedRuns: number;
  readonly failedRuns: number;
  readonly overallSuccessRate: number;
  readonly totalCostUsd: number;
  readonly avgDurationMs: number;
  readonly avgTurns: number;
}

// ── Coordinator ──────────────────────────────────────

export class ExperimentCoordinator {
  private readonly db: HarnessDB;

  constructor(dbPath?: string) {
    this.db = new HarnessDB(dbPath ?? 'harnessfit.db');
  }

  /** Load tasks from a benchmarks directory. */
  async loadTasks(tasksDir: string): Promise<TaskDefinition[]> {
    const tasks: TaskDefinition[] = [];
    const glob = new Bun.Glob('*/task.json');
    const scanDir = tasksDir.endsWith('/') ? tasksDir : `${tasksDir}/`;

    for await (const match of glob.scan({ cwd: scanDir, absolute: true })) {
      const file = Bun.file(match);
      const raw = await file.json() as TaskDefinition;
      tasks.push(raw);
    }

    return tasks;
  }

  /** Execute a single trial. */
  async runTrial(
    model: ModelSpec,
    task: TaskDefinition,
    harness: HarnessConfig,
    trialNumber: number,
    repoPath: string,
  ): Promise<TrialResult> {
    const runLimits: Partial<RunLimits> = {
      maxTurns: DEFAULT_LIMITS.maxTurns,
      maxToolCalls: DEFAULT_LIMITS.maxToolCalls,
      maxWallTimeSeconds: DEFAULT_LIMITS.maxWallTimeSeconds,
      maxCostUsd: DEFAULT_LIMITS.maxCostUsd,
    };

    // Compile harness
    const compiled = compileHarness(harness, [], '');

    // Create tool registry
    const tools = createDefaultRegistry();

    // Create agent loop
    const agentConfig: AgentLoopConfig = {
      model: model.adapter,
      modelId: model.id as ModelId,
      tools,
      systemPrompt: compiled.systemPrompt,
      limits: runLimits,
    };

    const agentLoop = new AgentLoop(agentConfig);
    agentLoop.setToolDefinitions(compiled.toolDefinitions);

    // Build task prompt
    const taskPrompt = this.buildTaskPrompt(task);

    const taskContext: TaskContext = {
      taskId: task.id as TaskId,
      repoPath,
      taskDescription: taskPrompt,
      configHash: compiled.hash as ConfigHash,
      seed: trialNumber * 1000 + Date.now() % 1000,
      trialNumber,
    };

    // Execute
    const runResult = await agentLoop.execute(taskContext);

    // Persist to DB
    this.db.saveRun(runResult, `exp-${Date.now()}`);

    // Evaluate
    const evalInput: ScoringInput = {
      functionalTests: runResult.termination === 'completed'
        ? { passed: runResult.toolCalls > 0 ? 1 : 0, total: 1, failures: runResult.toolCalls > 0 ? [] : ['no_tool_calls'] }
        : { passed: 0, total: 1, failures: [runResult.termination] },
      regression: {
        typecheckPassed: false,
        lintPassed: false,
        existingTests: { passed: 0, total: 0, failures: [] },
      },
      constraints: {
        violations: runResult.termination !== 'completed' ? ['non_completion'] : [],
      },
      patchQuality: {
        lineCount: (runResult.patch ?? '').split('\n').length,
        newDuplicationDetected: false,
        newLintViolations: 0,
      },
    };
    const score = computeScore(evalInput).total;

    return {
      runId: runResult.runId,
      modelId: model.id,
      taskId: task.id,
      trialNumber,
      success: runResult.termination === 'completed',
      score,
      durationMs: runResult.durationMs,
      turns: runResult.turns,
      toolCalls: runResult.toolCalls,
      costUsd: runResult.costUsd,
      termination: runResult.termination,
    };
  }

  /** Run a full experiment: all models × all tasks × N trials. */
  async run(spec: ExperimentSpec): Promise<ExperimentResult> {
    const allResults: TrialResult[] = [];

    for (const model of spec.models) {
      for (const task of spec.tasks) {
        for (let trial = 0; trial < spec.trials; trial++) {
          const repoPath = `sandboxes/${task.repository}-${trial}-${Date.now()}`;
          // Create sandbox directory
          await Bun.$`mkdir -p ${repoPath}`.quiet();
          // Copy benchmark repo
          const benchRepo = `benchmarks/repositories/${task.repository}`;
          await Bun.$`cp -r ${benchRepo}/* ${repoPath}/`.quiet();

          try {
            const result = await this.runTrial(model, task, spec.harness, trial, repoPath);
            allResults.push(result);
            console.log(`  [${model.id}/${task.id}/t${trial}] ${result.termination} (${result.score.toFixed(2)})`);
          } catch (err) {
            console.error(`  [${model.id}/${task.id}/t${trial}] ERROR: ${err instanceof Error ? err.message : String(err)}`);
          } finally {
            // Cleanup sandbox
            await Bun.$`rm -rf ${repoPath}`.quiet();
          }
        }
      }
    }

    const byModel = new Map<string, TrialResult[]>();
    const byTask = new Map<string, TrialResult[]>();
    for (const r of allResults) {
      const ml = byModel.get(r.modelId) ?? [];
      ml.push(r);
      byModel.set(r.modelId, ml);

      const tl = byTask.get(r.taskId) ?? [];
      tl.push(r);
      byTask.set(r.taskId, tl);
    }

    const completed = allResults.filter(r => r.success).length;
    const summary: ExperimentSummary = {
      totalRuns: allResults.length,
      completedRuns: completed,
      failedRuns: allResults.length - completed,
      overallSuccessRate: allResults.length > 0 ? completed / allResults.length : 0,
      totalCostUsd: allResults.reduce((sum, r) => sum + r.costUsd, 0),
      avgDurationMs: allResults.length > 0
        ? allResults.reduce((sum, r) => sum + r.durationMs, 0) / allResults.length
        : 0,
      avgTurns: allResults.length > 0
        ? allResults.reduce((sum, r) => sum + r.turns, 0) / allResults.length
        : 0,
    };

    return {
      experimentId: spec.id,
      runs: allResults,
      byModel,
      byTask,
      summary,
    };
  }

  /** Build a task prompt from a task definition. */
  private buildTaskPrompt(task: TaskDefinition): string {
    return `# Task: ${task.title}

${task.description}

## Repository
You are working in a TypeScript/Bun project at the current working directory.

## Instructions
1. Understand the codebase by reading relevant files
2. Identify the root cause of the issue
3. Implement a fix
4. Verify your fix compiles and existing tests pass
5. Use \`finish\` when done

## Constraints
- Do not modify test files
- Do not add new dependencies
- Keep changes minimal`;
  }

  close(): void {
    this.db.close();
  }
}
