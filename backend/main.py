# backend/main.py

from fastapi import FastAPI, UploadFile, File
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
import tempfile, os
from concurrent.futures import ThreadPoolExecutor, as_completed

from backend.vision_layer  import analyze_video
from backend.audio_layer   import analyze_audio
from backend.fusion        import fuse_inputs
from backend.reasoning     import reason_about_scene
from backend.critic        import critique_and_refine
from backend.action_agent  import generate_superintendent_commands
from backend.live_monitor  import start_monitoring, stop_monitoring, state

app = FastAPI(title="CrowdSense AI", version="1.0")

app.add_middleware(CORSMiddleware,
    allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])

# Shared thread pool — reused across requests
_executor = ThreadPoolExecutor(max_workers=4)


# ── ROUTES ───────────────────────────────────────────────────

@app.get("/")
def health():
    return {"status": "CrowdSense AI running", "version": "1.0"}


@app.post("/analyze")
async def analyze_video_upload(video: UploadFile = File(...)):
    """One-shot: upload video → full parallel pipeline → results."""
    with tempfile.NamedTemporaryFile(delete=False, suffix=".mp4") as f:
        f.write(await video.read())
        path = f.name

    try:
        import asyncio
        loop = asyncio.get_event_loop()

        # ── STAGE 1: Vision + Audio in parallel ──────────────
        vision_future = loop.run_in_executor(_executor, analyze_video, path)
        audio_future  = loop.run_in_executor(_executor, analyze_audio, path)
        vision, audio = await asyncio.gather(vision_future, audio_future)

        # ── STAGE 2: Fuse (instant) ───────────────────────────
        fused = fuse_inputs(vision, audio)

        # ── STAGE 3: Reasoning + Critic in parallel ───────────
        # Critic needs initial result, so run reasoning first then critic
        # But we can overlap: start reasoning, then critic immediately after
        initial = await loop.run_in_executor(_executor, reason_about_scene, fused)

        # Run critic and commands generation concurrently
        critic_future   = loop.run_in_executor(_executor, critique_and_refine, vision, initial)
        final = await critic_future

        crowd_count = vision.get("crowd_count_estimate", 0) if vision else 0
        commands = generate_superintendent_commands(final, {}, crowd_count)

        return {
            "success": True,
            "vision": vision, "audio": audio,
            "initial": initial, "final": final,
            "commands": commands
        }
    finally:
        try:
            os.remove(path)
        except Exception:
            pass


@app.post("/live/start")
def start_live():
    """Start live monitoring with dual cameras."""
    start_monitoring()
    return {"status": "live monitoring started for dual cameras"}


@app.post("/live/stop")
def stop_live():
    stop_monitoring()
    return {"status": "stopped"}


@app.get("/live/status")
def live_status():
    """Dashboard polls this every 2 seconds to get fresh data."""
    return JSONResponse(content=state.get_snapshot())
