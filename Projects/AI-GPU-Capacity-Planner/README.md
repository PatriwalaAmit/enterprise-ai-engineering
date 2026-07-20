# AI Capacity Planner

Design GPU and inference infrastructure for AI workloads in seconds.

Turns model choices, concurrency targets, and workload type into a **deployment blueprint**: recommended GPUs, VRAM sizing, CPU/RAM/storage/network, PCIe/NUMA guidance, and rough monthly cost estimates.

**Source code:** [PatriwalaAmit/ai-gpu-capacity-planner](https://github.com/PatriwalaAmit/ai-gpu-capacity-planner)  
**Related case study:** [008 — AI GPU Capacity Planner](../../CaseStudy/008-ai-gpu-capacity-planner.md)  
**Related reading:** [003 — Low-latency 70B inference architecture](../../CaseStudy/003-Designing-a-Low-Latency-Cost-Optimized-Inference-Architecture-for-a-70B-LLM-at-Enterprise-Scale.md)

---

## Overview

| | |
| --- | --- |
| **Paths** | Expert (full blueprint) · Novice (NL → stack options → Expert) |
| **Engine** | Weights + KV (GQA-aware) + activations + workload overhead + safety margin |
| **API** | `GET /models` · `POST /recommend` · `POST /plan` |
| **Stack** | React 19, TypeScript, Vite · FastAPI, Pydantic · Docker Compose |

No secrets or third-party API keys are required for core planning. Model metadata and cloud rates live in JSON/code.

---

## Quick start

```bash
git clone https://github.com/PatriwalaAmit/ai-gpu-capacity-planner.git
cd ai-gpu-capacity-planner
docker compose up --build
```

| Service | URL |
| --- | --- |
| Frontend | http://localhost:3000 |
| Backend | http://localhost:8000 |
| API docs | http://localhost:8000/docs |

Local development instructions (uvicorn + Vite) are in the [upstream README](https://github.com/PatriwalaAmit/ai-gpu-capacity-planner#local-development).

---

## User flows

```
Landing → Expert → POST /plan → Blueprint
Landing → Novice → POST /recommend → pick stack → Expert (prefilled)
```

1. **Landing** — Choose Expert or Novice  
2. **Novice** — Describe the product → stack options (API-first / open-source / hybrid)  
3. **Expert** — Tune models, precision, concurrency, runtime, cloud → blueprint  
4. **Blueprint** — Review nodes, VRAM rationales, infra analysis, costs  

---

## How planning works

1. Estimate VRAM per model (weights + KV + activations + workload factor + safety)  
2. Recommend GPU(s) from workload-specific pools  
3. Analyze PCIe, NUMA, and storage throughput needs  
4. Derive CPU, system RAM, NVMe, and network targets  
5. Optionally estimate monthly compute / API cost from cloud preference  

---

## Project layout (upstream)

```
backend/     FastAPI app, VRAM engine, costs, registries
frontend/    React Landing / Novice / Expert / Blueprint UI
docker-compose.yml
```

---

## License / contributing

See the [upstream repository](https://github.com/PatriwalaAmit/ai-gpu-capacity-planner) for `CONTRIBUTING.md` and license status.
