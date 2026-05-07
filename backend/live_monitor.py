# backend/live_monitor.py
# Pro continuous monitoring — webcam + audio + AI analysis loop
# Designed for AMD MI300X: processes video + audio concurrently

import cv2
import threading
import time
import queue
import base64
from datetime import datetime
from collections import deque

from backend.vision_layer  import analyze_frame
from backend.audio_layer   import analyze_live_audio
from backend.fusion        import fuse_inputs
from backend.reasoning     import reason_about_scene
from backend.critic        import critique_and_refine
from backend.action_agent  import generate_superintendent_commands

# ─────────────────────────────────────────────────────────────
# SHARED STATE — all threads read/write here safely
# ─────────────────────────────────────────────────────────────

class SystemState:
    """Thread-safe shared state for live monitoring."""

    def __init__(self):
        self._lock = threading.Lock()

        # Latest results
        self.vision_results   = {}  # camera_id -> result
        self.audio_result     = {}
        self.fused_result     = {}
        self.initial_result   = {}
        self.final_result     = {}
        self.commands         = {}

        # Latest frames (for dashboard display)
        self.frames_b64       = {}  # camera_id -> b64 string

        # Alert log (last 50 events)
        self.alert_log        = deque(maxlen=50)

        # System status
        self.is_running       = False
        self.analysis_count   = 0
        self.last_analysis_time = None
        self.current_risk     = 0

    def update_vision(self, camera_id, result):
        with self._lock:
            self.vision_results[camera_id] = result

    def update_audio(self, result):
        with self._lock:
            self.audio_result = result

    def update_full_analysis(self, fused, initial, final, commands):
        with self._lock:
            self.fused_result   = fused
            self.initial_result = initial
            self.final_result   = final
            self.commands       = commands
            self.current_risk   = final.get("final_risk_level", 0)
            self.analysis_count += 1
            self.last_analysis_time = datetime.now().strftime("%H:%M:%S")

    def update_frame(self, camera_id, frame):
        """Store latest frame base64."""
        import base64
        with self._lock:
            if frame is not None:
                # Store the raw frame internally for the vision thread
                if not hasattr(self, 'raw_frames'): self.raw_frames = {}
                self.raw_frames[camera_id] = frame
                _, buf = cv2.imencode('.jpg', frame, [cv2.IMWRITE_JPEG_QUALITY, 50])
                self.frames_b64[camera_id] = base64.b64encode(buf).decode()

    def add_alert(self, level: str, message: str):
        """level = INFO | WARN | CRIT"""
        with self._lock:
            self.alert_log.appendleft({
                "time":    datetime.now().strftime("%H:%M:%S"),
                "level":   level,
                "message": message
            })

    def get_snapshot(self) -> dict:
        """Return full current state as dict (for API endpoint)."""
        with self._lock:
            return {
                "vision":           dict(self.vision_results),
                "audio":            dict(self.audio_result),
                "initial":          dict(self.initial_result),
                "final":            dict(self.final_result),
                "commands":         dict(self.commands),
                "frames_b64":       dict(self.frames_b64),
                "alert_log":        list(self.alert_log),
                "analysis_count":   self.analysis_count,
                "last_updated":     self.last_analysis_time,
                "current_risk":     self.current_risk,
                "system_running":   self.is_running
            }


# Global state shared across all threads
state = SystemState()


# ─────────────────────────────────────────────────────────────
# THREAD 1: VIDEO CAPTURE
# Continuously reads camera frames — stores latest in state
# ─────────────────────────────────────────────────────────────

def video_capture_thread(source, camera_id="CAM-1"):
    """
    Continuously reads frames from webcam or video file.
    source = 0 for webcam, or "path/to/video.mp4"
    """
    print(f"[VideoThread] Starting {camera_id} — source: {source}")
    cap = cv2.VideoCapture(source)

    if not cap.isOpened():
        print(f"[VideoThread] ❌ Cannot open source: {source}")
        state.add_alert("CRIT", f"{camera_id} feed failed to open")
        return

    state.add_alert("INFO", f"{camera_id} feed started")

    while state.is_running:
        ok, frame = cap.read()

        if not ok:
            # For video files: loop back to start (useful for demo)
            if isinstance(source, str):
                cap.set(cv2.CAP_PROP_POS_FRAMES, 0)
                continue
            else:
                print("[VideoThread] Camera disconnected")
                break

        state.update_frame(camera_id, frame)
        time.sleep(0.1)  # ~10fps to save CPU

    cap.release()
    print("[VideoThread] Stopped")


