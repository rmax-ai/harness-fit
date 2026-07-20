import { describe, expect, test } from 'bun:test';

const cliPath = `${import.meta.dir}/cli.ts`;

function runInit(cwd: string, ...args: readonly string[]): string {
  const result = Bun.spawnSync({
    cmd: [process.execPath, cliPath, 'init', ...args],
    cwd,
    stdout: 'pipe',
    stderr: 'pipe',
  });

  expect(result.exitCode).toBe(0);
  return new TextDecoder().decode(result.stdout);
}

describe('harnessfit init', () => {
  test('preserves an existing experiment config unless --force is provided', async () => {
    const workspace = await Bun.$`mktemp -d`.text();
    const cwd = workspace.trim();
    const configPath = `${cwd}/experiments/definitions/default.yaml`;
    const existingConfig = 'id: custom-experiment\n';

    await Bun.$`mkdir -p ${cwd}/experiments/definitions`.quiet();
    await Bun.write(configPath, existingConfig);

    const preservedOutput = runInit(cwd);
    expect(await Bun.file(configPath).text()).toBe(existingConfig);
    expect(preservedOutput).toContain('preserved; use --force to overwrite');

    const forcedOutput = runInit(cwd, '--force');
    expect(await Bun.file(configPath).text()).toContain('id: harness-fit-v1');
    expect(forcedOutput).not.toContain('preserved; use --force to overwrite');
  });
});
