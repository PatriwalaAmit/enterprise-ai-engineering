"""Qwen3-TTS OpenAI-compatible API server."""

from __future__ import annotations

import argparse
import logging
import os
from pathlib import Path

from contextlib import asynccontextmanager

import uvicorn
import yaml
from fastapi import FastAPI

from .model import Qwen3TTSEngine
from .routes import init_engine, router

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)
logger = logging.getLogger(__name__)


def load_config(config_path: Path) -> dict:
    if not config_path.exists():
        return {}
    with config_path.open("r", encoding="utf-8") as f:
        return yaml.safe_load(f) or {}


def create_app(config: dict) -> FastAPI:
    server_cfg = config.get("server", {})
    tts_cfg = config.get("tts", {})

    engine = Qwen3TTSEngine(
        model_id=server_cfg.get("model_id", "Qwen/Qwen3-TTS-12Hz-1.7B-CustomVoice"),
        device=server_cfg.get("device", os.environ.get("QWEN3_TTS_DEVICE", "cuda:0")),
        dtype=server_cfg.get("dtype", "bfloat16"),
        attn_implementation=server_cfg.get("attn_implementation", "flash_attention_2"),
    )

    if default_voice := tts_cfg.get("default_voice"):
        os.environ.setdefault("QWEN3_TTS_DEFAULT_VOICE", default_voice)

    init_engine(engine)

    @asynccontextmanager
    async def lifespan(_: FastAPI):
        if os.environ.get("QWEN3_TTS_LAZY_LOAD", "false").lower() != "true":
            logger.info("Preloading Qwen3-TTS model on startup...")
            engine.load()
        yield

    app = FastAPI(
        title="Qwen3-TTS OpenAI-compatible Server",
        version="1.0.0",
        description="OpenAI /v1/audio/speech compatible wrapper for Qwen3-TTS CustomVoice",
        lifespan=lifespan,
    )
    app.include_router(router)

    return app


def main() -> None:
    parser = argparse.ArgumentParser(description="Qwen3-TTS OpenAI-compatible server")
    parser.add_argument(
        "--config",
        default=os.environ.get("QWEN3_TTS_CONFIG", "config.yaml"),
        help="Path to config.yaml",
    )
    parser.add_argument("--host", default=None)
    parser.add_argument("--port", type=int, default=None)
    args = parser.parse_args()

    config_path = Path(args.config)
    config = load_config(config_path)
    server_cfg = config.get("server", {})

    host = args.host or server_cfg.get("host", "0.0.0.0")
    port = args.port or server_cfg.get("port", 8880)

    app = create_app(config)
    uvicorn.run(app, host=host, port=port, log_level="info")


if __name__ == "__main__":
    main()
