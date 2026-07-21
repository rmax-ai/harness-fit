/**
 * HarnessFit CLI entry point.
 *
 * Commands: init, providers, baseline, optimize, evaluate, transfer, report, inspect.
 */
import { ExperimentCoordinator } from '@harnessfit/core';
import type { ModelSpec } from '@harnessfit/core';
import { GENERIC_HARNESS, parseConfig } from '@harnessfit/harness';
import type { HarnessConfig } from '@harnessfit/harness';
import { HarnessDB } from '@harnessfit/storage';
import { createProvider } from './factory';
import { parseExperimentConfig } from './parser';

const USAGE = `
HarnessFit — Automatic Discovery of Model-Specific Agent Harness Profiles

Commands:
  init [--force]        Initialize an experiment workspace
  providers check       Validate provider API credentials
  baseline              Run baseline experiment [--model=<id> --task=<id> --trials=<n>]
  optimize              Run hill-climbing optimization
  evaluate              Evaluate held-out tasks
  transfer              Generate cross-model transfer matrix
  report                Generate experiment report
  inspect <run-id>      Inspect a single run
  help                  Show this help
`;

async function main(): Promise<void> {
  const args = Bun.argv.slice(2);
  const command = args[0];

  switch (command) {
    case 'init': {
      await cmdInit(args.slice(1));
      break;
    }
    case 'providers':
      if (args[1] === 'check') {
        await cmdProvidersCheck();
      } else {
        console.log('Usage: harnessfit providers check');
      }
      break;
    case 'baseline':
      await cmdBaseline(args.slice(1));
      break;
    case 'optimize':
      await cmdOptimize(args.slice(1));
      break;
    case 'evaluate':
      await cmdEvaluate(args.slice(1));
      break;
    case 'transfer':
      await cmdTransfer(args.slice(1));
      break;
    case 'report':
      await cmdReport(args.slice(1));
      break;
    case 'inspect':
      await cmdInspect(args[1]);
      break;
    default:
      console.log(USAGE);
      break;
  }
}

async function cmdInit(args: readonly string[]): Promise<void> {
  const experimentsDir = 'experiments';
  const definitionsDir = `${experimentsDir}/definitions`;
  const resultsDir = `${experimentsDir}/results`;

  await Bun.$`mkdir -p ${definitionsDir} ${resultsDir}`.quiet();

  const defaultConfig = `id: harness-fit-v1

models:
  - id: gemini-flash
    provider: google
    model: gemini-3.5-flash
  - id: gpt-luna
    provider: openai
    model: gpt-5.6-luna
  - id: claude-haiku
    provider: anthropic
    model: claude-haiku-4-5

benchmark:
  trainingSplit: train
  developmentSplit: dev
  testSplit: test

trials:
  search: 3
  finalists: 5
  headline: 10

optimizer:
  algorithm: coordinate-hill-climbing
  randomRestarts: 3
  maximumCandidatesPerModel: 120
  minimumSuccessImprovement: 0.03

limits:
  maxTurns: 24
  maxToolCalls: 40
  maxWallTimeSeconds: 600
  maxOutputTokens: 32000
  maxCostUsdPerRun: 5

objective:
  successWeight: 1.0
  costWeight: 0.10
  latencyWeight: 0.05
  varianceWeight: 0.10

reporting:
  transferMatrix: true
  ablations: true
  paretoFrontiers: true
  confidenceIntervals: true
`;

  const configPath = `${definitionsDir}/default.yaml`;
  const configFile = Bun.file(configPath);
  const force = args.includes('--force');
  const configExists = await configFile.exists();

  if (!configExists || force) {
    await Bun.write(configPath, defaultConfig);
  }

  const gitkeep = Bun.file(`${resultsDir}/.gitkeep`);
  if (!(await gitkeep.exists())) {
    await Bun.write(`${resultsDir}/.gitkeep`, '');
  }

  console.log('✓ Initialized HarnessFit experiment directory');
  if (configExists && !force) {
    console.log(`  Config: ${configPath} (preserved; use --force to overwrite)`);
  } else {
    console.log(`  Config: ${configPath}`);
  }
  console.log(`  Results: ${resultsDir}/`);
  console.log('');
  console.log('Next steps:');
  console.log('  1. Set provider API keys (OPENAI_API_KEY, etc.)');
  console.log('  2. Run: bun harnessfit providers check');
  console.log('  3. Run: bun harnessfit baseline');
}

