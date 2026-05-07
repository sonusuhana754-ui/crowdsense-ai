# backend/audio_layer.py
# AMD-recommended model: OpenAI Whisper (ROCm compatible)
# Handles: video file audio extraction + live microphone capture

import os
import subprocess
import tempfile

# ── Whisper (AMD specified audio model) ──────────────────────
try:
    import whisper
    # 'small' = better accuracy than 'base', still fast on AMD MI300X
    _whisper_model = whisper.load_model("small")
    WHISPER_OK = True
    print("[AudioLayer] Whisper 'small' loaded [OK]")
except Exception as e:
    WHISPER_OK = False
    print(f"[AudioLayer] Whisper not available: {e}. Install: pip install openai-whisper")

# ── Live microphone (optional, for live monitoring mode) ──────
try:
    import sounddevice as sd
    import numpy as np
    SOUNDDEVICE_OK = True
except Exception:
    SOUNDDEVICE_OK = False

# Words that indicate panic or distress in any language context
PANIC_KEYWORDS = [
    "help", "run", "fire", "emergency", "stop", "danger",
    "out", "move", "crush", "trapped", "push", "back",
    "please", "hurry", "scared", "pain", "stuck", "fall",
    "bomb", "shoot", "attack", "save", "dying", "dead"
]


# ─────────────────────────────────────────────────────────────
# MAIN PUBLIC FUNCTION — called from test_my_files.py and main.py
# ─────────────────────────────────────────────────────────────

def analyze_audio(video_path: str) -> dict:
    """
    Extract audio from a video file and analyze it with Whisper.
    This is what test_my_files.py and main.py call.

    Args:
        video_path: path to .mp4 video file

    Returns:
        dict with transcription, panic score, concern level
    """
    print(f"  [Audio] Extracting from: {video_path}")

    # Step 1: Pull audio out of video using ffmpeg
    audio_path = _extract_audio(video_path)
    if not audio_path:
        return _fallback("could not extract audio from video")

    # Step 2: Run Whisper on the extracted audio
    result = _transcribe(audio_path)

    # Step 3: Cleanup temp audio file
    _cleanup(audio_path)

    return result


def analyze_live_audio(duration_seconds: int = 5) -> dict:
    """
    Record from microphone and analyze.
    Used in live_monitor.py for continuous monitoring.

    Args:
        duration_seconds: how many seconds to record

    Returns:
        dict with transcription, panic score, concern level
    """
    if not SOUNDDEVICE_OK:
        return _fallback("sounddevice not installed — pip install sounddevice scipy")

    if not WHISPER_OK:
        return _fallback("Whisper not installed")

    try:
        SAMPLE_RATE = 16000  # Whisper standard
        print(f"  [Audio] Recording {duration_seconds}s from microphone...")

        audio_data = sd.rec(
            int(duration_seconds * SAMPLE_RATE),
            samplerate=SAMPLE_RATE,
            channels=1,
            dtype="float32"
        )
        sd.wait()  # Block until recording is done

        # Save to temp wav file
        tmp = tempfile.NamedTemporaryFile(suffix=".wav", delete=False)
        tmp_path = tmp.name
        tmp.close()

        import scipy.io.wavfile as wavfile
        wavfile.write(tmp_path, SAMPLE_RATE, audio_data)

        result = _transcribe(tmp_path)
        _cleanup(tmp_path)
        return result

    except Exception as e:
        return _fallback(f"live audio error: {e}")


# ─────────────────────────────────────────────────────────────
# PRIVATE HELPERS
# ─────────────────────────────────────────────────────────────

def _extract_audio(video_path: str):
    """Use ffmpeg to pull audio out of video as 16kHz mono WAV."""
    out_path = video_path.replace(".mp4", "_tmp_audio.wav")

    cmd = [
        "ffmpeg",
        "-i", video_path,
        "-ac", "1",          # mono
        "-ar", "16000",      # 16kHz — Whisper's required rate
        "-vn",               # no video
        out_path,
        "-y",                # overwrite
        "-loglevel", "quiet"
    ]

    result = subprocess.run(cmd, capture_output=True)

    if result.returncode != 0 or not os.path.exists(out_path):
        print("  [Audio] ffmpeg extraction failed — video may have no audio track")
        return None

    size = os.path.getsize(out_path)
    if size < 1000:  # less than 1KB = empty audio
        print("  [Audio] Audio track is empty/silent")
        _cleanup(out_path)
        return None

    print(f"  [Audio] Extracted audio: {size // 1024}KB")
    return out_path


def _transcribe(audio_path: str) -> dict:
    """Run Whisper on audio file and build result dict."""
    if not WHISPER_OK:
        return _fallback("Whisper not loaded")

    try:
        print("  [Audio] Running Whisper transcription...")
        raw = _whisper_model.transcribe(
            audio_path,
            language=None,       # auto-detect — important for international use
            task="transcribe",
            fp16=False           # set True on AMD GPU for speed
        )
        text = raw["text"].strip()
        detected_lang = raw.get("language", "unknown")
        print(f"  [Audio] Transcribed ({detected_lang}): '{text[:60]}...'")
        return _score(text, detected_lang)

    except Exception as e:
        return _fallback(f"Whisper error: {e}")


def _score(transcription: str, language: str = "unknown") -> dict:
    """Count panic keywords and assign concern level."""
    text_lower = transcription.lower()

    found_words = [w for w in PANIC_KEYWORDS if w in text_lower]
    count = len(found_words)

    if count >= 4:
        concern = "critical"
    elif count >= 2:
        concern = "high"
    elif count >= 1:
        concern = "medium"
    else:
        concern = "low"

    return {
        "transcription":        transcription or "no speech detected",
        "language_detected":    language,
        "panic_words_detected": count,
        "panic_words_found":    found_words,
        "screaming_likely":     count >= 3,
        "audio_concern_level":  concern,
        "audio_risk_score":     min(10, count * 2),   # 0-10 scale
        "analysis_success":     True
    }


def _fallback(reason: str = "unknown") -> dict:
    """Safe default when audio analysis fails."""
    print(f"  [Audio] Fallback — {reason}")
    return {
        "transcription":        f"unavailable: {reason}",
        "language_detected":    "unknown",
        "panic_words_detected": 0,
        "panic_words_found":    [],
        "screaming_likely":     False,
        "audio_concern_level":  "low",
        "audio_risk_score":     0,
        "analysis_success":     False
    }


def _cleanup(path: str):
    try:
        if path and os.path.exists(path):
            os.remove(path)
    except Exception:
        pass