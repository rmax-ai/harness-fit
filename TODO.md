# HarnessFit — Remaining Work

> Last updated: 2026-07-19 · 12 commits · 91 tests · v0.1.0

## In Progress

### 1. Make `bun harnessfit baseline` work end-to-end
Wire coordinator + agent loop + evaluator + storage through the CLI.
Goal: `bun harnessfit baseline --experiment experiments/definitions/default.yaml` runs
the task-service benchmark against a real model and produces scores.

- [ ] Load experiment YAML config (models, tasks, trials)
- [ ] Create provider adapters from config
- [ ] Wire ExperimentCoordinator into CLI baseline command
- [ ] Execute trial: sandbox setup → agent loop → evaluate → persist
- [ ] Output results (JSON/text) to experiments/results/
- [ ] Acceptance: `bun harnessfit baseline` completes against task-service

### 2. Provider integration tests
Add `*.integration.test.ts` that hits real APIs, gated behind env var.

- [ ] OPENAI_API_KEY integration test (gated: `HARNESSFIT_LIVE_TEST=1`)
- [ ] ANTHROPIC_API_KEY integration test
- [ ] GOOGLE_API_KEY integration test
- [ ] Test: adapter → real API → normalized response structure valid
- [ ] Test: estimateCost returns USD > 0
- [ ] Test: capabilities() returns expected structure

### 3. README honesty pass
Align README and website claims with what actually works.

- [ ] Add "Status: MVP" section — what's real vs aspirational
- [ ] Remove or mark placeholder CLI commands (optimize, transfer, report)
- [ ] Verify every README code block runs successfully
- [ ] Sync website content with README
- [ ] Verify test count, stack list, and metrics are accurate

## Backlog

### 4. CI that gates on typecheck + test
- [ ] Add/verify `.github/workflows/ci.yml` with `bun install && bun run check && bun run test`
- [ ] Suppress pre-existing biome style lint warnings or fix them
- [ ] Green CI badge on README

### 5. Benchmark task expansion (12 tasks)
- [ ] 6 more benchmark repos/tasks across categories (bug, feature, refactor, comprehension)
- [ ] Hidden acceptance tests for each
- [ ] Task definitions (task.json) for each

### 6. `bun harnessfit optimize` implementation
- [ ] Wire hill-climbing optimizer to CLI
- [ ] Iteration loop: config → trial → score → neighbor → repeat
- [ ] Statistical acceptance gate
- [ ] Random restarts

### 7. Report generation
- [ ] `bun harnessfit report --experiment X --output reports/`
- [ ] JSON output (full data)
- [ ] Markdown summary output

### 8. Transfer matrix
- [ ] Cross-model orchestration: every harness × every model
- [ ] Matrix output (CSV/JSON)

### 9. Dashboard app
- [ ] Static HTML that reads experiments/results/
- [ ] Score tables, per-model comparison, config diffs
