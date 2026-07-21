import { describe, expect, test } from 'bun:test';

const cliPath = `${import.meta.dir}/cli.ts`;

describe('harnessfit baseline', () => {
  test('fails before scheduling trials when a selected provider credential is missing', async () => {
    const workspace = (await Bun.$`mktemp -d`.text()).trim();
    const definitionPath = `${workspace}/experiment.yaml`;
    await Bun.write(
      definitionPath,
      `id: missing-credential
models:
  - id: openai
    provider: openai
    model: gpt-5
`,
    );

    const result = Bun.spawnSync({
      cmd: [process.execPath, cliPath, 'baseline', `--experiment=${definitionPath}`],
      cwd: workspace,
      env: { ...process.env, OPENAI_API_KEY: '' },
      stdout: 'pipe',
      stderr: 'pipe',
    });

    expect(result.exitCode).toBe(1);
    expect(result.stderr.toString()).toContain('Missing provider credentials: OPENAI_API_KEY');
    expect(await Bun.file(`${workspace}/harnessfit.db`).exists()).toBeFalse();
    expect(await Bun.file(`${workspace}/sandboxes`).exists()).toBeFalse();
  });

  test('rejects an unknown selected model before provider setup', async () => {
    const workspace = (await Bun.$`mktemp -d`.text()).trim();
    const definitionPath = `${workspace}/experiment.yaml`;
    await Bun.write(
      definitionPath,
      `id: model-selection
models:
  - id: openai
    provider: openai
    model: gpt-5
`,
    );

    const result = Bun.spawnSync({
      cmd: [
        process.execPath,
        cliPath,
        'baseline',
        `--experiment=${definitionPath}`,
        '--model=missing-model',
      ],
      cwd: workspace,
      env: { ...process.env, OPENAI_API_KEY: '' },
      stdout: 'pipe',
      stderr: 'pipe',
    });

    expect(result.exitCode).toBe(1);
    expect(result.stderr.toString()).toContain("Unknown model 'missing-model'. Available: openai");
    expect(await Bun.file(`${workspace}/harnessfit.db`).exists()).toBeFalse();
  });

  test('rejects a non-positive trial override before provider setup', async () => {
    const workspace = (await Bun.$`mktemp -d`.text()).trim();
    const definitionPath = `${workspace}/experiment.yaml`;
    await Bun.write(
      definitionPath,
      `id: trial-selection
models:
  - id: openai
    provider: openai
    model: gpt-5
`,
    );

    const result = Bun.spawnSync({
      cmd: [process.execPath, cliPath, 'baseline', `--experiment=${definitionPath}`, '--trials=0'],
      cwd: workspace,
      env: { ...process.env, OPENAI_API_KEY: '' },
      stdout: 'pipe',
      stderr: 'pipe',
    });

    expect(result.exitCode).toBe(1);
    expect(result.stderr.toString()).toContain("--trials must be a positive integer; received '0'");
    expect(await Bun.file(`${workspace}/harnessfit.db`).exists()).toBeFalse();
  });

  test('rejects an invalid held-out harness before provider setup', async () => {
    const workspace = (await Bun.$`mktemp -d`.text()).trim();
    const harnessPath = `${workspace}/invalid.json`;
    await Bun.write(harnessPath, '{"prompt": {}}');

    const result = Bun.spawnSync({
      cmd: [process.execPath, cliPath, 'evaluate', `--config=${harnessPath}`],
      cwd: workspace,
      env: { ...process.env, OPENAI_API_KEY: '', ANTHROPIC_API_KEY: '', GOOGLE_API_KEY: '' },
      stdout: 'pipe',
      stderr: 'pipe',
    });

    expect(result.exitCode).toBe(1);
    expect(result.stderr.toString()).toContain(
      'Harness config is not a valid HarnessConfig JSON document',
    );
    expect(await Bun.file(`${workspace}/harnessfit.db`).exists()).toBeFalse();
  });
});
