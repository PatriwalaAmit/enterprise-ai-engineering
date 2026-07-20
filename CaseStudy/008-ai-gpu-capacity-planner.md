# Your GPU Quote Isn't Capacity Planning—It's a Guess With a Price Tag

*How we built AI Capacity Planner to turn model choice, concurrency, and workload type into a deployment blueprint—before anyone buys hardware.*

| | |
|---|---|
| **Project** | [ai-gpu-capacity-planner](https://github.com/PatriwalaAmit/ai-gpu-capacity-planner) |
| **Category** | LLM Inference / Capacity Planning |
| **Stack** | React 19, TypeScript, Vite · FastAPI, Pydantic · Docker Compose |
| **Status** | Working product — local / Docker |

---

## TL;DR

Enterprise AI teams still size GPUs from blog posts, vendor slide decks, and "a 70B needs an A100" folklore. That produces either overspend or an SLA miss on day one of peak traffic.

**AI Capacity Planner** is a small full-stack tool that encodes a practical capacity model: weights + KV cache + activations + workload overhead + safety margin → recommended GPU(s), node CPU/RAM/storage/network, PCIe/NUMA guidance, and rough monthly cloud or API cost. Product owners can start from a natural-language description (Novice path); architects can tune precision, concurrency, runtime, and cloud preference (Expert path).

This case study covers the problem the tool solves, how the VRAM engine works, the product architecture, and where the planner is intentionally approximate.

---

## 1. The Problem

Most GPU buying conversations start in the wrong place:

> "We're deploying Llama-70B. How many A100s do we need?"

That question skips the variables that actually drive memory and cost:

| Variable | Why it changes the answer |
|---|---|
| Precision (FP16 / INT8 / INT4) | Directly scales weight VRAM |
| Context length | Dominates KV cache for LLMs |
| Concurrent sessions | Multiplies KV (and often activations) |
| Workload type | Inference vs fine-tune vs training (optimizer / grads) |
| Runtime | vLLM vs Transformers overhead is not the same |
| API vs self-host | Zero local VRAM, token-priced instead |

Without those inputs, "buy A100s" is not architecture—it's procurement theater.

Related framing lives in [Case Study 003](./003-Designing-a-Low-Latency-Cost-Optimized-Inference-Architecture-for-a-70B-LLM-at-Enterprise-Scale.md): daily active users are not a capacity number; concurrent GPU-seconds are. Capacity Planner operationalizes that idea as software.

---

## 2. What We Built

[AI Capacity Planner](https://github.com/PatriwalaAmit/ai-gpu-capacity-planner) turns planner inputs into a **deployment blueprint**:

- Recommended GPU type and count (workload-specific pools)
- Per-model VRAM breakdown with human-readable rationales
- Node-level CPU, system RAM, NVMe, and network targets
- PCIe / NUMA / storage-throughput analysis and warnings
- Optional monthly compute and API cost estimates (AWS/GCP-oriented rates in code)

Two entry paths:

```
Landing
   ├── Expert  → configure models / precision / concurrency / runtime / cloud → POST /plan
   └── Novice  → describe the product in plain language → POST /recommend
                    └── pick a stack → hand off into Expert (prefilled models)
```

| Path | Who it's for | Outcome |
|---|---|---|
| **Novice** | Product / founders | API-first, open-source, or hybrid stack options with suggested models |
| **Expert** | Architects / MLOps | Full blueprint with VRAM math, infra analysis, and cost estimate |

---

## 3. Solution Architecture

```
┌─────────────────────────────────────────────────────────────┐
│  Frontend (React 19 + Vite + Tailwind)                      │
│  Landing · Novice · Expert · Blueprint                      │
└────────────────────────────┬────────────────────────────────┘
                             │  GET /models
                             │  POST /recommend
                             │  POST /plan
                             ▼
┌─────────────────────────────────────────────────────────────┐
│  Backend (FastAPI + Pydantic)                               │
│  main.py · schemas.py · engine.py · costs.py                │
│  recommendations.py                                         │
│                                                             │
│  data/models.json   — model registry (open-weight + API)    │
│  data/runtimes.json — runtime overhead factors              │
└─────────────────────────────────────────────────────────────┘
```

| Layer | Stack |
|---|---|
| Frontend | React 19, TypeScript, Vite 7, Tailwind CSS |
| Backend | Python 3.10+, FastAPI, Uvicorn, Pydantic |
| Data | Static JSON registries (no external API keys required) |
| Deploy | Docker Compose (nginx + Uvicorn) |

Design choice worth stating: **planning is offline**. Pricing and model metadata live in JSON/code. That keeps the tool usable in locked-down enterprise networks and makes recommendations auditable—you can read exactly why a GPU was chosen.

---

## 4. The VRAM Engine (What the Blueprint Is Made Of)

The core of the product is `backend/engine.py`. For each non-API model it estimates:

```
total_vram ≈
    (weights
   + KV cache
   + activations / working buffers
   + workload overhead (fine-tune / training)
   + fixed overhead)
   × runtime overhead
   × safety margin (1.25)
```

### Weights

Precision maps to bytes per parameter:

| Precision | Bytes/param |
|---|---|
| FP16 / BF16 | 2 |
| INT8 | 1 |
| INT4 | 0.5 |

`weights_vram ≈ params_billion × bytes_per_param` (GB-scale approximation).

### KV cache (LLMs / VLMs)

When architecture metadata is present (`num_layers`, `hidden_size`, `num_heads`, `num_kv_heads`), the planner uses a **GQA-aware** KV estimate so models with fewer KV heads are not over-penalized. Context length and concurrency multiply the working set—this is where "we only need one GPU for 70B" usually dies under multi-session load.

### Workload overhead

| Workload | Extra memory intent |
|---|---|
| Inference | Baseline |
| Fine-tuning | Optimizer / adapter-style overhead on top of weights |
| Training | Larger multiplier for grads + optimizer state |

### Activations and media models

Diffusion / video / TTS / STT / embedding types get additional working-set allowances scaled by concurrency (latents, frames, audio buffers)—not just transformer math.

### API models

If the registry marks a model as API (or pricing is token/character-based with no local params), VRAM is **zero** and cost estimation shifts to usage-based pricing. The blueprint can still recommend a hybrid stack: local open-weight for one tier, API for another.

---

## 5. GPU Recommendation and Infra Analysis

After VRAM is estimated, the engine:

1. Selects from **workload-specific GPU pools** (inference includes T4/L4/A10G/consumer cards; training prefers A100/H100/H200-class)
2. Fits the smallest GPU that holds the working set, or **ceil(VRAM / largest GPU)** for multi-GPU capacity
3. Derives node shape heuristics (e.g. CPU cores ≥ 16× GPU count, system RAM ≥ 2× total GPU VRAM)
4. Emits PCIe / NUMA / storage guidance:
   - Multi-GPU training → Gen5 interconnect pressure
   - \>4 GPUs → dual-socket NUMA warnings
   - Large weight files → NVMe throughput sized for reasonable cold-load time

The point is not to replace a detailed vendor sizing engagement. It is to stop the first purchase order from being based on vibes.

---

## 6. API Surface

| Method | Path | Role |
|---|---|---|
| `GET` | `/models` | List registry models |
| `POST` | `/recommend` | Novice: text description → stack options |
| `POST` | `/plan` | Expert: full deployment blueprint |

Interactive docs ship with the backend at `/docs`. Request/response shapes are Pydantic models in `schemas.py` (`PlannerRequest` → `DeploymentBlueprint`).

---

## 7. How to Run

### Docker Compose (recommended)

```bash
git clone https://github.com/PatriwalaAmit/ai-gpu-capacity-planner.git
cd ai-gpu-capacity-planner
docker compose up --build
```

| Service | URL |
|---|---|
| Frontend | http://localhost:3000 |
| Backend | http://localhost:8000 |
| API docs | http://localhost:8000/docs |

### Local development

```bash
# Backend
pip install -r backend/requirements.txt
# Windows PowerShell
$env:PYTHONPATH = "."
uvicorn backend.main:app --reload --host 0.0.0.0 --port 8000

# Frontend
cd frontend
cp ../.env.example .env   # optional; defaults to http://localhost:8000
npm install
npm run dev               # http://localhost:5173
```

No secrets are required for core planning. Set `VITE_API_URL` only if the API is not on `http://localhost:8000`.

---

## 8. Example Planning Narrative

**Input (Expert):** Qwen2.5-7B, FP16, 8K context, 20 concurrent chat sessions, inference, vLLM-class runtime, AWS preference.

**What the engine surfaces (conceptually):**

1. Weight VRAM for 7B @ FP16
2. KV cache scaled by context × concurrency (GQA if metadata present)
3. Activations + fixed overhead + 25% safety
4. Single L4 / A10G / 4090-class recommendation if the total fits; otherwise multi-GPU
5. Node CPU/RAM/NVMe suggestions and a monthly compute ballpark from cloud rates in code

**Novice equivalent:** "We need a customer-support chatbot with speech replies and under $2K/month" → stack options (API-first vs open-source vs hybrid) → user picks one → Expert opens with suggested models already filled.

That handoff is deliberate: founders get options; architects get the knobs.

---

## 9. Honest Limits (Where the Planner Is Approximate)

| Limitation | Implication |
|---|---|
| Static model/pricing JSON | Must be updated as SKUs and rates change |
| Heuristic activations / safety margin | Directionally correct; not a substitute for profiling on target hardware |
| Cost estimates | Rough order-of-magnitude, not a finance-approved forecast |
| No live cloud inventory | Does not check quota, reserved instances, or spot availability |
| Latency SLA | Optional constraint fields exist; deep latency modeling is still architectural work (batching, continuous batching, speculative decoding—see Case Study 003) |

Capacity Planner answers **"what hardware shape is plausible?"** It does not answer **"will p95 stay under 2s at Black Friday RPS?"**—that still needs load tests and serving-stack design.

---

## 10. Why This Belongs in the Project Portfolio

| Audience | Value |
|---|---|
| Solution / AI architects | Fast first-pass sizing before RFPs and cloud tickets |
| Engineering leads | Shared language between product ("we need chat + TTS") and infra ("this is 2× L4, not one H100") |
| Interview / teaching | Concrete artifact for capacity-planning conversations beyond "buy more GPUs" |
| India / hybrid cloud shops | Offline planning works without sending workload details to a SaaS sizing tool |

It also pairs with the inference architecture write-up in Case Study 003: that article explains *why* concurrency and KV dominate; this product lets you *compute* a first blueprint from those same drivers.

---

## 11. Project Structure

```
ai-gpu-capacity-planner/
├── backend/
│   ├── main.py              # FastAPI endpoints
│   ├── schemas.py           # Request / response models
│   ├── engine.py            # VRAM, GPU recommend, infra analysis
│   ├── costs.py             # Monthly cost estimates
│   ├── recommendations.py   # Novice-path stack suggestions
│   └── data/
│       ├── models.json
│       └── runtimes.json
├── frontend/src/components/ # Landing, Novice, Expert, Blueprint
├── docker-compose.yml
└── README.md
```

Contributing guidance for adding models, GPU pools, and pricing lives in the upstream repo's `CONTRIBUTING.md`.

---

## Conclusion

Buying GPUs without a capacity model is how demos become budget surprises. **AI Capacity Planner** encodes a transparent, extensible first-pass model—weights, KV, activations, workload, runtime overhead, and safety—into a blueprint product teams can actually run.

Use it to start the architecture conversation with numbers. Validate the answer with profiling and load tests before you lock a purchase order.

**Source:** [github.com/PatriwalaAmit/ai-gpu-capacity-planner](https://github.com/PatriwalaAmit/ai-gpu-capacity-planner)
