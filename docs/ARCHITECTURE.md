# HarnessFit — System Architecture

**Document status:** Formal architecture reference  
**Project:** HarnessFit — Automatic Discovery of Model-Specific Agent Harness Profiles  
**Stack:** TypeScript, Bun, SQLite  
**Providers:** OpenAI, Anthropic, Google  
**License:** Apache-2.0  
**Derived from:** SPEC.md (ground-truth specification, all 38 sections)

---

## Executive summary

**Core thesis:** Agent harnesses are measurable, optimizable system components — not folklore or style preferences. Prompts, tool schemas, validation loops, context policies, and retry strategies are configurable parameters whose effects on model-task outcomes can be empirically measured, compared, transferred across models, ablated, and falsified under controlled conditions.

HarnessFit treats the execution harness as an independent variable. The project asks not "which model performs best?" but rather "what harness configuration allows each model to perform best, and how much performance is lost when every model is forced through the same generic harness?" The answer takes the form of empirically derived, machine-readable harness profiles — not a conventional model leaderboard.

The system is a **single-machine experimental framework** (not a production service) that automates the following workflow:

1. Define a parameterized search space over harness configurations.
2. Execute identical software-engineering tasks across multiple models under varying harness configurations.
3. Score each run using deterministic tests and a multi-objective utility function.
4. Search the configuration space via coordinate hill climbing with statistical acceptance criteria.
5. Produce a cross-model transfer matrix, sensitivity analyses, and Pareto frontiers as research artifacts.

---

## Architecture overview

The system is organized as a linear pipeline of six layers, each with defined responsibilities and interfaces. Data flows downstream from the Experiment CLI through to the Sandbox; results flow back up through the same layers.

```
┌──────────────────────────────────┐
│         Experiment CLI           │  CLI entry point (bun harnessfit)
│  - Subcommand routing            │  Commands: init, providers check,
│  - YAML config loading           │  baseline, optimize, evaluate,
│  - Report generation             │  transfer, report, inspect
└──────────────┬───────────────────┘
               │
┌──────────────▼───────────────────┐
│     Experiment Coordinator       │  Orchestration layer
│  - Task selection & split mgmt   │  Owns: experiment lifecycle, trial
│  - Trial scheduling & seeding    │  scheduling, budget enforcement,
│  - Budget enforcement            │  phase transitions (Phase 0-4)
│  - Phase orchestration           │
└──────┬──────────────┬────────────┘
       │              │
┌──────▼──────┐ ┌─────▼────────────┐
│  Optimizer  │ │    Evaluator     │  Search & measurement layer
│ - Mutation  │ │ - Deterministic  │  Optimizer: neighbor generation,
│ - Selection │ │   test execution │  candidate evaluation, acceptance
│ - History   │ │ - Metric         │  testing, random restarts
│             │ │   computation    │  Evaluator: scoring, validation,
└──────┬──────┘ │ - Reporting      │  failure classification
       │        └─────┬────────────┘
       │              │
┌──────▼──────────────▼────────────┐
│         Agent Runtime             │  Execution layer
│  - Context assembly               │  Single-agent edit loop:
│  - Tool dispatch                  │  init → context → model decision →
│  - Validation loop                │  tool execution → feedback →
│  - Retry logic                    │  continuation → validation → complete
│  - Limit enforcement              │
└──────────────┬───────────────────┘
               │
┌──────────────▼───────────────────┐
│       Provider Adapter           │  Normalization layer
├────────────────┬─────────────────┤  Adapts provider-native API formats
│  OpenAI        │  Anthropic      │  (messages, tools, tool calls, usage,
│  Adapter       │  Adapter        │  errors) to a common internal interface
├────────────────┼─────────────────┤  while preserving provider-specific
│  Google        │  (Future...)    │  fields alongside normalized records
│  Adapter       │                 │
└──────────────┬┴──────────────────┘
               │
┌──────────────▼───────────────────┐
│  Isolated Repository Sandbox     │  Environment layer
│  - Clean repo per trial          │  Git-based isolation: each run starts
│  - Hidden tests outside tree     │  from a clean commit. Hidden acceptance
│  - Deterministic deps install    │  tests execute outside the writable
│  - No network access             │  working tree. Repo reset per trial.
└──────────────────────────────────┘
```

**Data flow (downstream):** CLI → Coordinator → (Optimizer | Evaluator) → Agent Runtime → Provider Adapter → Sandbox  
**Data flow (upstream):** Sandbox → Adapter → Runtime → (Optimizer | Evaluator) → Coordinator → Storage → CLI/Dashboard  
**Control flow:** CLI issues commands → Coordinator schedules trials → Optimizer generates configurations → Runtime executes → Evaluator scores → Optimizer decides → Coordinator persists

