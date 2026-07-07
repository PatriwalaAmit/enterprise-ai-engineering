"""Qwen3-TTS model loading and synthesis."""

from __future__ import annotations

import io
import logging
import os
from typing import Optional

import librosa
import numpy as np
import soundfile as sf
import torch

logger = logging.getLogger(__name__)

# OpenAI voice aliases → Qwen3-TTS CustomVoice speaker names
OPENAI_VOICE_ALIASES = {
    "alloy": "Ryan",
    "echo": "Aiden",
    "fable": "Dylan",
    "onyx": "Eric",
    "nova": "Serena",
    "shimmer": "Vivian",
}

SUPPORTED_SPEAKERS = {
    "Vivian",
    "Serena",
    "Uncle_Fu",
    "Dylan",
    "Eric",
    "Ryan",
    "Aiden",
    "Ono_Anna",
    "Sohee",
}


def resolve_runtime_settings(
    device: str,
    dtype: str,
    attn_implementation: str,
    model_id: str,
) -> tuple[str, torch.dtype, str, str]:
    """Pick device/dtype/model with safe fallbacks when CUDA or GPU hooks fail."""
    resolved_model = os.environ.get("QWEN3_TTS_MODEL_ID", model_id)
    resolved_device = os.environ.get("QWEN3_TTS_DEVICE", device)
    resolved_dtype_name = os.environ.get("QWEN3_TTS_DTYPE", dtype)
    resolved_attn = os.environ.get("QWEN3_TTS_ATTN", attn_implementation)

    if resolved_device.startswith("cuda") and not torch.cuda.is_available():
        logger.warning("CUDA requested (%s) but unavailable — falling back to CPU", resolved_device)
        resolved_device = "cpu"
        resolved_dtype_name = "float32"
        resolved_attn = "sdpa"
        if "1.7B" in resolved_model:
            resolved_model = "Qwen/Qwen3-TTS-12Hz-0.6B-CustomVoice"
            logger.warning("Switched to smaller model for CPU: %s", resolved_model)

    if resolved_device == "cpu":
        resolved_dtype_name = "float32"
        resolved_attn = "sdpa"

    resolved_dtype = getattr(torch, resolved_dtype_name, torch.float32)
    return resolved_device, resolved_dtype, resolved_attn, resolved_model


class Qwen3TTSEngine:
    def __init__(
        self,
        model_id: str,
        device: str = "cuda:0",
        dtype: str = "bfloat16",
        attn_implementation: str = "flash_attention_2",
    ) -> None:
        (
            self.device,
            self.dtype,
            self.attn_implementation,
            self.model_id,
        ) = resolve_runtime_settings(device, dtype, attn_implementation, model_id)
        self._model = None
        self._speakers: set[str] = set()

    @property
    def is_loaded(self) -> bool:
        return self._model is not None

    def load(self) -> None:
        if self._model is not None:
            return

        from qwen_tts import Qwen3TTSModel

        logger.info("Loading Qwen3-TTS model: %s on %s", self.model_id, self.device)
        kwargs = {
            "device_map": self.device,
            "dtype": self.dtype,
        }
        if self.attn_implementation:
            kwargs["attn_implementation"] = self.attn_implementation

        try:
            self._model = Qwen3TTSModel.from_pretrained(self.model_id, **kwargs)
        except Exception:
            logger.warning(
                "Failed to load with attn_implementation=%s, retrying with sdpa",
                self.attn_implementation,
            )
            kwargs["attn_implementation"] = "sdpa"
            self._model = Qwen3TTSModel.from_pretrained(self.model_id, **kwargs)

        supported = self._model.get_supported_speakers()
        self._speakers = {s for s in supported}
        logger.info("Model loaded. Supported speakers: %s", sorted(self._speakers))

    def resolve_speaker(self, voice: str) -> str:
        normalized = voice.strip()
        alias = OPENAI_VOICE_ALIASES.get(normalized.lower())
        if alias:
            return alias

        for speaker in self._speakers or SUPPORTED_SPEAKERS:
            if speaker.lower() == normalized.lower():
                return speaker

        default = os.environ.get("QWEN3_TTS_DEFAULT_VOICE", "Serena")
        logger.warning("Unknown voice %r, falling back to %s", voice, default)
        return default

    def synthesize(
        self,
        text: str,
        voice: str,
        language: str = "Auto",
        instruct: str = "",
        speed: float = 1.0,
    ) -> tuple[bytes, str]:
        self.load()
        assert self._model is not None

        speaker = self.resolve_speaker(voice)
        gen_kwargs = {}
        if instruct:
            gen_kwargs["instruct"] = instruct

        wavs, sample_rate = self._model.generate_custom_voice(
            text=text,
            speaker=speaker,
            language=language or "Auto",
            **gen_kwargs,
        )
        wav = wavs[0]

        if speed and abs(speed - 1.0) > 0.01:
            wav = librosa.effects.time_stretch(wav, rate=speed)

        buffer = io.BytesIO()
        sf.write(buffer, wav, sample_rate, format="WAV")
        return buffer.getvalue(), "audio/wav"

    def synthesize_pcm(
        self,
        text: str,
        voice: str,
        language: str = "Auto",
        instruct: str = "",
        speed: float = 1.0,
    ) -> tuple[np.ndarray, int]:
        self.load()
        assert self._model is not None

        speaker = self.resolve_speaker(voice)
        gen_kwargs = {}
        if instruct:
            gen_kwargs["instruct"] = instruct

        wavs, sample_rate = self._model.generate_custom_voice(
            text=text,
            speaker=speaker,
            language=language or "Auto",
            **gen_kwargs,
        )
        wav = wavs[0].astype(np.float32)

        if speed and abs(speed - 1.0) > 0.01:
            wav = librosa.effects.time_stretch(wav, rate=speed)

        return wav, sample_rate
