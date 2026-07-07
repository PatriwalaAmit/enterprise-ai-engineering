"""TTS client package."""

from .performance import SpeechSegment, segment_for_performance
from .tts_client import TTSClient, load_config

__all__ = ["TTSClient", "SpeechSegment", "segment_for_performance", "load_config"]
