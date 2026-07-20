import { describe, expect, test } from 'bun:test';
import { parseExperimentConfig } from './parser';

describe('parseExperimentConfig', () => {
  test('parses all baseline settings that the CLI uses', () => {
    const config = parseExperimentConfig(`id: local-baseline

models:
  - id: openai
    provider: openai
    model: gpt-5

trials: 2
`);

    expect(config).toEqual({
      id: 'local-baseline',
      models: [{ id: 'openai', provider: 'openai', model: 'gpt-5' }],
      trials: 2,
    });
  });

  test('rejects configuration sections that baseline does not use', () => {
    expect(() =>
      parseExperimentConfig(`id: local-baseline
models:
  - id: openai
    provider: openai
    model: gpt-5
benchmark:
  trainingSplit: train
`),
    ).toThrow('Baseline supports only id, models, and trials');
  });
});
