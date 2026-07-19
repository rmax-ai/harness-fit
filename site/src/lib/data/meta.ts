export const PROJECT_VERSION = "v0.1.0";
export const REPO = "rmax-ai/harness-fit";

export const STACK = [
  "TypeScript",
  "Bun",
  "SQLite",
  "SvelteKit 5",
];

export const FEATURES = [
  {
    title: "Deterministic Benchmark",
    desc: "Hidden acceptance tests ensure fair, reproducible evaluation across models.",
  },
  {
    title: "Provider-Neutral Runtime",
    desc: "Unified adapter interface for OpenAI, Anthropic, and Google Gemini — swap without changing agent code.",
  },
  {
    title: "Parameterized Harness",
    desc: "37 tunable harness parameters — prompt style, tool descriptions, validation policy, retry strategy.",
  },
  {
    title: "Hill-Climbing Optimizer",
    desc: "Per-model coordinate ascent finds optimal harness profiles with statistical acceptance.",
  },
  {
    title: "Content-Addressable",
    desc: "Every config, task, and result hashed for deterministic reproducibility.",
  },
  {
    title: "Event Log Architecture",
    desc: "Typed event log as system of record — every runtime action captured for analysis.",
  },
];

export const METRICS = [
  { label: "89 tests", desc: "Unit + integration tests across 7 modules" },
  { label: "0 type errors", desc: "Full strict TypeScript with branded types" },
  { label: "37 parameters", desc: "Tunable harness dimensions for optimization" },
  { label: "3 providers", desc: "OpenAI · Anthropic · Google Gemini adapters" },
];

export const ARCH_FLOW = [
  { label: "CLI", color: "#6366f1" },
  { label: "Coordinator", color: "#8b5cf6" },
  { label: "Optimizer", color: "#a855f7" },
  { label: "Runtime", color: "#06b6d4" },
  { label: "Adapter", color: "#22c55e" },
  { label: "Evaluator", color: "#f59e0b" },
  { label: "Storage", color: "#ef4444" },
];
