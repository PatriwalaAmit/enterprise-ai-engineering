# Your 70B Model Doesn't Have a Latency Problem—It Has an Architecture Problem

*Why serving open-source LLMs at enterprise scale is a systems design challenge, not a GPU-buying decision.*

Most discussions around LLM inference focus on which model to pick, how many GPUs to rent, and whether to go with OpenAI instead of self-hosting.

Yet one of the biggest reasons production LLM systems miss their SLA has nothing to do with the model.

It starts much earlier—at the moment a request enters the serving stack.

Imagine a product leader asking:

> **"Can we serve a 70B open-source model to 1 million daily users, under 2 seconds, without burning the infra budget?"**

The instinctive answer is to price out A100s and call it done.

A typical naive deployment fails within the first week of peak traffic.

Not because the model is weak.

Not because the GPUs are underpowered.

But because the system was never designed for concurrency.

It was designed for a demo.

---

# The Hidden Problem: Daily Active Users Is Not a Capacity Number

Enterprise leaders think in daily users.

Infrastructure fails in **concurrent requests per second**.

Do the math instead of trusting the intuition:

| Metric | Naive assumption | What actually happens |
|---|---|---|
| Daily users | 1,000,000 | same |
| Requests/user/day | 5 | same |
| Requests/day | 5,000,000 | same |
| "Average" RPS | 58 (5M ÷ 86,400s) | Looks trivial |
| Actual peak RPS (5-8x business-hours clustering) | — | **290–460 RPS** |
| GPU-seconds held per request (70B, ~400 output tokens) | assumed ~0 | **2–4 seconds of GPU occupancy** |

The gap between "58 average RPS" and "460 peak RPS with multi-second GPU holds" is where every under-provisioned deployment I've seen dies. It's not a rounding error — it's roughly an **8x underestimate** of the number you actually need to provision against.

This isn't a model problem.

It's a **capacity-planning problem** disguised as a model problem — and it's the one most teams skip because it doesn't feel like "AI work."

---

# When Naive Serving Destroys the SLA

Consider the default approach most teams reach for first:

```
Request
   ↓
Load Balancer
   ↓
Single GPU, Single Model Instance (FP16)
   ↓
Synchronous Generation
   ↓
Response
```

After a few hundred concurrent users, this becomes:

```
Request 214 → GPU busy with Request 189 → Estimated wait: 4.2s
Request 215 → GPU busy with Request 190 → Estimated wait: 4.6s
```

Neither request meets the 2-second SLA.

The GPU isn't slow. The **scheduling model** is wrong — a single FP16 replica holding one request at a time typically sustains only 1-2 concurrent generations before queueing starts, regardless of how fast the chip is.

---

# The Quantization Trade-off Nobody Puts a Number On

INT4 quantization (AWQ/GPTQ) is usually pitched as a free lunch: same quality, quarter the memory. That's not quite honest.

In practice, INT4 on a 70B model typically costs **1-2 points on benchmark suites like MMLU** and can be noticeably worse on tasks requiring precise numerical reasoning or long-tail factual recall — exactly the kind of enterprise queries (contract clauses, financial figures) that matter most.

My actual recommendation, which I don't see stated often enough:

- **INT4 (AWQ/GPTQ)** for high-volume, low-stakes traffic — FAQ, summarization, chat — where a 1-2 point quality dip is invisible to users.
- **FP8** on H100/L40S for anything routed to "complex reasoning" — it holds accuracy far closer to FP16 while still roughly halving memory versus FP16.
- Never quantize the **judge/verification path** if you're doing speculative decoding — the verifying model should stay at higher precision even if the draft model is aggressively compressed.

This is a decision that should be made per traffic tier, not once for the whole deployment. Most write-ups treat quantization as a single binary switch. It isn't.

---

# Why More GPUs Alone Cannot Solve This

The instinctive fix is to add hardware. More A100s. More replicas. Bigger cluster.

This works — and quietly destroys the "infrastructure cost must be low" requirement.

Here's the cost delta that actually matters, at rough on-demand pricing:

| Approach | GPUs needed for 300 peak RPS | Approx. monthly GPU cost* |
|---|---|---|
| Naive FP16, synchronous, no routing | ~50-60 replicas (2xA100 each) | $350K-450K |
| INT4 + continuous batching (vLLM), no routing | ~18-22 replicas | $130K-160K |
| INT4/FP8 tiered + routing + semantic cache | ~8-12 replicas (70B tier only) | $55K-80K |

*Illustrative, based on on-demand A100/H100 list pricing — actual numbers depend on cloud, region, and spot availability. The point isn't the exact dollar figure; it's that **the gap between the naive and optimized approach is 4-6x, and none of that gap comes from a cheaper GPU.** It comes from not sending 60-70% of traffic to the 70B tier at all.

---

# Models Should Be Served, Not Just Deployed

Instead of loading a model and pointing traffic at it, the serving layer should actively manage:

```
Inference Engine
├── Continuous Batching
├── Paged KV-Cache Management
├── Speculative Decoding
│     └── Small draft model proposes tokens
│     └── 70B model verifies in parallel
├── Prefix / Prompt Caching
└── Quantization (INT4 / FP8, tiered by traffic class)
```

