# backend/main.py

from fastapi import FastAPI, UploadFile, File
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
import tempfile, os

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


# ── ROUTES ───────────────────────────────────────────────────

@app.get("/")
def health():
    return {"status": "CrowdSense AI running", "version": "1.0"}


@app.post("/analyze")
async def analyze_video_upload(video: UploadFile = File(...)):
    """One-shot: upload video → full pipeline → results."""
    with tempfile.NamedTemporaryFile(delete=False, suffix=".mp4") as f:
        f.write(await video.read())
        path = f.name
    try:
        vision  = analyze_video(path)
        audio   = analyze_audio(path)
        fused   = fuse_inputs(vision, audio)
        initial = reason_about_scene(fused)
        final   = critique_and_refine(vision, initial)
        commands = generate_superintendent_commands(
                        final, {}, vision.get("crowd_count_estimate", 0))
        return {
            "success": True,
            "vision": vision, "audio": audio,
            "initial": initial, "final": final,
            "commands": commands
        }
    finally:
        os.remove(path)


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
    """Dashboard polls this every 5 seconds to get fresh data."""
    return JSONResponse(content=state.get_snapshot())