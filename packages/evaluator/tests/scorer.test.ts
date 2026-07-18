import { describe, it, expect } from 'bun:test';
import {
  computeScore,
  computeFunctionalScore,
  computeRegressionScore,
  computeConstraintScore,
  computeQualityScore,
} from '../src/deterministic/scorer';
import type {
  ScoringInput,
  TestSuiteResult,
  RegressionResult,
  ConstraintResult,
  PatchQualityMetrics,
} from '../src/deterministic/scorer';

/**
 * Determinism test: M1 acceptance criterion per SPEC.md §31.
 * "Same patch → same score across 10 repeated evaluations."
 */
describe('Scorer determinism (M1 acceptance criterion)', () => {
  const input: ScoringInput = {
    functionalTests: { passed: 4, total: 6, failures: ['test_e', 'test_f'] },
    regression: {
      existingTests: { passed: 18, total: 18, failures: [] },
      typecheckPassed: true,
      lintPassed: true,
    },
    constraints: { violations: [] },
    patchQuality: {
      lineCount: 45,
      newDuplicationDetected: false,
      newLintViolations: 0,
    },
  };

  it('produces identical score across 10 repeated evaluations', () => {
    const scores: number[] = [];
    for (let i = 0; i < 10; i++) {
      const result = computeScore(input);
      scores.push(result.total);
    }

    // All 10 scores must be exactly equal
    const first = scores[0];
    for (const score of scores) {
      expect(score).toBe(first!);
    }
  });

  it('produces identical sub-scores across 10 repeated evaluations', () => {
    const results = Array.from({ length: 10 }, () => computeScore(input));

    const first = results[0]!;
    for (const result of results) {
      expect(result.functional).toBe(first.functional);
      expect(result.regression).toBe(first.regression);
      expect(result.constraint).toBe(first.constraint);
      expect(result.quality).toBe(first.quality);
      expect(result.total).toBe(first.total);
    }
  });
});

describe('computeFunctionalScore', () => {
  it('returns 1.0 for all tests passed', () => {
    const tests: TestSuiteResult = {
      passed: 10,
      total: 10,
      failures: [],
    };
    expect(computeFunctionalScore(tests)).toBe(1.0);
  });

  it('returns 0.0 for all tests failed', () => {
    const tests: TestSuiteResult = {
      passed: 0,
      total: 10,
      failures: ['t1', 't2', 't3', 't4', 't5', 't6', 't7', 't8', 't9', 't10'],
    };
    expect(computeFunctionalScore(tests)).toBe(0.0);
  });

  it('returns 0.5 for half passed', () => {
    const tests: TestSuiteResult = {
      passed: 5,
      total: 10,
      failures: ['t6', 't7', 't8', 't9', 't10'],
    };
    expect(computeFunctionalScore(tests)).toBe(0.5);
  });

  it('returns 1.0 when no tests exist', () => {
    const tests: TestSuiteResult = {
      passed: 0,
      total: 0,
      failures: [],
    };
    expect(computeFunctionalScore(tests)).toBe(1.0);
  });
});

describe('computeRegressionScore', () => {
  it('returns 1.0 for perfect regression', () => {
    const regression: RegressionResult = {
      existingTests: { passed: 20, total: 20, failures: [] },
      typecheckPassed: true,
      lintPassed: true,
    };
    expect(computeRegressionScore(regression)).toBe(1.0);
  });

  it('returns 0.5 when only tests pass (not typecheck/lint)', () => {
    const regression: RegressionResult = {
      existingTests: { passed: 20, total: 20, failures: [] },
      typecheckPassed: false,
      lintPassed: false,
    };
    expect(computeRegressionScore(regression)).toBe(0.5);
  });

  it('scales test portion proportionally', () => {
    const regression: RegressionResult = {
      existingTests: { passed: 10, total: 20, failures: Array(10).fill('fail') },
      typecheckPassed: true,
      lintPassed: true,
    };
    // 0.5 * (10/20) + 0.25 + 0.25 = 0.25 + 0.25 + 0.25 = 0.75
    expect(computeRegressionScore(regression)).toBe(0.75);
  });

  it('returns 0.0 for total regression failure', () => {
    const regression: RegressionResult = {
      existingTests: { passed: 0, total: 20, failures: Array(20).fill('fail') },
      typecheckPassed: false,
      lintPassed: false,
    };
    expect(computeRegressionScore(regression)).toBe(0.0);
  });
});

