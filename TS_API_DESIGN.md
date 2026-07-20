# TypeScript API Design — HarnessFit

Companion to `AGENTS.md`. Type design patterns for public interfaces.

## Interfaces vs Types

```typescript
// ✅ Public API surfaces: interfaces
interface ModelProvider {
  generate(request: NormalizedModelRequest): Promise<NormalizedModelResponse>;
  estimateCost(usage: NormalizedUsage): Money;
  capabilities(): ProviderCapabilities;
}

// ✅ Union types: discriminated events, errors, options
type RunEvent =
  | { type: "run.started"; runId: RunId; timestamp: string }
  | { type: "model.requested"; runId: RunId; provider: string; messages: Message[] }
  | { type: "run.completed"; runId: RunId; score: number; durationMs: number };

// ✅ Utility types
type DeepReadonly<T> = { readonly [K in keyof T]: DeepReadonly<T[K]> };
```

## Branded Types for IDs

```typescript
declare const RunIdBrand: unique symbol;
type RunId = string & { readonly [RunIdBrand]: never };

function createRunId(): RunId {
  return crypto.randomUUID() as RunId;
}
```

Never accept raw `string` where a branded type is expected.

## Result Type

```typescript
type Result<T, E = Error> =
  | { ok: true; value: T }
  | { ok: false; error: E };

// Usage
function doThing(): Result<string, ValidationError> {
  if (invalid) return { ok: false, error: new ValidationError("bad") };
  return { ok: true, value: "good" };
}

// Discriminated narrowing
const result = doThing();
if (!result.ok) {
  console.error(result.error.message); // narrowed
  return;
}
console.log(result.value); // narrowed, T = string
```

## Config Types

```typescript
// ✅ as const string unions for wire values
type InstructionStyle = "minimal" | "contract" | "procedural" | "principles";
type ValidationMode = "final-only" | "after-edit" | "adaptive";

// ❌ No enums for serialized values
// enum InstructionStyle { Minimal, Contract } // BAD

// ✅ enums only for internal state machines
enum OptimizerPhase { Baseline, Sensitivity, HillClimb, Restart, Confirmation }
```

## Readonly by Default

```typescript
// ✅ Public API returns readonly
function getRunEvents(runId: RunId): readonly RunEvent[] { ... }

// ✅ Config is immutable
interface HarnessConfig {
  readonly prompt: PromptConfig;
  readonly planning: PlanningConfig;
}

// ✅ Mutation returns new object
function withPlanningMode(config: HarnessConfig, mode: PlanningMode): HarnessConfig {
  return { ...config, planning: { ...config.planning, mode } };
}
```

## Provider Abstraction Boundary

```typescript
// packages/core/src/types/provider.ts — shared, zero deps
interface NormalizedModelRequest {
  readonly model: string;
  readonly system: string;
  readonly messages: readonly Message[];
  readonly tools: readonly ToolDefinition[];
  readonly maxOutputTokens: number;
  readonly temperature?: number;
}

// packages/providers/openai/src/adapter.ts — provider-specific, depends on core
import OpenAI from "openai";
import type { NormalizedModelRequest, NormalizedModelResponse } from "@harnessfit/core";

class OpenAIProvider implements ModelProvider {
  private client: OpenAI;

  async generate(request: NormalizedModelRequest): Promise<NormalizedModelResponse> {
    const response = await this.client.chat.completions.create({
      // Map NormalizedModelRequest → OpenAI params
    });
    return this.normalize(response); // Map OpenAI response → NormalizedModelResponse
  }
}
```

## Event Sourcing

```typescript
// events are immutable value objects
interface RunStartedEvent {
  readonly type: "run.started";
  readonly runId: RunId;
  readonly modelId: ModelId;
  readonly configHash: string;
  readonly taskId: TaskId;
  readonly seed: number;
  readonly trialNumber: number;
  readonly timestamp: string;
}

// emit only through event store
eventStore.emit({ type: "run.started", runId, modelId, ... });
```
