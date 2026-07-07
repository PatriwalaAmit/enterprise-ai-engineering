# Qwen3-TTS — OpenAI-Compatible Text-to-Speech Server

OpenAI-compatible TTS deployment for conversational voice agents, built on [Qwen3-TTS](https://github.com/QwenLM/Qwen3-TTS). Drop-in replacement for Kokoro-FastAPI and other OpenAI TTS clients on port **8880**.

**Related case study:** [Replacing Kokoro-FastAPI with Qwen3-TTS](../../CaseStudy/004-Replacing-Kokoro-FastAPI-with-Qwen3-TTS.md)

---

## Overview

| | |
| --- | --- |
| **API** | OpenAI-compatible `POST /v1/audio/speech` |
| **Port** | `8880` (default) |
| **Models** | `Qwen3-TTS-12Hz-0.6B-CustomVoice` (CPU) · `Qwen3-TTS-12Hz-1.7B-CustomVoice` (GPU) |
| **Stack** | FastAPI, PyTorch, Docker, Python 3.11+ |

This project wraps the upstream Qwen3-TTS Python library in a production-ready HTTP server and provides a client with an optional **speech performance** layer (paced pauses, hesitation speed, feedback openers) for natural tutoring and coaching dialogue.

### Components

| Path | Role |
| --- | --- |
| `server/` | FastAPI app — `/v1/audio/speech`, `/health`, `/v1/models` |
| `client/` | OpenAI SDK wrapper + performance segmentation |
| `config.yaml` | Single source of truth for TTS and server settings |
| `Qwen3-TTS/` | Vendored upstream library (editable install) |
| `docker-compose.yml` | CPU default profile + optional GPU profile |
| `scripts/` | Start helpers for Windows, Linux, and Docker |

---

## Prerequisites

### All environments

- **Python 3.11+** (for native runs)
- **Git** (vendored `Qwen3-TTS` submodule/repo)
- **ffmpeg** and **SoX** system binaries (included in Docker image; install locally for native runs)
- **~3 GB disk** for first model download (Hugging Face cache)

### Docker (CPU or GPU)

- [Docker](https://docs.docker.com/get-docker/) and Docker Compose v2
- For GPU profile: [NVIDIA Container Toolkit](https://docs.nvidia.com/datacenter/cloud-native/container-toolkit/install-guide.html) on a **Linux** host

> **Windows note:** Docker Desktop GPU passthrough is often broken (WSL2 + NVIDIA prestart hook). On Windows, use **native GPU** via `scripts/start_qwen3_tts_gpu.ps1` instead of `docker compose --profile gpu`.

### Native GPU (Windows / Linux)

- NVIDIA GPU with recent drivers
- CUDA-capable PyTorch (installed via `requirements-gpu.txt`)
- **~6 GB VRAM** recommended for the 1.7B model

---

## Quick Start

### Option A — Docker CPU (works on Windows Docker Desktop)

```bash
cd Projects/QwenLMQwen3-TTS
docker compose up -d --build
```

Uses the smaller **0.6B** model on CPU. First startup downloads weights and may take **2–3 minutes**.

```powershell
# Windows helper
.\scripts\start_docker.ps1 -Mode docker-cpu
```

### Option B — Docker GPU (Linux production)

```bash
docker compose --profile gpu up -d --build
```

Uses the **1.7B** model with `cuda:0` and `bfloat16`.

```powershell
.\scripts\start_docker.ps1 -Mode docker-gpu
```

### Option C — Native GPU (recommended on Windows)

```powershell
.\scripts\start_qwen3_tts_gpu.ps1
```

Creates a `.venv`, installs CUDA PyTorch from `requirements-gpu.txt`, materializes the 1.7B model from the Docker HF cache if needed, and starts the server on port 8880.

### Option D — Native Linux / macOS (CPU or GPU per config.yaml)

```bash
./scripts/start_qwen3_tts.sh
```

---

## Verify

**Health check** (wait until `model_loaded` is `true`):

```bash
curl http://localhost:8880/health
```

```json
{"status": "ok", "model_loaded": true}
```

**Synthesize speech:**

```bash
curl -X POST http://localhost:8880/v1/audio/speech \
  -H "Content-Type: application/json" \
  -d '{"input":"Hello from Qwen3-TTS","voice":"Serena"}' \
  -o speech.wav
```

```powershell
Invoke-WebRequest -Uri "http://localhost:8880/v1/audio/speech" `
  -Method POST -ContentType "application/json" `
  -Body '{"input":"Hello from Qwen3-TTS","voice":"Serena"}' `
  -OutFile speech.wav
```

**Client smoke test:**

```bash
python scripts/synthesize.py "Hello from the performance layer." -o output.wav
```

---

## Configuration

All settings live in [`config.yaml`](./config.yaml). Environment variables override server settings without editing the file.

### Client (`tts` section)

```yaml
tts:
  base_url: "http://localhost:8880/v1"
  api_key: "not-needed"
  model: "qwen3-tts-customvoice"
  default_voice: "Serena"
  speed: 1.0
  default_instruct: ""   # optional tone/emotion instruction
  performance:
    enabled: true
    period_pause_ms: 350
    ellipsis_pause_ms: 450
    hesitation_speed: 0.85
    max_segments: 8
```

| Setting | Description |
| --- | --- |
| `base_url` | OpenAI-compatible API base (include `/v1`) |
| `default_voice` | Qwen speaker name or OpenAI alias (`nova` → `Serena`) |
| `performance.*` | Client-side pacing — splits text into segments with pauses |

### Server (`server` section)

```yaml
server:
  host: "0.0.0.0"
  port: 8880
  model_id: "Qwen/Qwen3-TTS-12Hz-1.7B-CustomVoice"
  device: "cuda:0"
  dtype: "bfloat16"
  attn_implementation: "sdpa"
  default_language: "Auto"
```

### Environment overrides

| Variable | Purpose |
| --- | --- |
| `QWEN3_TTS_CONFIG` | Path to config file (default: `config.yaml`) |
| `QWEN3_TTS_DEVICE` | `cuda:0`, `cpu`, etc. |
| `QWEN3_TTS_MODEL_ID` | Hugging Face ID or local model path |
| `QWEN3_TTS_DTYPE` | `bfloat16`, `float32` |
| `QWEN3_TTS_ATTN` | `sdpa` (default) or `flash_attention_2` |
| `QWEN3_TTS_LAZY_LOAD` | `true` to defer model load until first request |
| `HF_HOME` | Hugging Face cache directory |

When CUDA is unavailable, the engine automatically falls back to CPU, `float32`, and the **0.6B** model.

---

## Voices

### Qwen3-TTS preset speakers

| Female | Male |
| --- | --- |
| Vivian, Serena, Ono_Anna, Sohee | Uncle_Fu, Dylan, Eric, Ryan, Aiden |

### OpenAI alias mapping

| OpenAI | Qwen3-TTS |
| --- | --- |
| `alloy` | Ryan |
| `echo` | Aiden |
| `fable` | Dylan |
| `onyx` | Eric |
| `nova` | Serena |
| `shimmer` | Vivian |

---

## API Reference

### `POST /v1/audio/speech`

```json
{
  "model": "qwen3-tts-customvoice",
  "input": "Hello from Qwen3-TTS",
  "voice": "Serena",
  "speed": 1.0,
  "response_format": "wav",
  "language": "Auto",
  "instruct": ""
}
```

| Field | Default | Notes |
| --- | --- | --- |
| `input` | — | Required text to synthesize |
| `voice` | `Serena` | Speaker name or OpenAI alias |
| `speed` | `1.0` | Range `0.25`–`4.0` (librosa time-stretch) |
| `response_format` | `wav` | `wav`, `mp3`, `pcm` |
| `instruct` | `""` | Natural-language style/emotion hint |
| `language` | `Auto` | Target language |

### Other endpoints

| Endpoint | Description |
| --- | --- |
| `GET /health` | Server status and `model_loaded` flag |
| `GET /v1/models` | OpenAI-style model list |

---

## Python Client

```python
from client import TTSClient

client = TTSClient(config_path="config.yaml")
client.synthesize_to_file(
    "Excellent… you're almost there.",
    output_path="reply.wav",
    voice="Serena",
)
```

The performance layer splits replies at sentence boundaries, applies per-segment speed, and inserts silence between segments — matching the pattern used with Kokoro-FastAPI.

---

## Deployment Profiles

| Profile | Command | Model | Device |
| --- | --- | --- | --- |
| Docker CPU (default) | `docker compose up -d` | 0.6B CustomVoice | CPU |
| Docker GPU | `docker compose --profile gpu up -d` | 1.7B CustomVoice | CUDA |
| Native GPU (Windows) | `.\scripts\start_qwen3_tts_gpu.ps1` | 1.7B CustomVoice | CUDA |
| Native (Linux/macOS) | `./scripts/start_qwen3_tts.sh` | Per `config.yaml` | Per config |

---

## Local Development Setup

```bash
cd Projects/QwenLMQwen3-TTS
python -m venv .venv

# Linux/macOS
source .venv/bin/activate
pip install -r requirements.txt

# Windows GPU
pip install -r requirements-gpu.txt

export PYTHONPATH=.
python -m server.main --config config.yaml
```

### Install system dependencies (native)

**Ubuntu/Debian:**

```bash
sudo apt-get install -y ffmpeg libsndfile1 sox
```

**macOS:**

```bash
brew install ffmpeg libsndfile sox
```

---

## Repository Structure

```
QwenLMQwen3-TTS/
├── README.md
├── config.yaml              # TTS + server configuration
├── requirements.txt         # Base dependencies (+ editable Qwen3-TTS)
├── requirements-gpu.txt     # CUDA PyTorch + base deps
├── server/                  # OpenAI-compatible FastAPI server
│   ├── main.py
│   ├── routes.py
│   └── model.py
├── client/                  # TTS client + performance segmentation
│   ├── tts_client.py
│   └── performance.py
├── Qwen3-TTS/               # Upstream Qwen3-TTS library (vendored)
├── docker-compose.yml       # CPU default + GPU profile
├── Dockerfile
├── scripts/
│   ├── start_docker.ps1     # Docker helper (native-gpu | docker-cpu | docker-gpu)
│   ├── start_qwen3_tts.ps1  # Native server launcher (Windows)
│   ├── start_qwen3_tts_gpu.ps1
│   ├── start_qwen3_tts.sh   # Native server launcher (Linux/macOS)
│   └── synthesize.py        # CLI smoke test
└── models/                  # Local materialized weights (gitignored)
```

---

## Troubleshooting

| Symptom | Likely cause | Fix |
| --- | --- | --- |
| Container hangs 2–3 min on first start | Hugging Face model download | Wait; check `/health` for `model_loaded` |
| `sox: not found` | Missing system binary | Install SoX or use Docker image |
| Docker GPU prestart hook error on Windows | WSL2 + NVIDIA toolkit issue | Use `start_qwen3_tts_gpu.ps1` instead |
| Flash Attention build failure | Runtime image lacks `nvcc` | Use `attn_implementation: sdpa` (default) |
| OOM on GPU | 1.7B model too large | Switch to 0.6B or use CPU profile |

---

## License

The vendored [Qwen3-TTS](https://github.com/QwenLM/Qwen3-TTS) library is subject to its upstream license. Server and client wrapper code in this directory follows the parent repository license.
