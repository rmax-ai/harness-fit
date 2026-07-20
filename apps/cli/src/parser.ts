/** Parser for the experiment-definition YAML used by HarnessFit. */

const PROVIDERS = ['openai', 'anthropic', 'google'] as const;
const TRIAL_TIERS = ['search', 'finalists', 'headline'] as const;

type Provider = (typeof PROVIDERS)[number];
type Scalar = string | number | boolean;

interface ExperimentModel {
  readonly id: string;
  readonly provider: Provider;
  readonly model: string;
}

export interface BenchmarkConfig {
  readonly trainingSplit: string;
  readonly developmentSplit: string;
  readonly testSplit: string;
}

export interface TrialConfig {
  readonly search: number;
  readonly finalists: number;
  readonly headline: number;
}

export interface OptimizerConfig {
  readonly algorithm: 'coordinate-hill-climbing';
  readonly randomRestarts: number;
  readonly maximumCandidatesPerModel: number;
  readonly minimumSuccessImprovement: number;
}

export interface ExperimentLimits {
  readonly maxTurns: number;
  readonly maxToolCalls: number;
  readonly maxWallTimeSeconds: number;
  readonly maxOutputTokens: number;
  readonly maxCostUsdPerRun: number;
}

export interface ObjectiveConfig {
  readonly successWeight: number;
  readonly costWeight: number;
  readonly latencyWeight: number;
  readonly varianceWeight: number;
}

export interface ReportingConfig {
  readonly transferMatrix: boolean;
  readonly ablations: boolean;
  readonly paretoFrontiers: boolean;
  readonly confidenceIntervals: boolean;
}

export interface ExperimentConfig {
  readonly id: string;
  readonly models: readonly ExperimentModel[];
  readonly benchmark: BenchmarkConfig;
  readonly trials: TrialConfig;
  readonly optimizer: OptimizerConfig;
  readonly limits: ExperimentLimits;
  readonly objective: ObjectiveConfig;
  readonly reporting: ReportingConfig;
}

const DEFAULT_BENCHMARK: BenchmarkConfig = {
  trainingSplit: 'train',
  developmentSplit: 'dev',
  testSplit: 'test',
};

const DEFAULT_TRIALS: TrialConfig = { search: 3, finalists: 5, headline: 10 };

const DEFAULT_OPTIMIZER: OptimizerConfig = {
  algorithm: 'coordinate-hill-climbing',
  randomRestarts: 3,
  maximumCandidatesPerModel: 120,
  minimumSuccessImprovement: 0.03,
};

const DEFAULT_LIMITS: ExperimentLimits = {
  maxTurns: 24,
  maxToolCalls: 40,
  maxWallTimeSeconds: 600,
  maxOutputTokens: 32000,
  maxCostUsdPerRun: 5,
};

const DEFAULT_OBJECTIVE: ObjectiveConfig = {
  successWeight: 1,
  costWeight: 0.1,
  latencyWeight: 0.05,
  varianceWeight: 0.1,
};

const DEFAULT_REPORTING: ReportingConfig = {
  transferMatrix: true,
  ablations: true,
  paretoFrontiers: true,
  confidenceIntervals: true,
};

const SECTIONS = ['benchmark', 'trials', 'optimizer', 'limits', 'objective', 'reporting'] as const;
type Section = (typeof SECTIONS)[number];

interface ModelInput {
  id?: Scalar;
  provider?: Scalar;
  model?: Scalar;
}

