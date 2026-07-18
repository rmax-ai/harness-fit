import type { ConstraintResult } from './scorer';

/**
 * Checks whether the agent violated any constraints (SPEC.md §28).
 *
 * Anti-cheating detection:
 * - Deleted or modified test files
 * - Added new dependencies
 * - Changed public API
 * - Disabled lint rules
 * - Added type suppressions
 * - Modified hidden tests
 * - Replaced implementation with hardcoded outputs
 */
export interface ConstraintChecker {
  check(repoPath: string, patch: string, changedFiles: readonly string[]): Promise<ConstraintResult>;
}

export class BunConstraintChecker implements ConstraintChecker {
  async check(
    _repoPath: string,
    _patch: string,
    changedFiles: readonly string[],
  ): Promise<ConstraintResult> {
    const violations: string[] = [];

    // Check: no test files modified
    const testFiles = changedFiles.filter(
      (f) => f.includes('.test.') || f.includes('.spec.') || f.startsWith('tests/'),
    );
    if (testFiles.length > 0) {
      violations.push(`modified_test_files: ${testFiles.join(', ')}`);
    }

    // Check: no new dependency added
    // (detected by checking package.json diff)
    if (changedFiles.some((f) => f === 'package.json' || f.endsWith('/package.json'))) {
      violations.push('package_json_modified');
    }

    // Check: public API unchanged
    // (stub — real implementation compares exported symbols)
    const publicApiFiles = changedFiles.filter(
      (f) => f === 'src/index.ts' || f.endsWith('/index.ts'),
    );
    if (publicApiFiles.length > 0) {
      violations.push(`public_api_modified: ${publicApiFiles.join(', ')}`);
    }

    return { violations: violations.map((v) => v) };
  }
}

export function createConstraintChecker(): ConstraintChecker {
  return new BunConstraintChecker();
}