---

## Component architecture

### 1. Experiment CLI (`apps/cli/`)

**Responsibility:** Single entry point for all user-facing operations. Parses commands, loads experiment configurations from YAML, routes to the Coordinator, and formats results for display or export.

**Inputs:** User terminal commands, YAML experiment config files  
**Outputs:** Terminal output, report files (JSON/Markdown), exit codes  

**Key interfaces:**

| Command | Action |
|---|---|
| `bun harnessfit init` | Create project skeleton and configuration template |
| `bun harnessfit providers check` | Validate provider API keys and model availability |
| `bun harnessfit baseline --experiment <id>` | Run Phase 0: baseline generic harness |
| `bun harnessfit optimize --model <id> --search <algorithm>` | Run Phase 1-3: hill-climbing optimization |
| `bun harnessfit evaluate --config <path> --split <split>` | Run Phase 4: held-out evaluation |
| `bun harnessfit transfer --configs <paths>` | Generate cross-model transfer matrix |
| `bun harnessfit report --experiment <id>` | Generate aggregate report |
| `bun harnessfit inspect <run-id>` | Inspect a single run's full event trace |

**Dependencies:** YAML parser, Coordinator, Storage, Report formatter.

---

### 2. Experiment Coordinator (`packages/core/`)

**Responsibility:** Owns the experiment lifecycle. Selects task splits, manages trial scheduling (including seeding and ordering), enforces compute and API budgets, and orchestrates phase transitions (Phase 0 baseline → Phase 1 sensitivity → Phase 2 hill climbing → Phase 3 random restarts → Phase 4 held-out confirmation).

**Inputs:** Experiment config (YAML → typed), model registry, benchmark manifest  
**Outputs:** Scheduled runs (Model × HarnessConfig × Task × Seed × TrialNumber), phase-complete signals  

**Key interfaces:**

```typescript
interface Coordinator {
  runExperiment(config: ExperimentConfig): Promise<ExperimentResult>;
  runBaseline(modelIds: string[], tasks: Task[]): Promise<BaselineReport>;
  runOptimization(modelId: string, searchConfig: SearchConfig): Promise<OptimizationResult>;
  runEvaluation(config: HarnessConfig, tasks: Task[]): Promise<EvaluationReport>;
  runTransferMatrix(configs: HarnessConfig[], models: ModelConfig[]): Promise<TransferMatrix>;
}
```

**Phase orchestration:**

| Phase | Activity | Output |
|---|---|---|
| Phase 0 | Baseline evaluation under generic harness | Baseline success/cost/latency per model |
| Phase 1 | Single-parameter sensitivity analysis | Per-parameter effect estimates |
| Phase 2 | Coordinate hill climbing from best baseline | Optimized harness candidates |
| Phase 3 | Random restarts from different starting points | Multiple local optima |
| Phase 4 | Held-out confirmation on unseen tasks | Generalization estimate |

**Budget enforcement:** Tracks API cost, wall-clock time, and candidate evaluation count. Terminates optimization when `maximumCandidatesPerModel` or `maxCostUsd` is reached. Prevents any single model from consuming disproportionate resources.

---

### 3. Optimizer (`packages/optimizer/`)

**Responsibility:** Generates candidate harness configurations, evaluates them via the Evaluator, and applies statistical acceptance rules to decide whether to accept an improvement. Maintains optimization history including all candidates (accepted and rejected).

**Inputs:** ModelConfig, initial HarnessConfig, training task set, search config  
**Outputs:** OptimizationResult (incumbent config, history, acceptance decisions, trails)

**Sub-components:**

- **`hill-climbing/`** — Coordinate hill-climbing implementation: generate neighbors by mutating one parameter at a time, evaluate, accept if credible improvement found.
- **`random-search/`** — Random restarts: reinitialize from different configs to escape local optima.
- **`statistics/`** — Acceptance test suite: bootstrap confidence intervals, paired permutation tests, sequential testing.

**Algorithm (from SPEC.md §12):**

```typescript
async function optimize(
  model: ModelConfig,
  initial: HarnessConfig,
  trainingTasks: Task[],
): Promise<OptimizationResult> {
  let incumbent = await evaluateConfig(model, initial, trainingTasks);
  let improved = true;
  while (improved) {
    improved = false;
    const candidates = generateNeighbors(incumbent.config);
    for (const candidate of candidates) {
      const result = await evaluateConfig(model, candidate, trainingTasks);
      if (isCredibleImprovement(result, incumbent)) {
        incumbent = result;
        improved = true;
        break;
      }
    }
  }
  return incumbent;
}
```

