"""
=============================================================================
  P2P Car-Sharing Real-Time Driving Analysis System — Backend
  FastAPI + WebSocket + AsyncIO
=============================================================================
  Architecture Overview:
  ┌──────────────────────────────────────────────────────────────────┐
  │  DummyVisionAI  ←── [ INSERT YOLO MODEL HERE ] ────────────────│
  │  Generates mock events; swap analyze_frame() with real YOLO     │
  ├──────────────────────────────────────────────────────────────────┤
  │  DrivingAnalysisSession  — manages a single WS client session   │
  ├──────────────────────────────────────────────────────────────────┤
  │  WebSocket endpoint  /ws/driving-analysis                        │
  └──────────────────────────────────────────────────────────────────┘
"""

import asyncio
import base64
import json
import logging
import random
from datetime import datetime, timezone
from typing import Optional

import cv2

import uvicorn
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware

# ---------------------------------------------------------------------------
# Logging
# ---------------------------------------------------------------------------
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s — %(message)s",
)
logger = logging.getLogger("driving-analysis")

# ---------------------------------------------------------------------------
# FastAPI app
# ---------------------------------------------------------------------------
app = FastAPI(
    title="P2P Driving Analysis API",
    description="Real-time driving behaviour analysis via WebSocket.",
    version="1.0.0",
)

# Allow the React dev server (and any IP camera proxy) to connect
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],          # tighten in production
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ===========================================================================
#
#  ██████   ██████   ██████  ██████      ██   ███    ██ ███████ ███████ ██████  ████████
#  ██   ██ ██    ██ ██    ██ ██   ██     ██   ████   ██ ██      ██      ██   ██    ██
#  ██████  ██    ██ ██    ██ ██████      ██   ██ ██  ██ ███████ █████   ██████     ██
#  ██   ██ ██    ██ ██    ██ ██          ██   ██  ██ ██      ██ ██      ██   ██    ██
#  ██   ██  ██████   ██████  ██          ██   ██   ████ ███████ ███████ ██   ██    ██
#
#  ▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼
#
#  INSERT YOLO MODEL HERE
#  ─────────────────────
#  Replace the body of DummyVisionAI.analyze_frame() with your real
#  OpenCV + YOLOv8 inference logic.  The interface contract is:
#
#    async def analyze_frame(self, frame: Optional[bytes]) -> Optional[dict]
#
#  Return None when no event should be emitted, or a dict with keys:
#    {
#      "type":        "critical" | "warning",
#      "message":     str,          # human-readable description
#      "scoreChange": int,          # negative int, e.g. -10 or -5
#    }
#
#  Example real implementation skeleton:
#
#    import cv2, numpy as np
#    from ultralytics import YOLO
#
#    class RealVisionAI(DummyVisionAI):
#        def __init__(self, model_path: str = "yolov8n.pt"):
#            self.model = YOLO(model_path)
#
#        async def analyze_frame(self, frame: Optional[bytes]) -> Optional[dict]:
#            if frame is None:
#                return None
#            nparr = np.frombuffer(frame, np.uint8)
#            img   = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
#            results = self.model(img)
#            # … parse results and return event dict or None
#
#  ▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲
#
# ===========================================================================


class DummyVisionAI:
    """
    Placeholder AI engine that produces mock driving-violation events.

    When integrating the real YOLOv8 model, replace (or subclass) this class
    and override `analyze_frame`.  The rest of the pipeline requires no changes.
    """

    # Catalogue of mock events — replace with real YOLO detections later
    _MOCK_EVENTS: list[dict] = [
        {
            "type": "critical",
            "message": "🛑 Violation: Failed to stop at Stop Sign",
            "scoreChange": -10,
        },
        {
            "type": "critical",
            "message": "🚦 Violation: Ran a Red Light",
            "scoreChange": -10,
        }
    ]

    async def analyze_frame(self, frame: Optional[bytes]) -> Optional[dict]:
        """
        Analyse a single video frame (or None for mock mode).

        Parameters
        ----------
        frame : bytes | None
            Raw JPEG/PNG frame bytes from the camera.  Currently unused;
            the mock implementation fires random events instead.

        Returns
        -------
        dict | None
            Event dict {"type", "message", "scoreChange"} or None for no event.
        """
        # Mock disabled — real detections come from the browser TF.js pipeline.
        # Swap this with real YOLO inference when integrating the model.
        return None


