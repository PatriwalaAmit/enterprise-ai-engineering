"""Split reply text into paced TTS segments with per-segment speed hints."""

from __future__ import annotations

import re
from dataclasses import dataclass


@dataclass
class SpeechSegment:
    text: str
    pause_after_ms: int = 0
    speed: float = 1.0


HESITATION_RE = re.compile(
    r"^(Ah+|Hmm+|Um+|Uh+|Oh+|Well+|So+|Okay+|Right)\b",
    re.IGNORECASE,
)
FEEDBACK_OPENER_RE = re.compile(
    r"^(Excellent|Great|Good|Nice|Perfect|You're almost there|Almost|Not quite|Try again|Well done|That's right|That's it)\b",
    re.IGNORECASE,
)


def _split_sentences(text: str) -> list[str]:
    parts = re.split(r'(?<=[.!?…])\s+', text.strip())
    return [p.strip() for p in parts if p.strip()]


def _pause_after(segment: str, cfg: dict) -> int:
    if segment.rstrip().endswith("?"):
        return int(cfg.get("question_pause_ms", 350))
    if "…" in segment or segment.rstrip().endswith("..."):
        return int(cfg.get("ellipsis_pause_ms", 450))
    if segment.rstrip().endswith("."):
        return int(cfg.get("period_pause_ms", 350))
    return 0


def _segment_speed(segment: str, base_speed: float, cfg: dict) -> float:
    if HESITATION_RE.match(segment.strip()):
        return base_speed * float(cfg.get("hesitation_speed", 0.85))
    if FEEDBACK_OPENER_RE.match(segment.strip()):
        return base_speed * float(cfg.get("feedback_opener_speed", 0.95))
    return base_speed


def _merge_short(segments: list[SpeechSegment], min_chars: int) -> list[SpeechSegment]:
    if not segments:
        return segments

    merged: list[SpeechSegment] = []
    buffer = segments[0]

    for seg in segments[1:]:
        if len(buffer.text) < min_chars:
            buffer = SpeechSegment(
                text=f"{buffer.text} {seg.text}".strip(),
                pause_after_ms=seg.pause_after_ms,
                speed=seg.speed,
            )
        else:
            merged.append(buffer)
            buffer = seg

    merged.append(buffer)
    return merged


def segment_for_performance(text: str, base_speed: float, cfg: dict) -> list[SpeechSegment]:
    if not cfg.get("enabled", True):
        return [SpeechSegment(text=text.strip(), speed=base_speed)]

    max_segments = int(cfg.get("max_segments", 8))
    min_chars = int(cfg.get("min_segment_chars", 12))
    feedback_pause = int(cfg.get("feedback_opener_pause_ms", 300))

    raw_parts = _split_sentences(text)
    segments: list[SpeechSegment] = []

    for part in raw_parts:
        speed = _segment_speed(part, base_speed, cfg)
        pause = _pause_after(part, cfg)
        if FEEDBACK_OPENER_RE.match(part.strip()) and "…" in part:
            pause = max(pause, feedback_pause)
        segments.append(SpeechSegment(text=part, pause_after_ms=pause, speed=speed))

    segments = _merge_short(segments, min_chars)

    if len(segments) > max_segments:
        head = segments[: max_segments - 1]
        tail_text = " ".join(s.text for s in segments[max_segments - 1 :])
        tail = SpeechSegment(
            text=tail_text,
            pause_after_ms=segments[-1].pause_after_ms,
            speed=segments[-1].speed,
        )
        return head + [tail]

    return segments