**Acceptance rule (SPEC.md §12):** Accept candidate only when:
- Candidate utility > incumbent utility + minimum effect (3 pp task success or 5% utility improvement without reducing success), AND
- At least one of: bootstrap CI excludes zero, paired permutation test reaches threshold, or sequential test reaches required evidence.

**Inputs/Outputs detail:**

| | Inputs | Outputs |
|---|---|---|
| `generateNeighbors(config)` | Current HarnessConfig, mutation strategy | Array of mutated HarnessConfig candidates (1 mutation per candidate) |
| `evaluateConfig(model, config, tasks)` | ModelConfig, HarnessConfig, Task[] | ScoredRunResult (success rate, utility, raw metrics, per-task scores) |
| `isCredibleImprovement(candidate, incumbent)` | Candidate ScoredRunResult, incumbent ScoredRunResult | Boolean (accept/reject), evidence record |

---

### 4. Evaluator (`packages/evaluator/`)

**Responsibility:** Scores completed runs using deterministic tests and predefined metrics. Computes task scores along four dimensions and aggregates into the utility function. Produces failure classifications from the failure taxonomy.

**Sub-components:**

- **`deterministic/`** — Executes hidden acceptance tests, regression tests (existing test suite), linting, type checking, build validation. All tests are deterministic by design.
- **`metrics/`** — Computes functional correctness, regression safety, constraint compliance, patch quality. Calculates success rates, costs, latencies, variance.
- **`reports/`** — Aggregates per-task scores into run-level summaries.

**Task score composition (SPEC.md §14):**

| Component | Weight | Measurement |
|---|---|---|
| Functional correctness | 0.70 | Deterministic hidden tests only (no LLM-as-judge for primary metric) |
| Regression safety | 0.10 | Existing tests pass, type checking, linting, build success |
| Constraint compliance | 0.10 | No forbidden file changes, no test modification, no dependency addition, no public API breakage, no patch-size limit violation |
| Patch quality | 0.10 | Patch size, duplication introduced, complexity delta, new lint violations, unused code, forbidden suppressions |

**Utility function (SPEC.md §15):**

```
U = 1.00 × success rate
    - 0.10 × normalized cost
    - 0.05 × normalized latency
    - 0.10 × failure variance
    - 0.25 × limit violation rate
```

**Failure taxonomy (SPEC.md §27):** Deterministic labels: `ENVIRONMENT_FAILURE`, `PROVIDER_FAILURE`, `INVALID_TOOL_CALL`, `TOOL_LOOP`, `CONTEXT_EXHAUSTION`, `BUDGET_EXHAUSTION`, `PREMATURE_COMPLETION`, `TEST_FAILURE`, `REGRESSION`, `CONSTRAINT_VIOLATION`, `VALIDATION_MANIPULATION`, `NO_PATCH`, `UNRELATED_PATCH`.

**Inputs:** RawRunResult (event trace, generated patch, tool call log, termination reason)  
**Outputs:** ScoredRunResult (task score, utility, failure classification, per-metric breakdown)

---

### 5. Agent Runtime (`packages/core/runtime/`)

**Responsibility:** Implements the single-agent edit loop. Assembles context from the harness configuration and task specification, dispatches model requests through the provider adapter, manages tool execution in the sandbox, applies retry logic, and enforces runtime limits.

**Edit loop (SPEC.md §9):**

```
Task initialization → Context acquisition → Model decision → Tool execution →
Environment feedback → Model continuation → Validation → Completion or retry
```

**Runtime limits (configurable per run, from SPEC.md §9):**

| Limit | Default |
|---|---|
| `maxTurns` | 24 |
| `maxToolCalls` | 40 |
| `maxWallTimeSeconds` | 600 |
| `maxOutputTokens` | 32000 |
| `maxCostUsd` | 5 |

**Available tools (identical across providers, SPEC.md §9):** `list_files`, `read_file`, `search_files`, `write_file`, `apply_patch`, `run_command`, `git_diff`, `finish`.

**Normalized tool call representation:**

```typescript
interface ToolCall {
  id: string;
  name: ToolName;
  arguments: unknown;
}
```

**Inputs:** CompiledHarness (system prompt, tool definitions, runtime/validation/retry policies), Task specification, Sandbox handle  
**Outputs:** RunEvent stream, generated patch, termination reason, usage statistics  

---

### 6. Provider Adapter (`packages/providers/`)

**Responsibility:** Normalizes provider-native API interfaces to a common `ModelProvider` contract while preserving provider-specific metadata alongside normalized fields. Three initial adapters: OpenAI, Anthropic, Google.

