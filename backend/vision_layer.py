# ============================================================
# vision_layer.py — FINAL VERSION
# Handles: webcam live / video file / multiple CCTV feeds
# ============================================================

import cv2
import base64
import requests
import json
import threading
import time
from datetime import datetime

# ============================================================
# CONFIG — Change these when switching to AMD
# ============================================================
USE_GROQ = True  # False when AMD ready

if USE_GROQ:
    VISION_API_URL = "https://api.groq.com/openai/v1/chat/completions"
    VISION_API_KEY = "REPLACED_SECRET"
    VISION_MODEL = "meta-llama/llama-4-scout-17b-16e-instruct" # Llama 4 Multimodal model on Groq
else:
    VISION_API_URL = "http://YOUR_AMD_IP:8000/v1/chat/completions"
    VISION_API_KEY = ""
    VISION_MODEL = "Qwen/Qwen2-VL-7B-Instruct"

# ============================================================
# VENUE MAP — System learns the venue on startup
# This is what makes it feel like a real security system
# ============================================================
VENUE_MAP = {
    "exits": {
        "E1": "North Main Exit — capacity 300/min",
        "E2": "South Emergency Exit — capacity 150/min",
        "E3": "East Side Exit — capacity 200/min",
        "E4": "West Gate — capacity 250/min"
    },
    "zones": {
        "north": "Main entrance area — highest incoming flow",
        "south": "Stage/event area — densest crowd zone",
        "east": "Food court — moderate density",
        "west": "Parking access — natural dispersal route"
    },
    "total_capacity": 5000,
    "officer_positions": {
        "post_1": "North Gate",
        "post_2": "South Barrier",
        "post_3": "East Corridor",
        "post_4": "West Gate",
        "post_5": "Center Command",
        "post_6": "Emergency Post"
    }
}


def frame_to_base64(frame):
    """Convert OpenCV frame to base64 string for API"""
    _, buffer = cv2.imencode('.jpg', frame, [cv2.IMWRITE_JPEG_QUALITY, 85])
    return base64.b64encode(buffer).decode('utf-8')


def analyze_frame(frame, camera_id="CAM-1", venue_context=""):
    """Send one frame to vision AI and get crowd analysis"""

    image_b64 = frame_to_base64(frame)

    prompt = f"""You are an advanced crowd safety AI monitoring system for a security command center.

VENUE CONTEXT:
{venue_context}

CAMERA: {camera_id}
TIME: {datetime.now().strftime('%H:%M:%S')}

Analyze this crowd scene with the precision of an expert security superintendent.
Look for: crowd density, movement patterns, danger signs, bottlenecks, distress.

Return ONLY this JSON, nothing else:
{{
  "crowd_density": "empty/low/medium/high/critical",
  "crowd_count_estimate": number,
  "movement_pattern": "stationary/calm/moving/rushing/chaotic/converging/dispersing/pushing",
  "visible_distress": true or false,
  "body_language": ["list", "of", "behaviors"],
  "zone_descriptions": {{
    "north": "clear/crowded/blocked/danger",
    "south": "clear/crowded/blocked/danger",
    "east": "clear/crowded/blocked/danger",
    "west": "clear/crowded/blocked/danger"
  }},
  "visible_exits_status": "open_and_clear/partially_blocked/blocked/not_visible",
  "bottleneck_detected": true or false,
  "bottleneck_location": "describe exact location or none",
  "immediate_threats": ["list any immediate physical dangers observed"],
  "safe_direction": "north/south/east/west/multiple — safest direction to move crowd",
  "risk_score": number from 1 to 10,
  "scene_description": "one sentence describing exactly what you see"
}}"""

    headers = {
        "Authorization": f"Bearer {VISION_API_KEY}",
        "Content-Type": "application/json"
    }

    try:
        response = requests.post(
            VISION_API_URL,
            headers=headers,
            json={
                "model": VISION_MODEL,
                "messages": [{
                    "role": "user",
                    "content": [
                        {"type": "text", "text": prompt},
                        {"type": "image_url", "image_url": {"url": f"data:image/jpeg;base64,{image_b64}"}}
                    ]
                }],
                "response_format": {"type": "json_object"},
                "max_tokens": 600,
                "temperature": 0.1
            },
            timeout=30
        )

        response_json = response.json()
        if "choices" not in response_json:
            print(f"[Vision] ❌ Unexpected API response: {response_json}")
            return _fallback_result(f"API Error: {response_json.get('error', {}).get('message', 'Unknown')}")

        text = response_json["choices"][0]["message"]["content"]
        print(f"[Vision] Received raw response: {text[:200]}...")
        
        start, end = text.find("{"), text.rfind("}") + 1
        if start == -1 or end == 0:
            print(f"[Vision] ❌ No JSON found in text: {text}")
            return _fallback_result("No JSON found in AI response")
            
        return json.loads(text[start:end])

    except Exception as e:
        print(f"[Vision] ❌ Analysis failed: {e}")
        try:
            print(f"[Vision] Response text: {response.text}")
        except:
            pass
        return _fallback_result(str(e))