# ---------------------------------------------------------------------------
# Session handler — manages one WebSocket client
# ---------------------------------------------------------------------------

class DrivingAnalysisSession:
    """
    Encapsulates the lifecycle of a single connected WebSocket client.

    Responsibilities:
    - Poll the AI engine at a configurable interval.
    - Build well-formed JSON payloads.
    - Send events over the WebSocket connection.
    """

    # Seconds between AI polling cycles (random within range)
    _POLL_INTERVAL_MIN: float = 5.0
    _POLL_INTERVAL_MAX: float = 10.0

    def __init__(self, websocket: WebSocket, ai: DummyVisionAI):
        self.websocket = websocket
        self.ai = ai
        self.client_id = id(websocket)

    async def run(self) -> None:
        """Main loop: poll AI → build payload → send to client."""
        logger.info("Session started for client %s", self.client_id)
        try:
            while True:
                # Simulate frame capture; pass None in mock mode
                event = await self.ai.analyze_frame(frame=None)

                if event is not None:
                    payload = self._build_payload(event)
                    await self.websocket.send_text(json.dumps(payload))
                    logger.info(
                        "Sent [%s] to client %s: %s",
                        payload["type"],
                        self.client_id,
                        payload["message"],
                    )

                # Wait a random interval before next detection cycle
                interval = random.uniform(
                    self._POLL_INTERVAL_MIN, self._POLL_INTERVAL_MAX
                )
                await asyncio.sleep(interval)

        except asyncio.CancelledError:
            logger.info("Session %s cancelled.", self.client_id)

    @staticmethod
    def _build_payload(event: dict) -> dict:
        """Attach a server-side ISO-8601 timestamp to a raw event dict."""
        return {
            "timestamp": datetime.now(timezone.utc).isoformat(),
            **event,   # type, message, scoreChange
        }


# ---------------------------------------------------------------------------
# WebSocket endpoint
# ---------------------------------------------------------------------------

@app.websocket("/ws/driving-analysis")
async def driving_analysis_ws(websocket: WebSocket):
    """
    WebSocket endpoint for real-time driving analysis.

    Lifecycle:
      1. Accept the connection.
      2. Send an immediate "connected" handshake message.
      3. Spawn a DrivingAnalysisSession that streams events until disconnect.
    """
    await websocket.accept()
    logger.info("Client connected: %s", websocket.client)

    # Instantiate the AI engine (swap DummyVisionAI → RealVisionAI here)
    ai_engine = DummyVisionAI()
    session = DrivingAnalysisSession(websocket, ai_engine)

    # Send handshake so the frontend knows the server is ready
    handshake = {
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "type": "info",
        "message": "✅ Connected to Driving Analysis Server",
        "scoreChange": 0,
    }
    await websocket.send_text(json.dumps(handshake))

    try:
        # Run the streaming session until the client disconnects
        await session.run()
    except WebSocketDisconnect:
        logger.info("Client disconnected: %s", websocket.client)


# ---------------------------------------------------------------------------
# Local Camera Stream — WebSocket endpoint
# ---------------------------------------------------------------------------
#
# How it works:
#   1. Frontend sends a connect request → backend opens cv2.VideoCapture(device_index)
#   2. Each frame is JPEG-encoded and sent as a base64 string in a JSON envelope
#   3. Frontend decodes and sets it as <img src="data:image/jpeg;base64,...">
#
# iPhone via Lightning setup (Iriun Webcam — no separate driver install needed):
#   ① Install Iriun Webcam for Windows on PC (https://iriun.com) — virtual DirectShow driver is automatically included
#   ② Install and launch the Iriun Webcam app on iPhone
#   ③ Connect iPhone and PC with a Lightning cable
#   ④ Check which device index is assigned via the GET /api/cameras endpoint
#      (If the built-in webcam is index 0, it is usually assigned index 1 or 2)
# ---------------------------------------------------------------------------

