"""OpenAI-compatible TTS HTTP routes."""

from __future__ import annotations

import io
import logging
from typing import Literal, Optional

import numpy as np
import soundfile as sf
from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import Response, StreamingResponse
from pydantic import BaseModel, Field

from .model import Qwen3TTSEngine

logger = logging.getLogger(__name__)
router = APIRouter()

engine: Optional[Qwen3TTSEngine] = None


class SpeechRequest(BaseModel):
    model: str = "qwen3-tts-customvoice"
    input: str = Field(..., min_length=1)
    voice: str = "Serena"
    response_format: Literal["mp3", "wav", "pcm", "opus"] = "wav"
    speed: float = Field(default=1.0, ge=0.25, le=4.0)
    stream: bool = False
    language: Optional[str] = None
    instruct: Optional[str] = None


def init_engine(tts_engine: Qwen3TTSEngine) -> None:
    global engine
    engine = tts_engine


@router.get("/health")
async def health() -> dict:
    loaded = engine.is_loaded if engine else False
    return {"status": "ok", "model_loaded": loaded}


@router.get("/v1/models")
async def list_models() -> dict:
    return {
        "object": "list",
        "data": [
            {
                "id": "qwen3-tts-customvoice",
                "object": "model",
                "owned_by": "qwen",
            }
        ],
    }


@router.post("/v1/audio/speech")
async def create_speech(request: Request) -> Response:
    if engine is None:
        raise HTTPException(status_code=503, detail="TTS engine not initialized")

    content_type = request.headers.get("content-type", "")
    if "application/json" in content_type:
        body = await request.json()
        req = SpeechRequest(**body)
    else:
        params = dict(request.query_params)
        req = SpeechRequest(
            model=params.get("model", "qwen3-tts-customvoice"),
            input=params.get("input") or params.get("text", ""),
            voice=params.get("voice", "Serena"),
            response_format=params.get("response_format", "wav"),
            speed=float(params.get("speed", 1.0)),
            stream=params.get("stream", "false").lower() == "true",
            language=params.get("language"),
            instruct=params.get("instruct"),
        )

    if not req.input.strip():
        raise HTTPException(status_code=400, detail="input text is required")

    language = req.language or "Auto"
    instruct = req.instruct or ""

    try:
        if req.response_format == "pcm" or req.stream:
            wav, sample_rate = engine.synthesize_pcm(
                text=req.input,
                voice=req.voice,
                language=language,
                instruct=instruct,
                speed=req.speed,
            )
            pcm = (wav * 32767).astype(np.int16).tobytes()
            if req.stream:

                def stream_pcm():
                    chunk_size = sample_rate * 2  # ~1s of 16-bit mono
                    for i in range(0, len(pcm), chunk_size):
                        yield pcm[i : i + chunk_size]

                return StreamingResponse(stream_pcm(), media_type="audio/pcm")

            return Response(content=pcm, media_type="audio/pcm")

        audio_bytes, media_type = engine.synthesize(
            text=req.input,
            voice=req.voice,
            language=language,
            instruct=instruct,
            speed=req.speed,
        )

        if req.response_format == "mp3":
            try:
                from pydub import AudioSegment

                segment = AudioSegment.from_wav(io.BytesIO(audio_bytes))
                mp3_buffer = io.BytesIO()
                segment.export(mp3_buffer, format="mp3")
                return Response(content=mp3_buffer.getvalue(), media_type="audio/mpeg")
            except ImportError:
                logger.warning("pydub not installed; returning WAV instead of MP3")

        return Response(content=audio_bytes, media_type=media_type)
    except Exception as exc:
        logger.exception("Speech synthesis failed")
        raise HTTPException(status_code=500, detail=str(exc)) from exc