**Common interface (SPEC.md §20):**

```typescript
interface ModelProvider {
  generate(request: NormalizedModelRequest): Promise<NormalizedModelResponse>;
  estimateCost(usage: NormalizedUsage): Money;
  capabilities(): ProviderCapabilities;
}

interface NormalizedModelRequest {
  model: string;
  system: string;
  messages: Message[];
  tools: ToolDefinition[];
  maxOutputTokens: number;
  temperature?: number;
  reasoning?: ReasoningConfig;
}
```

**Normalization surfaces (SPEC.md §20 requirement — do not erase differences):**

| Surface | Normalization approach |
|---|---|
| Messages | Convert role/content to canonical format; preserve provider-native raw message alongside |
| Tool definitions | Map provider schema to canonical ToolDefinition; preserve native schema |
| Tool calls | Normalize to `{ id, name, arguments }`; preserve provider-native call object |
| Tool results | Return to provider in expected format; record raw response |
| Stop conditions | Map provider stop reasons to canonical termination taxonomy |
| Usage statistics | Normalize to `{ inputTokens, outputTokens, cachedTokens, ... }` |
| Reasoning controls | Expose via `ReasoningConfig`; adapter is responsible for provider-specific format |
| Errors | Classify into retryable vs non-retryable; preserve provider-native error details |

**Adapter structure:**

```
packages/providers/
├── openai/
│   ├── adapter.ts          # ModelProvider implementation for OpenAI
│   ├── types.ts            # OpenAI-specific type mappings
│   └── pricing.ts          # OpenAI cost estimation
├── anthropic/
│   ├── adapter.ts
│   ├── types.ts
│   └── pricing.ts
├── google/
│   ├── adapter.ts
│   ├── types.ts
│   └── pricing.ts
└── shared/
    ├── types.ts            # NormalizedModelRequest, NormalizedModelResponse, etc.
    ├── errors.ts           # Error classification (retryable, rate-limited, auth, etc.)
    └── pricing.ts          # Common pricing utilities
```

---

### 7. Isolated Repository Sandbox

**Responsibility:** Provides a clean, deterministic, isolated execution environment for each run. Each run starts from the same clean repository commit. Hidden acceptance tests execute outside the writable working tree to prevent tampering. Task fixtures are reset from the clean commit for every trial.

**Properties:**
- **Clean state:** Each trial clones or copies from a clean repository snapshot.
- **Hidden test isolation:** Acceptance tests run from a separate directory outside the model's writable workspace.
- **Deterministic dependencies:** Locked dependency versions, no network access during runs.
- **Reproducible:** Given the same task, harness config, and seed, the sandbox produces the same initial state.

**Inputs:** Repository fixture path, task specification, seed  
**Outputs:** Sandbox handle (working directory, hidden test runner, tool execution context)

---

## Request lifecycle

### End-to-end flow for a single experimental run

This is the canonical lifecycle for one `Run = Model × HarnessConfig × Task × RepositoryState × Seed × TrialNumber`.

```
┌──────────┐     ┌───────────┐    ┌──────────┐    ┌─────────┐    ┌────────┐    ┌──────┐
│   CLI    │     │Coordinator│    │ Runtime  │    │ Adapter │    │Sandbox │    │ Eval │
└────┬─────┘     └─────┬─────┘    └────┬─────┘    └────┬────┘    └───┬────┘    └──┬───┘
     │                  │               │               │            │           │
     │  1. schedule     │               │               │            │           │
     │─────────────────>│               │               │            │           │
     │                  │               │               │            │           │
     │                  │ 2. startRun   │               │            │           │
     │                  │──────────────>│               │            │           │
     │                  │               │               │            │           │
     │                  │               │3. initSandbox │            │           │
     │                  │               │───────────────────────────────────────>│
     │                  │               │               │            │           │
     │                  │               │   sandboxReady│            │           │
     │                  │               │<───────────────────────────────────────│
     │                  │               │               │            │           │
     │                  │               │4. compile     │            │           │
     │                  │               │   Harness     │            │           │
     │                  │               │   (system     │            │           │
     │                  │               │    prompt,    │            │           │
     │                  │               │    tools,     │            │           │
     │                  │               │    policies)  │            │           │
     │                  │               │               │            │           │
     │                  │               │5. generate    │            │           │
     │                  │               │───────────────│───────────>│           │
     │                  │               │               │(API call)  │           │
     │                  │               │               │            │           │
     │                  │               │6. modelResp   │            │           │
     │                  │               │<──────────────│───────────│           │
     │                  │               │               │            │           │
     │                  │               │7. executeTool │            │           │
     │                  │               │────────────────────────────────────────>│
     │                  │               │               │            │           │
     │                  │               │  toolResult   │            │           │
     │                  │               │<────────────────────────────────────────│
     │                  │               │               │            │           │
     │                  │               │ (Loop steps 5-7 until done or limit)   │
     │                  │               │    emit events │            │           │
     │                  │               │    for every   │            │           │
     │                  │               │    step        │            │           │
     │                  │               │               │            │           │
     │                  │               │8. runComplete  │            │           │
     │                  │               │───────────────│────────────│──────────>│
     │                  │               │               │            │           │
     │                  │               │               │            │9. score   │
     │                  │               │               │            │  result   │
     │                  │               │               │            │<──────────│
     │                  │               │               │            │           │
     │                  │10. persistRun │               │            │           │
     │                  │<──────────────│               │            │           │
     │                  │               │               │            │           │
     │11. reportRun     │               │               │            │           │
     │<─────────────────│               │               │            │           │
     │                  │               │               │            │           │
```

