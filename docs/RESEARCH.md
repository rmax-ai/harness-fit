# Phase 1 Research: TypeScript + Bun + SQLite for HarnessFit

## 1. Runtime: Bun

- **Version:** Bun 1.2.x+ (current stable). LTS not yet declared by Bun team — pin `bun` version in CI matrix.
- **Monorepo:** Bun workspaces via `bunfig.toml` or `package.json` `"workspaces"`. Use `"workspaces": ["packages/*", "apps/*"]`.
- **Package manager:** `bun install` (no npm/pnpm/yarn). Lockfile: `bun.lockb` (binary, committed).
- **Scripts:** `bun run <script>` in root `package.json`. Common: `"typecheck": "tsc --noEmit"`, `"lint": "biome lint ."`, `"format": "biome format --write ."`.
- **Binary entry:** `apps/cli/package.json` with `"bin": { "harnessfit": "./dist/cli.js" }`. Root `package.json` maps via workspace.
- **Testing:** `bun test` — built-in, Jest-compatible API. No Jest/Vitest needed. Fast startup, native TS support.
- **SQLite:** `bun:sqlite` built-in module. Synchronous API, WAL mode, prepared statements. No better-sqlite3 or node-sqlite3 needed.
- **File I/O:** `Bun.file()`, `Bun.write()`, `Bun.readableStreamToJSON()` — use over `fs/promises` where performance matters.
- **Shell:** `Bun.$` tagged template for subprocess execution. Returns `{ stdout, stderr, exitCode }`. Use for sandboxed command execution in agent runtime.
- **Environment:** `Bun.env` for typed env access. `.env` auto-loaded by Bun (no dotenv needed).

## 2. TypeScript

- **Config:** Strict mode everywhere (`"strict": true`). Base `tsconfig.json` at root with paths for `@harnessfit/*` packages. Each package extends base.
- **Module:** `"module": "ESNext"`, `"moduleResolution": "bundler"` (Bun supports this natively).
- **Target:** `"target": "ESNext"` — Bun runs latest JS.
- **No `any`:** Strict linting via Biome. `any` only with explicit `// biome-ignore lint/suspicious/noExplicitAny: <reason>`.
- **Branded types:** `type RunId = string & { readonly __brand: unique symbol }` for entity IDs.
- **Discriminated unions:** For event types (`RunEvent`), error types, harness config variants.
- **`as const` string unions:** For wire-format values (harness parameter options, failure labels). No TypeScript enums for serialized values.
- **`readonly` by default:** Arrays, objects, function params.
- **Result type:** `type Result<T, E = Error> = { ok: true; value: T } | { ok: false; error: E }` — over exceptions.
- **No classes for data:** Interfaces + plain objects. Classes only for stateful services (adapters, runtime, sandbox manager).

## 3. Monorepo Structure (Bun Workspaces)

```
harness-fit/
├── package.json          # Workspaces root, scripts
├── bunfig.toml           # Bun configuration
├── tsconfig.json         # Base TypeScript config
├── biome.json            # Formatter + linter config
├── apps/
│   ├── cli/              # package.json: "@harnessfit/cli"
│   │   ├── src/
│   │   │   ├── cli.ts    # Main entry, argument parsing
│   │   │   └── commands/ # One file per CLI command
│   │   └── tsconfig.json # Extends ../../tsconfig.json
│   └── dashboard/        # package.json: "@harnessfit/dashboard"
│       └── src/          # Static HTML generator
├── packages/
│   ├── core/             # @harnessfit/core — zero provider deps
│   │   ├── src/
│   │   │   ├── types/    # RunEvent, ToolCall, ModelProvider, Result
│   │   │   ├── runtime/  # Agent loop, context manager
│   │   │   ├── tools/    # Tool implementations, tool registry
│   │   │   └── events/   # Event emitter, event store
│   │   └── package.json  # "name": "@harnessfit/core"
│   ├── providers/        # @harnessfit/providers — adapter monorepo
│   │   ├── openai/       # @harnessfit/providers-openai
│   │   ├── anthropic/    # @harnessfit/providers-anthropic
│   │   └── google/       # @harnessfit/providers-google
│   ├── harness/          # @harnessfit/harness
│   │   └── src/
│   │       ├── compiler/ # Config → CompiledHarness (deterministic)
│   │       ├── configs/  # Default/generic config, validation
│   │       ├── mutations/# Neighbor generation
│   │       └── prompts/  # Prompt templates per instruction style
│   ├── optimizer/        # @harnessfit/optimizer
│   │   └── src/
│   │       ├── hill-climbing/
│   │       ├── random-search/
│   │       └── statistics/
│   ├── evaluator/        # @harnessfit/evaluator
│   │   └── src/
│   │       ├── deterministic/
│   │       ├── metrics/
│   │       └── reports/
│   └── storage/          # @harnessfit/storage
│       └── src/
│           ├── db.ts     # SQLite connection, migrations
│           ├── runs.ts   # Run CRUD
│           ├── events.ts # Event log
│           └── models/   # Typed query results
├── benchmarks/
│   ├── repositories/     # Git repos (task-service, payment-rules, event-processor)
│   ├── tasks/            # Task definitions (JSON/YAML)
│   ├── hidden-tests/     # Hidden acceptance tests (TypeScript files)
│   └── manifests/        # Task manifests
├── experiments/
│   ├── definitions/      # YAML experiment configs
│   └── results/          # Experiment output
├── scripts/              # Dev/CI scripts
├── docs/                 # Documentation
└── SPEC.md               # Ground truth
```

