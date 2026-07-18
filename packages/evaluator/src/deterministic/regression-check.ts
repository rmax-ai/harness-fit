import type { RegressionResult, TestSuiteResult } from './scorer';

/**
 * Checks that existing tests, typecheck, and lint still pass
 * after the agent's patch is applied.
 */
export interface RegressionChecker {
  check(repoPath: string): Promise<RegressionResult>;
}

export class BunRegressionChecker implements RegressionChecker {
  async check(repoPath: string): Promise<RegressionResult> {
    const [existingTests, typecheck, lint] = await Promise.all([
      this.runExistingTests(repoPath),
      this.runTypecheck(repoPath),
      this.runLint(repoPath),
    ]);

    return { existingTests, typecheckPassed: typecheck, lintPassed: lint };
  }

  private async runExistingTests(repoPath: string): Promise<TestSuiteResult> {
    const proc = Bun.spawnSync({
      cmd: ['bun', 'test'],
      cwd: repoPath,
      stdout: 'pipe',
      stderr: 'pipe',
    });

    const text = proc.stdout.toString();
    const passMatch = text.match(/(\d+) pass/);
    const failMatch = text.match(/(\d+) fail/);
    const passed = passMatch ? parseInt(passMatch[1]!, 10) : 0;
    const failed = failMatch ? parseInt(failMatch[1]!, 10) : 0;

    return {
      passed,
      total: passed + failed,
      failures: [],
    };
  }

  private async runTypecheck(repoPath: string): Promise<boolean> {
    const proc = Bun.spawnSync({
      cmd: ['bun', 'run', 'typecheck'],
      cwd: repoPath,
      stdout: 'pipe',
      stderr: 'pipe',
    });
    return proc.exitCode === 0;
  }

  private async runLint(repoPath: string): Promise<boolean> {
    const proc = Bun.spawnSync({
      cmd: ['bunx', 'biome', 'ci', '.'],
      cwd: repoPath,
      stdout: 'pipe',
      stderr: 'pipe',
    });
    return proc.exitCode === 0;
  }
}

export function createRegressionChecker(): RegressionChecker {
  return new BunRegressionChecker();
}