**Step details:**

1. **CLI → Coordinator:** User command is parsed and dispatched. Coordinator receives the experiment config with model, task split, and search parameters.
2. **Coordinator → Runtime:** Coordinator resolves Model × HarnessConfig × Task × Seed and calls `Runtime.startRun()`. A `RunStarted` event is emitted.
3. **Runtime → Sandbox:** Runtime initializes the sandbox: clones/restores the repository fixture to a clean state at the specified commit, sets up the hidden test runner outside the writable tree, installs locked dependencies.
4. **Runtime (internal):** Compiles the HarnessConfig into a `CompiledHarness` via the harness compiler (deterministic transformation: `hash(config) → same compiled harness`).
5. **Runtime → Adapter:** Runtime calls `ModelProvider.generate()` with the compiled system prompt, tool definitions, messages, and runtime policies.
6. **Adapter → API → Adapter:** Provider API is called. Response is normalized into `NormalizedModelResponse`. Provider-native fields are preserved alongside normalized ones. Cost is estimated from usage.
7. **Runtime → Sandbox → Runtime:** If the model makes a tool call, the runtime dispatches it through the sandbox, captures the result, and feeds it back to the model. Each step emits events: `ModelRequested`, `ModelResponded`, `ToolRequested`, `ToolCompleted`, `FileChanged`. The loop continues until the model calls `finish`, a limit is reached, or validation fails.
8. **Runtime → Evaluator:** Run completes. Runtime passes the full event trace, generated patch, tool call log, usage statistics, and termination reason to the Evaluator.
9. **Evaluator (internal):** Runs hidden acceptance tests, regression tests, linting, type checking, constraint checks. Computes functional correctness, regression safety, constraint compliance, and patch quality. Assigns a failure label from the taxonomy. Returns a `ScoredRunResult`.
10. **Coordinator (internal):** Persists the run result to SQLite: run record, events, tool calls, validation results, metrics. Stores large artifacts (patches, traces) as compressed filesystem files referenced by content hash.
11. **Coordinator → CLI:** Run result is returned to the CLI for display or included in aggregate reports.

---

## Data model

### Core entities

```
┌─────────────┐     ┌──────────────────┐     ┌─────────────┐
│   Model     │     │  HarnessConfig   │     │    Task     │
├─────────────┤     ├──────────────────┤     ├─────────────┤
│ id          │     │ id (hash)        │     │ id          │
│ provider    │     │ compiled (hash)  │     │ category    │
│ modelAlias  │     │ prompt           │     │ repository  │
│ resolvedId  │◄────│ planning         │────>│ description │
│ pricing     │     │ tools            │     │ difficulty  │
└──────┬──────┘     │ context          │     │ testCommand │
       │            │ feedback         │     │ hiddenTests │
       │            │ validation       │     │ constraints │
       │            │ retry            │     │ split       │
       │            │ completion       │     └─────────────┘
       │            └────────┬─────────┘
       │                     │
       │    ┌────────────────▼──────────────────────────────┐
       │    │                 Experiment                    │
       │    ├───────────────────────────────────────────────┤
       │    │ id, name, config (YAML snapshot), status,     │
       │    │ phase, startedAt, completedAt                 │
       └────┼───────────────────────┬───────────────────────┘
            │                       │
            │    ┌──────────────────▼───────────────────────┐
            │    │                 Run                       │
            │    ├───────────────────────────────────────────┤
            └────│ id (UUID), experimentId, modelId,         │
                 │ harnessConfigId, taskId, split, seed,     │
                 │ trialNumber, status, startedAt,           │
                 │ completedAt, terminationReason,            │
                 │ generatedPatch, inputTokens,              │
                 │ outputTokens, cachedTokens, costUsd,      │
                 │ toolCalls, toolErrors, turns, latencyMs   │
                 └─────┬─────────────────────────┬───────────┘
                       │                         │
              ┌────────▼──────┐         ┌────────▼──────────┐
              │   RunEvent    │         │     Metric        │
              │ (append-only) │         ├───────────────────┤
              ├───────────────┤         │ id                │
              │ id (seq)      │         │ runId             │
              │ runId         │         │ name              │
              │ type          │         │ value             │
              │ timestamp     │         │ unit              │
              │ data (JSON)   │         │ tags (key=value)  │
              └───────────────┘         └───────────────────┘
```

