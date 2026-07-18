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
    case 'init':
      console.log('Initialized HarnessFit workspace.');
      break;

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

async function cmdTransfer(args: string[]): Promise<void> {
  console.log('Generating transfer matrix...');
}

async function cmdReport(args: string[]): Promise<void> {
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
