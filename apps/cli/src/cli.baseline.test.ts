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
});
