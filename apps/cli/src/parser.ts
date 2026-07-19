/**
 * Minimal YAML config parser for HarnessFit experiment definitions.
 * Handles the flat key-value + simple list-of-objects structure.
 */

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
}

/**
 * Parse a simple YAML experiment config file.
 */
export function parseExperimentConfig(raw: string): ExperimentConfig {
  const lines = raw.split('\n');
  const config: Record<string, unknown> = {};
  const models: Array<Record<string, string>> = [];
  let currentModel: Record<string, string> | null = null;

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;

    // List item: "- key: value"
    const listItemMatch = trimmed.match(/^-\s+(\w[\w-]*)\s*:\s*(.+)$/);
    if (listItemMatch?.[1]) {
      const key = listItemMatch[1];
      const value = cleanValue(listItemMatch[2] ?? '');
      if (key === 'id') {
        currentModel = { id: value };
        models.push(currentModel);
      } else if (currentModel) {
        currentModel[key] = value;
      }
      continue;
    }

    // Indented continuation of a list item (no leading dash)
    // e.g. "    provider: google"
    const indentMatch = trimmed.match(/^(\w[\w-]*)\s*:\s*(.+)$/);
    if (indentMatch?.[1] && currentModel && line.startsWith(' ') && !line.startsWith('-')) {
      const key = indentMatch[1];
      const value = cleanValue(indentMatch[2] ?? '');
      currentModel[key] = value;
      continue;
    }

    // Top-level scalar: "key: value"
    const scalarMatch = trimmed.match(/^(\w[\w-]*)\s*:\s*(.+)$/);
    if (scalarMatch?.[1]) {
      const key = scalarMatch[1];
      const value = cleanValue(scalarMatch[2] ?? '');
      // Try numeric
      const num = Number(value);
      config[key] = isNaN(num) ? value : num;
    }
  }

  const trials = (config.trials as Record<string, number>)?.search ?? 1;

  return {
    id: config.id as string,
    models: models as ExperimentConfig['models'],
    trials: typeof trials === 'number' ? trials : 1,
  };
}

function cleanValue(raw: string): string {
  return raw.replace(/#.*$/, '').trim().replace(/^["']|["']$/g, '');
}
