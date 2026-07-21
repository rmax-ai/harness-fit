/**
 * SQLite storage layer for HarnessFit.
 *
 * Uses Bun's built-in `bun:sqlite` — zero dependencies.
 * WAL mode, foreign keys enforced, append-only event log.
 */
import { Database } from 'bun:sqlite';
import type { RunEvent, RunResult } from '@harnessfit/core';
import type { TaskScore } from '@harnessfit/evaluator';

export class HarnessDB {
  private db: Database;

  constructor(path = ':memory:') {
    this.db = new Database(path);
    this.db.exec('PRAGMA journal_mode=WAL');
    this.db.exec('PRAGMA foreign_keys=ON');
    this.migrate();
  }

  private migrate(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS schema_version (
        version INTEGER PRIMARY KEY
      );

      CREATE TABLE IF NOT EXISTS models (
        id TEXT PRIMARY KEY,
        provider TEXT NOT NULL,
        model TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      );

      CREATE TABLE IF NOT EXISTS harness_configs (
        hash TEXT PRIMARY KEY,
        config_json TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      );

      CREATE TABLE IF NOT EXISTS tasks (
        id TEXT PRIMARY KEY,
        category TEXT NOT NULL,
        difficulty TEXT NOT NULL,
        repository TEXT NOT NULL,
        metadata_json TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      );

      CREATE TABLE IF NOT EXISTS experiments (
        id TEXT PRIMARY KEY,
        definition_json TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'pending',
        started_at TEXT,
        completed_at TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      );

      CREATE TABLE IF NOT EXISTS runs (
        id TEXT PRIMARY KEY,
        experiment_id TEXT REFERENCES experiments(id),
        model_id TEXT NOT NULL,
        task_id TEXT NOT NULL,
        harness_config_hash TEXT NOT NULL,
        seed INTEGER NOT NULL,
        trial_number INTEGER NOT NULL,
        termination TEXT NOT NULL,
        failure_label TEXT,
        start_time TEXT NOT NULL,
        end_time TEXT,
        duration_ms INTEGER DEFAULT 0,
        turns INTEGER DEFAULT 0,
        tool_calls INTEGER DEFAULT 0,
        input_tokens INTEGER DEFAULT 0,
        output_tokens INTEGER DEFAULT 0,
        cached_tokens INTEGER DEFAULT 0,
        cost_usd REAL DEFAULT 0.0,
        patch_text TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      );

      CREATE TABLE IF NOT EXISTS run_events (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        run_id TEXT NOT NULL REFERENCES runs(id),
        sequence_number INTEGER NOT NULL,
        type TEXT NOT NULL,
        timestamp TEXT NOT NULL,
        data_json TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS run_evaluations (
        run_id TEXT PRIMARY KEY REFERENCES runs(id),
        success INTEGER NOT NULL,
        total_score REAL NOT NULL,
        functional_score REAL NOT NULL,
        regression_score REAL NOT NULL,
        constraint_score REAL NOT NULL,
        quality_score REAL NOT NULL,
        details_json TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      );

      CREATE INDEX IF NOT EXISTS idx_runs_experiment ON runs(experiment_id);
      CREATE INDEX IF NOT EXISTS idx_runs_model ON runs(model_id);
      CREATE INDEX IF NOT EXISTS idx_runs_task ON runs(task_id);
      CREATE INDEX IF NOT EXISTS idx_run_events_run ON run_events(run_id);
    `);

    // Insert schema version if not exists
    const version = this.db.query('SELECT version FROM schema_version').get();
    if (!version) {
      this.db.run('INSERT INTO schema_version (version) VALUES (1)');
    }
  }

  // ── Models ──────────────────────────────────────────

  registerModel(id: string, provider: string, model: string): void {
    this.db.run('INSERT OR REPLACE INTO models (id, provider, model) VALUES (?, ?, ?)', [
      id,
      provider,
      model,
    ]);
  }

  // ── Harness Configs ─────────────────────────────────

  saveConfig(hash: string, configJson: string): void {
    this.db.run('INSERT OR IGNORE INTO harness_configs (hash, config_json) VALUES (?, ?)', [
      hash,
      configJson,
    ]);
  }

  getConfig(hash: string): string | null {
    const row = this.db.query('SELECT config_json FROM harness_configs WHERE hash = ?').get(hash) as
      | { config_json: string }
      | undefined;
    return row?.config_json ?? null;
  }

  // ── Experiments ──────────────────────────────────────

  saveExperiment(id: string, definition: string): void {
    this.db.run(
      'INSERT OR IGNORE INTO experiments (id, definition_json, status, started_at) VALUES (?, ?, ?, ?)',
      [id, definition, 'running', new Date().toISOString()],
    );
  }

  completeExperiment(id: string): void {
    this.db.run('UPDATE experiments SET status = ?, completed_at = ? WHERE id = ?', [
      'completed',
      new Date().toISOString(),
      id,
    ]);
  }

  // ── Runs ────────────────────────────────────────────

  saveRun(run: RunResult, experimentId?: string): void {
    const stmt = this.db.prepare(`
      INSERT INTO runs (
        id, experiment_id, model_id, task_id, harness_config_hash,
        seed, trial_number, termination, failure_label,
        start_time, end_time, duration_ms, turns, tool_calls,
        input_tokens, output_tokens, cached_tokens, cost_usd, patch_text
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      run.runId,
      experimentId ?? null,
      run.modelId,
      run.taskId,
      run.configHash,
      run.seed,
      run.trialNumber,
      run.termination,
      run.failureLabel ?? null,
      run.startTime,
      run.endTime,
      run.durationMs,
      run.turns,
      run.toolCalls,
      run.inputTokens,
      run.outputTokens,
      run.cachedTokens,
      run.costUsd,
      run.patch ?? null,
    );

    // Save events
    const eventStmt = this.db.prepare(`
      INSERT INTO run_events (run_id, sequence_number, type, timestamp, data_json)
      VALUES (?, ?, ?, ?, ?)
    `);

    const tx = this.db.transaction(() => {
      for (const event of run.events) {
        eventStmt.run(
          run.runId,
          event.sequenceNumber,
          event.type,
          event.timestamp,
          JSON.stringify(event.data),
        );
      }
    });
    tx();
  }

  /** Persist the deterministic score projection for an already-recorded run. */
  saveEvaluation(runId: string, success: boolean, score: TaskScore): void {
    this.db.run(
      `INSERT OR REPLACE INTO run_evaluations (
        run_id, success, total_score, functional_score, regression_score,
        constraint_score, quality_score, details_json
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        runId,
        success ? 1 : 0,
        score.total,
        score.functional,
        score.regression,
        score.constraint,
        score.quality,
        JSON.stringify(score.details),
      ],
    );
  }

  getEvaluation(runId: string): StoredEvaluation | null {
    const row = this.db.query('SELECT * FROM run_evaluations WHERE run_id = ?').get(runId) as
      | StoredEvaluationRow
      | undefined;
    if (!row) return null;
    return {
      runId: row.run_id,
      success: row.success === 1,
      total: row.total_score,
      functional: row.functional_score,
      regression: row.regression_score,
      constraint: row.constraint_score,
      quality: row.quality_score,
      details: JSON.parse(row.details_json) as TaskScore['details'],
    };
  }

  getRun(runId: string): RunResult | null {
    const row = this.db.query('SELECT * FROM runs WHERE id = ?').get(runId) as
      | Record<string, unknown>
      | undefined;
    if (!row) return null;

    const events = this.db
      .query('SELECT * FROM run_events WHERE run_id = ? ORDER BY sequence_number')
      .all(runId) as {
      type: string;
      sequence_number: number;
      timestamp: string;
      data_json: string;
    }[];

    return {
      runId: row.id as string,
      modelId: row.model_id as string,
      taskId: row.task_id as string,
      configHash: row.harness_config_hash as string,
      seed: row.seed as number,
      trialNumber: row.trial_number as number,
      termination: row.termination as RunResult['termination'],
      failureLabel: row.failure_label as RunResult['failureLabel'],
      patch: row.patch_text as string | undefined,
      startTime: row.start_time as string,
      endTime: row.end_time as string,
      durationMs: row.duration_ms as number,
      turns: row.turns as number,
      toolCalls: row.tool_calls as number,
      inputTokens: row.input_tokens as number,
      outputTokens: row.output_tokens as number,
      cachedTokens: row.cached_tokens as number,
      costUsd: row.cost_usd as number,
      events: events.map(
        (e) =>
          ({
            type: e.type as RunEvent['type'],
            runId: row.id as string,
            sequenceNumber: e.sequence_number,
            timestamp: e.timestamp,
            data: JSON.parse(e.data_json),
          }) as RunEvent,
      ),
    } as unknown as RunResult;
  }

  /** Get all runs for an experiment. */
  getExperimentRuns(experimentId: string): readonly RunResult[] {
    const rows = this.db.query('SELECT id FROM runs WHERE experiment_id = ?').all(experimentId) as {
      id: string;
    }[];
    return rows.map((r) => this.getRun(r.id)).filter((r): r is RunResult => r !== null);
  }

  /** Get persisted runs together with their deterministic evaluation, when available. */
  getExperimentEvaluations(experimentId: string): readonly StoredExperimentEvaluation[] {
    const rows = this.db
      .query(
        `SELECT
          runs.id AS run_id,
          runs.model_id,
          runs.task_id,
          runs.trial_number,
          runs.termination,
          runs.failure_label,
          runs.duration_ms,
          runs.turns,
          runs.tool_calls,
          runs.cost_usd,
          run_evaluations.success,
          run_evaluations.total_score,
          run_evaluations.functional_score,
          run_evaluations.regression_score,
          run_evaluations.constraint_score,
          run_evaluations.quality_score,
          run_evaluations.details_json
        FROM runs
        LEFT JOIN run_evaluations ON run_evaluations.run_id = runs.id
        WHERE runs.experiment_id = ?
        ORDER BY runs.model_id, runs.task_id, runs.trial_number`,
      )
      .all(experimentId) as StoredExperimentEvaluationRow[];

    return rows.map((row) => ({
      runId: row.run_id,
      modelId: row.model_id,
      taskId: row.task_id,
      trialNumber: row.trial_number,
      termination: row.termination as RunResult['termination'],
      failureLabel: (row.failure_label ?? undefined) as RunResult['failureLabel'],
      durationMs: row.duration_ms,
      turns: row.turns,
      toolCalls: row.tool_calls,
      costUsd: row.cost_usd,
      evaluation:
        row.success === null
          ? null
          : {
              runId: row.run_id,
              success: row.success === 1,
              total: row.total_score ?? 0,
              functional: row.functional_score ?? 0,
              regression: row.regression_score ?? 0,
              constraint: row.constraint_score ?? 0,
              quality: row.quality_score ?? 0,
              details: JSON.parse(row.details_json ?? '{}') as TaskScore['details'],
            },
    }));
  }

  /** Get aggregate metrics for an experiment. */
  getExperimentSummary(experimentId: string): ExperimentSummary {
    const row = this.db
      .query(`
      SELECT
        COUNT(*) as total_runs,
        SUM(CASE WHEN termination = 'completed' THEN 1 ELSE 0 END) as completed,
        SUM(CASE WHEN termination != 'completed' THEN 1 ELSE 0 END) as failed,
        AVG(cost_usd) as avg_cost,
        SUM(cost_usd) as total_cost,
        AVG(duration_ms) as avg_duration,
        AVG(turns) as avg_turns
      FROM runs WHERE experiment_id = ?
    `)
      .get(experimentId) as Record<string, number | null> | undefined;

    if (!row)
      return {
        totalRuns: 0,
        completed: 0,
        failed: 0,
        avgCost: 0,
        totalCost: 0,
        avgDurationMs: 0,
        avgTurns: 0,
      };

    return {
      totalRuns: row.total_runs ?? 0,
      completed: row.completed ?? 0,
      failed: row.failed ?? 0,
      avgCost: row.avg_cost ?? 0,
      totalCost: row.total_cost ?? 0,
      avgDurationMs: row.avg_duration ?? 0,
      avgTurns: row.avg_turns ?? 0,
    };
  }

  close(): void {
    this.db.close();
  }
}

export interface ExperimentSummary {
  readonly totalRuns: number;
  readonly completed: number;
  readonly failed: number;
  readonly avgCost: number;
  readonly totalCost: number;
  readonly avgDurationMs: number;
  readonly avgTurns: number;
}

export interface StoredEvaluation {
  readonly runId: string;
  readonly success: boolean;
  readonly total: number;
  readonly functional: number;
  readonly regression: number;
  readonly constraint: number;
  readonly quality: number;
  readonly details: TaskScore['details'];
}

export interface StoredExperimentEvaluation {
  readonly runId: string;
  readonly modelId: string;
  readonly taskId: string;
  readonly trialNumber: number;
  readonly termination: RunResult['termination'];
  readonly failureLabel?: RunResult['failureLabel'];
  readonly durationMs: number;
  readonly turns: number;
  readonly toolCalls: number;
  readonly costUsd: number;
  readonly evaluation: StoredEvaluation | null;
}

interface StoredEvaluationRow {
  readonly run_id: string;
  readonly success: number;
  readonly total_score: number;
  readonly functional_score: number;
  readonly regression_score: number;
  readonly constraint_score: number;
  readonly quality_score: number;
  readonly details_json: string;
}

interface StoredExperimentEvaluationRow {
  readonly run_id: string;
  readonly model_id: string;
  readonly task_id: string;
  readonly trial_number: number;
  readonly termination: string;
  readonly failure_label: string | null;
  readonly duration_ms: number;
  readonly turns: number;
  readonly tool_calls: number;
  readonly cost_usd: number;
  readonly success: number | null;
  readonly total_score: number | null;
  readonly functional_score: number | null;
  readonly regression_score: number | null;
  readonly constraint_score: number | null;
  readonly quality_score: number | null;
  readonly details_json: string | null;
}