def _fallback_result(reason: str):
    return {
        "crowd_density": "unknown",
        "crowd_count_estimate": 0,
        "movement_pattern": "unknown",
        "visible_distress": False,
        "body_language": [f"Analysis failed: {reason}"],
        "zone_descriptions": {
            "north": "unknown",
            "south": "unknown",
            "east": "unknown",
            "west": "unknown"
        },
        "visible_exits_status": "unknown",
        "bottleneck_detected": False,
        "bottleneck_location": "none",
        "immediate_threats": ["none"],
        "safe_direction": "unknown",
        "risk_score": 0,
        "scene_description": f"Vision API analysis failed: {reason}"
    }
def analyze_video(video_path, camera_id="CAM-1"):
    """
    Analyze a video file by sampling one frame from the middle.
    This is used for one-shot analysis of uploaded files.
    """
    cap = cv2.VideoCapture(video_path)
    if not cap.isOpened():
        print(f"Error: Could not open video {video_path}")
        return None

    # Get total frames and go to middle
    total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
    cap.set(cv2.CAP_PROP_POS_FRAMES, total_frames // 2)

    success, frame = cap.read()
    cap.release()

    if success:
        return analyze_frame(frame, camera_id)
    return None


# ============================================================
# LIVE WEBCAM FEED — Analyzes your laptop camera in real time
# ============================================================

# Shared storage for latest results from each camera
camera_results = {}
camera_frames = {}

def run_camera_feed(source, camera_id):
    """
    Runs a camera feed in background thread.
    source = 0 for webcam, or "path/to/video.mp4"
    """
    cap = cv2.VideoCapture(source)

    if not cap.isOpened():
        print(f"Cannot open {camera_id}")
        return

    venue_context = f"""
    Venue exits: {json.dumps(VENUE_MAP['exits'])}
    Zone layout: {json.dumps(VENUE_MAP['zones'])}
    Total venue capacity: {VENUE_MAP['total_capacity']}
    """

    frame_count = 0
    print(f"{camera_id} started")

    while True:
        success, frame = cap.read()

        if not success:
            # If video ended, loop it (for demo purposes)
            cap.set(cv2.CAP_PROP_POS_FRAMES, 0)
            continue

        # Store latest frame for dashboard display
        camera_frames[camera_id] = frame

        # Analyze every 60 frames (every 2 seconds)
        if frame_count % 60 == 0:
            print(f"Analyzing {camera_id} frame {frame_count}...")
            result = analyze_frame(frame, camera_id, venue_context)
            if result:
                result["camera_id"] = camera_id
                result["timestamp"] = datetime.now().strftime("%H:%M:%S")
                camera_results[camera_id] = result

        frame_count += 1
        time.sleep(0.033)  # ~30fps display

    cap.release()


def start_webcam(camera_index=0, camera_id="WEBCAM-1"):
    """Start live webcam analysis in background"""
    thread = threading.Thread(
        target=run_camera_feed,
        args=(camera_index, camera_id),
        daemon=True
    )
    thread.start()
    return thread


def start_video_file(video_path, camera_id="CAM-1"):
    """Start video file analysis in background (for demo)"""
    thread = threading.Thread(
        target=run_camera_feed,
        args=(video_path, camera_id),
        daemon=True
    )
    thread.start()
    return thread


def get_latest_results():
    """Get latest analysis from all cameras"""
    return dict(camera_results)


def get_latest_frames():
    """Get latest video frames from all cameras"""
    return dict(camera_frames)