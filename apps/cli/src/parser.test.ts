import { describe, expect, test } from 'bun:test';
import { parseExperimentConfig } from './parser';

describe('parseExperimentConfig', () => {
  test('parses the full experiment contract', () => {
    const config = parseExperimentConfig(`id: local-baseline

models:
  - id: openai
    provider: openai
    model: gpt-5

benchmark:
  trainingSplit: train
  developmentSplit: dev
  testSplit: test

trials:
  search: 2
  finalists: 4
  headline: 8

optimizer:
  algorithm: coordinate-hill-climbing
  randomRestarts: 2
  maximumCandidatesPerModel: 40
  minimumSuccessImprovement: 0.05

limits:
  maxTurns: 12
  maxToolCalls: 20
  maxWallTimeSeconds: 300
  maxOutputTokens: 8000
  maxCostUsdPerRun: 1.5

objective:
  successWeight: 1
  costWeight: 0.2
  latencyWeight: 0.1
  varianceWeight: 0.15

reporting:
  transferMatrix: false
  ablations: true
  paretoFrontiers: false
  confidenceIntervals: true
`);

    expect(config.id).toBe('local-baseline');
    expect(config.models).toEqual([{ id: 'openai', provider: 'openai', model: 'gpt-5' }]);
    expect(config.benchmark).toEqual({
      trainingSplit: 'train',
      developmentSplit: 'dev',
      testSplit: 'test',
    });
    expect(config.trials).toEqual({ search: 2, finalists: 4, headline: 8 });
    expect(config.optimizer.maximumCandidatesPerModel).toBe(40);
    expect(config.limits).toEqual({
      maxTurns: 12,
      maxToolCalls: 20,
      maxWallTimeSeconds: 300,
      maxOutputTokens: 8000,
      maxCostUsdPerRun: 1.5,
    });
    expect(config.objective.costWeight).toBe(0.2);
    expect(config.reporting.transferMatrix).toBeFalse();
  });

  test('rejects unsupported settings instead of silently ignoring them', () => {
    expect(() =>
      parseExperimentConfig(`id: local-baseline
models:
  - id: openai
    provider: openai
    model: gpt-5
trials:
  unknownTier: 3
`),
    ).toThrow('trials.unknownTier is not supported');
  });
});
