import type { TestSuiteResult } from './scorer';

/** Runs hidden acceptance tests against a modified repository. */
export interface TestRunner {
  runHiddenTests(
    repoPath: string,
    hiddenTestsPath: string,
    repositoryName?: string,
  ): Promise<TestSuiteResult>;
}

/**
 * Executes a copied hidden-test directory outside the writable repository sandbox.
 *
 * The temporary layout mirrors `benchmarks/` so existing hidden tests can import
 * `../../repositories/<fixture>/...`, but that import resolves to a symlink to the
 * sandbox under evaluation rather than the source fixture.
 */
export class BunTestRunner implements TestRunner {
  async runHiddenTests(
    repoPath: string,
    hiddenTestsPath: string,
    repositoryName?: string,
  ): Promise<TestSuiteResult> {
    const tempRoot = (await Bun.$`mktemp -d`.text()).trim();
    const fixtureName = repositoryName ?? repoPath.split('/').filter(Boolean).at(-1);
    if (!fixtureName) return failedResult('invalid repository path');
    const absoluteRepoPath = repoPath.startsWith('/') ? repoPath : `${process.cwd()}/${repoPath}`;

    try {
      const copiedTestsPath = `${tempRoot}/hidden-tests/${hiddenTestsPath.split('/').filter(Boolean).at(-1)}`;
      const repositoryLink = `${tempRoot}/repositories/${fixtureName}`;
      const setup = Bun.spawnSync({
        cmd: [
          'sh',
          '-c',
          `mkdir -p "${tempRoot}/hidden-tests" "${tempRoot}/repositories" && cp -R "${hiddenTestsPath}" "${tempRoot}/hidden-tests/" && ln -s "${absoluteRepoPath}" "${repositoryLink}"`,
        ],
        stdout: 'pipe',
        stderr: 'pipe',
      });
      if (setup.exitCode !== 0)
        return failedResult(setup.stderr.toString() || 'failed to prepare hidden tests');

      const proc = Bun.spawnSync({
        cmd: [process.execPath, 'test', copiedTestsPath],
        cwd: tempRoot,
        stdout: 'pipe',
        stderr: 'pipe',
      });
      return parseBunTestOutput(proc.stdout.toString(), proc.stderr.toString(), proc.exitCode);
    } finally {
      Bun.spawnSync({ cmd: ['rm', '-rf', tempRoot], stdout: 'ignore', stderr: 'ignore' });
    }
  }
}

function parseBunTestOutput(stdout: string, stderr: string, exitCode: number): TestSuiteResult {
  const output = `${stdout}\n${stderr}`;
  const passed = readCount(output, /(\d+) pass/);
  const failed = readCount(output, /(\d+) fail/);
  const total = passed + failed;
  if (total > 0) {
    return {
      passed,
      total,
      failures: exitCode === 0 ? [] : [summarizeFailure(output)],
    };
  }
  return failedResult(summarizeFailure(output));
}

function readCount(output: string, pattern: RegExp): number {
  const value = output.match(pattern)?.[1];
  return value === undefined ? 0 : Number.parseInt(value, 10);
}

function failedResult(failure: string): TestSuiteResult {
  return { passed: 0, total: 1, failures: [failure] };
}

function summarizeFailure(output: string): string {
  const summary = output.trim().slice(-1000);
  return summary || 'hidden tests produced no parseable result';
}

export function createTestRunner(): TestRunner {
  return new BunTestRunner();
}
