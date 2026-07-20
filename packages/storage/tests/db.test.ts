import { describe, expect, test } from 'bun:test';
import { HarnessDB } from '@harnessfit/storage';

describe('HarnessDB evaluations', () => {
  test('persists deterministic score components with a run', () => {
    const db = new HarnessDB(':memory:');
    db.saveRun({
      runId: 'run-1' as never,
      modelId: 'model-1' as never,
      taskId: 'task-1' as never,
      configHash: 'config-1' as never,
      seed: 1,
      trialNumber: 0,
      termination: 'completed',
      startTime: '2026-01-01T00:00:00.000Z',
      endTime: '2026-01-01T00:00:01.000Z',
      durationMs: 1000,
      turns: 1,
      toolCalls: 1,
      inputTokens: 1,
      outputTokens: 1,
      cachedTokens: 0,
      costUsd: 0.01,
      events: [],
    });
    db.saveEvaluation('run-1', true, {
      functional: 1,
      regression: 1,
      constraint: 1,
      quality: 1,
      total: 1,
      details: {
        functionalTestsPassed: 1,
        functionalTestsTotal: 1,
        regressionTestsPassed: 1,
        regressionTestsTotal: 1,
        typecheckPassed: true,
        lintPassed: true,
        constraintViolations: [],
        patchLineCount: 1,
        newDuplicationDetected: false,
        newLintViolations: 0,
      },
    });

    expect(db.getEvaluation('run-1')).toMatchObject({ runId: 'run-1', success: true, total: 1 });
    db.close();
  });
});
