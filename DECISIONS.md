# HarnessFit — Decisions

Design rationale: why choices were made, what was considered, what was rejected.

---

## Major Assumptions

1. **Single-machine execution is sufficient for MVP.** Distributed execution adds complexity that doesn't help validate the core hypothesis. A single machine can run 120 candidates × 3 trials × 3 models serially within weeks.

2. **SQLite scales to this experiment size.** With ~50 configs × 3 trials × 30 tasks × 3 models = ~13,500 runs, SQLite handles this easily. PostgreSQL would be operational overhead without benefit.

3. **Three benchmark repositories are enough.** The spec explicitly says "rather than relying initially on large public repositories." Controlled, small repos reduce environmental variance and make results interpretable.

4. **Coordinate hill climbing is the right first optimizer.** It's simple, interpretable, and directly answers "which parameters matter?" More sophisticated optimizers (Bayesian, evolutionary) are V2.

5. **TypeScript/Bun over Python.** The spec mandates TypeScript. This is likely because: (a) benchmark repos are TypeScript, reducing language mismatch, (b) Bun provides a single tool for runtime + testing + package management, (c) TypeScript's type system models the harness config interfaces precisely.

---

## Key Decisions

### D1: Monorepo with apps/ and packages/

**Chosen:** `apps/cli/`, `apps/dashboard/`, `packages/core/`, `packages/providers/`, etc.
**Why:** Clean dependency boundaries. `core` has zero provider deps. `providers/*` depend on `core`. `apps/cli` depends on everything. `apps/dashboard` is independent static HTML.
**Rejected:** Flat single-package. Would mix provider SDKs into core, making it impossible to test the runtime without real API keys.

### D2: Provider normalization layer

**Chosen:** Each provider gets an adapter implementing `ModelProvider`. Adapter normalizes messages, tools, usage, errors into common types. Provider-native fields preserved alongside normalized.
**Why:** The experiment requires identical tools and task definitions across providers (§9). Normalization makes the agent runtime provider-agnostic. Preserving native fields enables post-hoc analysis of provider-specific behavior.
**Rejected:** Direct provider SDK usage in the runtime. Would couple the agent loop to provider-specific types, making it impossible to swap models without code changes.

### D3: Deterministic harness compiler

**Chosen:** `hash(config) → same CompiledHarness`. Store both declarative config and compiled output.
**Why:** Reproducibility (§30). Two researchers with the same config file must produce identical compiled harnesses. Without this, "model-specific" differences could be compiler nondeterminism.
**Rejected:** Runtime config interpretation. Would make it impossible to audit what prompt/tools/policy a model actually received.

### D4: Event log as system of record

**Chosen:** Append-only typed event stream stored per run. 11 event types covering the full lifecycle.
**Why:** Transcripts are lossy — they don't capture timing, retries, validation events, or limit enforcement. Events enable replay, debugging, cost attribution, and future optimizer development. "Avoid storing only final transcripts" (§22).
**Rejected:** Storing only final transcripts + metrics. Would lose behavioral data needed for V2-V6 analysis.

### D5: SQLite with typed wrappers, no ORM

**Chosen:** Raw SQL with TypeScript wrappers that return typed results.
**Why:** The schema is small and stable (11 tables). An ORM adds abstraction overhead without benefit. Raw SQL gives full control over queries, indices, and WAL configuration.
**Rejected:** Drizzle, Prisma, Knex. All add dependencies, migration complexity, and type-system friction for a schema this size.

### D6: Static HTML dashboard, no framework

**Chosen:** Plain HTML + vanilla JS + CSS. Single file or minimal build.
**Why:** The dashboard is read-only. Five views with tables, charts, and a heatmap. No interactivity beyond filtering. A framework (React, Svelte) would add build complexity and bundle size for no benefit.
**Rejected:** React, SvelteKit, Next.js. Overkill for a local research dashboard.

### D7: Coordinate hill climbing over Bayesian optimization

**Chosen:** Coordinate ascent — mutate one parameter at a time, accept improvements.
**Why:** Interpretability. Each step answers "did changing planning mode improve success?" Bayesian optimization is more sample-efficient but produces a black-box optimum. For a research project studying *which parameters matter*, interpretability dominates efficiency.
**Rejected:** Bayesian optimization, evolutionary search, random search. All V2 extensions. Hill climbing first because it directly tests H4 (parameter concentration).

### D8: Scoring weights frozen at spec values

**Chosen:** 0.70 functional + 0.10 regression + 0.10 constraint + 0.10 patch quality.
**Why:** The spec defines these explicitly (§14). Changing them mid-experiment would invalidate comparisons. The utility function weights are configurable per experiment (§15, §25) — the *task score* weights are fixed.
**Rejected:** Learned weights, per-task weights. Would make results incomparable across experiments.

### D9: `Result<T, E>` over exceptions

**Chosen:** Explicit result types for expected failures (provider errors, tool failures, validation failures). Exceptions only for invariant violations.
**Why:** The runtime handles many expected failure modes (rate limits, invalid tool calls, context exhaustion). Result types force callers to handle them. Exceptions would make the control flow implicit and error-prone.
**Rejected:** Try/catch everywhere. Would obscure which failures are expected vs catastrophic.

---

## Known Limitations

- **Single-machine only.** Cannot parallelize across machines. A full experiment (120 candidates × 3 trials × 30 tasks × 3 models) may take days.
- **No incremental benchmarking.** If a task or repo changes, all prior results are invalidated. No partial re-run support in MVP.
- **Provider nondeterminism cannot be fully controlled.** Some providers don't support seeding. The spec acknowledges this (§13, §30).
- **Small benchmark size (30 tasks).** Results may not generalize to larger, more diverse benchmarks. This is intentional for MVP but limits external validity.
- **TypeScript-only tasks.** Models may perform differently on Python or multi-language repos. This is controlled for internal validity but limits generalizability.
- **No human baseline.** Without human performance on the same tasks, it's unclear what "good" success rates are.
- **Cost estimation is approximate.** Provider pricing changes. The spec requires a pricing snapshot date (§30) but actual costs may drift.
