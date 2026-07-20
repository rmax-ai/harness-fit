/**
 * Parser for the baseline experiment configuration supported by the CLI.
 */

const PROVIDERS = ['openai', 'anthropic', 'google'] as const;

type Provider = (typeof PROVIDERS)[number];

interface ExperimentModel {
  readonly id: string;
  readonly provider: Provider;
  readonly model: string;
}

export interface ExperimentConfig {
  readonly id: string;
  readonly models: readonly ExperimentModel[];
  readonly trials: number;
}

/** Parse the limited YAML shape currently supported by `harnessfit baseline`. */
export function parseExperimentConfig(raw: string): ExperimentConfig {
  let id: string | undefined;
  let trials = 1;
  let inModels = false;
  let currentModel: Partial<ExperimentModel> | undefined;
  const models: ExperimentModel[] = [];

  for (const [index, rawLine] of raw.split('\n').entries()) {
    const lineNumber = index + 1;
    const line = rawLine.replace(/#.*$/, '');
    const trimmed = line.trim();
    if (!trimmed) continue;

    const modelMatch = line.match(/^\s+-\s+id:\s*(.+)$/);
    if (modelMatch) {
      if (!inModels) {
        throw new Error(`Line ${lineNumber}: model entries must be under models:`);
      }
      currentModel = { id: cleanValue(modelMatch[1]) };
      continue;
    }

    const modelPropertyMatch = line.match(/^\s+(provider|model):\s*(.+)$/);
    if (modelPropertyMatch) {
      if (!inModels || !currentModel) {
        throw new Error(`Line ${lineNumber}: model properties require a preceding model id`);
      }
      const [, key, value] = modelPropertyMatch;
      currentModel[key] = cleanValue(value);
      if (currentModel.id && currentModel.provider && currentModel.model) {
        models.push(validateModel(currentModel, lineNumber));
        currentModel = undefined;
      }
      continue;
    }

    const modelsSectionMatch = line.match(/^models:\s*$/);
    if (modelsSectionMatch) {
      inModels = true;
      continue;
    }

    const scalarMatch = line.match(/^(id|trials):\s*(.+)$/);
    if (scalarMatch) {
      const [, key, value] = scalarMatch;
      if (key === 'id') {
        id = cleanValue(value);
      } else {
        trials = parseTrials(cleanValue(value), lineNumber);
      }
      continue;
    }

    throw new Error(
      `Line ${lineNumber}: unsupported configuration. Baseline supports only id, models, and trials.`,
    );
  }

  if (!id) {
    throw new Error('Missing required experiment id');
  }
  if (currentModel) {
    throw new Error(`Model ${currentModel.id ?? '<unknown>'} must specify provider and model`);
  }
  if (models.length === 0) {
    throw new Error('At least one model is required');
  }

  return { id, models, trials };
}

function parseTrials(value: string, lineNumber: number): number {
  const trials = Number(value);
  if (!Number.isInteger(trials) || trials < 1) {
    throw new Error(`Line ${lineNumber}: trials must be a positive integer`);
  }
  return trials;
}

function validateModel(model: Partial<ExperimentModel>, lineNumber: number): ExperimentModel {
  if (!model.id || !model.provider || !model.model) {
    throw new Error(`Line ${lineNumber}: each model requires id, provider, and model`);
  }
  if (!PROVIDERS.includes(model.provider as Provider)) {
    throw new Error(`Line ${lineNumber}: unsupported provider ${model.provider}`);
  }
  return {
    id: model.id,
    provider: model.provider as Provider,
    model: model.model,
  };
}

function cleanValue(raw: string): string {
  return raw.trim().replace(/^['"]|['"]$/g, '');
}