**Entity descriptions:**

| Entity | Key fields | Role |
|---|---|---|
| **Model** | `id` (logical), `provider`, `modelAlias`, `resolvedId` | Registered model with provider adapter mapping. `resolvedId` persists the exact API version used at evaluation time. |
| **HarnessConfig** | `id` (content hash of declarative config), `compiled` (content hash of compiled output) | Parameterized harness configuration. Both declarative and compiled forms are stored. Deterministic compilation: same hash → same CompiledHarness. |
| **Task** | `id`, `category`, `difficulty`, `split` (train/dev/test) | A single evaluation unit with repository, description, tests, and constraints. Hidden tests are referenced but not stored in the task record available to the runtime. |
| **Experiment** | `id`, `config` (YAML snapshot), `phase`, `status` | Top-level organizational entity. Captures the full experiment configuration including model list, benchmark split, trial counts, optimizer settings, and limits. |
| **Run** | `id` (UUID), composite key (Model × HarnessConfig × Task × RepositoryState × Seed × TrialNumber) | The atomic experimental unit. Stores all execution metadata, generated patch, and termination reason. |
| **RunEvent** | `id` (sequential), `type` (from union type), `timestamp`, `data` (JSON) | Append-only event log. Every runtime action produces an event. The event log is the system of record — not final transcripts. Enables replay, debugging, cost attribution, behavioral analysis. |
| **Metric** | `id`, `name`, `value`, `unit`, `tags` | Flexible key-value metric storage. Supports task scores, utility components, cost breakdowns, latency percentiles. Tags enable dimensional slicing. |

---

## Harness compiler

The harness compiler (`packages/harness/compiler/`) is a **deterministic, pure transformation** from a declarative `HarnessConfig` to a `CompiledHarness` runtime artifact.

**SPEC.md §21 requirement:** `hash(config) → same compiled harness`. Compilation must be deterministic. Both declarative and compiled output are stored.

**Input:**

```typescript
interface HarnessConfig {
  prompt: PromptConfig;
  planning: PlanningConfig;
  tools: ToolConfig;
  context: ContextConfig;
  feedback: FeedbackConfig;
  validation: ValidationConfig;
  retry: RetryConfig;
  completion: CompletionConfig;
}
```

**Output:**

```typescript
interface CompiledHarness {
  systemPrompt: string;           // Fully assembled system prompt
  toolDefinitions: ToolDefinition[];  // Tool schemas in canonical format
  runtimePolicy: RuntimePolicy;       // Turn limits, token budgets, cost caps
  validationPolicy: ValidationPolicy; // When and how to validate
  retryPolicy: RetryPolicy;          // Retry count, mode, critique strategy
}
```

**Compilation rules are deterministic functions of config fields:**

| Config section | Compiled artifact | Determinism guarantee |
|---|---|---|
| `prompt` | System prompt assembly: instruction style, structure, examples, constraints, positioning | Same field values → identical string |
| `planning` | `runtimePolicy.requirePlanBeforeTools`, `runtimePolicy.requirePlanUpdateAfterFailure` | Boolean/policy flags map directly |
| `tools` | `toolDefinitions`: description style, schema strictness, return format | Text templates produce identical output for same params |
| `context` | `runtimePolicy.repositoryMap`, `runtimePolicy.initialFileStrategy`, `runtimePolicy.toolResultCompaction` | Strategy enums map to deterministic code paths |
| `feedback` | `runtimePolicy.commandOutput`, `runtimePolicy.includeDiffAfterEdit`, etc. | Same as above |
| `validation` | `validationPolicy.validationMode`, `validationPolicy.requireTestsBeforeFinish`, etc. | Policy object is direct mapping |
| `retry` | `retryPolicy.retries`, `retryPolicy.retryMode`, `retryPolicy.critiqueBeforeRetry` | Direct mapping |
| `completion` | `runtimePolicy.requireStructuredSummary`, etc. | Direct mapping |

