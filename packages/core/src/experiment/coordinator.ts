/**
 * Experiment coordinator — orchestrates the full pipeline:
 * Task loading → Sandbox setup → Agent loop execution → Storage → Evaluation
 *
 * SPEC.md §9, §18, §25
 */

import type { ModelProvider } from '@harnessfit/core';
import type { HarnessConfig } from '@harnessfit/harness';
import { AgentLoop, createDefaultRegistry, getToolDefinitions } from '@harnessfit/core';
import type { AgentLoopConfig, TaskContext } from '@harnessfit/core';
import { compileHarness } from '@harnessfit/harness';
import { HarnessDB } from '@harnessfit/storage';
import { computeScore } from '@harnessfit/evaluator';
import type { ScoringInput, TestSuiteResult } from '@harnessfit/evaluator';
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
      const raw = (await file.json()) as TaskDefinition;
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
    experimentId: string,
    experimentLimits?: Partial<RunLimits>,
  ): Promise<TrialResult> {
    const runLimits: Partial<RunLimits> = {
      maxTurns: DEFAULT_LIMITS.maxTurns,
      maxToolCalls: DEFAULT_LIMITS.maxToolCalls,
      maxWallTimeSeconds: DEFAULT_LIMITS.maxWallTimeSeconds,
      maxCostUsd: DEFAULT_LIMITS.maxCostUsd,
      ...experimentLimits,
    };

    // Compile harness
    const compiled = compileHarness(harness, getToolDefinitions(), '');

    // Create tool registry
    const tools = createDefaultRegistry();

    // Create agent loop
    const agentConfig: AgentLoopConfig = {
      model: model.adapter,
      modelId: model.id as ModelId,
      modelName: model.model,
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
      seed: trialNumber * 1000 + (Date.now() % 1000),
      trialNumber,
    };

    // Execute
    const runResult = await agentLoop.execute(taskContext);

    // Log provider errors with detail
    if (runResult.termination === 'provider_error') {
      const lastError = runResult.events?.find(
        (e) => e.type === 'limit.reached' && e.data?.limit === 'provider_error'
      );
      console.error(`  [provider_error detail] ${lastError?.data?.error ?? 'unknown error'}`);
    }

    // Persist to DB
    this.db.saveRun(runResult, experimentId);

    // Evaluate — run hidden tests, existing tests, typecheck against the sandbox
    const evalInput = await this.evaluateRun(runResult, task, repoPath);
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
    // Create experiment record
    this.db.saveExperiment(spec.id, JSON.stringify(spec));

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
          // Init git for patch tracking (SPEC.md §4: clean commit per trial)
          await Bun.$`git -C ${repoPath} init`.quiet();
          await Bun.$`git -C ${repoPath} add -A`.quiet();
          await Bun.$`git -C ${repoPath} commit -m init --allow-empty`.quiet();
          // Install deps so typecheck + tests work
          await Bun.$`bun install --cwd ${repoPath}`.quiet();

          try {
            const result = await this.runTrial(model, task, spec.harness, trial, repoPath, spec.id, spec.limits);
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

  /** Run real evaluation against a sandbox after agent execution. */
  private async evaluateRun(
    runResult: { readonly termination: string; readonly toolCalls: number },
    task: TaskDefinition,
    repoPath: string,
  ): Promise<ScoringInput> {
    // If the run didn't complete, return zero-score input
    if (runResult.termination !== 'completed') {
      return {
        functionalTests: { passed: 0, total: 1, failures: [runResult.termination] },
        regression: { typecheckPassed: false, lintPassed: false, existingTests: { passed: 0, total: 0, failures: [] } },
        constraints: { violations: ['non_completion'] },
        patchQuality: { lineCount: 0, newDuplicationDetected: false, newLintViolations: 0 },
      };
    }

    // ── 1. Run hidden acceptance tests ──
    const functionalTests = await this.runHiddenTests(task.id, repoPath);

    // ── 2. Run existing tests (regression) ──
    const existingTests = await this.runExistingTests(repoPath);

    // ── 3. Typecheck ──
    const typecheckPassed = await this.runTypecheck(repoPath);

    // ── 4. Git diff for patch metrics ──
    const patchQuality = await this.computePatchMetrics(repoPath);

    // ── 5. Constraint violations ──
    const constraintViolations = await this.checkConstraints(repoPath);

    return {
      functionalTests,
      regression: {
        typecheckPassed,
        lintPassed: false, // No lint tool in sandbox
        existingTests,
      },
      constraints: { violations: constraintViolations },
      patchQuality,
    };
  }

  /** Copy hidden test to sandbox, rewrite imports, run bun test. */
  private async runHiddenTests(taskId: string, repoPath: string): Promise<TestSuiteResult> {
    const hiddenDir = `benchmarks/hidden-tests/${taskId}`;
    const glob = new Bun.Glob('*.test.ts');

    let totalPassed = 0;
    let totalTests = 0;
    const failures: string[] = [];

    for await (const testFile of glob.scan({ cwd: hiddenDir, absolute: false })) {
      const srcPath = `${hiddenDir}/${testFile}`;
      let content = await Bun.file(srcPath).text();

      // Rewrite imports: ../../repositories/task-service/src/ → ./src/
      content = content.replace(
        /(['"])\.\.\/\.\.\/repositories\/[^/]+\/src\//g,
        '$1./src/',
      );

      // Write to sandbox
      const sandboxPath = `${repoPath}/.hidden-${testFile}`;
      await Bun.write(sandboxPath, content);

      // Run the test
      try {
        const proc = Bun.spawnSync(['bun', 'test', sandboxPath, '--reporter', 'json'], {
          cwd: repoPath,
          stdout: 'pipe',
          stderr: 'pipe',
        });

        const out = proc.stdout.toString();
        try {
          const parsed = JSON.parse(out);
          if (typeof parsed.pass === 'number' && typeof parsed.fail === 'number') {
            totalPassed += parsed.pass;
            totalTests += parsed.pass + parsed.fail;
            if (parsed.fail > 0) failures.push(`${testFile}: ${parsed.fail} failures`);
          } else {
            failures.push(`${testFile}: unparseable output`);
          }
        } catch {
          failures.push(`${testFile}: parse error - ${out.slice(0, 100)}`);
        }
      } catch (err) {
        failures.push(`${testFile}: ${err instanceof Error ? err.message : String(err)}`);
      }

      // Clean up temp test file
      try { await Bun.file(sandboxPath).delete(); } catch { /* ok */ }
    }

    return { passed: totalPassed, total: totalTests, failures };
  }

  /** Run the sandbox's own test suite for regression detection. */
  private async runExistingTests(repoPath: string): Promise<TestSuiteResult> {
    try {
      const proc = Bun.spawnSync(['bun', 'test', '--reporter', 'json'], {
        cwd: repoPath,
        stdout: 'pipe',
        stderr: 'pipe',
        timeout: 60_000,
      });

      const out = proc.stdout.toString();
      try {
        const parsed = JSON.parse(out);
        if (typeof parsed.pass === 'number' && typeof parsed.fail === 'number') {
          return {
            passed: parsed.pass,
            total: parsed.pass + parsed.fail,
            failures: parsed.fail > 0 ? [`${parsed.fail} existing tests failed`] : [],
          };
        }
      } catch { /* fall through */ }
      return { passed: 0, total: 0, failures: ['could not parse test output'] };
    } catch {
      return { passed: 0, total: 0, failures: ['test runner crashed'] };
    }
  }

  /** Run typecheck in the sandbox. */
  private async runTypecheck(repoPath: string): Promise<boolean> {
    try {
      const proc = Bun.spawnSync(['bun', 'run', 'typecheck'], {
        cwd: repoPath,
        stdout: 'pipe',
        stderr: 'pipe',
        timeout: 30_000,
      });
      return proc.exitCode === 0;
    } catch {
      return false;
    }
  }

  /** Compute patch quality from git diff. */
  private async computePatchMetrics(repoPath: string): Promise<{
    readonly lineCount: number;
    readonly newDuplicationDetected: boolean;
    readonly newLintViolations: number;
  }> {
    try {
      const proc = Bun.spawnSync(['git', 'diff', '--stat'], {
        cwd: repoPath,
        stdout: 'pipe',
        stderr: 'pipe',
      });
      const out = proc.stdout.toString();
      // Parse "X files changed, Y insertions(+), Z deletions(-)"
      const match = out.match(/(\d+)\s+insertions?/);
      const insertions = match?.[1] ? Number.parseInt(match[1]) : 0;
      const delMatch = out.match(/(\d+)\s+deletions?/);
      const deletions = delMatch?.[1] ? Number.parseInt(delMatch[1]) : 0;

      return {
        lineCount: insertions + deletions,
        newDuplicationDetected: false,
        newLintViolations: 0,
      };
    } catch {
      return { lineCount: 0, newDuplicationDetected: false, newLintViolations: 0 };
    }
  }

  /** Check for constraint violations in the sandbox. */
  private async checkConstraints(repoPath: string): Promise<string[]> {
    const violations: string[] = [];
    try {
      const proc = Bun.spawnSync(['git', 'diff', '--name-only'], {
        cwd: repoPath,
        stdout: 'pipe',
        stderr: 'pipe',
      });

      const changedFiles = proc.stdout.toString().trim().split('\n').filter(Boolean);
      const testFilesModified = changedFiles.filter((f: string) => f.includes('.test.'));
      if (testFilesModified.length > 0) {
        violations.push(`modified_test_files: ${testFilesModified.join(', ')}`);
      }

      // Check for 'any' type usage in changed files
      for (const file of changedFiles) {
        if (file.endsWith('.ts') || file.endsWith('.tsx')) {
          try {
            const content = await Bun.file(`${repoPath}/${file}`).text();
            if (content.includes(': any') || content.includes('<any>') || content.includes('as any')) {
              violations.push(`any_type_in: ${file}`);
              break; // One violation is enough
            }
          } catch { /* file may not exist */ }
        }
      }
    } catch { /* ok */ }

    return violations;
  }

  close(): void {
    this.db.close();
  }
}
