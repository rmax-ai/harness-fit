# TypeScript Architecture Layout — HarnessFit

Companion to `AGENTS.md`. Monorepo structure, module boundaries, and dependency direction.

## Monorepo Layering

```
apps/          ← Entry points, thin, depends on packages/
  ├── cli/       @harnessfit/cli — CLI commands, argument parsing
  └── dashboard/ @harnessfit/dashboard — Static HTML generation

packages/      ← Libraries, each with clear dependency direction
  ├── core/              @harnessfit/core — Types, runtime, tools, events (ZERO deps)
  ├── storage/           @harnessfit/storage — SQLite, migrations, typed queries
  ├── providers/         Provider adapters (each depends only on core)
  │   ├── openai/        @harnessfit/providers-openai
  │   ├── anthropic/     @harnessfit/providers-anthropic
  │   └── google/        @harnessfit/providers-google
  ├── harness/           @harnessfit/harness — Config, compiler, mutations, prompts
  ├── evaluator/         @harnessfit/evaluator — Scoring, metrics, reports
  └── optimizer/         @harnessfit/optimizer — Hill climbing, statistics
```

## Dependency Rules

```
core ← storage ← harness ← evaluator ← optimizer ← cli
  ↑        ↑         ↑         ↑
providers  ──────────┘         │
  └────────────────────────────┘
```

- **`core` imports nothing** except `bun:sqlite` types (for event store persistence — but actual storage lives in `storage` package)
- **`providers` import only `core`** for `NormalizedModelRequest`, `NormalizedModelResponse`
- **`storage` imports `core`** for typed event models, run metadata
- **`harness` imports `core`** for config types
- **`evaluator` imports `core`** for `RunResult`, `Task` types, and `storage` for persistence
- **`optimizer` imports `core`**, `harness`, `evaluator`
- **`cli` imports everything** — it wires the system together
- **`dashboard` imports `storage`** — reads results, generates HTML

## Package Structure (per package)

```
packages/<name>/
├── package.json       # "name": "@harnessfit/<name>", "main": "src/index.ts"
├── tsconfig.json      # { "extends": "../../tsconfig.json" }
├── src/
│   ├── index.ts       # Public API exports
│   ├── <module>.ts    # Implementation
│   └── <module>.test.ts  # Tests alongside source
```

## Path Aliases

All imports use `@harnessfit/*` prefixes. Configured in root `tsconfig.json` `paths`:

```typescript
// In packages/core/src/runtime/agent-loop.ts
import type { RunEvent } from "@harnessfit/core/types";
import { EventStore } from "@harnessfit/core/events";

// In packages/providers/openai/src/adapter.ts
import type { ModelProvider, NormalizedModelRequest } from "@harnessfit/core";
import OpenAI from "openai";

// In apps/cli/src/commands/optimize.ts
import { optimize } from "@harnessfit/optimizer";
import { loadConfig } from "@harnessfit/harness";
import { createDatabase } from "@harnessfit/storage";
```

## Building

- **No build step for development.** Bun runs TypeScript directly (`bun run apps/cli/src/cli.ts`).
- **Production build:** `bun build` for CLI binary. Dashboard is static HTML — no build needed.
- **Type checking:** `tsc --noEmit` verifies types across the monorepo.

## CLI Entry Point

```
apps/cli/
├── package.json    # "bin": { "harnessfit": "./src/cli.ts" }
├── tsconfig.json   # { "extends": "../../tsconfig.json" }
└── src/
    ├── cli.ts      # Main entry: parses args, dispatches to commands
    └── commands/
        ├── init.ts
        ├── baseline.ts
        ├── optimize.ts
        ├── evaluate.ts
        ├── transfer.ts
        ├── report.ts
        └── inspect.ts
```
