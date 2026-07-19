import type { TaskScore } from './types';

/**
 * Deterministic scoring engine per SPEC.md §14.
 *
 * TaskScore = 0.70 × functional_correctness
 *           + 0.10 × regression_safety
 *           + 0.10 × constraint_compliance
 *           + 0.10 × patch_quality
 *
 * This is a PURE FUNCTION. For identical inputs, it MUST produce identical outputs.
 * No randomness, no timestamps in score computation, no external state.
 *
 * Weights are frozen per SPEC.md and DECISIONS.md (D8).
 */

const WEIGHTS = {
  functional: 0.7,
  regression: 0.1,
  constraint: 0.1,
  quality: 0.1,
} as const;

/**
 * Test result from running a test suite.
 */
export interface TestSuiteResult {
  readonly passed: number;
  readonly total: number;
  readonly failures: readonly string[];
}

/**
 * Regression check results.
 */
export interface RegressionResult {
  readonly existingTests: TestSuiteResult;
  readonly typecheckPassed: boolean;
  readonly lintPassed: boolean;
}

/**
 * Constraint check results.
 */
export interface ConstraintResult {
  readonly violations: readonly string[];
}

/**
 * Patch quality metrics.
 */
export interface PatchQualityMetrics {
  readonly lineCount: number;
  readonly newDuplicationDetected: boolean;
  readonly newLintViolations: number;
}

/**
 * Full scoring input — all sub-scores computed by the individual check functions.
 */
export interface ScoringInput {
  readonly functionalTests: TestSuiteResult;
  readonly regression: RegressionResult;
  readonly constraints: ConstraintResult;
  readonly patchQuality: PatchQualityMetrics;
}

/**
 * Compute the task score from pre-computed sub-results.
 * This is the core scoring function — completely deterministic.
 */
export function computeScore(input: ScoringInput): TaskScore {
  const functional = computeFunctionalScore(input.functionalTests);
  const regression = computeRegressionScore(input.regression);
  const constraint = computeConstraintScore(input.constraints);
  const quality = computeQualityScore(input.patchQuality);

  const total = round(
    WEIGHTS.functional * functional +
      WEIGHTS.regression * regression +
      WEIGHTS.constraint * constraint +
      WEIGHTS.quality * quality,
  );

  return {
    functional,
    regression,
    constraint,
    quality,
    total,
    details: {
      functionalTestsPassed: input.functionalTests.passed,
      functionalTestsTotal: input.functionalTests.total,
      regressionTestsPassed: input.regression.existingTests.passed,
      regressionTestsTotal: input.regression.existingTests.total,
      typecheckPassed: input.regression.typecheckPassed,
      lintPassed: input.regression.lintPassed,
      constraintViolations: [...input.constraints.violations],
      patchLineCount: input.patchQuality.lineCount,
      newDuplicationDetected: input.patchQuality.newDuplicationDetected,
      newLintViolations: input.patchQuality.newLintViolations,
    },
  };
}

/**
 * Functional correctness: proportion of hidden tests passed.
 * Weight: 0.70
 */
export function computeFunctionalScore(tests: TestSuiteResult): number {
  if (tests.total === 0) return 1.0; // No failing tests = full score
  return round(tests.passed / tests.total);
}

/**
 * Regression safety: all existing tests, typecheck, and lint must pass.
 * Weight: 0.10
 *
 * Components:
 * - Existing tests (50% of regression weight)
 * - Typecheck (25%)
 * - Lint (25%)
 */
export function computeRegressionScore(regression: RegressionResult): number {
  let score = 0.0;

  // Existing tests: 0.5 weight within regression
  if (regression.existingTests.total > 0) {
    score += 0.5 * (regression.existingTests.passed / regression.existingTests.total);
  } else {
    score += 0.5; // No existing tests = full credit
  }

  // Typecheck: 0.25 weight
  score += regression.typecheckPassed ? 0.25 : 0.0;

  // Lint: 0.25 weight
  score += regression.lintPassed ? 0.25 : 0.0;

  return round(score);
}

/**
 * Constraint compliance: penalty for each violation.
 * Weight: 0.10
 *
 * Violations include:
 * - Modified test files
 * - Added dependencies
 * - Changed public API
 * - Exceeded patch size limit
 * - Deleted existing tests
 * - Disabled lint rules
 * - Added type suppressions
 */
export function computeConstraintScore(constraints: ConstraintResult): number {
  if (constraints.violations.length === 0) return 1.0;

  // Each violation costs 0.2 points. Minimum score is 0.0.
  const penalty = constraints.violations.length * 0.2;
  return round(Math.max(0.0, 1.0 - penalty));
}

/**
 * Patch quality: size, duplication, complexity.
 * Weight: 0.10
 *
 * Components:
 * - Base score: 1.0
 * - Penalty for large patches (>500 lines → -0.3, >200 lines → -0.15)
 * - Penalty for duplication (-0.2)
 * - Penalty for new lint violations (-0.1 each, max -0.3)
 */
export function computeQualityScore(metrics: PatchQualityMetrics): number {
  let score = 1.0;

  // Patch size penalty
  if (metrics.lineCount > 500) {
    score -= 0.3;
  } else if (metrics.lineCount > 200) {
    score -= 0.15;
  } else if (metrics.lineCount > 100) {
    score -= 0.05;
  }

  // Duplication penalty
  if (metrics.newDuplicationDetected) {
    score -= 0.2;
  }

  // Lint violation penalty (max 0.3)
  const lintPenalty = Math.min(metrics.newLintViolations * 0.1, 0.3);
  score -= lintPenalty;

  return round(Math.max(0.0, score));
}

/**
 * Round to 4 decimal places for determinism.
 */
function round(value: number): number {
  return Math.round(value * 10000) / 10000;
}
