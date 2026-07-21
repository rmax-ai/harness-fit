import { cloneConfig, getConfigValue, setConfigValue } from '../configs/config';
import { GENERIC_HARNESS } from '../configs/types';
import type { HarnessConfig, ParameterKey } from '../configs/types';

/**
 * Neighbor generation for hill climbing (SPEC.md §11, §12).
 *
 * For a given config, generate all neighboring configurations
 * by mutating one parameter at a time.
 */

/** All possible values for each parameter (used for enumeration). */
const PARAMETER_VALUES: Record<ParameterKey, readonly unknown[]> = {
  'prompt.instructionStyle': ['minimal', 'contract', 'procedural', 'principles'],
  'prompt.structure': ['markdown', 'xml', 'plain'],
  'prompt.includeExamples': [true, false],
  'prompt.repeatConstraints': [true, false],
  'prompt.explicitSuccessCriteria': [true, false],
  'prompt.instructionPosition': ['prefix', 'prefix-and-suffix'],
  'planning.mode': ['none', 'implicit', 'explicit'],
  'planning.requirePlanBeforeTools': [true, false],
  'planning.requirePlanUpdateAfterFailure': [true, false],
  'planning.maxPlanItems': [3, 5, 8],
  'tools.descriptionStyle': ['minimal', 'detailed', 'detailed-with-examples'],
  'tools.schemaStrictness': ['permissive', 'strict'],
  'tools.returnFormat': ['plain', 'structured'],
  'tools.includeUsageGuidance': [true, false],
  'tools.exposeToolErrorsVerbatim': [true, false],
  'context.repositoryMap': ['none', 'compact', 'detailed'],
  'context.initialFileStrategy': ['none', 'retrieved', 'task-hints'],
  'context.toolResultCompaction': ['none', 'truncate', 'summarize'],
  'context.includePreviousFailures': [true, false],
  'context.maxContextTokens': [32_000, 64_000, 128_000, 200_000],
  'feedback.commandOutput': ['raw', 'normalized', 'diagnostic'],
  'feedback.includeDiffAfterEdit': [true, false],
  'feedback.includeRemainingBudget': [true, false],
  'feedback.failureFraming': ['neutral', 'diagnostic', 'directive'],
  'validation.validationMode': ['final-only', 'after-edit', 'adaptive'],
  'validation.requireTestsBeforeFinish': [true, false],
  'validation.requireLintBeforeFinish': [true, false],
  'validation.requireTypecheckBeforeFinish': [true, false],
  'validation.rejectTestDeletion': [true, false],
  'validation.rejectValidationWeakening': [true, false],
  'retry.retries': [0, 1, 2],
  'retry.retryMode': ['same-context', 'failure-summary', 'fresh-context'],
  'retry.critiqueBeforeRetry': [true, false],
  'completion.requireStructuredSummary': [true, false],
  'completion.requireEvidenceReferences': [true, false],
  'completion.requireChangedFiles': [true, false],
  'completion.requireResidualRisk': [true, false],
};

/**
 * Generate all neighbor configurations by mutating one parameter at a time.
 * Returns configurations that differ from the input by exactly one parameter.
 */
export function generateNeighbors(config: HarnessConfig): readonly HarnessConfig[] {
  const neighbors: HarnessConfig[] = [];
  const keys = Object.keys(PARAMETER_VALUES) as ParameterKey[];

  for (const key of keys) {
    const currentValue = getConfigValue(config, key);
    const alternatives = PARAMETER_VALUES[key].filter((v) => v !== currentValue);

    for (const alt of alternatives) {
      neighbors.push(setConfigValue(config, key, alt));
    }
  }

  return neighbors;
}

/**
 * Generate a random harness configuration.
 * Used for random restarts in hill climbing (SPEC.md §11, Phase 3).
 */
export function generateRandomConfig(baseConfig?: HarnessConfig, seed = 0): HarnessConfig {
  let config = cloneConfig(baseConfig ?? GENERIC_HARNESS);
  const keys = Object.keys(PARAMETER_VALUES) as ParameterKey[];
  const random = createSeededRandom(seed);

  // Mutate 3-5 random parameters
  const mutations = 3 + Math.floor(random() * 3);
  const shuffled = [...keys];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    const current = shuffled[i];
    const replacement = shuffled[j];
    if (current === undefined || replacement === undefined) {
      throw new Error('Parameter shuffle produced an invalid index');
    }
    shuffled[i] = replacement;
    shuffled[j] = current;
  }

  for (let i = 0; i < Math.min(mutations, shuffled.length); i++) {
    const key = shuffled[i];
    if (key === undefined) throw new Error('Parameter mutation selected an invalid key');
    const options = PARAMETER_VALUES[key];
    const value = options[Math.floor(random() * options.length)];
    if (value === undefined) throw new Error(`No values configured for ${key}`);
    config = setConfigValue(config, key, value);
  }

  return config;
}

function createSeededRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state += 0x6d2b79f5;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4_294_967_296;
  };
}