# ─────────────────────────────────────────────────────────────
# THREAD 2: VISION ANALYSIS
# Every 10 seconds: grab latest frame → send to vision AI
# ─────────────────────────────────────────────────────────────

def vision_analysis_thread(camera_id="CAM-1", interval_seconds=10):
    """
    Every N seconds: grab current frame, run vision AI on it.
    10 seconds = good balance of freshness vs API cost.
    """
    print(f"[VisionThread] Started — analyzing every {interval_seconds}s")
    state.add_alert("INFO", "Vision analysis thread active")

    while state.is_running:
        if hasattr(state, 'raw_frames') and camera_id in state.raw_frames:
            frame = state.raw_frames[camera_id]
        else:
            frame = None

        if frame is not None:
            try:
                print(f"\n[Vision] Analyzing {camera_id} at {datetime.now().strftime('%H:%M:%S')}...")
                result = analyze_frame(frame, camera_id)
                state.update_vision(camera_id, result)

                risk = result.get("risk_score", 0)
                density = result.get("crowd_density", "?")
                count = result.get("crowd_count_estimate", 0)

                # Log based on severity
                if risk >= 7:
                    state.add_alert("CRIT", f"{camera_id} density {density} — risk {risk}/10 — {count} persons")
                elif risk >= 4:
                    state.add_alert("WARN", f"{camera_id} density {density} — risk {risk}/10")
                else:
                    state.add_alert("INFO", f"{camera_id} normal — {density} density — {count} persons")

            except Exception as e:
                print(f"[VisionThread] Error: {e}")
                state.add_alert("WARN", f"Vision analysis error: {str(e)[:50]}")

        time.sleep(interval_seconds)

    print("[VisionThread] Stopped")


# ─────────────────────────────────────────────────────────────
# THREAD 3: AUDIO ANALYSIS
# Every 15 seconds: record 5s from mic → Whisper → update state
# ─────────────────────────────────────────────────────────────

def audio_analysis_thread(interval_seconds=15, record_duration=5):
    """
    Every N seconds: record from mic, transcribe with Whisper.
    """
    print(f"[AudioThread] Started — analyzing every {interval_seconds}s")
    state.add_alert("INFO", "Audio monitoring active (Whisper)")

    # Wait for first vision result before starting audio analysis
    time.sleep(5)

    while state.is_running:
        try:
            result = analyze_live_audio(duration_seconds=record_duration)
            state.update_audio(result)

            if result.get("screaming_likely"):
                state.add_alert("CRIT", f"Screaming detected — words: {result.get('panic_words_found', [])}")
            elif result.get("panic_words_detected", 0) > 0:
                state.add_alert("WARN", f"Panic words: {result.get('panic_words_found', [])}")

        except Exception as e:
            print(f"[AudioThread] Error: {e}")

        time.sleep(interval_seconds)

    print("[AudioThread] Stopped")


# ─────────────────────────────────────────────────────────────
# THREAD 4: INTELLIGENCE ENGINE
# Every 12 seconds: fuse latest vision+audio → reason → critic → commands
# ─────────────────────────────────────────────────────────────