**Compiler pipeline:**
1. Receive raw `HarnessConfig` (validated by schema).
2. Compute `contentHash = hash(canonicalJSON(config))`.
3. Assemble system prompt from `prompt` sub-config using template engine.
4. Generate `ToolDefinition[]` from `tools` sub-config.
5. Build policy objects (`RuntimePolicy`, `ValidationPolicy`, `RetryPolicy`) from remaining sub-configs.
6. Return `CompiledHarness` with `compiledHash = hash(prompt + toolDefs + policies)`.
7. Store both `config` (by `contentHash`) and `compiled` (by `compiledHash`) in storage.

---

## Event model

The event model is an **append-only, typed event log** that serves as the system of record (SPEC.md §22). Every runtime action — model requests, tool calls, file changes, validation events, limit enforcement — emits a typed event.

**Event types (SPEC.md §22):**

```typescript
type RunEvent =
  | RunStarted
  | ModelRequested
  | ModelResponded
  | ToolRequested
  | ToolCompleted
  | FileChanged
  | ValidationStarted
  | ValidationCompleted
  | RetryStarted
  | LimitReached
  | RunCompleted;
```

**Event structure:**

```typescript
interface EventBase {
  id: number;          // Monotonic sequence number within run
  runId: string;       // UUID linking to Run
  type: EventType;     // Discriminant from union above
  timestamp: string;   // ISO 8601
  data: unknown;       // Type-specific payload (JSON)
}
```

**Why append-only events as system of record (not transcripts):**
- **Replayability:** Full event log enables deterministic replay of any run for debugging or analysis.
- **Cost attribution:** Every model request and response carries token counts and cost data.
- **Behavioral analysis:** Tool-call patterns, retry sequences, and failure modes can be extracted from event streams.
- **Auditability:** No information is lost or transformed during execution. The raw event stream is the ground truth.
- **Flexible querying:** Events can be projected into different views (transcripts, summaries, traces) without losing fidelity.

---

## Storage

### SQLite schema overview

SQLite serves as the local storage engine for the MVP. Core tables correspond to the data model entities (SPEC.md §23).

**Core tables:**

| Table | Purpose | Key columns |
|---|---|---|
| `models` | Provider-registered model records | `id`, `provider`, `model_alias`, `resolved_id`, `pricing_snapshot` |
| `harness_configs` | Declarative harness configs | `id` (content hash), `compiled_hash`, `config_json`, `compiled_json`, `created_at` |
| `tasks` | Benchmark task definitions | `id`, `category`, `difficulty`, `split`, `repo`, `description`, `constraints` |
| `experiments` | Experiment metadata | `id`, `name`, `config_yaml`, `phase`, `status`, `created_at`, `completed_at` |
| `runs` | Atomic run results | `id` (UUID), `experiment_id`, `model_id`, `harness_config_id`, `task_id`, `split`, `seed`, `trial_number`, `status`, `termination_reason`, `input_tokens`, `output_tokens`, `cached_tokens`, `cost_usd`, `tool_calls`, `tool_errors`, `turns`, `latency_ms`, `patch_hash`, `artifact_path` |
| `run_events` | Append-only event log | `id`, `run_id`, `type`, `timestamp`, `data_json` |
| `tool_calls` | Normalized tool call records | `id`, `run_id`, `event_id`, `tool_name`, `arguments_json`, `result_json`, `error` |
| `validation_results` | Per-run validation outcomes | `id`, `run_id`, `validation_type`, `passed`, `details_json` |
| `metrics` | Flexible metric storage | `id`, `run_id`, `name`, `value`, `unit`, `tags_json` |
| `optimization_steps` | Optimization history | `id`, `experiment_id`, `model_id`, `step_number`, `config_id`, `utility`, `accepted`, `parent_config_id` |
| `artifacts` | Content-addressed blob storage | `hash`, `run_id`, `type`, `size`, `compression`, `path` |

### Content-addressable design

Large artifacts (patches, full event traces, compiled harness snapshots, repository fixture snapshots) are stored as compressed filesystem blobs and referenced from SQLite by content hash.

- **Artifact key:** `SHA-256(content)` — deterministic, deduplicated, verifiable.
- **Storage path:** `experiments/results/<hash>.gz` or equivalent layout.
- **Referencing:** The `artifacts` table maps content hashes to runs and types.
- **Benefits:** Identical patches across repeated evaluations share one blob. Content integrity is self-verifying. Large objects don't bloat SQLite.

---

## Deployment topology

### Local single-machine CLI

**Topology type:** Single-node, no network service, no distributed execution.

