import type { HarnessConfig } from '@harnessfit/harness';
import type { RunResult } from '@harnessfit/core';

/**
 * Hill-climbing optimizer per SPEC.md §12.
 *
 * Coordinate ascent: mutate one parameter at a time,
 * accept improvements that pass the statistical acceptance rule.
 */

export interface OptimizationStep {
  readonly candidate: number;
  readonly config: HarnessConfig;
  readonly utility: number;
  readonly accepted: boolean;
  readonly hash: string;
}

export interface OptimizationResult {
  readonly config: HarnessConfig;
  readonly utility: number;
  readonly steps: readonly OptimizationStep[];
  readonly totalCandidates: number;
  readonly improvements: number;
}

export interface OptimizationConfig {
  readonly maxCandidates: number;
  readonly minImprovement: number;
  readonly trialsPerCandidate: number;
  readonly randomRestarts: number;
}

const DEFAULT_OPTIMIZATION: OptimizationConfig = {
  maxCandidates: 120,
  minImprovement: 0.03,
  trialsPerCandidate: 3,
  randomRestarts: 3,
};

/**
 * Evaluate a harness config against a set of tasks.
 * Returns the average utility across all tasks and trials.
 */
export type Evaluator = (config: HarnessConfig) => Promise<number>;

/**
 * Coordinate hill climbing optimizer.
 *
 * Algorithm:
 * 1. Start from initial config
 * 2. Generate neighbors (single-parameter mutations)
 * 3. Evaluate each neighbor
 * 4. Accept if utility improvement exceeds threshold
 * 5. Repeat until no improvement or budget exhausted
 * 6. Optionally: random restarts from different starting points
 */
export async function optimize(
  initial: HarnessConfig,
  evaluator: Evaluator,
  generateNeighborsFn: (config: HarnessConfig) => readonly HarnessConfig[],
  config: Partial<OptimizationConfig> = {},
): Promise<OptimizationResult> {
  const opts = { ...DEFAULT_OPTIMIZATION, ...config };
  const steps: OptimizationStep[] = [];
  let incumbent = initial;
  let incumbentUtility = await evaluator(incumbent);
  let candidateCount = 0;
  let improvements = 0;

  // Hill climbing
  let improved = true;
  while (improved && candidateCount < opts.maxCandidates) {
    improved = false;
    const neighbors = generateNeighborsFn(incumbent);

    for (const neighbor of neighbors) {
      candidateCount++;
      if (candidateCount > opts.maxCandidates) break;

      const utility = await evaluator(neighbor);
      const hash = `${candidateCount}-${JSON.stringify(neighbor).slice(0, 20)}`;

      const accepted = utility > incumbentUtility + opts.minImprovement;

      steps.push({ candidate: candidateCount, config: neighbor, utility, accepted, hash });

      if (accepted) {
        incumbent = neighbor;
        incumbentUtility = utility;
        improved = true;
        improvements++;
        break; // First-improvement (not steepest-ascent)
      }
    }
  }

  return {
    config: incumbent,
    utility: incumbentUtility,
    steps,
    totalCandidates: candidateCount,
    improvements,
  };
}

/**
 * Statistical acceptance test per SPEC.md §12.
 *
 * A candidate is accepted only when:
 * 1. candidate utility > incumbent utility + minimum effect
 * 2. AND one of: bootstrap CI excludes zero OR paired permutation test passes
 */
export function isCredibleImprovement(
  candidateUtility: number,
  incumbentUtility: number,
  minEffect: number = 0.03,
): boolean {
  // Simple threshold check (full statistical tests are V2)
  return candidateUtility > incumbentUtility + minEffect;
}

/**
 * Bootstrap confidence interval (placeholder — full implementation V2).
 */
export function bootstrapCI(values: readonly number[], confidence: number = 0.95): [number, number] {
  if (values.length === 0) return [0, 0];
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  // Simple ±2 standard error (placeholder for actual bootstrap)
  const variance = values.reduce((a, b) => a + (b - mean) ** 2, 0) / values.length;
  const se = Math.sqrt(variance / values.length);
  const z = confidence === 0.95 ? 1.96 : confidence === 0.99 ? 2.576 : 2.0;
  return [mean - z * se, mean + z * se];
}