def intelligence_thread(interval_seconds=12):
    """
    Core intelligence loop.
    Takes latest vision + audio → runs full AI pipeline → generates commands.
    Runs slightly after vision thread to always have fresh data.
    """
    print("[IntelThread] Started — running full pipeline every {interval_seconds}s")
    state.add_alert("INFO", "Intelligence engine active — dual-model reasoning online")

    # Wait for first vision + audio results
    time.sleep(12)

    while state.is_running:
        vision_results = state.vision_results
        audio  = state.audio_result

        if not vision_results:
            time.sleep(3)
            continue

        # Aggregate vision results across all cameras
        agg_vision = {
            "crowd_count_estimate": sum(v.get("crowd_count_estimate", 0) for v in vision_results.values()),
            "risk_score": max((v.get("risk_score", 0) for v in vision_results.values()), default=0),
            "crowd_density": "high" if any(v.get("risk_score", 0) >= 7 for v in vision_results.values()) else "normal",
            "movement_pattern": "mixed",
            "body_language": list(set([item for v in vision_results.values() for item in v.get("body_language", [])])),
            "visible_distress": any(v.get("visible_distress", False) for v in vision_results.values()),
            "zone_descriptions": vision_results.get("CAM-1", {}).get("zone_descriptions", {}),
            "concern_areas": [f"{cam}: {v.get('scene_description', '')}" for cam, v in vision_results.items()]
        }

        try:
            print(f"\n[Intel] Running full pipeline...")

            # Fuse
            fused = fuse_inputs(agg_vision, audio)

            # Reason
            initial = reason_about_scene(fused)
            initial_risk = initial.get("risk_level", 0)
            print(f"[Intel] Initial risk: {initial_risk}/10")

            # Critic
            final = critique_and_refine(agg_vision, initial)
            final_risk = final.get("final_risk_level", 0)
            print(f"[Intel] Final risk:   {final_risk}/10")

            # Commands
            crowd_count = agg_vision.get("crowd_count_estimate", 0)
            commands = generate_superintendent_commands(final, vision_results, crowd_count)

            # Update state
            state.update_full_analysis(fused, initial, final, commands)

            level = commands.get("incident_level", "?")
            state.add_alert("INFO",
                f"Analysis #{state.analysis_count} — {level} — risk {final_risk}/10")

            # If critical, add prominent alert
            if final_risk >= 8:
                state.add_alert("CRIT",
                    f"🚨 CRITICAL: {final.get('final_reasoning', '')[:80]}")

        except Exception as e:
            print(f"[IntelThread] Error: {e}")
            state.add_alert("WARN", f"Pipeline error: {str(e)[:60]}")

        time.sleep(interval_seconds)

    print("[IntelThread] Stopped")


# ─────────────────────────────────────────────────────────────
# START / STOP FUNCTIONS
# ─────────────────────────────────────────────────────────────

def start_monitoring():
    """
    Start all monitoring threads for both webcam and sample video.
    """
    global state
    state.is_running = True

    state.add_alert("INFO", "═══ CROWDSENSE AI SYSTEM INITIALISING ═══")
    state.add_alert("INFO", "Loading AMD MI300X inference pipeline...")
    state.add_alert("INFO", f"Starting Dual Cameras: 0 and demo/sample.mp4")

    threads = [
        # Camera 1 (Webcam)
        threading.Thread(target=video_capture_thread, args=(0, "CAM-1"), daemon=True),
        threading.Thread(target=vision_analysis_thread, args=("CAM-1", 10), daemon=True),
        
        # Camera 2 (Sample Video)
        threading.Thread(target=video_capture_thread, args=("demo/sample.mp4", "CAM-2"), daemon=True),
        threading.Thread(target=vision_analysis_thread, args=("CAM-2", 12), daemon=True),

        # Shared Audio & Intel
        threading.Thread(target=audio_analysis_thread, args=(15, 5), daemon=True),
        threading.Thread(target=intelligence_thread, args=(12,), daemon=True),
    ]

    for t in threads:
        t.start()

    state.add_alert("INFO", "All 4 monitoring threads active — system online")
    print("\n[CrowdSense] [OK] All threads running. Call state.get_snapshot() for data.\n")
    return threads


def stop_monitoring():
    global state
    state.is_running = False
    with state._lock:
        state.frames_b64.clear()
        if hasattr(state, 'raw_frames'):
            state.raw_frames.clear()
        state.vision_results.clear()
    print("[CrowdSense] Stopping all threads and clearing feeds...")