/** Parse the restricted YAML subset used by experiment definitions. */
export function parseExperimentConfig(raw: string): ExperimentConfig {
  let id: Scalar | undefined;
  let activeSection: Section | 'models' | undefined;
  let currentModel: ModelInput | undefined;
  const models: ModelInput[] = [];
  const sections: Partial<Record<Section, Record<string, Scalar>>> = {};

  for (const [index, rawLine] of raw.split('\n').entries()) {
    const lineNumber = index + 1;
    const line = rawLine.replace(/#.*$/, '');
    if (!line.trim()) continue;

    const topLevel = line.match(/^([a-zA-Z][\w-]*):\s*(.*)$/);
    if (topLevel) {
      const key = topLevel[1];
      const value = topLevel[2];
      if (key === undefined || value === undefined) {
        throw new Error(`Line ${lineNumber}: invalid top-level configuration`);
      }
      currentModel = undefined;
      if (key === 'id' && value) {
        id = parseScalar(value);
        activeSection = undefined;
        continue;
      }
      if (key === 'models' && !value) {
        activeSection = 'models';
        continue;
      }
      if (isSection(key) && !value) {
        activeSection = key;
        sections[key] = {};
        continue;
      }
      throw new Error(`Line ${lineNumber}: unsupported top-level configuration key ${key}`);
    }

    const modelStart = line.match(/^\s{2}-\s+id:\s*(.+)$/);
    if (modelStart) {
      if (activeSection !== 'models') {
        throw new Error(`Line ${lineNumber}: model entries must be under models:`);
      }
      const modelId = modelStart[1];
      if (modelId === undefined) throw new Error(`Line ${lineNumber}: missing model id`);
      currentModel = { id: parseScalar(modelId) };
      models.push(currentModel);
      continue;
    }

    const nestedValue = line.match(/^\s{2,4}([a-zA-Z][\w-]*):\s*(.+)$/);
    if (nestedValue) {
      const key = nestedValue[1];
      const value = nestedValue[2];
      if (key === undefined || value === undefined) {
        throw new Error(`Line ${lineNumber}: invalid nested configuration`);
      }
      if (activeSection === 'models') {
        if (!currentModel || (key !== 'provider' && key !== 'model')) {
          throw new Error(`Line ${lineNumber}: models accept only id, provider, and model`);
        }
        currentModel[key] = parseScalar(value);
        continue;
      }
      if (activeSection) {
        const sectionValues = sections[activeSection];
        if (!sectionValues) throw new Error(`Line ${lineNumber}: missing ${activeSection} section`);
        sectionValues[key] = parseScalar(value);
        continue;
      }
    }

    throw new Error(`Line ${lineNumber}: unsupported experiment configuration syntax`);
  }

  return {
    id: requireString(id, 'id'),
    models: models.map((model, index) => parseModel(model, index + 1)),
    benchmark: parseBenchmark(sections.benchmark),
    trials: parseTrials(sections.trials),
    optimizer: parseOptimizer(sections.optimizer),
    limits: parseLimits(sections.limits),
    objective: parseObjective(sections.objective),
    reporting: parseReporting(sections.reporting),
  };
}

function parseModel(model: ModelInput, index: number): ExperimentModel {
  const provider = requireString(model.provider, `models[${index}].provider`);
  if (!PROVIDERS.includes(provider as Provider)) {
    throw new Error(`models[${index}].provider must be one of ${PROVIDERS.join(', ')}`);
  }
  return {
    id: requireString(model.id, `models[${index}].id`),
    provider: provider as Provider,
    model: requireString(model.model, `models[${index}].model`),
  };
}

function parseBenchmark(values: Record<string, Scalar> | undefined): BenchmarkConfig {
  ensureKeys(values, ['trainingSplit', 'developmentSplit', 'testSplit'], 'benchmark');
  return {
    trainingSplit: readString(values, 'trainingSplit', DEFAULT_BENCHMARK.trainingSplit),
    developmentSplit: readString(values, 'developmentSplit', DEFAULT_BENCHMARK.developmentSplit),
    testSplit: readString(values, 'testSplit', DEFAULT_BENCHMARK.testSplit),
  };
}

function parseTrials(values: Record<string, Scalar> | undefined): TrialConfig {
  ensureKeys(values, TRIAL_TIERS, 'trials');
  return {
    search: readPositiveInteger(values, 'search', DEFAULT_TRIALS.search),
    finalists: readPositiveInteger(values, 'finalists', DEFAULT_TRIALS.finalists),
    headline: readPositiveInteger(values, 'headline', DEFAULT_TRIALS.headline),
  };
}

function parseOptimizer(values: Record<string, Scalar> | undefined): OptimizerConfig {
  ensureKeys(
    values,
    ['algorithm', 'randomRestarts', 'maximumCandidatesPerModel', 'minimumSuccessImprovement'],
    'optimizer',
  );
  const algorithm = readString(values, 'algorithm', DEFAULT_OPTIMIZER.algorithm);
  if (algorithm !== 'coordinate-hill-climbing') {
    throw new Error('optimizer.algorithm must be coordinate-hill-climbing');
  }
  return {
    algorithm,
    randomRestarts: readPositiveInteger(values, 'randomRestarts', DEFAULT_OPTIMIZER.randomRestarts),
    maximumCandidatesPerModel: readPositiveInteger(
      values,
      'maximumCandidatesPerModel',
      DEFAULT_OPTIMIZER.maximumCandidatesPerModel,
    ),
    minimumSuccessImprovement: readNonNegativeNumber(
      values,
      'minimumSuccessImprovement',
      DEFAULT_OPTIMIZER.minimumSuccessImprovement,
    ),
  };
}

function parseLimits(values: Record<string, Scalar> | undefined): ExperimentLimits {
  ensureKeys(
    values,
    ['maxTurns', 'maxToolCalls', 'maxWallTimeSeconds', 'maxOutputTokens', 'maxCostUsdPerRun'],
    'limits',
  );
  return {
    maxTurns: readPositiveInteger(values, 'maxTurns', DEFAULT_LIMITS.maxTurns),
    maxToolCalls: readPositiveInteger(values, 'maxToolCalls', DEFAULT_LIMITS.maxToolCalls),
    maxWallTimeSeconds: readPositiveInteger(
      values,
      'maxWallTimeSeconds',
      DEFAULT_LIMITS.maxWallTimeSeconds,
    ),
    maxOutputTokens: readPositiveInteger(values, 'maxOutputTokens', DEFAULT_LIMITS.maxOutputTokens),
    maxCostUsdPerRun: readNonNegativeNumber(
      values,
      'maxCostUsdPerRun',
      DEFAULT_LIMITS.maxCostUsdPerRun,
    ),
  };
}

function parseObjective(values: Record<string, Scalar> | undefined): ObjectiveConfig {
  ensureKeys(
    values,
    ['successWeight', 'costWeight', 'latencyWeight', 'varianceWeight'],
    'objective',
  );
  return {
    successWeight: readNonNegativeNumber(values, 'successWeight', DEFAULT_OBJECTIVE.successWeight),
    costWeight: readNonNegativeNumber(values, 'costWeight', DEFAULT_OBJECTIVE.costWeight),
    latencyWeight: readNonNegativeNumber(values, 'latencyWeight', DEFAULT_OBJECTIVE.latencyWeight),
    varianceWeight: readNonNegativeNumber(
      values,
      'varianceWeight',
      DEFAULT_OBJECTIVE.varianceWeight,
    ),
  };
}

function parseReporting(values: Record<string, Scalar> | undefined): ReportingConfig {
  ensureKeys(
    values,
    ['transferMatrix', 'ablations', 'paretoFrontiers', 'confidenceIntervals'],
    'reporting',
  );
  return {
    transferMatrix: readBoolean(values, 'transferMatrix', DEFAULT_REPORTING.transferMatrix),
    ablations: readBoolean(values, 'ablations', DEFAULT_REPORTING.ablations),
    paretoFrontiers: readBoolean(values, 'paretoFrontiers', DEFAULT_REPORTING.paretoFrontiers),
    confidenceIntervals: readBoolean(
      values,
      'confidenceIntervals',
      DEFAULT_REPORTING.confidenceIntervals,
    ),
  };
}

function readString(
  values: Record<string, Scalar> | undefined,
  key: string,
  fallback: string,
): string {
  const value = values?.[key];
  if (value === undefined) return fallback;
  return requireString(value, key);
}

function readPositiveInteger(
  values: Record<string, Scalar> | undefined,
  key: string,
  fallback: number,
): number {
  const value = values?.[key];
  if (value === undefined) return fallback;
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 1) {
    throw new Error(`${key} must be a positive integer`);
  }
  return value;
}

