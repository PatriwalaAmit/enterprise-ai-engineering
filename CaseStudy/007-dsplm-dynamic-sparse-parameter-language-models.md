# Case Study: Dynamic Sparse Parameter Language Models (DSPLM) — Architecture, Benchmarks, and a Phased Path to Implementation

> **Note:** Number this to match your GitHub series sequence (e.g. Case Study 006) before publishing. Content below is implementation-ready as a standalone doc regardless of numbering.

> "MoE is one popular implementation of dynamic sparse computation. DSPLM is the broader concept — any language model that dynamically activates only the necessary subset of its parameters during inference."

---

## TL;DR

DSPLM is a generalization of Mixture-of-Experts: instead of sparsity living only in the FFN block (experts), it can live in attention heads, transformer blocks, neurons, or any combination — all coordinated by a dynamic controller that adjusts sparsity level against a compute/latency budget. The individual mechanisms (expert routing, head selection, layer skipping) are independently well-studied. The novel, risky part is unifying them under one controller and proving the interaction doesn't destabilize training. This case study lays out the architecture, the benchmark methodology needed to validate it honestly, and a four-phase implementation plan — starting from a dense baseline and adding one sparsity mechanism at a time.

---

## 1. Problem Statement

Dense transformers activate every parameter for every token. As models scale, this means compute and memory grow linearly with total parameter count even though, intuitively, not every token needs every parameter to be "on." MoE proved that decoupling *total capacity* from *active compute* works at production scale (Mixtral, DeepSeek-MoE, Qwen3-MoE). The open question this case study explores:

**Can sparsity be generalized beyond the FFN block — to attention heads and layer-level routing — under a single learned or rule-based controller, without the added routing machinery eating the efficiency gains or destabilizing training?**

---

## 2. Architecture Overview

### 2.1 Core idea

At each transformer block, DSPLM introduces two independent sparse sub-layers plus a coordination layer:

1. **Dynamic Sparse Attention** — a head router (and optionally a token router) selects a subset of attention heads to compute per token, instead of running all heads densely.
2. **Dynamic Sparse Feed-Forward / Experts** — a gating network performs top-k selection over a pool of M experts (this sub-layer is standard MoE).
3. **Dynamic Parameter Controller** — a higher-level policy that monitors performance (latency, loss, load), enforces a budget (MFLOPs, latency, memory), and adjusts routing behavior (sparsity level, top-k) across the model.

### 2.2 Data flow (single block, layer ℓ)

```
Input → RMSNorm → [Head Router → Selected Heads → Multi-Head Attention] → Dropout → Residual Add → RMSNorm
      → [Gating Network → Top-K Selection → Expert Pool → Weighted Sum] → Dropout → Residual Add → Output
```

Only the selected heads/experts execute their compute — unselected components are skipped entirely for that token, not just masked.

### 2.3 What can be made sparse (generalization axes)

| Granularity | Mechanism | Maturity |
|---|---|---|
| Experts (FFN blocks) | Top-k expert routing | Production-proven (MoE) |
| Attention heads | Head router selects active heads per token | Research-stage |
| Transformer blocks | Layer skipping / early exit | Research-stage, quality-risk |
| Parameters / neurons | Fine-grained structured sparsity | Early research |
| Tokens | Token dropping / pruning | Established for efficiency, orthogonal to this design |

### 2.4 Training objective

```
Total Loss = Language Modeling Loss
           + Load Balancing Loss (prevents expert/head collapse)
           + Sparsity / Budget Loss (enforces compute target)
           + Optional Auxiliary Losses
```

---

## 3. MoE vs. DSPLM — Where This Extends Prior Art

| Aspect | MoE | DSPLM |
|---|---|---|
| Concept | Specific architecture, multiple expert FFNs | Broader class — dynamically activates any subset of the model |
| Sparsity | Expert-level only | Expert, layer, neuron, or attention-head level |
| Routing | Router picks top-k experts per token | Any mechanism selecting which parameters activate |
| Granularity | Coarse (whole experts) | Fine- or coarse-grained |
| Example models | Mixtral, DeepSeek-MoE, Qwen3-MoE | MoE models + head-routing / layer-skipping research variants |

**Relationship:** All MoE models are DSPLMs. Not all DSPLMs are MoE models. This case study is specifically about testing the parts *beyond* MoE — head-level and controller-level dynamism — where the literature is thinner and the risk/reward is less proven.

---

## 4. Honest Risk Assessment

This section exists because the series convention is trade-off framing over promotional framing — and this architecture has real failure modes worth naming before writing a line of code.