# Target resolution & quality (trade-off: quality ↑ → latency ↑)
_CAMERA_WIDTH   = 1280
_CAMERA_HEIGHT  = 720
_JPEG_QUALITY   = 60     # 0–100; lower = smaller payload
_TARGET_FPS     = 30


@app.get("/api/cameras", tags=["camera"])
async def list_cameras(max_index: int = 5) -> dict:
    """
    Probe device indices 0..max_index and report which ones OpenCV can open.

    Use this endpoint to identify which index your Lightning-connected
    iPhone appears on (typically 1 or 2 after Iriun Webcam is installed and running).

    Example: GET http://localhost:8000/api/cameras
    """
    available: list[dict] = []
    for idx in range(max_index + 1):
        cap = cv2.VideoCapture(idx, cv2.CAP_DSHOW)  # CAP_DSHOW = Windows DirectShow
        if cap.isOpened():
            width  = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
            height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
            available.append({"index": idx, "width": width, "height": height})
            cap.release()
    logger.info("Camera scan found %d device(s): %s", len(available), available)
    return {"cameras": available}


@app.websocket("/ws/camera-stream")
async def camera_stream_ws(websocket: WebSocket, device: int = 0):
    """
    WebSocket endpoint that streams live video from a local camera device.

    Query param:
      device (int, default 0) — DirectShow device index.
                                0 = built-in webcam, 1/2 = USB/Lightning camera.

    Message format sent to client:
      { "kind": "frame", "data": "<base64 JPEG string>" }

    Or on error:
      { "kind": "error", "message": "<description>" }
    """
    await websocket.accept()
    logger.info("Camera stream client connected — device index %d", device)

    # Open the camera (CAP_DSHOW is required on Windows for low-latency access)
    cap = cv2.VideoCapture(device, cv2.CAP_DSHOW)

    if not cap.isOpened():
        error_msg = (
            f"Cannot open camera device {device}. "
            "Check that Iriun Webcam is running on your iPhone and connected via Lightning."
        )
        logger.error(error_msg)
        await websocket.send_text(json.dumps({"kind": "error", "message": error_msg}))
        await websocket.close()
        return

    # Set resolution; Iriun Webcam honours these requests
    cap.set(cv2.CAP_PROP_FRAME_WIDTH,  _CAMERA_WIDTH)
    cap.set(cv2.CAP_PROP_FRAME_HEIGHT, _CAMERA_HEIGHT)
    cap.set(cv2.CAP_PROP_FPS,          _TARGET_FPS)

    frame_interval = 1.0 / _TARGET_FPS   # seconds between frames

    try:
        while True:
            # Read one frame — this is a blocking call, run in thread pool
            ret, frame = await asyncio.get_event_loop().run_in_executor(
                None, cap.read
            )

            if not ret or frame is None:
                logger.warning("Camera read failed (device %d) — stopping stream.", device)
                await websocket.send_text(json.dumps({
                    "kind":    "error",
                    "message": "Camera read error. Check the cable / app connection.",
                }))
                break

            # Encode frame → JPEG bytes → base64 string
            encode_params = [cv2.IMWRITE_JPEG_QUALITY, _JPEG_QUALITY]
            _, buffer = cv2.imencode(".jpg", frame, encode_params)
            b64_frame  = base64.b64encode(buffer.tobytes()).decode("utf-8")

            await websocket.send_text(json.dumps({
                "kind": "frame",
                "data": b64_frame,
            }))

            # Yield control so other coroutines (AI events etc.) can run
            await asyncio.sleep(frame_interval)

    except WebSocketDisconnect:
        logger.info("Camera stream client disconnected (device %d).", device)
    finally:
        cap.release()
        logger.info("Camera device %d released.", device)


# ---------------------------------------------------------------------------
# Health-check REST endpoint
# ---------------------------------------------------------------------------

@app.get("/health", tags=["meta"])
async def health() -> dict:
    """Simple liveness probe."""
    return {"status": "ok", "service": "driving-analysis"}


# ---------------------------------------------------------------------------
# Entry point (dev convenience)
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    uvicorn.run(
        "main:app",
        host="0.0.0.0",
        port=8000,
        reload=True,
        log_level="info",
    )
