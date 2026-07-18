# AGENTS.md — Guidelines for HarnessFit

This document captures the conventions that all contributors and AI coding agents should follow when working on **HarnessFit**.

---

## 1. Project DNA

- **Mission:** Measure and optimize how agent harnesses interact with language models. Harnesses are empirical objects — not folklore.
- **Stack:** TypeScript, Bun runtime, SQLite storage. No Node.js. Use `bun` for everything (runtime, test runner, package manager).
- **Style:** Research-grade engineering. Correctness over cleverness. Determinism over convenience. Reproducibility is a feature.
- **License:** Apache-2.0.

## 2. Code Organisation

- Monorepo with `apps/` and `packages/`. See `docs/ARCHITECTURE.md` for full layout.
- `packages/core/` has zero provider dependencies. It defines types, runtime, tools, and events.
- `packages/providers/` contains one adapter per provider. Each adapter is a self-contained module.
- `apps/cli/` is the entry point. Thin — delegates to packages.
- `apps/dashboard/` is static HTML. No framework required for MVP.
- Import paths use package names (`@harnessfit/core`, `@harnessfit/providers/openai`), not relative paths.
- One export per module's public API. Internal details stay internal.

## 3. TypeScript Conventions

- **Strict mode everywhere.** `strict: true` in tsconfig. No `any` without explicit `// eslint-disable` and justification.
- **Interfaces over type aliases** for public API surfaces. Types for unions and utilities.
- **Branded types** for IDs: `type RunId = string & { __brand: 'RunId' }`.
- **Discriminated unions** for event types (see `RunEvent` in SPEC.md §22).
- **Readonly by default.** Arrays and objects that shouldn't mutate are `readonly`.
- **No classes** for data models. Use interfaces + plain objects. Classes only for stateful services (adapters, runtime).
- **No enums** for wire-format values. Use `as const` string unions. Enums reserved for internal state machines.

## 4. Error Handling

- **Result type over exceptions** for expected failures:
  ```typescript
  type Result<T, E = Error> = { ok: true; value: T } | { ok: false; error: E };
  ```
- Exceptions only for truly unexpected conditions (programmer error, invariant violation).
- Provider errors must be normalized. Never leak provider-specific error types outside the adapter.
- Every run failure gets a deterministic `FailureLabel` (see SPEC.md §27).

## 5. Testing

- **Tests alongside source:** `packages/core/src/runtime/agent-loop.test.ts`.
- **Bun test runner** (`bun test`). No Jest, no Vitest.
- **Test categories:**
  - `*.test.ts` — unit tests (fast, no I/O)
  - `*.integration.test.ts` — integration (provider calls, SQLite, filesystem)
  - `*.e2e.test.ts` — end-to-end (full run against benchmark repo)
- **Determinism:** Tests that involve model calls must mock the provider. The scoring system must produce identical output for identical input.
- **Hidden tests** run in a separate process, outside the writable working tree. They are never in `packages/`.
- **Benchmark repos** live in `benchmarks/repositories/`. Tests in CI clone them fresh.

## 6. Documentation

- **SPEC.md is the ground truth.** Every architectural decision traces back to a SPEC.md section.
- **ARCHITECTURE.md** is kept current with every structural change. PRs that change architecture must update it.
- **Inline comments** explain *why*, not *what*. The *what* should be clear from types and names.
- **No doc comments on private internals.** Public API only.

## 7. Performance

- **Profile before optimizing.** The MVP target is 600s per run. Don't micro-optimize prematurely.
- **SQLite with WAL mode** for concurrent reads during experiments.
- **Stream provider responses** — don't buffer entire model outputs in memory.
- **Repository sandbox clones** use shallow clones or copy-on-write where available.
- **Large artifacts** (transcripts, patches) stored as compressed filesystem blobs, not in SQLite rows.

## 8. Dependencies

- **Minimal dependencies.** Bun + SQLite should cover 80% of needs.
- **No framework** for the dashboard. Static HTML + vanilla JS for MVP.
- **Provider SDKs** (`@anthropic-ai/sdk`, `openai`, `@google/generative-ai`) are the only heavyweight deps.
- **No ORM.** Raw SQL with typed wrappers for SQLite.
- **Version pinning:** `bun.lockb` committed. Exact versions, no ranges.

## 9. Formatting and Linting

- **Formatter:** `bunx biome format --write .` (Biome, not Prettier).
- **Linter:** `bunx biome lint .` (Biome, not ESLint).
- **Type check:** `bun run typecheck` (delegates to `tsc --noEmit`).
- **CI gate:** `bun run check` runs format + lint + typecheck + test.

## 10. CI / CD

- GitHub Actions. Matrix across Bun versions (current LTS).
- Required checks: format, lint, typecheck, test.
- No deployment — this is a research CLI tool. Dashboard is static HTML served locally.

## 11. Architecture Non-Negotiables

These come from SPEC.md and are not up for debate:

1. **Provider-agnostic runtime.** The agent loop must work identically regardless of which provider is behind the adapter.
2. **Deterministic compilation.** `hash(config) → same CompiledHarness`. Always.
3. **Event log as system of record.** Every runtime action emits a typed event. No final-transcript-only storage.
4. **Hidden tests outside writable tree.** The model's sandbox must not access acceptance tests.
5. **Clean repo per trial.** Task fixtures reset from a clean commit. No state leaks between trials.
6. **Content-addressable.** Every configuration, task, repo version, and result has a stable identifier.
7. **Reproducible runs.** Same model + config + task + seed → same result (modulo provider nondeterminism).
8. **Statistical acceptance.** No claiming improvement without bootstrap CI, permutation test, or sequential test.

## 12. References

- `SPEC.md` — Authoritative specification (38 sections)
- `docs/ARCHITECTURE.md` — System architecture and component design
- `docs/THREAT_MODEL.md` — Threat analysis and validity controls
- `docs/ROADMAP.md` — Phased implementation plan
- `docs/DECISIONS.md` — Design rationale and rejected alternatives
- `docs/RESEARCH.md` — Stack research: Bun, TypeScript, SQLite, provider SDKs
- `docs/TS_DEVELOPMENT.md` — Day-to-day TS patterns: async, errors, testing, logging
- `docs/TS_API_DESIGN.md` — Type design: interfaces, branded types, Result, configs
- `docs/TS_SYSTEM_DESIGN_PATTERNS.md` — Domain patterns: agent loop, adapter, compiler, event store
- `docs/TS_ARCHITECTURE.md` — Monorepo layout, module boundaries, dependency direction