- **Expert routing (MoE FFN):** Low risk. Well-understood, production-validated. Main failure mode is expert collapse, solved by load-balancing loss.
- **Dynamic head selection:** Medium-high risk. Attention heads are computationally cheap relative to FFN blocks, so the *routing overhead itself* can erase the savings. This needs to be measured, not assumed.
- **Layer/block skipping:** High risk to quality. Skipping a full block breaks residual-stream continuity in a way that skipping an expert doesn't — this tends to hurt downstream task accuracy more than perplexity numbers alone will show.
- **Unified meta-controller (Section 2.1, #3):** The highest-risk, highest-novelty part. Three routers with three load-balancing losses and one coordinating policy is an interaction-effects problem, not a single-mechanism problem. Most likely failure mode: routers quietly collapsing (e.g., 90% of tokens routed to 2 experts) while aggregate loss looks fine — which is exactly why Section 5.3 below is mandatory, not optional.

**Working hypothesis for this case study:** individual sparsity mechanisms are good ideas; the unified controller is the genuinely open research question and the reason this is worth documenting as a case study rather than just wiring up an existing MoE library.

---

## 5. Benchmark Methodology

Perplexity alone is not sufficient. Three categories, all required:

### 5.1 Compute-matched quality (isoFLOP comparison)
- Dense baseline vs. DSPLM at **matched active-parameter budget** — sparse "winning" without compute-matching is meaningless.
- Metrics: perplexity + downstream tasks (MMLU, HellaSwag, ARC-easy/challenge at minimum).

### 5.2 Efficiency
- Latency: p50 / p99 per-token generation time.
- Throughput: tokens/sec at a fixed batch size.
- Actual active-params-per-token vs. target sparsity %.
- Memory footprint (peak activation + parameter memory).

### 5.3 Routing health (the one most people skip)
- Expert/head utilization histograms over an eval set.
- Load-balancing loss trend across training.
- Collapse detection: flag if any single expert/head exceeds a utilization threshold (e.g., >40% of tokens).
- This is the metric that tells you if the architecture is functioning as designed vs. degenerating to a de-facto dense or de-facto single-expert model.

---

## 6. Phased Implementation Plan

Build incrementally. Do not implement Section 2's full architecture in one pass — each phase isolates one variable so failures are attributable.

### Phase 0 — Dense Baseline
- Small-scale GPT-2-class model (125M–350M params).
- Train cleanly on available hardware; this is the control group for every later comparison.
- Recommended scaffold: nanoGPT or LitGPT — hackable, easy to instrument, fast iteration over distributed-training infra.

### Phase 1 — FFN Expert Routing (Standard MoE)
- Add top-k=2 expert routing to the FFN block only.
- Use a reference implementation pattern rather than writing the router from scratch (study Mixtral's open architecture as the reference).
- Validate against all three benchmark categories in Section 5 before proceeding.

### Phase 2 — Dynamic Head Selection (Isolated)
- Add head routing on top of Phase 1, in isolation.
- Critical question: does this add measurable quality or efficiency gain over Phase 1 alone, or does routing overhead cancel the benefit?
- This phase is the direct test of whether the head-router box in the architecture diagram earns its place in the design.

### Phase 3 — Unified Meta-Controller
- Only after Phase 1 and 2 are independently validated.
- Start with a **rule-based** policy (fixed thresholds on latency/budget) before attempting a learned policy — this isolates controller instability from routing instability.
- This is where most of the genuine research risk (Section 4) lives.

---

## 7. Key Characteristics (Target State)

- Input-dependent (dynamic) activation
- Sparse computation via top-k routing
- Large total parameter count, small active set per token
- Lower compute, lower latency at inference
- Scalable model capacity independent of active-compute budget

---

## 8. Next Steps

- [ ] Confirm case study number for series sequencing
- [ ] Stand up Phase 0 dense baseline on nanoGPT/LitGPT
- [ ] Instrument Section 5.3 routing-health logging *before* Phase 1 training starts (not retrofitted after)
- [ ] Phase 1 MoE FFN implementation + isoFLOP comparison against Phase 0

---

**Discussion question for the community:** For those who've experimented with sparse routing beyond FFN experts — did dynamic head selection actually pay for its own routing overhead in your setups, or did it net out roughly even with dense attention at small scale?

---

*This case study was developed with AI assistance (Claude) for architecture analysis, benchmark design, and technical writing support. All implementation decisions, trade-off framing, and phased planning reflect the author's engineering judgment.*

Happy Learning!!
*Purity, Patience & Perseverance are the three essentials to SUCCESS.*
