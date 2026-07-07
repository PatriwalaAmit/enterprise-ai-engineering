# Qwen3-TTS OpenAI-compatible Server — NVIDIA CUDA
#
# Build:  docker compose build
# Run:    docker compose up -d
# Test:   curl -X POST http://localhost:8880/v1/audio/speech \
#           -H "Content-Type: application/json" \
#           -d '{"input":"Hello from Qwen3-TTS","voice":"Serena"}' \
#           -o speech.wav

FROM pytorch/pytorch:2.6.0-cuda12.6-cudnn9-runtime

WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends \
    ffmpeg libsndfile1 git curl sox \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
COPY Qwen3-TTS ./Qwen3-TTS
RUN pip install --no-cache-dir -r requirements.txt

# Flash Attention 2 requires the devel CUDA image (nvcc). Runtime image uses sdpa fallback.
# RUN pip install --no-cache-dir flash-attn --no-build-isolation || true

COPY config.yaml .
COPY server ./server
COPY client ./client

ENV QWEN3_TTS_CONFIG=/app/config.yaml \
    PYTHONPATH=/app

EXPOSE 8880

HEALTHCHECK --interval=30s --timeout=10s --start-period=120s --retries=3 \
    CMD curl -f http://localhost:8880/health || exit 1

CMD ["python", "-m", "server.main", "--config", "/app/config.yaml"]
