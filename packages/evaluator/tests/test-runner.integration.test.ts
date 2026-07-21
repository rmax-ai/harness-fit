import { describe, expect, test } from 'bun:test';
import { createTestRunner } from '@harnessfit/evaluator';

describe('BunTestRunner', () => {
  test('runs hidden tests against the supplied sandbox instead of the source fixture', async () => {
    const root = (await Bun.$`mktemp -d`.text()).trim();
    const repoPath = `${root}/sample-trial-0`;
    const hiddenTestsPath = `${root}/hidden-tests/case`;
    await Bun.$`mkdir -p ${repoPath}/src ${hiddenTestsPath}`.quiet();
    await Bun.write(`${repoPath}/src/value.ts`, 'export const value = 2;\n');
    await Bun.write(
      `${hiddenTestsPath}/value.test.ts`,
      `import { expect, test } from 'bun:test';
import { value } from '../../repositories/sample/src/value';
test('uses sandbox value', () => expect(value).toBe(2));
`,
    );

    const runner = createTestRunner();
    const passed = await runner.runHiddenTests(repoPath, hiddenTestsPath, 'sample');
    expect(passed).toEqual({ passed: 1, total: 1, failures: [] });

    await Bun.write(`${repoPath}/src/value.ts`, 'export const value = 1;\n');
    const failed = await runner.runHiddenTests(repoPath, hiddenTestsPath, 'sample');
    expect(failed.passed).toBe(0);
    expect(failed.total).toBe(1);
  });

  test('links a trial sandbox under the task repository name expected by hidden tests', async () => {
    const root = (await Bun.$`mktemp -d`.text()).trim();
    const source = `${import.meta.dir}/../../../benchmarks/repositories/task-service`;
    const repoPath = `${root}/task-service-trial-0`;
    await Bun.$`cp -R ${source} ${repoPath}`.quiet();

    const result = await createTestRunner().runHiddenTests(
      repoPath,
      `${import.meta.dir}/../../../benchmarks/hidden-tests/bug-001-status-filter`,
      'task-service',
    );

    expect(result.total).toBe(6);
    expect(result.passed).toBeLessThan(result.total);
  });

  test('resolves a relative sandbox path from the workspace root', async () => {
    const result = await createTestRunner().runHiddenTests(
      'benchmarks/repositories/task-service',
      'benchmarks/hidden-tests/bug-001-status-filter',
      'task-service',
    );

    expect(result.total).toBe(6);
    expect(result.passed).toBeLessThan(result.total);
  });
});
