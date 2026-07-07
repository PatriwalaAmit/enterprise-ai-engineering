"""OpenAI-compatible TTS client with optional speech performance layer."""

from __future__ import annotations

import io
from pathlib import Path
from typing import Optional

import numpy as np
import soundfile as sf
import yaml
from openai import OpenAI

from .performance import SpeechSegment, segment_for_performance


def load_config(config_path: str | Path = "config.yaml") -> dict:
    path = Path(config_path)
    if not path.exists():
        return {}
    with path.open("r", encoding="utf-8") as f:
        return yaml.safe_load(f) or {}


def _silence_ms(duration_ms: int, sample_rate: int) -> np.ndarray:
    if duration_ms <= 0:
        return np.array([], dtype=np.float32)
    samples = int(sample_rate * duration_ms / 1000)
    return np.zeros(samples, dtype=np.float32)


def _decode_audio(response_bytes: bytes) -> tuple[np.ndarray, int]:
    data, sample_rate = sf.read(io.BytesIO(response_bytes), dtype="float32")
    if data.ndim > 1:
        data = data.mean(axis=1)
    return data.astype(np.float32), int(sample_rate)


class TTSClient:
    def __init__(self, config: Optional[dict] = None, config_path: str | Path = "config.yaml") -> None:
        self.config = config or load_config(config_path)
        tts = self.config.get("tts", {})
        self.base_url = tts.get("base_url", "http://localhost:8880/v1")
        self.api_key = tts.get("api_key", "not-needed")
        self.model = tts.get("model", "qwen3-tts-customvoice")
        self.default_voice = tts.get("default_voice", "Serena")
        self.default_speed = float(tts.get("speed", 1.0))
        self.default_instruct = tts.get("default_instruct", "")
        self.performance_cfg = tts.get("performance", {})

        self._client = OpenAI(base_url=self.base_url, api_key=self.api_key)

    def synthesize_segment(
        self,
        text: str,
        voice: Optional[str] = None,
        speed: Optional[float] = None,
        instruct: Optional[str] = None,
    ) -> tuple[np.ndarray, int]:
        response = self._client.audio.speech.create(
            model=self.model,
            voice=voice or self.default_voice,
            input=text,
            response_format="wav",
            speed=speed if speed is not None else self.default_speed,
            extra_body={
                "instruct": instruct if instruct is not None else self.default_instruct,
            },
        )
        return _decode_audio(response.content)

    def synthesize(
        self,
        text: str,
        voice: Optional[str] = None,
        speed: Optional[float] = None,
        instruct: Optional[str] = None,
        use_performance: Optional[bool] = None,
    ) -> tuple[np.ndarray, int]:
        perf_enabled = (
            use_performance
            if use_performance is not None
            else self.performance_cfg.get("enabled", True)
        )

        if not perf_enabled:
            return self.synthesize_segment(text, voice=voice, speed=speed, instruct=instruct)

        segments = segment_for_performance(
            text,
            base_speed=speed if speed is not None else self.default_speed,
            cfg=self.performance_cfg,
        )
        return self._concat_segments(segments, voice=voice, instruct=instruct)

    def synthesize_to_file(
        self,
        text: str,
        output_path: str | Path,
        voice: Optional[str] = None,
        speed: Optional[float] = None,
        instruct: Optional[str] = None,
        use_performance: Optional[bool] = None,
    ) -> Path:
        wav, sample_rate = self.synthesize(
            text,
            voice=voice,
            speed=speed,
            instruct=instruct,
            use_performance=use_performance,
        )
        out = Path(output_path)
        sf.write(out, wav, sample_rate)
        return out

    def _concat_segments(
        self,
        segments: list[SpeechSegment],
        voice: Optional[str] = None,
        instruct: Optional[str] = None,
    ) -> tuple[np.ndarray, int]:
        if not segments:
            return np.array([], dtype=np.float32), 24000

        chunks: list[np.ndarray] = []
        sample_rate = 24000

        for i, segment in enumerate(segments):
            wav, sample_rate = self.synthesize_segment(
                segment.text,
                voice=voice,
                speed=segment.speed,
                instruct=instruct,
            )
            chunks.append(wav)
            if i < len(segments) - 1:
                chunks.append(_silence_ms(segment.pause_after_ms, sample_rate))

        return np.concatenate(chunks), sample_rate
