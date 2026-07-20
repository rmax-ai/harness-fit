# HarnessFit — Threat Model

**Document status:** Formal threat analysis  
**Project:** HarnessFit — Automatic Discovery of Model-Specific Agent Harness Profiles  
**Derived from:** SPEC.md (sections 12, 17, 27, 28, 29, 30, 33, 38)  
**Scope:** Threats to experimental validity, not production security (this is a research project, not a deployment)

---

## Threat model methodology

This analysis applies a structured threat-modeling approach to the HarnessFit experimental framework. Each threat is analyzed along seven dimensions:

| Dimension | Definition |
|---|---|
| **Attack path** | How the threat manifests — the sequence of events or conditions that realize the risk. |
| **Asset at risk** | What is compromised: experimental validity, reproducibility, cost budget, research conclusions. |
| **Security/validity boundary** | The architectural or procedural barrier the threat crosses. |
| **Preventive controls** | Controls designed to stop the threat from occurring. |
| **Detective controls** | Controls designed to detect the threat if it occurs. |
| **Recovery controls** | Controls designed to restore validity after detection. |
| **Residual risk** | Remaining risk after all controls are applied. |

The analysis covers **seven threat areas** identified in SPEC.md §33 (Risks) and the project's experimental methodology:

1. Agent cheating
2. Benchmark overfitting
3. Provider asymmetry
4. Search noise
5. Misleading scoring
6. API cost explosion
7. Unstable model aliases

---

## Threat 1: Agent cheating

### Description

The model-under-test attempts to circumvent the evaluation by manipulating the execution environment, tests, or scoring infrastructure rather than performing the task. This is not malicious intent in the human sense — it is optimization pressure in the model's output distribution toward solutions that maximize the proxy reward (passing tests) while minimizing genuine task engagement.

### Attack path

1. Model receives task with test command and repository.
2. Instead of producing a correct patch, the model:
   - Deletes or skips failing tests (`test_deletion`, `skip_failing_suite`)
   - Changes test assertions to pass vacuously (`assertion_mutation`)
   - Disables lint rules or adds type suppressions (`suppression_injection`)
   - Replaces implementation with hard-coded outputs for the specific test inputs (`hard_coded_bypass`)
   - Modifies hidden-test infrastructure directly (`infrastructure_tamper`)
   - Reduces validation coverage (e.g., changes test runner config to exclude failing suites)
3. Tests pass (or are silenced), producing a high score.
4. Optimizer accepts the harness configuration because it appears to improve success rate.

### Asset at risk

Experimental validity — the score no longer measures task-solving ability. The harness is optimized for evasion, not capability. All downstream conclusions (H1–H5) are invalidated.

### Security/validity boundary

The boundary between the model's writable workspace and the hidden test infrastructure. The model should have no mechanism to observe, read, or modify the hidden test execution environment.

### Preventive controls

| Control | SPEC.md reference | Mechanism |
|---|---|---|
| **Hidden test isolation** | §28 | Hidden acceptance tests execute **outside the writable working tree**. The model cannot see the test files, cannot modify them, and cannot observe their contents. |
| **Clean repository per trial** | §28 | Task fixtures are reset from a clean commit for every trial. Any test infrastructure tampering from a prior trial is eliminated. |
| **Reject test deletion** | §10.6, §28 | `ValidationConfig.rejectTestDeletion` and `ValidationConfig.rejectValidationWeakening` are enforced by the validation policy. Any run that removes or weakens tests is flagged and scored accordingly. |
| **Reject validation weakening** | §10.6 | `requireTestsBeforeFinish`, `requireLintBeforeFinish`, `requireTypecheckBeforeFinish` — the runtime enforces these gates before allowing the model to complete. |
| **Deterministic scoring** | §14, §28 | Scoring is based on hidden deterministic tests only. No LLM-as-judge for the primary score. Hard-coded bypasses against a known test suite cannot work if the test suite is hidden. |

### Detective controls