**Import convention:** Packages import with workspace names: `import { AgentLoop } from "@harnessfit/core"`. Apps import packages. Packages never import apps. `core` never imports `providers`.

## 4. Provider SDKs with Bun

### OpenAI
- **SDK:** `openai` (v4.x). Works with Bun via `fetch` polyfill — Bun's built-in `fetch` is compatible.
- **Auth:** `OPENAI_API_KEY` env var auto-picked by SDK.
- **Streaming:** Use `stream: true` + async iterator. Bun handles streaming natively.
- **Tool calls:** SDK handles tool call parsing. Normalize SDK tool call objects into project's `ToolCall` type.
- **Cost estimation:** Use `usage.prompt_tokens`, `usage.completion_tokens` from response. Pricing table hardcoded per model with snapshot date.

### Anthropic
- **SDK:** `@anthropic-ai/sdk` (v0.x). Bun-compatible.
- **Auth:** `ANTHROPIC_API_KEY` env var.
- **Messages API:** Uses `messages.create()` with `system` param (not in messages array).
- **Tool use:** Content blocks with `type: "tool_use"`. Different from OpenAI's function calling. Must normalize.
- **Streaming:** SSE-based. SDK handles parsing.
- **Cost:** Per-model pricing table.

### Google (Gemini)
- **SDK:** `@google/generative-ai` (v0.x). Bun-compatible.
- **Auth:** `GOOGLE_API_KEY` env var.
- **API:** `GenerativeModel.generateContent()`. Different message format from OpenAI/Anthropic.
- **Tool/function calling:** `functionDeclarations` in config. Different schema format.
- **Streaming:** `generateContentStream()`.
- **Cost:** Per-model pricing.

### Normalization Strategy
Each adapter implements:
```typescript
interface ModelProvider {
  generate(request: NormalizedModelRequest): Promise<NormalizedModelResponse>;
  estimateCost(usage: NormalizedUsage): Money;
  capabilities(): ProviderCapabilities;
}
```

Adapter responsibilities:
1. Convert `NormalizedModelRequest` → provider-native request
2. Convert provider-native response → `NormalizedModelResponse`
3. Map provider error codes → `ProviderError` (with retryability flag)
4. Record provider-native fields alongside normalized for post-hoc analysis

## 5. SQLite with Bun

- **Module:** `import { Database } from "bun:sqlite"` — zero dependencies.
- **WAL mode:** `db.exec("PRAGMA journal_mode=WAL")` — better concurrent reads.
- **Prepared statements:** `db.query("SELECT ...").all(params)` for typed results.
- **Migrations:** Simple numbered SQL files in `packages/storage/migrations/`. Run sequentially on startup. Track in `schema_version` table.
- **Transactions:** `db.transaction(() => { ... })()` for atomic multi-statement operations.
- **No ORM:** Raw SQL with typed wrappers. Benefit: full control, no migration framework, no query builder abstraction.
- **Blob storage:** Large artifacts (transcripts > 100KB, patches) stored as compressed files (`Bun.gzipSync()`) referenced by content hash. SQLite rows store the hash + metadata.

### Schema Design Principles
- Content-addressable: Every entity has a stable identifier (content hash or UUID).
- Timestamps: ISO 8601 strings (SQLite has no native datetime type).
- Foreign keys: Enforced (`PRAGMA foreign_keys = ON`).
- Indices: On foreign keys, content hashes, experiment IDs, timestamps.
- No soft deletes: Research data is append-only. Delete = true deletion only for test teardown.

## 6. CLI Design

