/**
 * HarnessFit CLI entry point.
 *
 * Commands: init, providers, baseline, optimize, evaluate, transfer, report, inspect.
 */
import { ExperimentCoordinator } from '@harnessfit/core';
import type { ModelSpec } from '@harnessfit/core';
import { GENERIC_HARNESS } from '@harnessfit/harness';
import { HarnessDB } from '@harnessfit/storage';
import { createProvider } from './factory';
import { parseExperimentConfig } from './parser';

const USAGE = `
HarnessFit — Automatic Discovery of Model-Specific Agent Harness Profiles

Commands:
  init [--force]        Initialize an experiment workspace
  providers check       Validate provider API credentials
  baseline              Run baseline experiment
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
    model: gemini-2.5-flash
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
  const experimentPath =
    args.find((a) => a.startsWith('--experiment='))?.split('=')[1] ??
    'experiments/definitions/default.yaml';
  const requestedSplit = args.find((arg) => arg.startsWith('--split='))?.split('=')[1];

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
  console.log(`  Experiment: ${expConfig.id}`);
  console.log(`  Models: ${expConfig.models.map((m) => m.id).join(', ')}`);
  console.log(`  Trials per model×task: ${expConfig.trials.search}`);

  // 2. Create provider adapters
  console.log('\nInitializing providers...');
  const missingCredentials = expConfig.models
    .map((model) => providerCredential(model.provider))
    .filter((credential): credential is string => !Bun.env[credential]);
  if (missingCredentials.length > 0) {
    console.error(`Missing provider credentials: ${[...new Set(missingCredentials)].join(', ')}`);
    console.error('Set credentials and run: bun harnessfit providers check');
    process.exit(1);
  }

  const models: ModelSpec[] = [];
  for (const m of expConfig.models) {
    const adapter = createProvider(m);
    models.push({
      id: m.id,
      provider: m.provider,
      model: m.model,
      adapter,
    });
    console.log(`  ${m.id}: ${m.provider}/${m.model} ✓`);
  }

  // 3. Load tasks
  const tasksDir = 'benchmarks/tasks';
  const split = requestedSplit ?? expConfig.benchmark.trainingSplit;
  console.log(`\nLoading ${split} tasks from ${tasksDir}/...`);
  const coordinator = new ExperimentCoordinator();
  const tasks = await coordinator.loadTasks(tasksDir, split);
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
    trials: expConfig.trials.search,
    harness: GENERIC_HARNESS,
    limits: {
      maxTurns: expConfig.limits.maxTurns,
      maxToolCalls: expConfig.limits.maxToolCalls,
      maxWallTimeSeconds: expConfig.limits.maxWallTimeSeconds,
      maxOutputTokens: expConfig.limits.maxOutputTokens,
      maxCostUsd: expConfig.limits.maxCostUsdPerRun,
    },
  };

  // 5. Run
  console.log('\nRunning baseline experiment...');
  console.log(
    `  ${models.length} models × ${tasks.length} tasks × ${expConfig.trials.search} trials = ${models.length * tasks.length * expConfig.trials.search} runs\n`,
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
  const outputPath = `experiments/results/${expConfig.id}-${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
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
  const config = args.find((a) => a.startsWith('--config='))?.split('=')[1];
  console.log(`Evaluating config: ${config || 'default'}`);
  console.log('(Held-out evaluation coming in v0.2.0)');
}

async function cmdTransfer(_args: string[]): Promise<void> {
  console.log('Transfer matrix generation coming in v0.2.0');
}

async function cmdReport(_args: string[]): Promise<void> {
  console.log('Report generation coming in v0.2.0');
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
