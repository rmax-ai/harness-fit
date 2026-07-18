# HarnessFit

**Automatic Discovery of Model-Specific Agent Harness Profiles**

[![License](https://img.shields.io/badge/license-Apache%202.0-blue)](LICENSE)
[![Stack](https://img.shields.io/badge/stack-TypeScript%20%7C%20Bun%20%7C%20SQLite-3178c6)]()

An experimental framework that tests the hypothesis: **a significant portion of observed model performance comes from harness compatibility, not raw model capability.**

Instead of asking "which model performs best?", HarnessFit asks "what harness configuration allows each model to perform best?"

---

## Quickstart

```bash
# Clone
git clone https://github.com/rmax-ai/harness-fit.git
cd harness-fit

# Install (requires Bun)
bun install

# Validate provider setup
cp .env.example .envrc
direnv allow
bun harnessfit providers check

# Run baseline experiment
bun harnessfit baseline --experiment experiments/definitions/baseline.yaml

# Optimize a model
bun harnessfit optimize --model gpt-luna --search hill-climb --budget 120

# Generate transfer matrix
bun harnessfit transfer --configs experiments/results/finalists/

# View dashboard
bun harnessfit report --experiment harness-fit-v1 --output reports/
```

> **API keys:** Set `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, `GOOGLE_API_KEY` in your environment. See `.env.example`.

---

## How It Works

```
Experiment CLI → Coordinator → Optimizer/Evaluator → Agent Runtime → Provider Adapter → Sandbox
```

1. **Define** — TypeScript benchmark repos with hidden acceptance tests
2. **Baseline** — Run all models through a generic harness
3. **Optimize** — Hill-climb through harness parameters per model
4. **Transfer** — Test every optimized harness on every model
5. **Ablate** — Remove features one at a time to measure impact

The central output is the **transfer matrix** — a 4×3 grid showing whether harnesses are universal, provider-specific, or model-specific.

---

## Architecture

| Component | Purpose |
|-----------|---------|
| `packages/core/` | Types, runtime, tools, events — provider-agnostic |
| `packages/providers/` | OpenAI, Anthropic, Google adapters |
| `packages/harness/` | Config definitions, compiler, mutations |
| `packages/optimizer/` | Hill climbing, statistics, random search |
| `packages/evaluator/` | Deterministic scoring, metrics, reports |
| `packages/storage/` | SQLite persistence, event log |
| `apps/cli/` | Command-line interface |
| `apps/dashboard/` | Static HTML experiment dashboard |

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for full system design.

---

## Documentation

| Document | Content |
|----------|---------|
| [SPEC.md](SPEC.md) | Authoritative specification (38 sections) |
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | System architecture and component design |
| [docs/THREAT_MODEL.md](docs/THREAT_MODEL.md) | Threat analysis and validity controls |
| [docs/ROADMAP.md](docs/ROADMAP.md) | Phased implementation plan |
| [docs/DECISIONS.md](docs/DECISIONS.md) | Design rationale and trade-offs |

---

## Research Questions

- How much does model-specific harness optimization improve task success?
- Do optimized harnesses transfer between models?
- Which harness dimensions produce the largest performance changes?
- Can inexpensive models approach stronger-model performance with a better harness?
- Does harness optimization overfit to the benchmark?

See [SPEC.md §2](SPEC.md#2-research-questions) for the full list.

---

## Commands

```bash
bun harnessfit init                    # Initialize project
bun harnessfit providers check         # Validate API credentials
bun harnessfit baseline --experiment … # Run baseline
bun harnessfit optimize --model …      # Hill-climb optimization
bun harnessfit evaluate --config …     # Held-out evaluation
bun harnessfit transfer --configs …    # Cross-model transfer matrix
bun harnessfit report --experiment …   # Generate report + dashboard
bun harnessfit inspect <run-id>        # Inspect a single run
```

---

## License

Apache 2.0 © 2026