Continuous batching plus paged KV cache is where most of the 3-5x throughput gain over naive serving actually comes from — quantization alone gets you memory headroom, but batching is what turns that headroom into throughput.

---

# Traffic Routing Matters More Than Model Size

Consider these three requests:

**"What's your refund policy?"** → small 7B-8B model or a cached template response.

**"Summarize this 40-page contract and flag the liability clauses."** → the 70B model.

**"Same question a thousand other users asked this morning."** → semantic cache. Skip the model entirely.

Routing requests to the right tier of compute often improves cost efficiency more than any GPU upgrade. In practice, teams that instrument this properly find **40-60% of production traffic never needed the largest model in the first place** — that's not a marginal optimization, it's the single biggest lever in the whole system.

The catch: a bad router is worse than no router. If your classifier misroutes a complex legal question to a 7B model, you've traded latency for silent quality degradation that's much harder to detect than a slow response. Route conservatively — when the classifier is unsure, default to the larger model, not the smaller one.

---

# Where This Pattern Breaks Down

Every version of this architecture I've seen written up presents it as a solved problem. It isn't, in a few specific ways worth naming honestly:

- **Long multi-turn conversations** blow up KV cache faster than any capacity model above accounts for — a 20-turn conversation with a large system prompt can hold 5-10x the memory of a single-turn request, and paged attention only mitigates this, it doesn't eliminate it.
- **GPU autoscaling is slow.** Unlike CPU pods, a new GPU replica needs model weights loaded into VRAM — often 30-90 seconds for a 70B model even with fast storage. If your traffic spike is sharper than your autoscaler's reaction time, you need warm standby capacity, which erodes some of the cost savings above.
- **Semantic cache correctness is a real risk**, not just a performance feature — a cache hit on a question that's semantically similar but factually different (different contract, different patient, different dollar figure) returns a confidently wrong answer. Semantic caching for enterprise data needs a much tighter similarity threshold than consumer chat use cases, and probably needs metadata scoping (per-tenant, per-document) rather than pure embedding similarity.
- **Speculative decoding's speedup is workload-dependent** — it helps a lot on predictable, templated text and much less on genuinely novel reasoning, where the draft model's guesses are rejected more often.

None of this means the architecture is wrong. It means the numbers in any write-up — including this one — are a starting hypothesis to benchmark against your actual traffic, not a spec to implement blindly.

---

# Recommended Production Architecture

```
                          Incoming Request
                                │
                        Semantic Cache Check (scoped per tenant)
                                │
                    ┌───────────┴───────────┐
                 Cache Hit              Cache Miss
                    │                       │
              Instant Response       Query Classifier (conservative default: escalate)
                                            │
                          ┌─────────────────┼─────────────────┐
                          │                 │                 │
                     Simple Query     Standard Query     Complex Query
                          │                 │                 │
                    Small Model (7B)   70B Model (INT4)   70B Model (FP8)
                          │                 │                 │
                          └─────────────────┼─────────────────┘
                                            │
                          vLLM / TensorRT-LLM Serving Layer
                          (Continuous Batching + Paged KV Cache
                           + Speculative Decoding)
                                            │
                          Autoscaled GPU Pool + Warm Standby
                          (Spot + On-Demand, Multi-AZ)
                                            │
                                     Streamed Response
```

---

# Observability That Actually Catches Problems Before Users Do

Every request should carry metadata the scheduler can act on:

- Time-to-first-token
- Queue depth at time of arrival
- GPU utilization per replica
- Cache hit/miss **and cache-hit confidence score** (not just hit/miss — how close was the match)
- Token count (input and projected output)
- SLA risk score

The cache-confidence metric is the one I'd add that most write-ups skip — a raw hit rate tells you cost savings, not correctness. Track them separately.

---

# Tools That Support Cost-Efficient LLM Serving

- vLLM
- TensorRT-LLM
- Ray Serve
- AWQ / GPTQ (INT4 quantization)
- Text Generation Inference (TGI)
- Karpenter / KEDA (GPU-aware autoscaling)
- Redis / semantic caching layers

---

# The Bigger Lesson

The cost and latency of serving a model depend less on the model itself and more on how intelligently requests are scheduled, batched, cached, and routed.

But the honest version of that lesson has a second half: intelligent routing and caching introduce their own failure modes — misrouted queries, stale cache hits, cold-start lag — that are quieter and harder to detect than a GPU running out of memory. Optimizing for cost and latency without instrumenting for *correctness* just moves the risk from "slow" to "wrong," and wrong is more expensive in an enterprise context.

---

## Final Thoughts

The architecture in this piece will get you most of the way to a 4-6x cost reduction and a sub-2-second SLA. What it won't do is guarantee correctness for free — that requires treating your router, your cache, and your quantization tiers as things to benchmark against your actual data and traffic, not defaults to trust because they worked in someone else's write-up.

The teams that get this right treat inference architecture the way they'd treat any other production system: with load testing against realistic traffic shapes, a rollback plan for the router's misclassifications, and monitoring that catches silent quality drift, not just latency breaches.
