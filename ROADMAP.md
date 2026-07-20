# HarnessFit — Roadmap

Phased implementation plan extracted from SPEC.md §31.

---

## v0.1.0 — M1: Deterministic Benchmark

**Goal:** One repository fixture, six tasks, hidden tests, sandbox reset, deterministic scoring.

**Deliverables:**
- [ ] `benchmarks/repositories/task-service/` — TypeScript repo (2K-8K lines, tests <30s, type-checked, linted)
- [ ] `benchmarks/tasks/` — 6 task definitions with hidden acceptance tests
- [ ] `packages/evaluator/deterministic/` — Test runner, scoring engine
- [ ] Sandbox reset mechanism (clean commit per trial)
- [ ] Scoring function (0.70 functional + 0.10 regression + 0.10 constraint + 0.10 patch quality)
- [ ] `benchmarks/hidden-tests/` — Isolated from writable working tree

**Acceptance criterion:** Same manually created patch → same score across 10 repeated evaluations.

**Est. Codex sessions:** 2-3

---

## v0.2.0 — M2: Provider-Neutral Runtime

**Goal:** Three provider adapters, common tools, event trace, cost accounting, runtime limits.

**Deliverables:**
- [ ] `packages/providers/openai/` — OpenAI adapter (normalize messages, tools, usage, errors)
- [ ] `packages/providers/anthropic/` — Anthropic adapter
- [ ] `packages/providers/google/` — Google adapter
- [ ] `packages/core/types/` — `ModelProvider`, `NormalizedModelRequest`, `NormalizedModelResponse`
- [ ] `packages/core/runtime/` — Agent edit loop (task init → context → model → tools → feedback → validate)
- [ ] `packages/core/tools/` — 8 tools: `list_files`, `read_file`, `search_files`, `write_file`, `apply_patch`, `run_command`, `git_diff`, `finish`
- [ ] `packages/core/events/` — 11 event types (append-only, typed)
- [ ] Cost accounting per run
- [ ] Runtime limits enforcement (turns, tool calls, wall time, output tokens, cost)

**Acceptance criterion:** All three models complete the same task through the same normalized tool interface.

**Est. Codex sessions:** 3-4

---

## v0.3.0 — M3: Parameterized Harness

**Goal:** Typed configuration, harness compiler, ≥12 mutable parameters, config hashing/diffing.

**Deliverables:**
- [ ] `packages/core/types/harness.ts` — `HarnessConfig` with 8 sub-configs
- [ ] `packages/harness/configs/` — Default/generic config, config validation
- [ ] `packages/harness/compiler/` — Deterministic `config → CompiledHarness`
- [ ] `packages/harness/mutations/` — Neighbor generation (single-parameter mutation)
- [ ] `packages/harness/prompts/` — Prompt templates per instruction style
- [ ] Configuration hashing (`hash(config) → same compiled harness`)
- [ ] Configuration diffing
- [ ] At least 12 mutable parameters across dimensions

**Acceptance criterion:** Two distinct configurations produce traceable, reproducible compiled harnesses.

**Est. Codex sessions:** 2-3

---

## v0.4.0 — M4: Baseline Experiment

**Goal:** 12 tasks, 3 models, 3 trials, generic harness, initial comparison report.

**Deliverables:**
- [ ] Expand to 12 tasks (mix of bug repair, feature, refactoring, code review, comprehension)
- [ ] `experiments/definitions/baseline.yaml` — Experiment config
- [ ] `apps/cli/` — CLI commands: `init`, `providers check`, `baseline`, `evaluate`
- [ ] `packages/evaluator/metrics/` — Full metric collection
- [ ] `packages/evaluator/reports/` — Report generation
- [ ] `packages/storage/` — SQLite schema, run persistence, event storage
- [ ] Baseline run: 3 models × 12 tasks × 3 trials = 108 runs
- [ ] Initial comparison report (generic harness baseline)

**Acceptance criterion:** Every model has complete success, cost, latency, and failure metrics.

**Est. Codex sessions:** 3-4

---

## v0.5.0 — M5: Hill-Climbing Optimizer

**Goal:** Neighbor generation, candidate evaluation, acceptance test, search budget, optimization history, random restarts.

**Deliverables:**
- [ ] `packages/optimizer/hill-climbing/` — Coordinate hill climbing algorithm
- [ ] `packages/optimizer/statistics/` — Bootstrap CI, paired permutation test, sequential test
- [ ] Acceptance rule: candidate utility > incumbent + minimum effect + statistical evidence
- [ ] `packages/optimizer/random-search/` — Random restart from different starting points
- [ ] Search budget enforcement (max candidates per model)
- [ ] Optimization history (all candidates, including rejected)
- [ ] CLI: `harnessfit optimize --model gpt-luna --search hill-climb --budget 120`

**Acceptance criterion:** Optimizer discovers and retains a configuration that improves a synthetic objective with known optimum.

**Est. Codex sessions:** 3-4

---

## v0.6.0 — M6: Full Experiment

**Goal:** 30 tasks, train/dev/test split, model-specific optimization, transfer matrix, ablations, dashboard, research report.

**Deliverables:**
- [ ] Expand to 30 tasks (12 train, 6 dev, 12 test)
- [ ] Three benchmark repositories (`task-service`, `payment-rules`, `event-processor`)
- [ ] At least one repository held-out (only in test split)
- [ ] `apps/dashboard/` — Static HTML dashboard with 5 views
- [ ] Transfer matrix CLI + report (`harnessfit transfer`)
- [ ] Ablation study (remove one feature at a time)
- [ ] Pareto frontier generation
- [ ] Full experiment run: 3 models × optimized harnesses × transfer matrix
- [ ] Research report auto-generation
- [ ] `experiments/results/` — Machine-readable dataset

**Acceptance criterion:** Final report can confirm, reject, or qualify the harness-fit hypothesis using held-out evidence.

**Est. Codex sessions:** 4-5

---

## v0.7.0 — Article & Publication

- [ ] Technical article (working title: *The Harness Gap*)
- [ ] Public dashboard deployment
- [ ] Dataset publication
- [ ] Follow-up research agenda

---

## Dependency Graph

```
M1 (Benchmark) ──► M2 (Runtime) ──► M3 (Harness) ──► M4 (Baseline) ──► M5 (Optimizer) ──► M6 (Full Experiment)
                                                                                              │
                                                                                              ▼
                                                                                     M7 (Article)
```

M1-M3 are infrastructure. M4 validates infrastructure end-to-end. M5 adds optimization. M6 is the full experiment. Each builds on the previous.
