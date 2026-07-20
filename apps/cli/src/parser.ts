/**
 * Minimal YAML config parser for HarnessFit experiment definitions.
 * Handles the flat key-value + simple list-of-objects structure.
 */

export interface ExperimentLimits {
  maxTurns: number;
  maxToolCalls: number;
  maxWallTimeSeconds: number;
  maxCostUsd: number;
}

export interface ExperimentConfig {
  id: string;
  models: Array<{
    id: string;
    provider: 'openai' | 'anthropic' | 'google';
    model: string;
  }>;
  trials: number;
  benchmark?: {
    tasksDir?: string;
    reposDir?: string;
  };
  limits?: ExperimentLimits;
}

/**
 * Parse a simple YAML experiment config file.
 * Handles top-level scalars, nested sections, and list-of-objects for models.
 */
export function parseExperimentConfig(raw: string): ExperimentConfig {
  const lines = raw.split('\n');
  const config: Record<string, unknown> = {};
  const models: Array<Record<string, string>> = [];
  let currentModel: Record<string, string> | null = null;
  let currentSection: string | null = null;
  const sections: Record<string, Record<string, unknown>> = {};

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;

    // Check if this line starts a section: "key:" at indent level 0 with no value
    const sectionMatch = trimmed.match(/^(\w[\w-]*):$/);
    if (sectionMatch && !line.startsWith(' ')) {
      const sectionName = sectionMatch[1]!;
      // Skip models — handled via list-item parsing
      if (sectionName !== 'models') {
        currentSection = sectionName;
        sections[sectionName] = {};
      }
      currentModel = null;
      continue;
    }

    // List item: "- key: value"
    const listItemMatch = trimmed.match(/^-\s+(\w[\w-]*)\s*:\s*(.+)$/);
    if (listItemMatch?.[1]) {
      const key = listItemMatch[1];
      const value = cleanValue(listItemMatch[2] ?? '');
      currentSection = null;
      if (key === 'id') {
        currentModel = { id: value };
        models.push(currentModel);
      } else if (currentModel) {
        currentModel[key] = value;
      }
      continue;
    }

    // Indented key: value under current model
    const indentMatch = trimmed.match(/^(\w[\w-]*)\s*:\s*(.+)$/);
    if (indentMatch?.[1] && currentModel && line.startsWith(' ') && !line.startsWith('-')) {
      const key = indentMatch[1];
      const value = cleanValue(indentMatch[2] ?? '');
      currentModel[key] = value;
      continue;
    }

    // Indented key: value under current section
    if (indentMatch?.[1] && currentSection && line.startsWith(' ') && !line.startsWith('-')) {
      const key = indentMatch[1];
      const value = cleanValue(indentMatch[2] ?? '');
      const num = Number(value);
      sections[currentSection]![key] = isNaN(num) ? value : num;
      continue;
    }

    // Top-level scalar: "key: value"
    const scalarMatch = trimmed.match(/^(\w[\w-]*)\s*:\s*(.+)$/);
    if (scalarMatch?.[1]) {
      const key = scalarMatch[1];
      const value = cleanValue(scalarMatch[2] ?? '');
      const num = Number(value);
      config[key] = isNaN(num) ? value : num;
      currentSection = null;
    }
  }

  const trials = (config.trials as Record<string, number>)?.search ?? 1;

  // Extract limits section, normalizing YAML key names to match coordinator Expectations
  const limitsRaw = sections.limits ?? {};
  const limits: ExperimentConfig['limits'] =
    Object.keys(limitsRaw).length > 0
      ? {
          maxTurns: (limitsRaw.maxTurns as number) ?? 24,
          maxToolCalls: (limitsRaw.maxToolCalls as number) ?? 40,
          maxWallTimeSeconds: (limitsRaw.maxWallTimeSeconds as number) ?? 600,
          maxCostUsd: ((limitsRaw.maxCostUsdPerRun ?? limitsRaw.maxCostUsd) as number) ?? 5,
        }
      : undefined;

  return {
    id: config.id as string,
    models: models as ExperimentConfig['models'],
    trials: typeof trials === 'number' ? trials : 1,
    limits,
  };
}

function cleanValue(raw: string): string {
  return raw.replace(/#.*$/, '').trim().replace(/^["']|["']$/g, '');
}