- **Library:** `commander` or hand-rolled argument parsing. Bun's built-in `parseArgs` (`Bun.argv`) is sufficient for MVP.
- **Structure:** One file per command in `apps/cli/src/commands/`. Main `cli.ts` registers all commands.
- **Output:** Plain text for pipe-ability, JSON for structured output (`--json` flag).
- **Exit codes:** 0 = success, 1 = general error, 2 = usage error.
- **Progress:** Optional spinner/progress bar for long operations (`bun:cli` or simple terminal output).

## 7. Testing Strategy

- **Framework:** `bun test` — built-in. `describe`/`it`/`expect` global API (Jest-compatible).
- **Mocking:** `bun test` supports `mock.module()` for module mocking. Provider adapters mocked in unit tests.
- **Integration:** SQLite in-memory (`:memory:`) for storage tests. Real Bun.$ for sandbox tests.
- **E2E:** Full run against benchmark repo. Requires `Bun.$` for subprocess isolation.
- **Coverage:** `bun test --coverage`.
- **CI:** `bun test --coverage --reporter=junit > test-results.xml`.

## 8. Formatting & Linting

- **Biome:** Single tool for both. Configured via `biome.json` at root.
- **Formatter:** 2-space indent, single quotes, trailing commas, semicolons.
- **Linter rules:** `noExplicitAny` (error), `useConst` (error), `noUnusedVariables` (error but allow `_` prefix), `useLiteralEnumMembers` (error for TS enums).
- **CI gate:** `bunx biome ci .` — fails on any violation (unlike `biome check` which only reports).

## 9. CI/CD (GitHub Actions)

```yaml
# .github/workflows/ci.yml
jobs:
  check:
    runs-on: ubuntu-latest
    strategy:
      matrix:
        bun-version: ["1.2"]  # Latest stable
    steps:
      - uses: actions/checkout@v4
      - uses: oven-sh/setup-bun@v2
        with:
          bun-version: ${{ matrix.bun-version }}
      - run: bun install --frozen-lockfile
      - run: bunx biome ci .
      - run: bun run typecheck        # tsc --noEmit
      - run: bun test --coverage
```

## 10. Key Pitfalls (TypeScript/Bun)

| Pitfall | Mitigation |
|---------|-----------|
| Bun still has rough edges with some npm packages | Test all provider SDKs early in M2 |
| `bun:sqlite` is synchronous — blocking operations | Acceptable for MVP; long queries run in experiments, not request paths |
| Provider SDKs have different tool call formats | Normalize early, test with real API calls, not just mocks |
| `Bun.$` shell escaping | Use tagged template literals carefully; prefer array args for safety |
| Binary lockfile (`bun.lockb`) not human-readable | Commit it; review diffs via `bun install --frozen-lockfile` in CI |
| TypeScript strict mode reveals many missing types in provider SDKs | Add `// @ts-expect-error` with justification, or contribute types upstream |
| Bun monorepo path resolution | Use `"exports"` in each package's `package.json` for clean imports |

## 11. Module Resolution Pattern

Each `packages/*/package.json`:
```json
{
  "name": "@harnessfit/core",
  "version": "0.1.0",
  "main": "src/index.ts",
  "types": "src/index.ts",
  "exports": {
    ".": "./src/index.ts",
    "./types": "./src/types/index.ts",
    "./runtime": "./src/runtime/index.ts"
  }
}
```

Root `tsconfig.json`:
```json
{
  "compilerOptions": {
    "strict": true,
    "target": "ESNext",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "paths": {
      "@harnessfit/*": ["./packages/*/src"]
    }
  }
}
```

## 12. Summary: What to Build First

1. **Root scaffold:** `package.json` (workspaces), `tsconfig.json`, `biome.json`, `bunfig.toml`, `.gitignore`
2. **`packages/core`:** Types (`RunEvent`, `ToolCall`, `ModelProvider`, `Result`), event emitter, tool registry
3. **`packages/storage`:** SQLite connection, migrations, typed query wrappers
4. **`packages/providers/*`:** One adapter per provider, normalization layer
5. **`packages/core/runtime`:** Agent loop — depends on core types + tools
6. **`packages/harness`:** Config types, compiler, mutations — depends on core types
7. **`packages/evaluator`:** Scoring, metrics — depends on storage
8. **`packages/optimizer`:** Hill climbing — depends on evaluator + harness
9. **`apps/cli`:** Commands — depends on everything
10. **`apps/dashboard`:** Static HTML generation — depends on storage (reads results)

Dependency graph: `core → storage → providers + harness → runtime → evaluator → optimizer → cli → dashboard`
