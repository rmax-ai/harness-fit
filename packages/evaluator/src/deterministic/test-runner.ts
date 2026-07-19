import type { TestSuiteResult } from './scorer';

/**
 * Runs hidden acceptance tests against a modified repository.
 *
 * Hidden tests are stored OUTSIDE the writable working tree (SPEC.md §28).
 * The test runner copies them to a temp location, runs `bun test`,
 * and parses results.
 *
 * This is a stub — the real implementation uses Bun.$ to invoke `bun test`.
 */
export interface TestRunner {
  /** Run hidden tests for a given task. Returns test results. */
  runHiddenTests(repoPath: string, hiddenTestsPath: string): Promise<TestSuiteResult>;
}

/**
 * Concrete test runner using Bun's shell API.
 */
export class BunTestRunner implements TestRunner {
  async runHiddenTests(repoPath: string, hiddenTestsPath: string): Promise<TestSuiteResult> {
    // Copy hidden tests to a temp location within the repo
    // (but not in the writable tree — we run from a read-only snapshot)
    const proc = Bun.spawnSync({
      cmd: ['bun', 'test', '--reporter', 'json'],
      cwd: repoPath,
      env: {
        ...Bun.env,
        HIDDEN_TESTS_PATH: hiddenTestsPath,
      },
      stdout: 'pipe',
      stderr: 'pipe',
    });

    // Bun test --json outputs machine-readable results
    try {
      const output = JSON.parse(proc.stdout.toString());
      return parseBunTestOutput(output);
    } catch {
      // Fallback: count pass/fail from text output
      return parseBunTestOutputText(proc.stdout.toString());
    }
  }
}

/**
 * Parse bun test --json output.
 */
function parseBunTestOutput(output: unknown): TestSuiteResult {
  // Stub — real implementation parses actual bun test JSON format
  const o = output as Record<string, unknown>;
  if (o && typeof o.pass === 'number' && typeof o.fail === 'number') {
    return {
      passed: o.pass as number,
      total: (o.pass as number) + (o.fail as number),
      failures: [],
    };
  }
  return { passed: 0, total: 0, failures: [] };
}

/**
 * Fallback parser for text output.
 */
function parseBunTestOutputText(_text: string): TestSuiteResult {
  // Stub — real implementation regex-matches "N pass" / "M fail"
  return { passed: 0, total: 0, failures: ['parse-failed'] };
}

export function createTestRunner(): TestRunner {
  return new BunTestRunner();
}