```
┌──────────────────────────────────────────────┐
│              Local Machine                     │
│                                                │
│  ┌──────────────┐    ┌──────────────────────┐ │
│  │ Terminal      │    │  Dashboard (Bun     │ │
│  │ CLI           │    │  HTTP server or     │ │
│  │ bun harnessfit│    │  static HTML build) │ │
│  └───────┬───────┘    └──────────┬───────────┘ │
│          │                       │              │
│          └───────┬───────────────┘              │
│                  │                              │
│          ┌───────▼──────────────┐               │
│          │   Core / Packages    │               │
│          │   (TypeScript, Bun)  │               │
│          └───────┬──────────────┘               │
│                  │                              │
│          ┌───────▼──────────────┐               │
│          │    SQLite Database   │               │
│          │    (file-backed)     │               │
│          └──────────────────────┘               │
│                                                │
│  ┌──────────────────────────────────────────┐  │
│  │  experiments/results/ (content-addressed) │  │
│  └──────────────────────────────────────────┘  │
│                                                │
│  ┌──────────────────────────────────────────┐  │
│  │  benchmarks/repositories/ fixtures        │  │
│  └──────────────────────────────────────────┘  │
└──────────────────────────────────────────────┘
```

**What runs where:**
- **CLI** — User-facing terminal application. Run directly by the researcher.
- **Dashboard** — Either a local Bun HTTP server or a static HTML build. Reads from the same SQLite database. Not intended for deployment; runs on the same machine.
- **Core** — All packages (core, harness, optimizer, evaluator, providers, storage) are TypeScript libraries loaded by the CLI or dashboard.
- **SQLite** — File-backed database at `experiments/experiments.db` (or configurable path). Single writer (CLI), concurrent readers (dashboard).
- **Artifacts** — Compressed files in `experiments/results/`. Referenced by content hash from SQLite.
- **Repository fixtures** — Local directories under `benchmarks/repositories/`. Read-only during experiments; copied per trial for isolation.

**Explicit exclusions from MVP (from SPEC.md §5):**
- No distributed execution, no production deployment, no multi-agent orchestration, no browser automation, no dynamic model routing, no RL training, no fine-tuning, no automatic benchmark generation.

---

## Risks and trade-offs

### Architectural risks

| Risk | Description | Mitigation |
|---|---|---|
| **SQLite contention** | Dashboard reads during active experiment may see incomplete runs or cause write contention. | SQLite WAL mode; dashboard tolerates eventual consistency; experiment writes are batched. |
| **Content-addressable blob growth** | Large event traces and patches accumulate. | Compression (gzip); periodic cleanup of intermediate artifacts; only finalist runs and optimization history retained indefinitely by default. |
| **Provider API drift** | Provider API changes break normalization. | Versioned adapters; integration tests per provider; pinned API versions via `resolvedId`. |
| **Bun ecosystem maturity** | Bun's SQLite bindings, HTTP server, and package ecosystem are less mature than Node.js. | All core logic is TypeScript-first; migration to Node.js is possible if Bun blockers emerge. |
| **Single-machine bottleneck** | All runs serialized per model (no parallel evaluation across machines). | Acceptable for MVP (small task count, fast repos); parallelization belongs in V2+ roadmap. |
| **Hidden test exposure** | Deterministic hidden tests could be inferred from repeated runs. | Tests execute outside writable tree; different seeds don't change test content; task fixtures reset per trial. |

### Design trade-offs

| Trade-off | Chosen approach | Alternative considered |
|---|---|---|
| **Storage** | SQLite + filesystem blobs | PostgreSQL (rejected: overkill for single-machine, adds deployment complexity) |
| **Search algorithm** | Coordinate hill climbing | Bayesian optimization (rejected: higher complexity, fewer transparency guarantees for initial research) |
| **Scoring** | Weighted deterministic formula with hidden tests | LLM-as-judge (rejected: introduces confounders; recorded separately but not as primary metric) |
| **Isolation** | Git-based per-trial clean state | Container-based (rejected: adds Docker dependency, overkill for controlled repository tasks) |
| **Reproducibility** | Same seed → deterministic replay | Full sandbox snapshot (rejected: storage cost outweighs benefit for MVP) |
| **Dashboard** | Static HTML or Bun HTTP server reading SQLite | Separate backend service (rejected: adds deployment complexity for single-machine use case) |
| **Provider normalization** | Preserve provider-native fields alongside normalized | Purist normalization (rejected: erases information needed for analysis of provider-specific behavior) |

---

*This architecture document is derived from SPEC.md (all 38 sections) and serves as the formal architectural reference for the HarnessFit project. All component names, interfaces, types, algorithms, and parameter names use the exact terminology defined in the specification.*