async function cmdProvidersCheck(): Promise<void> {
  const checks = [
    { name: 'OPENAI_API_KEY', env: Bun.env.OPENAI_API_KEY },
    { name: 'ANTHROPIC_API_KEY', env: Bun.env.ANTHROPIC_API_KEY },
    { name: 'GOOGLE_API_KEY', env: Bun.env.GOOGLE_API_KEY },
  ];

  let configured = 0;
  for (const check of checks) {
    const status = check.env ? '✓ configured' : '✗ missing';
    if (check.env) configured++;
    console.log(`  ${check.name}: ${status}`);
  }
  console.log(`\n  ${configured}/${checks.length} providers configured`);
}

async function cmdBaseline(args: string[]): Promise<void> {
  await cmdRunExperiment(args, {
    commandName: 'baseline',
    defaultSplit: 'trainingSplit',
    trials: 'search',
    harness: GENERIC_HARNESS,
  });
}

interface ExperimentRunOptions {
  readonly commandName: 'baseline' | 'evaluate';
  readonly defaultSplit: 'trainingSplit' | 'developmentSplit' | 'testSplit';
  readonly trials: 'search' | 'finalists' | 'headline';
  readonly harness: HarnessConfig;
}

async function cmdRunExperiment(
  args: readonly string[],
  options: ExperimentRunOptions,
): Promise<void> {
  const experimentPath =
    args.find((a) => a.startsWith('--experiment='))?.split('=')[1] ??
    'experiments/definitions/default.yaml';
  const requestedSplit = args.find((arg) => arg.startsWith('--split='))?.split('=')[1];
  const requestedModel = args.find((arg) => arg.startsWith('--model='))?.split('=')[1];
  const requestedTask = args.find((arg) => arg.startsWith('--task='))?.split('=')[1];
  const requestedTrials = args.find((arg) => arg.startsWith('--trials='))?.split('=')[1];

  // 1. Load config
  console.log(`Loading experiment: ${experimentPath}`);
  const file = Bun.file(experimentPath);
  if (!(await file.exists())) {
    console.error(`Config not found: ${experimentPath}`);
    console.error('Run: bun harnessfit init');
    process.exit(1);
  }

  const raw = await file.text();
  const expConfig = parseExperimentConfig(raw);
  const selectedModels = selectModels(expConfig.models, requestedModel);
  const trials = parseTrialCount(requestedTrials, expConfig.trials[options.trials]);
  console.log(`  Experiment: ${expConfig.id}`);
  console.log(`  Models: ${selectedModels.map((m) => m.id).join(', ')}`);
  console.log(`  Trials per model×task: ${trials}`);

  // 2. Create provider adapters
  console.log('\nInitializing providers...');
  const missingCredentials = selectedModels
    .map((model) => providerCredential(model.provider))
    .filter((credential): credential is string => !Bun.env[credential]);
  if (missingCredentials.length > 0) {
    console.error(`Missing provider credentials: ${[...new Set(missingCredentials)].join(', ')}`);
    console.error('Set credentials and run: bun harnessfit providers check');
    process.exit(1);
  }

  const models: ModelSpec[] = [];
  for (const m of selectedModels) {
    const providerModel = resolveProviderModel(m);
    const adapter = createProvider({ ...m, model: providerModel });
    models.push({
      id: m.id,
      provider: m.provider,
      model: providerModel,
      adapter,
    });
    console.log(`  ${m.id}: ${m.provider}/${providerModel} ✓`);
  }

  // 3. Load tasks
  const tasksDir = 'benchmarks/tasks';
  const split = requestedSplit ?? expConfig.benchmark[options.defaultSplit];
  console.log(`\nLoading ${split} tasks from ${tasksDir}/...`);
  const coordinator = new ExperimentCoordinator();
  const loadedTasks = await coordinator.loadTasks(tasksDir, split);
  const tasks = selectTasks(loadedTasks, requestedTask);
  if (tasks.length === 0) {
    console.error('  No tasks found. Create task definitions in benchmarks/tasks/');
    coordinator.close();
    process.exit(1);
  }
  console.log(`  Found ${tasks.length} task(s):`);
  for (const t of tasks) {
    console.log(`    [${t.id}] ${t.title} (${t.difficulty})`);
  }

  // 4. Build experiment spec
  const spec = {
    id: expConfig.id,
    models,
    tasks,
    trials,
    harness: options.harness,
    limits: {
      maxTurns: expConfig.limits.maxTurns,
      maxToolCalls: expConfig.limits.maxToolCalls,
      maxWallTimeSeconds: expConfig.limits.maxWallTimeSeconds,
      maxOutputTokens: expConfig.limits.maxOutputTokens,
      maxCostUsd: expConfig.limits.maxCostUsdPerRun,
    },
  };

  // 5. Run
  console.log(`\nRunning ${options.commandName} experiment...`);
  console.log(
    `  ${models.length} models × ${tasks.length} tasks × ${trials} trials = ${models.length * tasks.length * trials} runs\n`,
  );

  const startTime = Date.now();
  const result = await coordinator.run(spec);
  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);

  // 6. Output summary
  console.log(`\n${'='.repeat(60)}`);
  console.log(`Experiment: ${result.experimentId}`);
  console.log(`Duration: ${elapsed}s`);
  console.log(`${'='.repeat(60)}`);
  console.log(`Total runs:     ${result.summary.totalRuns}`);
  console.log(`Completed:      ${result.summary.completedRuns}`);
  console.log(`Failed:         ${result.summary.failedRuns}`);
  console.log(`Success rate:   ${(result.summary.overallSuccessRate * 100).toFixed(1)}%`);
  console.log(`Total cost:     $${result.summary.totalCostUsd.toFixed(4)}`);
  console.log(`Avg duration:   ${result.summary.avgDurationMs.toFixed(0)}ms`);
  console.log(`Avg turns:      ${result.summary.avgTurns.toFixed(1)}`);
  console.log(`${'='.repeat(60)}`);

  // Per-model breakdown
  console.log('\nPer-model results:');
  console.log('Model           | Runs | Success | Score  | Cost');
  console.log('----------------|------|---------|--------|-------');
  for (const [modelId, runs] of result.byModel) {
    const success = runs.filter((r) => r.success).length;
    const avgScore = runs.length > 0 ? runs.reduce((s, r) => s + r.score, 0) / runs.length : 0;
    const cost = runs.reduce((s, r) => s + r.costUsd, 0);
    console.log(
      `${modelId.padEnd(15)} | ${String(runs.length).padStart(4)} | ${String(success).padStart(7)} | ${avgScore.toFixed(2).padStart(6)} | $${cost.toFixed(4)}`,
    );
  }

  // Save results
  const outputPath = `experiments/results/${expConfig.id}-${options.commandName}-${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
  await Bun.write(outputPath, JSON.stringify(result, replacer, 2));
  console.log(`\nResults saved: ${outputPath}`);

  coordinator.close();
}

/** JSON.stringify replacer that handles Map and readonly types. */
function replacer(_key: string, value: unknown): unknown {
  if (value instanceof Map) {
    return Object.fromEntries(value);
  }
  return value;
}

function providerCredential(provider: ModelSpec['provider']): string {
  switch (provider) {
    case 'openai':
      return 'OPENAI_API_KEY';
    case 'anthropic':
      return 'ANTHROPIC_API_KEY';
    case 'google':
      return 'GOOGLE_API_KEY';
  }
}

function resolveProviderModel(model: {
  readonly provider: ModelSpec['provider'];
  readonly model: string;
}): string {
  const override =
    model.provider === 'openai'
      ? Bun.env.HARNESSFIT_OPENAI_MODEL
      : model.provider === 'anthropic'
        ? Bun.env.HARNESSFIT_ANTHROPIC_MODEL
        : Bun.env.HARNESSFIT_GOOGLE_MODEL;
  return override || model.model;
}

function selectModels<T extends { readonly id: string }>(
  models: readonly T[],
  requestedModel: string | undefined,
): readonly T[] {
  if (!requestedModel) return models;
  const model = models.find((candidate) => candidate.id === requestedModel);
  if (!model) {
    throw new Error(
      `Unknown model '${requestedModel}'. Available: ${models.map((candidate) => candidate.id).join(', ')}`,
    );
  }
  return [model];
}

function selectTasks<T extends { readonly id: string }>(
  tasks: readonly T[],
  requestedTask: string | undefined,
): readonly T[] {
  if (!requestedTask) return tasks;
  const task = tasks.find((candidate) => candidate.id === requestedTask);
  if (!task) {
    throw new Error(
      `Unknown task '${requestedTask}'. Available: ${tasks.map((candidate) => candidate.id).join(', ')}`,
    );
  }
  return [task];
}

function parseTrialCount(value: string | undefined, fallback: number): number {
  if (value === undefined) return fallback;
  if (!/^\d+$/.test(value) || Number.parseInt(value, 10) < 1) {
    throw new Error(`--trials must be a positive integer; received '${value}'`);
  }
  return Number.parseInt(value, 10);
}

async function cmdOptimize(args: string[]): Promise<void> {
  const model = args.find((a) => a.startsWith('--model='))?.split('=')[1];
  const search = args.find((a) => a.startsWith('--search='))?.split('=')[1];
  const budget = Number.parseInt(
    args.find((a) => a.startsWith('--budget='))?.split('=')[1] || '120',
  );

  console.log(`Optimizing model: ${model || 'default'}`);
  console.log(`  Search: ${search || 'hill-climb'}, Budget: ${budget} candidates`);
  console.log('(Full optimizer integration coming in v0.2.0)');
}

async function cmdEvaluate(args: string[]): Promise<void> {
  const configPath = args.find((arg) => arg.startsWith('--config='))?.split('=')[1];
  if (!configPath) {
    console.log(
      'Usage: harnessfit evaluate --config=<harness.json> [--experiment=<definition.yaml>] [--split=test]',
    );
    return;
  }

  const file = Bun.file(configPath);
  if (!(await file.exists())) {
    console.error(`Harness config not found: ${configPath}`);
    process.exit(1);
  }
  const harness = parseConfig(await file.text());
  if (!harness) {
    console.error(`Harness config is not a valid HarnessConfig JSON document: ${configPath}`);
    process.exit(1);
  }

  await cmdRunExperiment(args, {
    commandName: 'evaluate',
    defaultSplit: 'testSplit',
    trials: 'headline',
    harness,
  });
}

async function cmdTransfer(_args: string[]): Promise<void> {
  console.log('Transfer matrix generation coming in v0.2.0');
}

async function cmdReport(_args: string[]): Promise<void> {
  const experimentId = _args.find((arg) => arg.startsWith('--experiment='))?.split('=')[1];
  const dbPath = _args.find((arg) => arg.startsWith('--db='))?.split('=')[1] ?? 'harnessfit.db';
  const outputPath = _args.find((arg) => arg.startsWith('--output='))?.split('=')[1];

  if (!experimentId) {
    console.log(
      'Usage: harnessfit report --experiment=<id> [--db=harnessfit.db] [--output=report.json]',
    );
    return;
  }

  const db = new HarnessDB(dbPath);
  const runs = db.getExperimentEvaluations(experimentId);
  db.close();

  if (runs.length === 0) {
    console.error(`No persisted runs found for experiment: ${experimentId}`);
    process.exit(1);
  }

  const byModel = new Map<string, Array<(typeof runs)[number]>>();
  for (const run of runs) {
    const modelRuns = byModel.get(run.modelId) ?? [];
    modelRuns.push(run);
    byModel.set(run.modelId, modelRuns);
  }
  const summarize = (items: readonly (typeof runs)[number][]) => {
    const evaluated = items.filter((run) => run.evaluation !== null);
    const successes = evaluated.filter((run) => run.evaluation?.success).length;
    return {
      runs: items.length,
      evaluatedRuns: evaluated.length,
      successfulRuns: successes,
      successRate: evaluated.length === 0 ? 0 : successes / evaluated.length,
      averageScore:
        evaluated.length === 0
          ? 0
          : evaluated.reduce((sum, run) => sum + (run.evaluation?.total ?? 0), 0) /
            evaluated.length,
      totalCostUsd: items.reduce((sum, run) => sum + run.costUsd, 0),
      averageDurationMs:
        items.length === 0 ? 0 : items.reduce((sum, run) => sum + run.durationMs, 0) / items.length,
    };
  };
  const report = {
    experimentId,
    generatedAt: new Date().toISOString(),
    summary: summarize(runs),
    byModel: Object.fromEntries(
      [...byModel.entries()].map(([modelId, modelRuns]) => [modelId, summarize(modelRuns)]),
    ),
    runs,
  };

  console.log(`Experiment: ${experimentId}`);
  console.log('Model           | Runs | Success | Score  | Cost');
  console.log('----------------|------|---------|--------|-------');
  for (const [modelId, modelRuns] of byModel) {
    const summary = summarize(modelRuns);
    console.log(
      `${modelId.padEnd(15)} | ${String(summary.runs).padStart(4)} | ${(summary.successRate * 100).toFixed(1).padStart(6)}% | ${summary.averageScore.toFixed(2).padStart(6)} | $${summary.totalCostUsd.toFixed(4)}`,
    );
  }

  if (outputPath) {
    await Bun.write(outputPath, JSON.stringify(report, replacer, 2));
    console.log(`Report saved: ${outputPath}`);
  }
}

async function cmdInspect(runId: string | undefined): Promise<void> {
  if (!runId) {
    console.log('Usage: harnessfit inspect <run-id>');
    return;
  }
  const db = new HarnessDB('harnessfit.db');
  const run = db.getRun(runId);
  if (run) {
    console.log(JSON.stringify(run, replacer, 2));
  } else {
    console.log(`Run not found: ${runId}`);
  }
  db.close();
}

main().catch((err) => {
  console.error('Fatal error:', err instanceof Error ? err.message : String(err));
  process.exit(1);
});