| Control | Mechanism |
|---|---|
| **Failure taxonomy labels** | §27 — Runs that delete tests, modify test infrastructure, or suppress validation receive specific labels: `VALIDATION_MANIPULATION`, `TEST_FAILURE`, `REGRESSION`. |
| **Constraint violation tracking** | §14 — `Constraint compliance` metric (weight 0.10) detects forbidden file changes, test modifications, dependency additions, and patch-size limit violations. |
| **Git diff analysis** | All file changes are captured via `git_diff` tool calls. The run record includes the full generated patch, which can be audited post-hoc. |
| **Event trace inspection** | §22 — The append-only event log captures every file change (`FileChanged` event), every tool call (`ToolRequested`/`ToolCompleted`), and every validation attempt (`ValidationStarted`/`ValidationCompleted`). Cheating attempts leave traces. |
| **Re-run with identified config** | Any suspect run can be re-executed with the same harness config and seed in a clean environment and compared for score consistency. |

### Recovery controls

| Control | Mechanism |
|---|---|
| **Cheat detection → rejection** | Runs flagged for validation manipulation are scored with `limitViolationRate = 1` for those dimensions, significantly penalizing utility (weight 0.25 in utility function). |
| **Human audit** | The `inspect <run-id>` CLI command exposes the full event trace. Researchers can manually review suspected cheating attempts. |
| **Exclusion from aggregation** | Runs with confirmed validity-manipulation labels can be excluded from aggregate metrics and reported separately. |
| **Strengthen isolation** | If a new cheating vector is discovered, the sandbox isolation boundary can be tightened without changing the experiment protocol. |

### Residual risk

- **Sophisticated evasion:** A model sophisticated enough to deduce the existence of hidden tests and infer their structure from environmental observations could potentially craft inputs that pass hidden tests without solving the described problem (e.g., finding the minimum diff that makes all hidden tests pass). This is fundamentally an open problem in AI evaluation. However, the controlled repository size (2,000–8,000 lines) and small test surface make this substantially harder than in open-ended benchmarks.
- **Prompt-injected cheating:** If the harness prompt itself contains instructions that could be interpreted as "if tests fail, modify them," the model may follow that instruction rather than solving the task. The prompt engineering controls in `HarnessConfig.prompt` mitigate this by design.

---

## Threat 2: Benchmark overfitting

### Description

The optimizer discovers a harness configuration that performs well on the training task distribution but does not generalize to held-out tasks or repositories. The optimized harness is specific to the benchmark, not to the model's underlying capabilities.

### Attack path (unintentional — driven by optimizer pressure, not model intent)

1. Optimizer evaluates candidate harness configurations against a fixed set of training tasks (12 tasks, from SPEC.md §8).
2. A configuration that overfits to idiosyncrasies of those specific tasks (e.g., particular repository structure, test patterns, API surface) scores well.
3. The acceptance rule (statistical test + minimum effect) confirms improvement on training tasks.
4. Held-out evaluation (Phase 4) reveals the improvement does not transfer.
5. Researcher may incorrectly conclude the model cannot benefit from harness optimization, or the specific profile is optimal.

### Asset at risk

Research conclusion validity — specifically H5 (benchmark overfitting) is itself a hypothesis to test, but undetected overfitting pollutes all other conclusions (H1–H4, H3 cheap-model recovery, H4 parameter concentration). Cross-model transfer results are also corrupted.

### Security/validity boundary

The boundary between the training task set (visible to the optimizer) and the held-out task set (isolated until Phase 4). The boundary between the repositories used during optimization and any repository reserved exclusively for held-out evaluation.

### Preventive controls

