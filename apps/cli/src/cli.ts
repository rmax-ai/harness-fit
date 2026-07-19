/**
 * HarnessFit CLI entry point.
 *
 * Commands: init, providers, baseline, optimize, evaluate, transfer, report, inspect.
 */
import { HarnessDB } from '@harnessfit/storage';

const USAGE = `
HarnessFit — Automatic Discovery of Model-Specific Agent Harness Profiles

Commands:
  init                  Initialize a new experiment workspace
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
      await cmdInit();
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

    case 'help':
    default:
      console.log(USAGE);
      break;
  }
}

async function cmdInit(): Promise<void> {
  const experimentsDir = 'experiments';
  const definitionsDir = `${experimentsDir}/definitions`;
  const resultsDir = `${experimentsDir}/results`;

  await Bun.$`mkdir -p ${definitionsDir} ${resultsDir}`.quiet();

  // Write default experiment config
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
  await Bun.write(configPath, defaultConfig);

  // Ensure .gitkeep in results
  const gitkeep = Bun.file(`${resultsDir}/.gitkeep`);
  if (!(await gitkeep.exists())) {
    await Bun.write(`${resultsDir}/.gitkeep`, '');
  }

  console.log('✓ Initialized HarnessFit experiment directory');
  console.log(`  Config: ${configPath}`);
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

  for (const check of checks) {
    const status = check.env ? '✓ configured' : '✗ missing';
    console.log(`  ${check.name}: ${status}`);
  }
}

async function cmdBaseline(args: string[]): Promise<void> {
  const experiment = args.find((a) => a.startsWith('--experiment='))?.split('=')[1];
  console.log(`Running baseline experiment: ${experiment || 'default'}`);
  console.log('(Full implementation requires model provider keys and benchmark repo)');

  const db = new HarnessDB('harnessfit.db');
  console.log('  Database: initialized (WAL mode, SQLite)');
  db.close();
}

async function cmdOptimize(args: string[]): Promise<void> {
  const model = args.find((a) => a.startsWith('--model='))?.split('=')[1];
  const search = args.find((a) => a.startsWith('--search='))?.split('=')[1];
  const budget = parseInt(args.find((a) => a.startsWith('--budget='))?.split('=')[1] || '120');

  console.log(`Optimizing model: ${model || 'default'}`);
  console.log(`  Search: ${search || 'hill-climb'}, Budget: ${budget} candidates`);
  console.log('(Full implementation invokes hill-climbing optimizer against benchmark tasks)');
}

async function cmdEvaluate(args: string[]): Promise<void> {
  const config = args.find((a) => a.startsWith('--config='))?.split('=')[1];
  const split = args.find((a) => a.startsWith('--split='))?.split('=')[1];
  console.log(`Evaluating config ${config} on ${split} split`);
}

async function cmdTransfer(_args: string[]): Promise<void> {
  console.log('Generating transfer matrix...');
}

async function cmdReport(_args: string[]): Promise<void> {
  console.log('Generating report...');
}

async function cmdInspect(runId: string | undefined): Promise<void> {
  if (!runId) {
    console.log('Usage: harnessfit inspect <run-id>');
    return;
  }
  const db = new HarnessDB('harnessfit.db');
  const run = db.getRun(runId);
  if (run) {
    console.log(JSON.stringify(run, null, 2));
  } else {
    console.log(`Run not found: ${runId}`);
  }
  db.close();
}

main().catch(console.error);
