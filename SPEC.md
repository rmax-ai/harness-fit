# HarnessFit — Specification

Automatic Discovery of Model-Specific Agent Harness Profiles

**Status:** Project specification
**Implementation stack:** TypeScript, Bun, SQLite
**Initial providers:** OpenAI, Anthropic, Google
**License:** Apache-2.0
**Target duration:** 4–6 weeks for the complete experimental MVP

> This is the original specification preserved verbatim as the ground-truth reference. Every downstream document (ARCHITECTURE.md, implementation plan, issues) references SPEC.md sections.

---

## Table of Contents

1. [Project summary](#1-project-summary)
2. [Research questions](#2-research-questions)
3. [Core hypotheses](#3-core-hypotheses)
4. [Initial model cohort](#4-initial-model-cohort)
5. [Scope](#5-scope)
6. [Experimental unit](#6-experimental-unit)
7. [Task design](#7-task-design)
8. [Benchmark construction](#8-benchmark-construction)
9. [Agent runtime](#9-agent-runtime)
10. [Harness configuration model](#10-harness-configuration-model)
11. [Search space](#11-search-space)
12. [Hill-climbing algorithm](#12-hill-climbing-algorithm)
13. [Repeated trials](#13-repeated-trials)
14. [Scoring](#14-scoring)
15. [Utility function](#15-utility-function)
16. [Evaluation matrix](#16-evaluation-matrix)
17. [Overfitting controls](#17-overfitting-controls)
18. [Architecture](#18-architecture)
19. [Repository structure](#19-repository-structure)
20. [Provider abstraction](#20-provider-abstraction)
21. [Harness compiler](#21-harness-compiler)
22. [Event model](#22-event-model)
23. [Storage](#23-storage)
24. [CLI](#24-cli)
25. [Experiment configuration](#25-experiment-configuration)
26. [Dashboard](#26-dashboard)
27. [Failure taxonomy](#27-failure-taxonomy)
28. [Anti-cheating controls](#28-anti-cheating-controls)
29. [Statistical analysis](#29-statistical-analysis)
30. [Reproducibility requirements](#30-reproducibility-requirements)
31. [MVP milestones](#31-mvp-milestones)
32. [MVP success criteria](#32-mvp-success-criteria)
33. [Risks](#33-risks)
34. [Extension roadmap](#34-extension-roadmap)
35. [Expected research artifacts](#35-expected-research-artifacts)
36. [Proposed article](#36-proposed-article)
37. [Central output](#37-central-output)
38. [Final project principle](#38-final-project-principle)

---

## 1. Project summary

HarnessFit is an experimental framework for measuring and automatically optimizing how an agent harness interacts with different language models.

The project tests the hypothesis that a significant portion of observed model performance comes not from the underlying model alone, but from the compatibility between the model and its execution harness.

Instead of asking:
> Which model performs best?

HarnessFit asks:
> What harness configuration allows each model to perform best, and how much performance is lost when every model is forced through the same generic harness?

The system executes identical software-engineering tasks across several models, mutates harness parameters, evaluates the resulting behavior, and retains configurations that improve a defined objective.

The principal output is not a conventional model leaderboard. It is a collection of empirically derived harness profiles describing which prompting, planning, tool-use, validation, and retry strategies work best for each model.

---

## 2. Research questions

**Primary question**
How much does model-specific harness optimization improve task success compared with a shared generic harness?

**Secondary questions**
- Do optimized harnesses transfer between models?
- Which harness dimensions produce the largest performance changes?
- Are improvements stable across task categories and repositories?
- Does optimization improve success by increasing intelligence, or merely by increasing tokens, retries, or tool calls?
- Can inexpensive models approach stronger-model performance when given a better-fitting harness?
- How quickly does simple hill climbing converge?
- Does a harness overfit to the benchmark used during optimization?
- Are model-specific profiles stable across model version upgrades?

---

## 3. Core hypotheses

**H1: Harness-fit hypothesis**
Each model has a distinct locally optimal harness configuration.
```
score(model, optimized_harness_for_model) > score(model, generic_harness)
```

**H2: Cross-model incompatibility**
A harness optimized for one model will perform worse when applied to another model than the receiving model's own optimized harness.
```
score(M2, H2*) > score(M2, H1*)
```

**H3: Cheap-model recovery**
Harness optimization will recover part of the performance gap between inexpensive and more capable models without proportionally increasing cost.

**H4: Parameter concentration**
A small subset of harness parameters will explain most observed performance variation.
Likely candidates: Tool-description style, Planning policy, Validation feedback, Retry strategy, Context compaction, Instruction density.

**H5: Benchmark overfitting**
Optimization against one task distribution will improve in-distribution performance more than held-out performance.

---

## 4. Initial model cohort

| Provider | Model | Experimental role |
|----------|-------|-------------------|
| Google | Gemini 3.5 Flash | Fast agentic and coding-oriented model |
| OpenAI | GPT-5.6 Luna | Cost-sensitive, high-volume model |
| Anthropic | Claude Haiku 4.5 | Fast Anthropic model with agent capabilities |

Model identifiers must be loaded from configuration rather than hard-coded.

```yaml
models:
  - id: gemini-flash
    provider: google
    model: gemini-3.5-flash
  - id: gpt-luna
    provider: openai
    model: gpt-5.6-luna
  - id: claude-haiku
    provider: anthropic
    model: claude-haiku-4-5
```

Exact API aliases may be overridden through environment variables.

**Optional control model** (post-MVP): GPT-5.6 Terra, Claude Sonnet 4.6, Gemini 3.1 Pro (or successor). Provides reference for whether optimized small models close the gap with stronger models.

---

## 5. Scope

**Included in the MVP:**
- Provider-independent model adapter
- Repository-based coding tasks
- Shell and filesystem tools
- Deterministic test execution
- Parameterized harness configurations
- Baseline evaluation
- Coordinate hill climbing
- Multi-objective scoring
- Full execution traces
- Held-out evaluation
- Cross-model harness transfer matrix
- Results export
- Static HTML or local web dashboard

**Excluded from the MVP:**
- Production deployment
- Browser automation
- Dynamic model routing within one run
- Multi-agent orchestration
- Reinforcement-learning training
- Fine-tuning
- Human preference evaluation
- Automatic benchmark generation
- Distributed execution
- General-purpose autonomous coding

---

## 6. Experimental unit

An experimental run is defined by:
```
Run = Model × Harness configuration × Task × Repository state × Random seed × Trial number
```

Each run must be independently reproducible.

**Required stored data:** Model and provider, exact model version, harness configuration hash, task version, repository commit, seed, start/completion timestamps, input/output/cached tokens, monetary cost, tool calls, tool errors, number of turns, wall-clock latency, generated patch, test results, validator output, final score, termination reason, full event trace.

---

## 7. Task design

First benchmark is deliberately small and controlled.

**Task categories:**
- **A. Local bug repair** — Model receives repository, bug description, test command. Succeeds when existing failing test passes without regressions.
- **B. Small feature implementation** — Narrowly scoped feature request with explicit acceptance tests.
- **C. Refactoring under constraints** — Improve internal structure without changing observable behavior.
- **D. Code review** — Receive patch with seeded defects, produce structured findings.
- **E. Repository comprehension** — Answer architectural questions checked against repository-specific reference.

---

## 8. Benchmark construction

Three small repositories (not large public repos initially):
- `fixtures/task-service/`
- `fixtures/payment-rules/`
- `fixtures/event-processor/`

Each repository: 2,000–8,000 lines, clear install, tests < 30s, type checking, linting, git history, seeded tasks, hidden acceptance tests, deterministic deps, no network requirement. Use TypeScript for the first benchmark.

**Initial task count:** 30 total (12 training, 6 dev, 12 held-out test).

**Difficulty:** 10 easy, 12 medium, 8 hard. Defined empirically using baseline success rates.

---

## 9. Agent runtime

Minimal single-agent edit loop:

```
Task initialization → Context acquisition → Model decision → Tool execution →
Environment feedback → Model continuation → Validation → Completion or retry
```

**Available tools:** `list_files`, `read_file`, `search_files`, `write_file`, `apply_patch`, `run_command`, `git_diff`, `finish`. Tool set identical across providers.

Provider-native tool-call formats normalized into common internal representation:
```typescript
interface ToolCall {
  id: string;
  name: ToolName;
  arguments: unknown;
}
```

**Runtime limits (configurable per run):**
```yaml
limits:
  maxTurns: 24
  maxToolCalls: 40
  maxWallTimeSeconds: 600
  maxOutputTokens: 32000
  maxCostUsd: 5
```

---

## 10. Harness configuration model

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

**10.1 Prompt:** instructionStyle (minimal|contract|procedural|principles), structure (markdown|xml|plain), includeExamples, repeatConstraints, explicitSuccessCriteria, instructionPosition (prefix|prefix-and-suffix).

**10.2 Planning:** mode (none|implicit|explicit), requirePlanBeforeTools, requirePlanUpdateAfterFailure, maxPlanItems (3|5|8).

**10.3 Tools:** descriptionStyle (minimal|detailed|detailed-with-examples), schemaStrictness (permissive|strict), returnFormat (plain|structured), includeUsageGuidance, exposeToolErrorsVerbatim.

**10.4 Context:** repositoryMap (none|compact|detailed), initialFileStrategy (none|retrieved|task-hints), toolResultCompaction (none|truncate|summarize), includePreviousFailures, maxContextTokens.

**10.5 Feedback:** commandOutput (raw|normalized|diagnostic), includeDiffAfterEdit, includeRemainingBudget, failureFraming (neutral|diagnostic|directive).

**10.6 Validation:** validationMode (final-only|after-edit|adaptive), requireTestsBeforeFinish, requireLintBeforeFinish, requireTypecheckBeforeFinish, rejectTestDeletion, rejectValidationWeakening.

**10.7 Retry:** retries (0|1|2), retryMode (same-context|failure-summary|fresh-context), critiqueBeforeRetry.

**10.8 Completion:** requireStructuredSummary, requireEvidenceReferences, requireChangedFiles, requireResidualRisk.

---

## 11. Search space

Full Cartesian product too large. MVP uses constrained coordinate search.

**Phases:**
- **Phase 0: Baseline** — One generic harness across all models.
- **Phase 1: Single-parameter sensitivity** — Mutate one value, hold everything else constant.
- **Phase 2: Coordinate hill climbing** — Start from best baseline, select parameter, generate neighbors, evaluate, accept best credible improvement.
- **Phase 3: Random restarts** — Repeat from different starting points.
- **Phase 4: Held-out confirmation** — Evaluate selected harness on unseen tasks.

---

## 12. Hill-climbing algorithm

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

**Acceptance rule:** Accept only when candidate utility > incumbent utility + minimum effect AND one of: bootstrap CI excludes zero, paired permutation test reaches threshold, sequential test reaches required evidence. Minimum effect: 3 pp task success or 5% utility improvement without reducing success.

---

## 13. Repeated trials

- 3 trials during search
- 5 trials for finalist configurations
- 10 trials for selected headline comparisons
- Use identical task ordering and matched seeds where provider APIs support seeding.

---

## 14. Scoring

**Primary metric:** Success rate. Cost and latency are constraints/secondary objectives.

**Task score =** 0.70 × functional correctness + 0.10 × regression safety + 0.10 × constraint compliance + 0.10 × patch quality.

- **Functional correctness:** Deterministic hidden tests only.
- **Regression safety:** Existing tests, type checking, linting, build success.
- **Constraint compliance:** Did not change forbidden files, modify tests, add dependencies, break public API, exceed patch-size limit.
- **Patch quality:** Patch size, duplication introduced, complexity delta, new lint violations, unused code, forbidden suppressions.

LLM-as-judge may be recorded separately but must not determine the principal result.

---

## 15. Utility function

```
U = 1.00 × success rate
    - 0.10 × normalized cost
    - 0.05 × normalized latency
    - 0.10 × failure variance
    - 0.25 × limit violation rate
```

Also generate Pareto frontiers for: success vs cost, success vs latency, success vs tokens, success vs tool calls. No single "best" harness reported without naming its objective.

---

## 16. Evaluation matrix

Four comparisons:
- **A. Generic-harness baseline** — All models under generic harness.
- **B. Model-specific optimized harnesses** — Generic vs optimized per model.
- **C. Cross-model transfer matrix** — Every harness on every model (central empirical artifact).
- **D. Ablation study** — Remove one feature at a time from optimized harness.

---

## 17. Overfitting controls

- Task split: training / development / held-out test
- Repository split: at least one repo only in held-out
- Mutation budget: same max candidate evaluations per model
- Compute budget: comparable optimization expenditure or normalized by cost
- Search logging: every candidate retained (including rejected)
- Finalist lock: cannot change finalist configs after held-out results observed

---

## 18. Architecture

```
┌──────────────────────────────┐
│ Experiment CLI               │
└──────────────┬───────────────┘
               │
┌──────────────▼───────────────┐
│ Experiment Coordinator       │
│ - task selection             │
│ - trial scheduling           │
│ - budget enforcement         │
└──────┬──────────────┬────────┘
       │              │
┌──────▼──────┐ ┌─────▼────────┐
│ Optimizer   │ │ Evaluator    │
│ - mutation  │ │ - tests      │
│ - selection │ │ - metrics    │
└──────┬──────┘ └─────┬────────┘
       │              │
┌──────▼──────────────▼────────┐
│ Agent Runtime                │
│ - context                    │
│ - tools                      │
│ - validation loop            │
└──────────────┬───────────────┘
               │
┌──────────────▼───────────────┐
│ Provider Adapter             │
├────────────┬─────────┬───────┤
│ OpenAI     │ Google  │ Claude│
└────────────┴─────────┴───────┘
               │
┌──────────────▼───────────────┐
│ Isolated Repository Sandbox  │
└──────────────────────────────┘
```

---

## 19. Repository structure

```
harness-fit/
├── apps/
│   ├── cli/
│   └── dashboard/
├── packages/
│   ├── core/
│   │   ├── events/
│   │   ├── runtime/
│   │   ├── tools/
│   │   └── types/
│   ├── providers/
│   │   ├── openai/
│   │   ├── anthropic/
│   │   └── google/
│   ├── harness/
│   │   ├── compiler/
│   │   ├── configs/
│   │   ├── mutations/
│   │   └── prompts/
│   ├── optimizer/
│   │   ├── hill-climbing/
│   │   ├── random-search/
│   │   └── statistics/
│   ├── evaluator/
│   │   ├── deterministic/
│   │   ├── metrics/
│   │   └── reports/
│   └── storage/
├── benchmarks/
│   ├── repositories/
│   ├── tasks/
│   ├── hidden-tests/
│   └── manifests/
├── experiments/
│   ├── definitions/
│   └── results/
├── scripts/
├── docs/
└── README.md
```

---

## 20. Provider abstraction

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

Adapter must normalize: messages, tool definitions, tool calls, tool results, stop conditions, usage statistics, reasoning controls, errors, retryable failures. Do not erase provider differences — record provider-native fields alongside normalized.

---

## 21. Harness compiler

Configurations compile into provider-neutral runtime artifacts:

```typescript
interface CompiledHarness {
  systemPrompt: string;
  toolDefinitions: ToolDefinition[];
  runtimePolicy: RuntimePolicy;
  validationPolicy: ValidationPolicy;
  retryPolicy: RetryPolicy;
}
```

Compilation must be deterministic: `hash(config) → same compiled harness`. Store both declarative and compiled output.

---

## 22. Event model

Every runtime action emits an append-only event:

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

Enables replay, debugging, cost attribution, behavioral analysis. The event log is the system of record — not final transcripts.

---

## 23. Storage

SQLite for MVP. Core tables: `models`, `harness_configs`, `tasks`, `experiments`, `runs`, `run_events`, `tool_calls`, `validation_results`, `metrics`, `optimization_steps`, `artifacts`. Large transcripts/patches stored as compressed filesystem artifacts referenced from SQLite. Everything content-addressable.

---

## 24. CLI

```bash
bun harnessfit init                              # Initialize
bun harnessfit providers check                   # Validate providers
bun harnessfit baseline --experiment ...         # Run baseline
bun harnessfit optimize --model ... --search ... # Optimize
bun harnessfit evaluate --config ... --split ... # Evaluate held-out
bun harnessfit transfer --configs ...            # Transfer matrix
bun harnessfit report --experiment ...           # Generate report
bun harnessfit inspect <run-id>                  # Inspect a run
```

---

## 25. Experiment configuration

```yaml
id: harness-fit-v1
models: [gemini-flash, gpt-luna, claude-haiku]
benchmark:
  trainingSplit: train
  developmentSplit: dev
  testSplit: test
trials:
  search: 3
  finalists: 5
  headline: 10
optimizer:
  algorithm: coordinate-hill-climbing
  randomRestarts: 3
  maximumCandidatesPerModel: 120
  minimumSuccessImprovement: 0.03
limits:
  maxTurns: 24
  maxToolCalls: 40
  maxWallTimeSeconds: 600
  maxCostUsdPerRun: 5
objective:
  successWeight: 1.0
  costWeight: 0.10
  latencyWeight: 0.05
  varianceWeight: 0.10
reporting:
  transferMatrix: true
  ablations: true
  paretoFrontiers: true
  confidenceIntervals: true
```

---

## 26. Dashboard

Five questions: Which harness works best? How much improvement? Which parameters produced it? Does it generalize? What did it cost?

**Views:** Experiment overview, Harness comparison, Transfer heatmap, Optimization trajectory, Run trace.

---

## 27. Failure taxonomy

Deterministic labels: `ENVIRONMENT_FAILURE`, `PROVIDER_FAILURE`, `INVALID_TOOL_CALL`, `TOOL_LOOP`, `CONTEXT_EXHAUSTION`, `BUDGET_EXHAUSTION`, `PREMATURE_COMPLETION`, `TEST_FAILURE`, `REGRESSION`, `CONSTRAINT_VIOLATION`, `VALIDATION_MANIPULATION`, `NO_PATCH`, `UNRELATED_PATCH`.

---

## 28. Anti-cheating controls

System must detect: deleted tests, skipped tests, changed assertions, disabled lint rules, added type suppressions, replaced implementation with hard-coded outputs, modified hidden-test infrastructure, reduced validation coverage, commands excluding failing suites.

Hidden acceptance tests must run outside the writable working tree. Task fixtures reset from clean commit for every trial.

---

## 29. Statistical analysis

For each comparison: mean success rate, median task score, standard deviation, bootstrap CI, per-task paired difference, total cost, cost per successful task, median latency, failure distribution.

**Minimum reporting standard:** "Optimized configuration improved mean task success from X% to Y% across N tasks and T trials. Paired improvement: Z pp. 95% bootstrap CI: [A, B]. Optimization and evaluation cost: $C."

---

## 30. Reproducibility requirements

Every published result includes: source commit, benchmark version, repository fixture commits, harness configuration files, provider model identifiers, pricing snapshot date, runtime limits, randomization policy, trial count, raw metrics, excluded runs and reasons, search budget, complete optimization history. Provider-side nondeterminism must be acknowledged.

---

## 31. MVP milestones

| Milestone | Deliverable | Acceptance criterion |
|-----------|------------|---------------------|
| M1: Deterministic benchmark | 1 repo fixture, 6 tasks, hidden tests, sandbox reset, deterministic scoring | Same patch → same score across 10 repeated evals |
| M2: Provider-neutral runtime | 3 adapters, common tools, event trace, cost accounting, runtime limits | All 3 models complete same task through same interface |
| M3: Parameterized harness | Typed config, harness compiler, ≥12 mutable params, config hashing/diffing | Two distinct configs → traceable, reproducible compiled harnesses |
| M4: Baseline experiment | 12 tasks, 3 models, 3 trials, generic harness, comparison report | Every model has complete success/cost/latency/failure metrics |
| M5: Hill-climbing optimizer | Neighbor gen, candidate eval, acceptance test, search budget, history, restarts | Discovers config improving synthetic objective with known optimum |
| M6: Full experiment | 30 tasks, train/dev/test split, model-specific optimization, transfer matrix, ablations, dashboard, report | Can confirm/reject/qualify harness-fit hypothesis using held-out evidence |

---

## 32. MVP success criteria

**Technical:** All 3 models use same normalized runtime. Every run reproducible. Harness configs machine-readable and versioned. Optimizer evaluates ≥50 configs per model. Hidden tests determine functional correctness. Cost/latency/tokens/tool calls recorded. Held-out tasks inaccessible during optimization. Transfer matrix auto-generated.

**Research:** ≥2 models improve by ≥5 pp on held-out success after optimization. ≥1 optimized harness performs materially worse when transferred. Improvement not explained by higher token/tool/retry budgets. Ablation identifies ≥1 model-specific parameter interaction. Null result still valuable — same harness working best falsifies model-specificity claim.

---

## 33. Risks

- **Excessive API cost** — Small repos, fast tests, early stopping, sequential eval, candidate pruning, batch/cached inference.
- **Benchmark overfitting** — Held-out repos, fixed search budget, finalist lock, transfer evaluation.
- **Provider asymmetry** — Distinguish shared vs provider-specific params. Shared-space experiment first.
- **Unstable model aliases** — Persist resolved model versions, store response metadata, pin dated aliases.
- **Search noise** — Paired tasks, repeated trials, minimum effect threshold, statistical acceptance rule.
- **Misleading scalar score** — Preserve raw metrics, publish Pareto frontiers, state objective explicitly.

---

## 34. Extension roadmap

- **V2: Advanced search** — Random search, simulated annealing, Bayesian optimization, evolutionary search, contextual bandits.
- **V3: Task-specific profiles** — Separate profiles for bug fixing, refactoring, code review, comprehension, frontend.
- **V4: Dynamic harness selection** — Select profile at runtime based on task characteristics.
- **V5: Dynamic model routing** — Different models for planning, implementation, validation, summarization.
- **V6: Self-improving harness** — Convert production failures/successes into candidate mutations and regression tests.

---

## 35. Expected research artifacts

Open-source evaluation framework, reproducible benchmark, model-specific harness profiles, cross-model transfer matrix, harness-parameter sensitivity analysis, cost-versus-quality Pareto frontiers, technical article, machine-readable experiment dataset, public dashboard, follow-up research agenda.

---

## 36. Proposed article

**Working title:** *The Harness Gap: Measuring How Much Agent Performance Depends on Model-Specific Execution Architecture*

**Central argument:** Models should not be compared only under one generic agent implementation. A fairer comparison measures each model under a common harness, under its optimized harness, and with every optimized harness transferred to every other model. The difference between these conditions quantifies the harness gap.

---

## 37. Central output

The most important project artifact is the transfer matrix:

```
                 Model
Harness       Gemini   GPT   Claude
Generic         ?       ?       ?
Gemini-fit      ?       ?       ?
GPT-fit         ?       ?       ?
Claude-fit      ?       ?       ?
```

Four possible outcomes: A (universal harness), B (provider-family profiles), C (model-specific profiles), D (task-specific profiles). The project must discover which is true rather than presupposing model-specific optimization will win.

---

## 38. Final project principle

HarnessFit treats agent architecture as an empirical object.

Prompts, tool schemas, validation loops, context policies, and retries are not folklore or style preferences. They are configurable system components whose effects can be measured, optimized, transferred, ablated, and falsified.