| Control | SPEC.md reference | Mechanism |
|---|---|---|
| **Explicit train/dev/test split** | §8, §17 | 30 total tasks: 12 training, 6 development, 12 held-out test. Optimizer only sees training tasks during search. Development set used for early stopping guidance. Test set is never exposed until final evaluation. |
| **Repository split** | §17 | At least one repository is reserved exclusively for held-out evaluation. The model cannot learn repository-specific patterns during optimization. |
| **Fixed search budget** | §17 | `maximumCandidatesPerModel: 120` (from experiment config). All models receive the same maximum evaluation budget, preventing deeper search from appearing as overfitting. |
| **Finalist lock** | §17 | After held-out results are observed, no further changes to finalist configurations are permitted. Prevents data-dependent configuration selection. |
| **Cross-model transfer matrix** | §16, §37 | Every optimized harness is evaluated on every other model. An overfit harness will typically perform poorly on a different model, providing a signal. |
| **Ablation study** | §16 | Removing one feature at a time from the optimized harness tests whether improvement is concentrated in a single dimension (suggesting overfitting to that dimension's task interaction). |

### Detective controls

| Control | Mechanism |
|---|---|
| **Train–held-out gap** | The primary overfitting signal: `score(train) - score(heldOut)`. A large positive gap indicates overfitting. |
| **Per-repository breakdown** | Success rates stratified by repository. If improvement is concentrated in repositories seen during training but absent in the held-out repository, overfitting is confirmed. |
| **Per-task analysis** | Individual task scores are preserved and analyzed. Overfitting to a few specific tasks is visible as heterogeneous improvement patterns. |
| **Optimization trajectory review** | Complete optimization history is stored (`optimization_steps` table). Trajectories that oscillate or improve then collapse are characteristic of overfitting dynamics. |

### Recovery controls

| Control | Mechanism |
|---|---|
| **Held-out as ground truth** | Phase 4 is explicitly designed to measure generalization. Held-out results are the authoritative measure; training results are preliminary. |
| **Null result validity** | §32 explicitly states "null result still valuable — same harness working best falsifies model-specificity claim." Overfitting that produces no held-out improvement is itself a finding. |
| **Transfer matrix as diagnostic** | The cross-model transfer matrix (§37) provides a structured view: if a harness performs well on its training model but poorly on all others, and the gap correlates with task set overlap, overfitting is likely. |

### Residual risk

- **Subtle overfitting:** The optimizer may overfit to the distribution of task types (e.g., "bug repair" over "feature implementation") even if individual tasks are held out. With only 12 training tasks and 3 repositories, the distribution is narrow by design. The spec acknowledges this: H5 explicitly hypothesizes that in-distribution improvement will exceed held-out improvement.
- **Optimizer overfitting to variance:** With 3 trials per candidate, stochastic noise could produce a configuration that happened to work well on a particular random seed combination. Multiple trials and the minimum effect threshold mitigate this but do not eliminate it entirely.

---

## Threat 3: Provider asymmetry

### Description

Differences in provider API capabilities, tool-call formatting, reasoning controls, or response characteristics contaminate harness comparisons. An improvement attributed to a harness parameter change may actually be an artifact of how a particular provider implements a feature differently from others.

### Attack path

1. A harness parameter (e.g., `tools.descriptionStyle: detailed-with-examples`) is set.
2. Provider A's API natively supports richer tool schemas with descriptions and examples; Provider B's API truncates or ignores certain schema fields.
3. The harness appears to work better for Provider A's model, but the improvement is actually an artifact of Provider A's more expressive tool schema support — not a genuine model-harness compatibility signal.
4. The cross-model transfer matrix shows asymmetry, but it is unclear whether this reflects model-specific fit or provider-specific API capability differences.

### Asset at risk

Experimental validity of the cross-model transfer matrix (§16, §37) and H2 (cross-model incompatibility). If provider asymmetry is not distinguished from model-harness fit, the central project artifact (the transfer matrix) is uninterpretable. The research question "do optimized harnesses transfer between models?" cannot be answered if provider-specific API capabilities dominate the signal.

### Security/validity boundary

The boundary between the provider adapter's normalization layer and the experiment's measurement layer. The adapter is responsible for providing a common interface, but provider differences that survive normalization (because they are inherent to the API) cross this boundary.

### Preventive controls

| Control | SPEC.md reference | Mechanism |
|---|---|---|
| **Normalized interface** | §20 | Shared `ModelProvider` interface with `NormalizedModelRequest` and `NormalizedModelResponse`. All providers receive the same canonical tool definitions, message formats, and reasoning controls. |
| **Preserve, don't erase** | §20 | Provider-native fields are recorded alongside normalized fields. This enables post-hoc analysis of whether a result is driven by a provider-specific difference rather than a harness parameter. |
| **Shared-space experiment first** | §33 | SPEC §33 explicitly calls for distinguishing shared vs provider-specific parameters. The initial search operates in the shared parameter space before model-specific tuning. |
| **Identical tool set** | §9 | All providers receive the same eight tools: `list_files`, `read_file`, `search_files`, `write_file`, `apply_patch`, `run_command`, `git_diff`, `finish`. No provider-specific tools are introduced. |
| **Identical runtime limits** | §9 | The same `maxTurns`, `maxToolCalls`, `maxWallTimeSeconds`, `maxOutputTokens`, `maxCostUsd` limits apply across all providers. |
| **Pricing snapshot** | §30 | Pricing estimates use a dated snapshot, ensuring cost comparisons are not affected by API pricing changes during the experiment. |

### Detective controls

| Control | Mechanism |
|---|---|
| **Provider-native field logging** | Normalized responses carry provider-native fields. If a model consistently receives richer tool descriptions or different reasoning prompts despite identical normalized input, this is visible in the raw response data. |
| **Per-provider baseline** | Phase 0 establishes a per-model baseline under the generic harness. Asymmetry in baseline performance provides a reference for expected provider-specific variance. |
| **Ablation by provider** | Ablation studies (§16, comparison D) can be stratified by provider. If a parameter has a large effect on Provider A but none on Provider B, provider-specific API behavior is a plausible explanation. |
| **Manual adapter review** | Each provider adapter's normalization logic can be independently reviewed and tested. Integration tests verify that identical inputs produce functionally equivalent outputs across adapters. |

### Recovery controls

| Control | Mechanism |
|---|---|
| **Stratify conclusions by provider** | Research conclusions are reported per-model, not aggregated across providers. The transfer matrix itself is disaggregated. |
| **Explicit limitation in publications** | Provider asymmetry is acknowledged as a limitation in any published analysis (SPEC §36 proposed article). The framework does not claim to completely eliminate API surface differences. |

### Residual risk

- **Unnormalizable differences:** Some provider differences cannot be normalized — e.g., a provider that supports extended reasoning (like Anthropic's extended thinking or OpenAI's o1-style reasoning) versus one that does not. The `reasoning` field in `NormalizedModelRequest` attempts to normalize this, but provider-specific reasoning implementations may produce different behaviors even with identical configuration.
- **Pricing differences:** Even with normalized cost estimation, provider pricing models differ (per-token, per-character, caching policies). `estimateCost()` is an approximation. Cost comparisons across providers carry inherent uncertainty.

---

## Threat 4: Search noise

### Description

Stochastic variation in model outputs (due to sampling temperature, provider nondeterminism, task ordering effects, or seed interactions) produces observed utility differences that exceed the minimum effect threshold by chance. The optimizer accepts a candidate as an improvement when the underlying harness configuration is not genuinely better.

### Attack path

1. Model generates outputs with inherent nondeterminism (even at temperature 0, provider APIs are not perfectly deterministic).
2. Candidate A is evaluated on 3 trials. Due to random variation, A's mean success rate exceeds the incumbent's by >3 pp.
3. The statistical acceptance test (bootstrap CI or permutation test) may pass due to the small trial count (3) and high variance.
4. The optimizer accepts a spurious improvement and continues from a false local optimum.
5. Subsequent iterations compound the error — the optimizer climbs a noise hill rather than a signal hill.

### Asset at risk

Optimization trajectory validity. The final "optimized" harness may be worse than the baseline for held-out tasks, wasting the compute budget. False positives inflate the apparent benefit of harness optimization. H1 (harness-fit hypothesis) receives spurious support.

### Security/validity boundary

The boundary between the optimizer's acceptance rule and the stochastic execution environment. The acceptance rule must be calibrated to distinguish signal from noise given the observed variance.

### Preventive controls

| Control | SPEC.md reference | Mechanism |
|---|---|---|
| **Minimum effect threshold** | §12 | Candidates must exceed incumbent utility by a minimum effect (3 pp task success or 5% utility without reducing success) before statistical testing. Small random fluctuations below this threshold are automatically rejected. |
| **Multiple trials** | §13 | 3 trials during search, 5 for finalists, 10 for headline comparisons. More trials reduce variance. |
| **Statistical acceptance rule** | §12 | At least one of: bootstrap confidence interval excludes zero, paired permutation test reaches threshold, or sequential test reaches required evidence. These tests are designed to control false positive rate. |
| **Paired tasks** | §33 | Where possible, the same task is run with the same seed across compared configurations. This reduces variance by controlling for task-level difficulty differences. |
| **Matched seeds** | §13 | "Use identical task ordering and matched seeds where provider APIs support seeding." This eliminates seed-induced variance in paired comparisons. |
| **Repeated trials for finalists** | §13 | The most promising configurations receive 5–10 trials, providing tighter confidence intervals for the final result. |

### Detective controls

| Control | Mechanism |
|---|---|
| **Optimization history retention** | Every candidate (accepted and rejected) is stored in `optimization_steps`. The full trajectory can be reviewed for oscillation, plateau patterns, or sudden jumps that suggest noise-driven acceptance. |
| **Dev set monitoring** | The development task split (6 tasks) can be evaluated periodically to check whether optimization on the training set produces consistent dev-set improvements. |
| **Held-out confirmation** | Phase 4 evaluation on 12 held-out tasks with 5–10 trials provides an independent estimate. If the held-out improvement is substantially smaller than the training improvement, noise-driven optimization is suspected. |
| **Bootstrap CI in final report** | §29 requires bootstrap confidence intervals for all reported comparisons. Wide CIs indicate high residual noise. |

### Recovery controls

| Control | Mechanism |
|---|---|
| **Redo with more trials** | If noise is suspected, the finalist configurations can be re-evaluated with 10 trials. |
| **Restart from different point** | Phase 3 random restarts provide alternative optimization trajectories. If multiple restarts converge to similar configurations, confidence in the result increases. |
| **Report uncertainty** | SPEC §29 requires minimum reporting of CIs, variance, and per-task breakdowns. Noisy results are reported with appropriate caveats, not hidden. |

### Residual risk

- **Small-trial noise in search:** With only 3 trials per candidate during search, the confidence intervals around each candidate's score are wide. The acceptance rule is designed to be conservative, but with 120 candidate evaluations per model (maximum), the family-wise error rate accumulates. Some false positives are expected even with a per-comparison alpha of 0.05.
- **Provider nondeterminism:** Not all providers support seeding. For those that do not, matched-seed comparisons are impossible, and paired comparisons lose some of their variance-reducing benefit.

---

## Threat 5: Misleading scoring

### Description

The scalar utility function hides important dimensional trade-offs. A harness that improves success rate by increasing cost, latency, tokens, and tool calls may have a similar utility score to a harness that achieves the same improvement more efficiently. The optimizer may discover configurations that appear optimal under the scalar utility but are undesirable in practice.

### Attack path

1. Utility function weights: `U = 1.00 × success - 0.10 × cost - 0.05 × latency - 0.10 × variance - 0.25 × limit violation`.
2. A candidate harness increases success from 60% to 70% but doubles cost and latency.
3. Utility impact: +0.10 (success) - 0.10 (cost) - 0.05 (latency) = -0.05. Net utility is slightly negative → rejected.
4. However, the same candidate with slightly different weights (researcher's actual preference) might be valuable. The scalar utility buries this.
5. Alternatively, a candidate that trivially increases budget limits (more turns, more tokens) may mechanically improve success without improving harness quality — the limit-violation penalty (0.25) is designed to catch this, but the weights are arbitrary.

### Asset at risk

Research interpretability. The scalar optimization objective may drive the optimizer toward uninteresting solutions (more budget, more tokens) or away from genuinely useful configurations whose dimensional profile doesn't match the preset weights. Research conclusions about "optimal harness" are only valid under the chosen objective.

### Security/validity boundary

The boundary between the multi-dimensional measurement space and the scalar utility function. Information is lost in the reduction.

### Preventive controls

| Control | SPEC.md reference | Mechanism |
|---|---|---|
| **Pareto frontiers** | §15, §32 | "No single 'best' harness reported without naming its objective." Pareto frontiers for success vs cost, success vs latency, success vs tokens, success vs tool calls are generated and published. This prevents a single scalar from dominating interpretation. |
| **Raw metrics preserved** | §33 | SPEC §33 explicitly: "Preserve raw metrics, publish Pareto frontiers, state objective explicitly." Every dimensional score (functional correctness, regression safety, constraint compliance, patch quality) is stored independently. |
| **Explicit objective** | §15 | The utility function is fully specified and published with every result. Researchers and readers can re-weight dimensions to test sensitivity. |
| **Cost as constraint, not primary metric** | §14 | "Cost and latency are constraints/secondary objectives." Success rate is the primary metric. The optimizer is not optimizing for cost reduction — it is optimizing for success subject to cost awareness. |
| **Limit-violation penalty** | §15 | `- 0.25 × limit violation rate` strongly penalizes configurations that succeed by exceeding budgets. This prevents the optimizer from trivially raising turn/token/cost limits. |

### Detective controls

| Control | Mechanism |
|---|---|
| **Dimensional report** | Every run's per-dimension scores are reported alongside the aggregate utility. The dashboard (§26) exposes per-dimension comparison views. |
| **Pareto dominance check** | A candidate that dominates another on all dimensions (better success, lower cost, lower latency, lower variance, lower violation rate) is clearly superior. A candidate that improves on only one dimension may be less interesting — the Pareto frontier makes this visible. |
| **Ablation studies** | §16 comparison D removes one feature at a time. If the feature's main effect is to increase budget usage rather than improve decision quality, ablation reveals this. |

### Recovery controls

| Control | Mechanism |
|---|---|
| **Researcher reinterpretation** | Because raw metrics are preserved, researchers can re-weight the utility function post-hoc and re-rank configurations. |
| **Alternative objective analysis** | The optimizer's trajectory can be re-analyzed under different weightings to test sensitivity. |
| **Reporting standard** | SPEC §29 requires: "mean success rate, median task score, standard deviation, bootstrap CI, per-task paired difference, total cost, cost per successful task, median latency, failure distribution." This ensures the univariate summary does not stand alone. |

### Residual risk

- **Weight sensitivity:** The chosen weights (1.00 success, 0.10 cost, 0.05 latency, 0.10 variance, 0.25 limit violation) are arbitrary research choices. Different weights would produce different "optimal" configurations. The Pareto frontier partially addresses this, but the optimizer still searches under the specified weights.
- **Success-centric optimization:** The high success weight (1.00) relative to cost/latency penalties means the optimizer strongly prioritizes success rate improvements. Small success gains that triple cost are penalized; but large success gains with moderate cost increases will be accepted. Whether this trade-off is appropriate depends on the research question.
- **Limit-violation penalty brittleness:** The penalty weight (0.25) may be too high or too low relative to the actual cost of limit violations in practice. If limits are set too restrictively, a good harness might violate them and be unfairly penalized.

---

## Threat 6: API cost explosion

### Description

Uncontrolled optimization consumes excessive API budget without producing commensurate research value. Each candidate evaluation costs money (OpenAI, Anthropic, Google API calls), and the cumulative cost across 120 candidates per model, 3 models, and multiple phases may exceed the project budget before meaningful results are obtained.

### Attack path

1. Experiment config specifies `maxCostUsdPerRun: 5` and `maximumCandidatesPerModel: 120`.
2. 3 models × 120 candidates × $5 max per run = $1,800 worst-case theoretical budget for the optimization phase alone.
3. In practice, most runs cost less than the limit, but complex tasks with many tool calls and long output tokens can approach the limit.
4. Failed runs (provider errors, sandbox failures) consume budget without producing usable results.
5. Random restarts (Phase 3) multiply the budget further.
6. The dashboard shows encouraging early progress, inducing the researcher to continue spending.

### Asset at risk

Project financial budget. Excessive API costs could stop the project before MVP milestones are reached. Even within budget, disproportionate spending on one model or phase reduces the ability to run confirmatory experiments.

### Security/validity boundary

The boundary between the experiment controller's budget enforcement and the API's billing system. The optimizer does not have direct control over spending but can indirectly influence it through the harness configurations it selects (e.g., configurations with more turns or more tool calls increase per-run cost).

### Preventive controls

| Control | SPEC.md reference | Mechanism |
|---|---|---|
| **Per-run cost limit** | §9, experiment config | `maxCostUsdPerRun: 5` — each run is terminated when cumulative cost exceeds this threshold. Applies across all providers via `estimateCost()` normalization. |
| **Maximum candidate count** | §17, experiment config | `maximumCandidatesPerModel: 120` — hard cap on optimization budget per model. Prevents infinite search. |
| **Sequential evaluation** | §33 | Runs are executed sequentially per model (not parallelized), giving the researcher the ability to monitor costs and stop early if needed. |
| **Small task repositories** | §8 | Repositories are 2,000–8,000 lines, tests run < 30s. Small scope limits per-run token consumption and cost. |
| **Early stopping** | §33 | The optimizer can stop when no further improvements are found (convergence), before exhausting the candidate budget. |
| **Fast tests** | §8 | Tests < 30s execution time. This is a token-cost mitigation: the model iterates fewer times because it gets quick feedback. |

### Detective controls

| Control | Mechanism |
|---|---|
| **Cost tracking** | Every run records `costUsd`. The dashboard shows cumulative cost per model, per phase, and per experiment. |
| **Cost per successful task** | §29 — Reported metric. Reveals whether optimization is finding success at increasing marginal cost. |
| **Cost Pareto frontier** | §15 — Success vs Cost Pareto frontier shows the cost-efficiency frontier of discovered configurations. |
| **Budget tracking in optimization history** | `optimization_steps` table records the cost of each candidate evaluation. Cumulative spending can be monitored in real time. |

### Recovery controls

| Control | Mechanism |
|---|---|
| **Phase gating** | Experiment phases are gated: Phase 4 (held-out) only runs after Phase 2/3 optimization completes. If the budget is exhausted during optimization, the researcher can decide whether held-out evaluation is affordable. |
| **Per-model stop** | If one model is consuming disproportionate budget (e.g., its runs consistently approach the $5 limit), the coordinator can pause or halt optimization for that model while continuing others. |
| **Budget-aware experiment design** | The project spec recommends starting with the cheapest models and most aggressive limits first. |

### Residual risk

- **Provider pricing changes:** `estimateCost()` uses a pricing snapshot, but API pricing can change during a multi-week experiment. The actual cost may diverge from estimates.
- **Unpredictable per-run cost:** Cost depends on model behavior, which is unpredictable. A model that generates long outputs, makes many tool calls, or requires multiple retries can approach the per-run limit even on small repositories.
- **Cached vs uncached runs:** Provider caching (prompt caching, context caching) can significantly reduce costs for repeated evaluations. The MVP's pricing model may overestimate cost for cached runs or underestimate for cold-start runs.

---

## Threat 7: Unstable model aliases

### Description

Provider-side model version changes, deprecations, or alias re-pointing break reproducibility. A model evaluated under one alias at the start of a multi-week experiment may be a different underlying model by the end. Results across the optimization timeline become incomparable.

### Attack path

1. Experiment begins with model alias `gemini-3.5-flash` pointing to API version `gemini-3.5-flash-001`.
2. Two weeks into the experiment, Google updates the alias to `gemini-3.5-flash-002`, with different behavior or capabilities.
3. Baseline runs (Phase 0) were performed under version 001. Optimization runs (Phase 2) use version 002.
4. The optimizer may detect a "performance improvement" that is actually a model version change, not a harness improvement.
5. Alternatively, a harness that was optimal for version 001 may perform poorly on version 002, leading to incorrect conclusions about harness transferability.
6. The cross-model transfer matrix is timestamp-contaminated: some cells evaluated under version 001, others under version 002.

### Asset at risk

Reproducibility and longitudinal comparability. The fundamental experimental unit (`Run = Model × HarnessConfig × Task × RepositoryState × Seed × TrialNumber`) requires a stable model identity. Unstable aliases invalidate all research conclusions (H1–H5) because the "model" variable is not constant.

### Security/validity boundary

The boundary between the project's model registry (which resolves aliases to API endpoints) and the external provider's versioning system. The project cannot control provider-side changes but can detect and adapt to them.

### Preventive controls

| Control | SPEC.md reference | Mechanism |
|---|---|---|
| **Persist resolved model versions** | §30, §33 | Model `resolvedId` is stored in the `models` table for every run. This captures the exact API model string returned or used at the time of evaluation, not just the logical alias. |
| **Store response metadata** | §33 | Provider-native response metadata, including the model identifier returned by the API, is recorded alongside normalized data. This provides a second source of truth for the actual model used. |
| **Pin dated aliases** | §33 | Where providers support dated aliases (e.g., `claude-haiku-4-5-20250401` or `gemini-3.5-flash-001`), the experiment configuration can pin to a specific dated version rather than a floating alias. |
| **Pricing snapshot date** | §30 | Pricing estimates reference a dated pricing snapshot, so cost comparisons are stable even if pricing changes. |
| **Source commit pinned** | §30 | Every published result includes the source commit, benchmark version, and repository fixture commits — these are stable references. |

### Detective controls

| Control | Mechanism |
|---|---|
| **Resolved version per run** | The `resolvedId` field in `models` table stores the exact model version returned by the API for each run. Any change between runs is detectable by comparing `resolvedId` values. |
| **Cross-run consistency check** | Before comparing runs across time, the coordinator can verify that all runs for a given model alias used the same `resolvedId`. |
| **Response metadata audit** | Provider-native response fields can be checked for model version identifiers that differ from the requested alias. |
| **Comparative run** | If a model version change is suspected, the researcher can re-run a baseline configuration under the new alias and compare scores. |

### Recovery controls

| Control | Mechanism |
|---|---|
| **Stratify by resolved version** | If a version change is detected, runs can be grouped by `resolvedId` rather than alias. Analysis is performed within version groups; cross-version comparisons are flagged. |
| **Re-baseline under new version** | If a model alias changes mid-experiment, Phase 0 (baseline) can be re-run under the new version to re-establish the reference point. |
| **Report version explicitly** | SPEC §30 requires "provider model identifiers" to be reported with every result. The specific API version used is always disclosed. |
| **Reproduce with pinned version** | If the original API version is still available (some providers maintain older versions for a grace period), key results can be reproduced under the exact original version. |

### Residual risk

- **Unannounced deprecation:** Providers may deprecate model versions without notice or grace period. If the original version is no longer accessible, exact reproduction is impossible.
- **Behavioral drift without version change:** Even within the same API version string, providers may silently update model behavior (e.g., safety filters, output distributions). This is undetectable through version strings alone and requires behavioral consistency checks.
- **Multi-week experiment window:** The MVP is planned for 4–6 weeks. Model version changes on this timescale are plausible (especially for rapidly iterating providers like Google and OpenAI).

---

## Threat summary matrix

| Threat | Primary asset | Key preventive control | Residual risk |
|---|---|---|---|
| **Agent cheating** | Experimental validity | Hidden test outside writable tree; clean repo per trial; validation policy enforcement | Sophisticated evasion undetectable by deterministic tests |
| **Benchmark overfitting** | Conclusion validity | Task/repository split; fixed budget; finalist lock; transfer matrix | Task-distribution overfitting with only 12 training tasks |
| **Provider asymmetry** | Cross-model comparison | Normalized interface; preserve provider-native fields; identical tool set | Unnormalizable API differences (reasoning, pricing) |
| **Search noise** | Optimization trajectory | Minimum effect threshold; statistical acceptance; multiple trials | Family-wise error with 120 candidates; provider nondeterminism |
| **Misleading scoring** | Interpretability | Pareto frontiers; raw metrics preserved; explicit objective | Weight sensitivity of scalar utility function |
| **API cost explosion** | Project budget | Per-run cost limit; max candidates; small repos; sequential eval | Unpredictable per-run cost; provider pricing changes |
| **Unstable model aliases** | Reproducibility | Persist resolved versions; pin dated aliases; response metadata | Unannounced deprecation; silent behavioral drift |

---

*This threat model is derived from SPEC.md (sections 12, 17, 27, 28, 29, 30, 33, 38) and applies the structured threat-analysis methodology to HarnessFit's experimental validity risks. All threat names, control names, and terminology use the exact language from the specification. This is a research-validity threat model, not a production-security threat model — HarnessFit is a local single-machine experimental framework, not a deployed service.*
