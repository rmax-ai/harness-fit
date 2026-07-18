import type { HarnessConfig, ParameterKey } from './types';
import { GENERIC_HARNESS } from './types';

/**
 * Validate that a HarnessConfig has valid values for all fields.
 */
export function validateConfig(config: unknown): config is HarnessConfig {
  if (!config || typeof config !== 'object') return false;
  const c = config as Record<string, unknown>;

  const sections = ['prompt', 'planning', 'tools', 'context', 'feedback', 'validation', 'retry', 'completion'];
  return sections.every((section) => c[section] && typeof c[section] === 'object');
}

/**
 * Parse a JSON string into a HarnessConfig.
 */
export function parseConfig(raw: string): HarnessConfig | null {
  try {
    const parsed = JSON.parse(raw);
    if (!validateConfig(parsed)) return null;
    return parsed as HarnessConfig;
  } catch {
    return null;
  }
}

/**
 * Deep clone a HarnessConfig (immutable by convention but safe copy).
 */
export function cloneConfig(config: HarnessConfig): HarnessConfig {
  return JSON.parse(JSON.stringify(config));
}

/**
 * Get the list of parameter keys for optimization.
 */
export function getParameterKeys(): readonly ParameterKey[] {
  return [
    'prompt.instructionStyle',
    'prompt.structure',
    'prompt.includeExamples',
    'prompt.repeatConstraints',
    'prompt.explicitSuccessCriteria',
    'prompt.instructionPosition',
    'planning.mode',
    'planning.requirePlanBeforeTools',
    'planning.requirePlanUpdateAfterFailure',
    'planning.maxPlanItems',
    'tools.descriptionStyle',
    'tools.schemaStrictness',
    'tools.returnFormat',
    'tools.includeUsageGuidance',
    'tools.exposeToolErrorsVerbatim',
    'context.repositoryMap',
    'context.initialFileStrategy',
    'context.toolResultCompaction',
    'context.includePreviousFailures',
    'context.maxContextTokens',
    'feedback.commandOutput',
    'feedback.includeDiffAfterEdit',
    'feedback.includeRemainingBudget',
    'feedback.failureFraming',
    'validation.validationMode',
    'validation.requireTestsBeforeFinish',
    'validation.requireLintBeforeFinish',
    'validation.requireTypecheckBeforeFinish',
    'validation.rejectTestDeletion',
    'validation.rejectValidationWeakening',
    'retry.retries',
    'retry.retryMode',
    'retry.critiqueBeforeRetry',
    'completion.requireStructuredSummary',
    'completion.requireEvidenceReferences',
    'completion.requireChangedFiles',
    'completion.requireResidualRisk',
  ];
}

/**
 * Get a nested value from a config by dot-path key.
 */
export function getConfigValue(config: HarnessConfig, key: ParameterKey): unknown {
  const [section, field] = key.split('.') as [keyof HarnessConfig, string];
  const obj = config[section] as Record<string, unknown>;
  return obj[field];
}

/**
 * Set a nested value in a config by dot-path key, returning a new config.
 */
export function setConfigValue(config: HarnessConfig, key: ParameterKey, value: unknown): HarnessConfig {
  const [section, field] = key.split('.') as [keyof HarnessConfig, string];
  const cloned = cloneConfig(config);
  const obj = cloned[section] as Record<string, unknown>;
  obj[field] = value;
  return cloned;
}

/**
 * Compute a stable SHA-256 hash of a HarnessConfig (deterministic compilation).
 */
export function hashConfig(config: HarnessConfig): string {
  // Deterministic serialization: sort keys at all levels
  const canonical = JSON.stringify(config, sortedKeysReplacer);
  const hasher = new Bun.CryptoHasher('sha256');
  hasher.update(canonical);
  return hasher.digest('hex');
}

/** JSON.stringify replacer that sorts object keys for deterministic output. */
function sortedKeysReplacer(_key: string, value: unknown): unknown {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return Object.keys(value as Record<string, unknown>)
      .sort()
      .reduce((acc, k) => {
        (acc as Record<string, unknown>)[k] = (value as Record<string, unknown>)[k];
        return acc;
      }, {} as Record<string, unknown>);
  }
  return value;
}

/**
 * Diff two harness configs, returning changed keys and values.
 */
export function diffConfigs(a: HarnessConfig, b: HarnessConfig): readonly ConfigDiffEntry[] {
  const diffs: ConfigDiffEntry[] = [];
  const keys = getParameterKeys();

  for (const key of keys) {
    const valA = JSON.stringify(getConfigValue(a, key));
    const valB = JSON.stringify(getConfigValue(b, key));
    if (valA !== valB) {
      diffs.push({ key, before: getConfigValue(a, key), after: getConfigValue(b, key) });
    }
  }

  return diffs;
}

export interface ConfigDiffEntry {
  readonly key: ParameterKey;
  readonly before: unknown;
  readonly after: unknown;
}

/**
 * Get the generic (baseline) harness configuration.
 */
export function getGenericConfig(): HarnessConfig {
  return cloneConfig(GENERIC_HARNESS);
}
