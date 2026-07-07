# Case Study: Replacing Kokoro-FastAPI with Qwen3-TTS

**Project:** OpenAI-compatible Text-to-Speech deployment for conversational voice agents  
**Stack:** [Qwen3-TTS](https://github.com/QwenLM/Qwen3-TTS), FastAPI, Docker, Python  
**Outcome:** Drop-in TTS replacement on port 8880 with natural speech pacing and dual CPU/GPU deployment paths

---

## Executive Summary

A voice-agent application needed to move from **Kokoro-FastAPI** to **Qwen3-TTS** — Alibaba's open-source TTS model family — without rewriting downstream clients. The existing integration already spoke the OpenAI TTS API (`POST /v1/audio/speech`), so the goal was to preserve that contract while gaining Qwen3-TTS quality, multilingual support, and instruction-driven prosody.

We delivered a self-contained deployment: an OpenAI-compatible FastAPI server, a YAML configuration layer matching the existing LLM/TTS pattern, a client-side **speech performance** module for natural pacing, and Docker profiles for both local development (CPU) and production (GPU).

---

## The Problem

### Business context

The application uses a unified configuration pattern for AI services:

```yaml
tts:
  base_url: "http://<host>:8880/v1"
  api_key: "not-needed"
  model: "..."
  default_voice: "..."
  performance:
    enabled: true
    period_pause_ms: 350
    # ...
```

Kokoro-FastAPI had been serving this role. The team wanted to evaluate and adopt **Qwen3-TTS** for:

- Higher-quality, more expressive speech
- 10-language support with dialectal voices
- Natural-language **instruction control** (tone, emotion, speaking rate)
- A path toward voice cloning (Base model) and voice design

### Technical constraints

| Constraint | Implication |
|------------|-------------|
| OpenAI API compatibility | Clients must keep using `base_url` + `audio.speech.create()` |
| Port 8880 | Existing infra and firewall rules already pointed here |
| Speech performance layer | Replies must feel conversational — pauses after full stops, slower hesitations, beats after ellipses |
| Mixed environments | Developers on Windows/Docker Desktop; production on a Linux GPU VM |
| Qwen3-TTS has no official HTTP server | Only Python library + Gradio demo; wrapper required |

---

## Solution Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                     Voice Agent Application                      │
│  config.yaml → TTSClient (OpenAI SDK + performance layer)       │
└────────────────────────────┬────────────────────────────────────┘
                             │ POST /v1/audio/speech
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│              Qwen3-TTS OpenAI-compatible Server                  │
│  FastAPI → routes.py → Qwen3TTSEngine → qwen_tts package        │
│  Port 8880                                                       │
└────────────────────────────┬────────────────────────────────────┘
                             │
              ┌──────────────┴──────────────┐
              ▼                             ▼
     CPU (0.6B CustomVoice)        GPU (1.7B CustomVoice)
     Docker default profile         docker compose --profile gpu
```

### Components delivered

| Component | Role |
|-----------|------|
| `server/` | FastAPI app exposing `/v1/audio/speech`, `/health`, `/v1/models` |
| `client/` | OpenAI client wrapper + performance segmentation |
| `config.yaml` | Single source of truth for TTS and server settings |
| `Qwen3-TTS/` | Vendored upstream library (editable install) |
| `docker-compose.yml` | CPU default + optional GPU profile |
| `scripts/` | Start helpers for Windows, Linux, and Docker |

### API compatibility

The server accepts the standard OpenAI request shape:

```json
{
  "model": "qwen3-tts-customvoice",
  "input": "Hello from Qwen3-TTS",
  "voice": "Serena",
  "speed": 1.0
}
```

Voice aliases map Kokoro/OpenAI names to Qwen speakers (`nova` → `Serena`, `alloy` → `Ryan`, etc.), easing migration.

### Speech performance layer

Rather than pushing pacing logic into the model, we kept it in the **client** — matching the original Kokoro design:

1. Split reply text at sentence boundaries (`.`, `?`, `…`)
2. Assign per-segment speed (hesitations at 0.85×, feedback openers at 0.95×)
3. Synthesize each segment via separate TTS calls
4. Concatenate audio with locally generated silence (350–450 ms pauses)

This adds ~1 round-trip per sentence but produces noticeably more natural tutoring and coaching dialogue.

---

## Implementation Highlights

### 1. Wrapping Qwen3-TTS as an OpenAI server

Qwen3-TTS exposes `Qwen3TTSModel.generate_custom_voice()` in Python. We wrapped it in a thin engine class that:

- Loads `Qwen/Qwen3-TTS-12Hz-1.7B-CustomVoice` (or 0.6B on CPU)
- Resolves voice names and OpenAI aliases
- Applies speed via librosa time-stretch when `speed ≠ 1.0`
- Returns WAV bytes compatible with existing pipelines

### 2. Configuration migration (Kokoro → Qwen3)

| Setting | Kokoro (before) | Qwen3-TTS (after) |
|---------|-----------------|-------------------|
| `model` | `kokoro` | `qwen3-tts-customvoice` |
| `default_voice` | `af_bella` | `Serena` |
| `base_url` | `:8880/v1` | `:8880/v1` (unchanged) |
| `performance.*` | — | Preserved verbatim |

Nine preset speakers replace Kokoro's voice mixing syntax: Vivian, Serena, Ryan, Aiden, Dylan, Eric, Uncle_Fu, Ono_Anna, Sohee.

### 3. Runtime device resolution

The engine auto-adapts when CUDA is unavailable:

```python
# Pseudocode from server/model.py
if cuda_requested and not torch.cuda.is_available():
    device = "cpu"
    dtype = float32
    model = "Qwen3-TTS-12Hz-0.6B-CustomVoice"  # smaller, feasible on CPU
```

Environment variables (`QWEN3_TTS_DEVICE`, `QWEN3_TTS_MODEL_ID`) override config for Docker without editing YAML.

---

## Challenges & Resolutions

### Challenge 1: Missing system dependencies in Docker

**Symptom:** `sox: not found` warning on startup.

**Cause:** The `qwen-tts` Python package depends on the SoX **binary**, not just the pip package.

**Fix:** Added `sox` to the Dockerfile `apt-get install` list.

---

### Challenge 2: Flash Attention failed to build

**Symptom:** `CUDA_HOME environment variable is not set` during `pip install flash-attn`.

**Cause:** The PyTorch **runtime** Docker image lacks `nvcc`; Flash Attention requires the **devel** image.

**Fix:**
- Default `attn_implementation` to `sdpa` (PyTorch built-in)
- Removed flash-attn from the Docker build step
- Server retries with SDPA if flash_attention_2 fails at runtime

**Impact:** ~20–30% slower inference vs Flash Attention, but stable and zero extra build complexity.

---

### Challenge 3: Long first-startup time

**Symptom:** Container appeared hung for 2–3 minutes after "Loading Qwen3-TTS model…"

**Cause:** First run downloads ~3 GB of Hugging Face weights into a Docker volume.

**Fix:** Documented expected behavior; added `/health` endpoint with `model_loaded` flag; set Docker healthcheck `start-period: 120s`.

**Verified result:** After warmup, synthesis of a short phrase completed in ~4 seconds on GPU.

---

### Challenge 4: NVIDIA Container Toolkit crash on Docker Desktop

**Symptom:**
```
error running prestart hook #0: exit status 127
Inconsistency detected by ld.so: dl-setup_hash.c: 36: _dl_setup_hash: Assertion failed!
```

**Cause:** Known incompatibility between Docker Desktop (WSL2), NVIDIA drivers, and the GPU prestart hook on Windows dev machines.

**Fix:** Split Docker Compose into two profiles:

| Profile | Command | Model | Device |
|---------|---------|-------|--------|
| Default (CPU) | `docker compose up -d` | 0.6B CustomVoice | CPU |
| GPU | `docker compose --profile gpu up -d` | 1.7B CustomVoice | CUDA |

Developers on Windows can run and test the full API locally without GPU passthrough. Production on Linux GPU VM uses the `gpu` profile unchanged.

---

## Results

| Metric | Outcome |
|--------|---------|
| API compatibility | 100% drop-in for OpenAI TTS clients on port 8880 |
| Client code changes | Config-only (voice name + model string) |
| Local dev unblock | CPU Docker profile starts without NVIDIA toolkit |
| Production path | GPU profile on `20.197.48.32:8880` |
| Speech quality | Qwen3-TTS 1.7B CustomVoice with instruction support |
| Conversational pacing | Performance layer preserved from Kokoro design |

### Sample verification

```powershell
Invoke-WebRequest -Uri "http://localhost:8880/v1/audio/speech" `
  -Method POST -ContentType "application/json" `
  -Body '{"input":"Hello from Qwen3-TTS","voice":"Serena"}' `
  -OutFile speech.wav
```

Health check after model load:

```json
{"status": "ok", "model_loaded": true}
```

---

## Lessons Learned

1. **Preserve the API contract, swap the engine.** Standardizing on OpenAI-compatible endpoints made the Kokoro → Qwen3 migration a configuration change, not a rewrite.

2. **Separate inference from performance.** Pacing (pauses, hesitation speed) belongs in the client layer. TTS models generate speech; the agent layer shapes *how* it is delivered.

3. **Plan for two deployment tiers.** Requiring GPU everywhere blocks Windows developers. A CPU fallback with a smaller model keeps the team moving while production uses full quality.

4. **Runtime images ≠ devel images.** Flash Attention, custom CUDA kernels, and similar optimizations need explicit devel tooling — don't assume they install on `pytorch:*-runtime`.

5. **First-run UX matters.** Large model downloads look like failures. Health endpoints, generous start periods, and clear logs reduce false alarms.

---

## Future Work

- **Voice cloning:** Enable `Qwen3-TTS-12Hz-1.7B-Base` with `POST /v1/voices` for user-registered clones
- **Streaming:** Token-level PCM streaming for sub-200 ms time-to-first-audio in live agents
- **vLLM-Omni:** Migrate inference to vLLM when online serving support matures
- **Production hardening:** API key auth, request rate limits, and model warm pooling for concurrent sessions

---

## Repository Structure

```
QwenLMQwen3-TTS/
├── config.yaml              # TTS + server configuration
├── server/                  # OpenAI-compatible FastAPI server
├── client/                  # TTS client + performance segmentation
├── Qwen3-TTS/               # Upstream Qwen3-TTS library (vendored)
├── docker-compose.yml       # CPU default + GPU profile
├── Dockerfile
├── requirements.txt
└── scripts/
    ├── start_docker.ps1     # Docker helper (cpu | gpu)
    ├── start_qwen3_tts.ps1  # Native server (Windows)
    └── start_qwen3_tts.sh   # Native server (Linux/macOS)
```

---

## Conclusion

This project demonstrates how to adopt a state-of-the-art open-source TTS model in a production voice stack without disrupting existing clients. By wrapping Qwen3-TTS in an OpenAI-compatible server, preserving the configuration and performance patterns from Kokoro, and engineering pragmatic CPU/GPU deployment paths, the team gained better speech quality and multilingual capability while keeping migration risk low.

The same pattern — **OpenAI API surface, YAML config, client-side performance, Docker profiles for dev vs prod** — applies broadly to swapping LLM or TTS backends in conversational AI systems.
