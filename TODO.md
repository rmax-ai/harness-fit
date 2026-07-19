# HarnessFit — Remaining Work

> Last updated: 2026-07-19 · 12 commits · 91 tests · v0.1.0

## Done ✓

### 1. Make `bun harnessfit baseline` work end-to-end ✓
- [x] Load experiment YAML config
- [x] Create provider adapters from config
- [x] Wire ExperimentCoordinator into CLI baseline command
- [x] Execute trial: sandbox setup → agent loop → evaluate → persist
- [x] Output results (JSON/text) to experiments/results/
- [x] Acceptance: pipeline flows (provider_error without keys, completed with keys)

### 2. Provider integration tests ✓
- [x] OPENAI_API_KEY integration test (gated: `HARNESSFIT_LIVE_TEST=1`)
- [x] ANTHROPIC_API_KEY integration test
- [x] GOOGLE_API_KEY integration test
- [x] Test: adapter → real API → normalized response
- [x] Test: estimateCost returns USD > 0
- [x] Test: capabilities() returns expected structure

### 3. README honesty pass ✓
- [x] Add "Status: MVP" section — what's real vs aspirational
- [x] Separate working commands from "coming in v0.2.0"
- [x] All listed commands actually work

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