function readNonNegativeNumber(
  values: Record<string, Scalar> | undefined,
  key: string,
  fallback: number,
): number {
  const value = values?.[key];
  if (value === undefined) return fallback;
  if (typeof value !== 'number' || value < 0) {
    throw new Error(`${key} must be a non-negative number`);
  }
  return value;
}

function readBoolean(
  values: Record<string, Scalar> | undefined,
  key: string,
  fallback: boolean,
): boolean {
  const value = values?.[key];
  if (value === undefined) return fallback;
  if (typeof value !== 'boolean') throw new Error(`${key} must be a boolean`);
  return value;
}

function requireString(value: Scalar | undefined, name: string): string {
  if (typeof value !== 'string' || value.length === 0)
    throw new Error(`${name} must be a non-empty string`);
  return value;
}

function ensureKeys(
  values: Record<string, Scalar> | undefined,
  allowed: readonly string[],
  section: string,
): void {
  for (const key of Object.keys(values ?? {})) {
    if (!allowed.includes(key)) throw new Error(`${section}.${key} is not supported`);
  }
}

function parseScalar(raw: string): Scalar {
  const value = raw.trim().replace(/^['"]|['"]$/g, '');
  if (value === 'true') return true;
  if (value === 'false') return false;
  const number = Number(value);
  return Number.isNaN(number) ? value : number;
}

function isSection(value: string): value is Section {
  return SECTIONS.includes(value as Section);
}
