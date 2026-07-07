#!/usr/bin/env bash
# Start Qwen3-TTS OpenAI-compatible server on port 8880
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

if [[ ! -d .venv ]]; then
  python3 -m venv .venv
fi
# shellcheck disable=SC1091
source .venv/bin/activate

pip install -q -r requirements.txt

export PYTHONPATH="$ROOT"
export QWEN3_TTS_CONFIG="${QWEN3_TTS_CONFIG:-$ROOT/config.yaml}"

echo "Starting Qwen3-TTS server on http://0.0.0.0:8880/v1"
exec python -m server.main --config "$QWEN3_TTS_CONFIG"