describe('computeConstraintScore', () => {
  it('returns 1.0 with no violations', () => {
    const constraints: ConstraintResult = { violations: [] };
    expect(computeConstraintScore(constraints)).toBe(1.0);
  });

  it('deducts 0.2 per violation', () => {
    const constraints: ConstraintResult = {
      violations: ['modified_tests', 'added_dependency'],
    };
    expect(computeConstraintScore(constraints)).toBe(0.6);
  });

  it('floors at 0.0', () => {
    const constraints: ConstraintResult = {
      violations: Array(10).fill('v'),
    };
    expect(computeConstraintScore(constraints)).toBe(0.0);
  });
});

describe('computeQualityScore', () => {
  it('returns 1.0 for small, clean patch', () => {
    const metrics: PatchQualityMetrics = {
      lineCount: 10,
      newDuplicationDetected: false,
      newLintViolations: 0,
    };
    expect(computeQualityScore(metrics)).toBe(1.0);
  });

  it('penalizes large patches', () => {
    const metrics: PatchQualityMetrics = {
      lineCount: 600,
      newDuplicationDetected: false,
      newLintViolations: 0,
    };
    expect(computeQualityScore(metrics)).toBe(0.7); // 1.0 - 0.3
  });

  it('penalizes medium patches', () => {
    const metrics: PatchQualityMetrics = {
      lineCount: 250,
      newDuplicationDetected: false,
      newLintViolations: 0,
    };
    expect(computeQualityScore(metrics)).toBe(0.85); // 1.0 - 0.15
  });

  it('penalizes duplication', () => {
    const metrics: PatchQualityMetrics = {
      lineCount: 10,
      newDuplicationDetected: true,
      newLintViolations: 0,
    };
    expect(computeQualityScore(metrics)).toBe(0.8); // 1.0 - 0.2
  });

  it('penalizes lint violations', () => {
    const metrics: PatchQualityMetrics = {
      lineCount: 10,
      newDuplicationDetected: false,
      newLintViolations: 2,
    };
    expect(computeQualityScore(metrics)).toBe(0.8); // 1.0 - 0.2
  });

  it('caps lint penalty at 0.3', () => {
    const metrics: PatchQualityMetrics = {
      lineCount: 10,
      newDuplicationDetected: false,
      newLintViolations: 10,
    };
    expect(computeQualityScore(metrics)).toBe(0.7); // 1.0 - 0.3 (capped)
  });
});

describe('computeScore integration', () => {
  it('perfect score: all tests pass, no violations, small patch = 1.0', () => {
    const input: ScoringInput = {
      functionalTests: { passed: 10, total: 10, failures: [] },
      regression: {
        existingTests: { passed: 20, total: 20, failures: [] },
        typecheckPassed: true,
        lintPassed: true,
      },
      constraints: { violations: [] },
      patchQuality: {
        lineCount: 30,
        newDuplicationDetected: false,
        newLintViolations: 0,
      },
    };

    const result = computeScore(input);
    expect(result.functional).toBe(1.0);
    expect(result.regression).toBe(1.0);
    expect(result.constraint).toBe(1.0);
    expect(result.quality).toBe(1.0);
    expect(result.total).toBe(1.0);
  });

  it('weighted total matches expected formula', () => {
    // functional=0.5, regression=0.75, constraint=0.8, quality=0.85
    // total = 0.70*0.5 + 0.10*0.75 + 0.10*0.8 + 0.10*0.85
    // = 0.35 + 0.075 + 0.08 + 0.085 = 0.59
    const input: ScoringInput = {
      functionalTests: { passed: 5, total: 10, failures: Array(5).fill('f') },
      regression: {
        existingTests: { passed: 15, total: 20, failures: Array(5).fill('f') },
        typecheckPassed: true,
        lintPassed: true,
      },
      constraints: { violations: ['v1'] },
      patchQuality: {
        lineCount: 150,
        newDuplicationDetected: false,
        newLintViolations: 0,
      },
    };

    const result = computeScore(input);
    expect(result.functional).toBe(0.5);
    expect(result.regression).toBe(0.875); // 0.5*(15/20) + 0.25 + 0.25
    expect(result.constraint).toBe(0.8);   // 1.0 - 0.2
    expect(result.quality).toBe(0.95);      // 1.0 - 0.05
    expect(result.total).toBe(0.6125);
    // 0.70*0.5 + 0.10*0.875 + 0.10*0.8 + 0.10*0.95
    // = 0.35 + 0.0875 + 0.08 + 0.095 = 0.6125
  });
});
