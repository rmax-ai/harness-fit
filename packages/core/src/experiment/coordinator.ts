/**
 * Experiment coordinator — orchestrates the full pipeline:
 * Task loading → Sandbox setup → Agent loop execution → Storage → Evaluation
 *
 * SPEC.md §9, §18, §25
 */

import type { ModelProvider } from '@harnessfit/core';
import { AgentLoop, createDefaultRegistry } from '@harnessfit/core';
import type { AgentLoopConfig, TaskContext } from '@harnessfit/core';
import type { ConfigHash, ModelId, RunLimits, TaskId } from '@harnessfit/core';
import { computeScore } from '@harnessfit/evaluator';
import type { ScoringInput } from '@harnessfit/evaluator';
import {
  createConstraintChecker,
  createPatchQualityAnalyzer,
  createRegressionChecker,
  createTestRunner,
} from '@harnessfit/evaluator';
import type { HarnessConfig } from '@harnessfit/harness';
import { compileHarness } from '@harnessfit/harness';
import { HarnessDB } from '@harnessfit/storage';

// ── Types ────────────────────────────────────────────

export interface TaskDefinition {
  readonly id: string;
  readonly category: string;
  readonly difficulty: string;
  readonly title: string;
  readonly description: string;
  readonly repository: string;
  readonly hiddenTestCommand?: string;
  readonly hiddenTestsPath: string;
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
  readonly limits?: Partial<RunLimits>;
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
      const raw = (await file.json()) as Omit<TaskDefinition, 'hiddenTestsPath'>;
      tasks.push({ ...raw, hiddenTestsPath: `benchmarks/hidden-tests/${raw.id}` });
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
    experimentId: string,
    limits?: Partial<RunLimits>,
  ): Promise<TrialResult> {
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
      limits,
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
      seed: trialNumber * 1000 + (Date.now() % 1000),
      trialNumber,
    };

    // Execute
    const runResult = await agentLoop.execute(taskContext);

    const patch = readGitOutput(repoPath, ['diff', '--no-ext-diff']);
    const changedFiles = readGitOutput(repoPath, ['diff', '--name-only'])
      .split('\n')
      .filter((path) => path.length > 0);
    const [hiddenTests, regression, checkedConstraints, patchQuality] = await Promise.all([
      createTestRunner().runHiddenTests(repoPath, task.hiddenTestsPath),
      createRegressionChecker().check(repoPath),
      createConstraintChecker().check(repoPath, patch, changedFiles),
      createPatchQualityAnalyzer().analyze(repoPath, patch),
    ]);

    const functionalTests =
      runResult.termination === 'completed'
        ? hiddenTests
        : { passed: 0, total: Math.max(hiddenTests.total, 1), failures: [runResult.termination] };
    const constraints = {
      violations:
        runResult.termination === 'completed'
          ? checkedConstraints.violations
          : [...checkedConstraints.violations, `run_not_completed:${runResult.termination}`],
    };
    const evalInput: ScoringInput = {
      functionalTests,
      regression,
      constraints,
      patchQuality,
    };
    const score = computeScore(evalInput).total;

    // Persist the complete execution trace before returning the score projection.
    this.db.saveRun({ ...runResult, patch }, experimentId);

    return {
      runId: runResult.runId,
      modelId: model.id,
      taskId: task.id,
      trialNumber,
      success:
        runResult.termination === 'completed' &&
        functionalTests.total > 0 &&
        functionalTests.passed === functionalTests.total &&
        constraints.violations.length === 0,
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
    // Create experiment record
    this.db.saveExperiment(spec.id, JSON.stringify(spec));

    const allResults: TrialResult[] = [];

    for (const model of spec.models) {
      for (const task of spec.tasks) {
        for (let trial = 0; trial < spec.trials; trial++) {
          const repoPath = `sandboxes/${task.repository}-${trial}-${Date.now()}`;
          this.prepareSandbox(task.repository, repoPath);

          try {
            const result = await this.runTrial(
              model,
              task,
              spec.harness,
              trial,
              repoPath,
              spec.id,
              spec.limits,
            );
            allResults.push(result);
            console.log(
              `  [${model.id}/${task.id}/t${trial}] ${result.termination} (${result.score.toFixed(2)})`,
            );
          } catch (err) {
            console.error(
              `  [${model.id}/${task.id}/t${trial}] ERROR: ${err instanceof Error ? err.message : String(err)}`,
            );
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

    const completed = allResults.filter((r) => r.success).length;
    const summary: ExperimentSummary = {
      totalRuns: allResults.length,
      completedRuns: completed,
      failedRuns: allResults.length - completed,
      overallSuccessRate: allResults.length > 0 ? completed / allResults.length : 0,
      totalCostUsd: allResults.reduce((sum, r) => sum + r.costUsd, 0),
      avgDurationMs:
        allResults.length > 0
          ? allResults.reduce((sum, r) => sum + r.durationMs, 0) / allResults.length
          : 0,
      avgTurns:
        allResults.length > 0
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

  private prepareSandbox(repository: string, repoPath: string): void {
    const sourcePath = `benchmarks/repositories/${repository}`;
    runCommand(['mkdir', '-p', repoPath]);
    runCommand(['cp', '-R', `${sourcePath}/.`, repoPath]);
    runCommand(['git', 'init', '-q'], repoPath);
    runCommand(['git', 'config', 'user.email', 'harnessfit@example.invalid'], repoPath);
    runCommand(['git', 'config', 'user.name', 'HarnessFit'], repoPath);
    runCommand(['git', 'add', '.'], repoPath);
    runCommand(['git', 'commit', '-qm', 'fixture baseline'], repoPath);
  }

  close(): void {
    this.db.close();
  }
}

function readGitOutput(repoPath: string, args: readonly string[]): string {
  const proc = Bun.spawnSync({
    cmd: ['git', ...args],
    cwd: repoPath,
    stdout: 'pipe',
    stderr: 'pipe',
  });
  return proc.exitCode === 0 ? proc.stdout.toString() : '';
}

function runCommand(command: readonly string[], cwd?: string): void {
  const proc = Bun.spawnSync({ cmd: [...command], cwd, stdout: 'pipe', stderr: 'pipe' });
  if (proc.exitCode !== 0) {
    throw new Error(`${command.join(' ')} failed: ${proc.stderr.toString()}`);
  }
}
