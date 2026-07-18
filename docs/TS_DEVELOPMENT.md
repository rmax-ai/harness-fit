# TypeScript Development Conventions — HarnessFit

Companion to `AGENTS.md`. Day-to-day engineering patterns for working in this codebase.

## Module System

- **ESM only.** `"type": "module"` in root `package.json`. Use `import`/`export`, never `require`.
- **Import from package scope:** `import { AgentLoop } from "@harnessfit/core"` — never relative paths across packages.
- **Barrel exports:** Each package's `src/index.ts` re-exports public API. Internal modules are not importable from outside.
- **One concern per file.** `agent-loop.ts`, not `runtime.ts` with 800 lines.

## Async Patterns

- **`async/await` everywhere.** No raw promises, no `.then()` chains.
- **Provider calls are I/O-bound.** Use `await provider.generate(...)`, not callbacks.
- **Bun.$ is async:** `const result = await Bun.$`ls${dir}`.quiet()`.
- **SQLite is sync but fast.** `bun:sqlite` uses synchronous API. It's acceptable because experiments run sequentially, not on a hot path.

## Error Handling

```typescript
// Expected failures: return Result
function parseConfig(raw: string): Result<HarnessConfig, ConfigParseError> {
  try {
    const config = JSON.parse(raw);
    return { ok: true, value: validateConfig(config) };
  } catch (e) {
    return { ok: false, error: new ConfigParseError(e.message) };
  }
}

// Unexpected failures: throw
function assertInvariant(condition: boolean, message: string): asserts condition {
  if (!condition) throw new InvariantError(message);
}
```

- **Provider errors:** Catch SDK errors in adapters, normalize to `ProviderError` with `isRetryable` flag.
- **Never leak provider types** outside `packages/providers/`.
- **Error messages are for developers, not users.** Include context (model, run ID, attempt number).

## Logging

- **Structured key-value, not printf:** `console.log(JSON.stringify({ event: "run.started", runId, model, task }))`.
- **Levels:** `debug` (tool calls, events), `info` (run boundaries, decisions), `warn` (retries, budget close), `error` (failures).
- **No logging library for MVP.** `console.log` + `console.error` is sufficient. JSON lines can be parsed later.

## Testing

- **Test file naming:** `agent-loop.test.ts` (sibling to `agent-loop.ts`).
- **Mock providers in unit tests.** Use Bun's `mock.module()`:
  ```typescript
  mock.module("@harnessfit/providers-openai", () => ({
    OpenAIProvider: class {
      async generate() { return mockResponse; }
    },
  }));
  ```
- **Integration tests use `:memory:` SQLite.**
- **E2E tests run real Bun.$** against benchmark repos. Tag with `@e2e` and skip in CI (`bun test --grep-invert @e2e`).

## Profiling

- **`bun --inspect`** for CPU profiles.
- **`console.time('label')` / `console.timeEnd('label')`** for quick measurements.
- **Don't optimize prematurely.** Target: 600s per run. Profile only if exceeding.

## Observability

- **Every run emits typed events** (see `RunEvent` in SPEC.md §22). Store all, filter later.
- **Run metadata:** `run_id`, `model_id`, `harness_config_hash`, `task_id`, `seed`, `trial_number`.
- **Cost tracking:** Every model call records `input_tokens`, `output_tokens`, `cached_tokens`, `cost_usd`.
