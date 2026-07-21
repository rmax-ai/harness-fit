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
    title: "Hidden-Test Evaluation",
    desc: "Six split benchmark tasks are evaluated with hidden acceptance tests, regression checks, and deterministic scoring.",
  },
  {
    title: "Multi-Provider Runtime",
    desc: "One normalized runtime executes OpenAI, Anthropic, and Gemini models under the same generic harness.",
  },
  {
    title: "Parameterized Harness",
    desc: "A machine-readable harness has 37 typed settings spanning prompts, tools, context, validation, retries, and completion.",
  },
  {
    title: "Held-Out Evaluation",
    desc: "Evaluate a supplied harness JSON on the configured test split with persisted success, score, cost, and latency data.",
  },
  {
    title: "Persisted Run Evidence",
    desc: "SQLite stores run metadata, events, patches, deterministic score components, costs, and durations; harness configs are hashed.",
  },
  {
    title: "Research Roadmap",
    desc: "Optimization, transfer matrices, stability analysis, and statistical acceptance remain planned work—not current results.",
  },
];

export const METRICS = [
  { label: "101 passing tests", desc: "7 live-provider checks are opt-in" },
  { label: "0 type errors", desc: "Full strict TypeScript with branded types" },
  { label: "6 benchmark tasks", desc: "3 train · 2 dev · 1 test" },
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
