# TypeScript System Design Patterns — HarnessFit

Companion to `AGENTS.md`. Patterns relevant to HarnessFit's domain: agent runtime, optimization, evaluation.

## 1. Agent Edit Loop (Pipeline Pattern)

```
Task init → Context → Model → Tools → Feedback → Validate → Complete/Retry
```

```typescript
class AgentLoop {
  async execute(
    task: Task,
    model: ModelProvider,
    harness: CompiledHarness,
    limits: RunLimits,
  ): Promise<RunResult> {
    const events = new EventStore();
    let context = await this.buildInitialContext(task, harness);

    for (let turn = 0; turn < limits.maxTurns; turn++) {
      const budget = this.checkBudget(events, limits);
      if (!budget.ok) return this.finish(events, "budget_exhausted");

      const response = await model.generate({ ...context, tools: harness.toolDefinitions });
      events.emit({ type: "model.responded", ... });

      if (response.stopReason === "tool_use") {
        for (const toolCall of response.toolCalls) {
          const result = await this.executeTool(toolCall, context.sandbox);
          events.emit({ type: "tool.completed", ... });
          context = this.addToolResult(context, toolCall, result);
        }
        continue;
      }

      if (response.stopReason === "end_turn") {
        const validation = await this.validate(context.sandbox, harness.validationPolicy);
        events.emit({ type: "validation.completed", ... });

        if (validation.passed) return this.finish(events, "completed");
        if (harness.retryPolicy.retries > 0) {
          context = this.prepareRetry(context, harness.retryPolicy, validation);
          continue;
        }
        return this.finish(events, "validation_failed");
      }
    }
    return this.finish(events, "turn_limit");
  }
}
```

## 2. Provider Adapter (Strategy Pattern)

Each provider is a strategy implementing `ModelProvider`. The runtime doesn't know which provider is in use.

```typescript
interface ModelProvider {
  generate(request: NormalizedModelRequest): Promise<NormalizedModelResponse>;
  estimateCost(usage: NormalizedUsage): Money;
  capabilities(): ProviderCapabilities;
}

// Registry allows swapping providers by config
const providers: Record<string, ModelProvider> = {
  openai: new OpenAIProvider(),
  anthropic: new AnthropicProvider(),
  google: new GoogleProvider(),
};

function getProvider(modelId: ModelId): ModelProvider {
  const config = modelRegistry.get(modelId);
  const provider = providers[config.provider];
  if (!provider) throw new Error(`Unknown provider: ${config.provider}`);
  return provider;
}
```

## 3. Harness Compiler (Builder / Compiler Pattern)

Deterministic transformation from `HarnessConfig → CompiledHarness`.

```typescript
function compileHarness(config: HarnessConfig): CompiledHarness {
  const systemPrompt = buildSystemPrompt(config.prompt);
  const toolDefinitions = buildToolDefinitions(config.tools);
  const hash = hashConfig(config); // SHA-256 of canonical JSON

  return {
    systemPrompt,
    toolDefinitions,
    runtimePolicy: buildRuntimePolicy(config),
    validationPolicy: buildValidationPolicy(config.validation),
    retryPolicy: buildRetryPolicy(config.retry),
    hash,
  };
}

// Determinism: same input → same output. No random, no timestamps in compiled output.
function hashConfig(config: HarnessConfig): string {
  const canonical = JSON.stringify(config, Object.keys(config).sort());
  return Bun.SHA256.hash(canonical).toString("hex");
}
```

## 4. Event Store (Append-Only Log)

```typescript
class EventStore {
  private events: RunEvent[] = [];

  emit(event: RunEvent): void {
    this.events.push({ ...event, sequenceNumber: this.events.length });
  }

  getAll(): readonly RunEvent[] {
    return this.events;
  }

  // Persist to SQLite on run completion
  async flush(db: Database, runId: RunId): Promise<void> {
    const insert = db.prepare(
      "INSERT INTO run_events (run_id, sequence, type, data) VALUES (?, ?, ?, ?)"
    );
    const tx = db.transaction(() => {
      for (const event of this.events) {
        insert.run(runId, event.sequenceNumber, event.type, JSON.stringify(event));
      }
    });
    tx();
  }
}
```

## 5. Optimizer (Hill Climbing with Statistical Acceptance)

```typescript
async function optimize(
  model: ModelId,
  initial: HarnessConfig,
  tasks: readonly Task[],
  budget: number,
): Promise<OptimizationResult> {
  let incumbent = await evaluateConfig(model, initial, tasks);
  let improved = true;
  let candidates = 0;

  while (improved && candidates < budget) {
    improved = false;
    const neighbors = generateNeighbors(incumbent.config);

    for (const candidate of neighbors) {
      candidates++;
      const result = await evaluateConfig(model, candidate, tasks);

      if (isCredibleImprovement(result, incumbent)) {
        incumbent = result;
        improved = true;
        break; // First-improvement (not steepest-ascent)
      }
    }
  }

  return { config: incumbent.config, history: incumbent.history };
}
```

## 6. Sandbox Manager (Isolation)

```typescript
class SandboxManager {
  async createSandbox(repoPath: string): Promise<Sandbox> {
    const workDir = await this.cloneClean(repoPath);
    const hiddenTestsDir = path.join(repoPath, "..", "hidden-tests");
    return {
      workDir,
      hiddenTestsDir, // Outside writable tree — model cannot access
      async runCommand(cmd: string[]): Promise<CommandResult> {
        return await Bun.$`cd ${workDir} && ${cmd}`.quiet();
      },
      async destroy(): Promise<void> {
        await Bun.$`rm -rf ${workDir}`;
      },
    };
  }
}
```

## 7. Deterministic Scoring

```typescript
interface TaskScore {
  readonly functional: number;  // 0.70 weight — hidden tests
  readonly regression: number;  // 0.10 weight — existing tests, typecheck, lint
  readonly constraint: number;  // 0.10 weight — didn't modify tests, add deps, break API
  readonly quality: number;     // 0.10 weight — patch size, duplication, complexity
  readonly total: number;       // Weighted sum
}

function scoreTask(result: RunResult, hiddenTests: HiddenTestSuite): TaskScore {
  const functional = runHiddenTests(result.patch, hiddenTests); // Deterministic
  const regression = checkRegression(result);
  const constraint = checkConstraints(result);
  const quality = measurePatchQuality(result.patch);
  return {
    functional,
    regression,
    constraint,
    quality,
    total: 0.70 * functional + 0.10 * regression + 0.10 * constraint + 0.10 * quality,
  };
}
```
