import { describe, expect, test } from 'bun:test';
import { createTestRunner } from '@harnessfit/evaluator';

describe('BunTestRunner', () => {
  test('runs hidden tests against the supplied sandbox instead of the source fixture', async () => {
    const root = (await Bun.$`mktemp -d`.text()).trim();
    const repoPath = `${root}/sample`;
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
    const passed = await runner.runHiddenTests(repoPath, hiddenTestsPath);
    expect(passed).toEqual({ passed: 1, total: 1, failures: [] });

    await Bun.write(`${repoPath}/src/value.ts`, 'export const value = 1;\n');
    const failed = await runner.runHiddenTests(repoPath, hiddenTestsPath);
    expect(failed.passed).toBe(0);
    expect(failed.total).toBe(1);
  });
});
