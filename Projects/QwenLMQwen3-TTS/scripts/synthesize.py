#!/usr/bin/env python3
"""CLI smoke test for Qwen3-TTS client."""

from __future__ import annotations

import argparse
from pathlib import Path

from client import TTSClient


def main() -> None:
    parser = argparse.ArgumentParser(description="Synthesize speech via Qwen3-TTS")
    parser.add_argument("text", help="Text to synthesize")
    parser.add_argument("-o", "--output", default="output.wav", help="Output WAV path")
    parser.add_argument("--voice", default=None, help="Speaker name (e.g. Serena, Ryan)")
    parser.add_argument("--speed", type=float, default=None, help="Speech speed multiplier")
    parser.add_argument("--no-performance", action="store_true", help="Disable performance layer")
    parser.add_argument("--config", default="config.yaml", help="Config file path")
    args = parser.parse_args()

    client = TTSClient(config_path=args.config)
    out = client.synthesize_to_file(
        args.text,
        output_path=Path(args.output),
        voice=args.voice,
        speed=args.speed,
        use_performance=not args.no_performance,
    )
    print(f"Wrote {out}")


if __name__ == "__main__":
    main()
