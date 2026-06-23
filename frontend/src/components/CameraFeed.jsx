// ============================================================================
//  CameraFeed.jsx — Dual-mode camera: IP MJPEG stream OR Local USB/Lightning
// ============================================================================
//
//  Mode A (IP Camera):
//    - Enter MJPEG stream URL (e.g. http://192.168.x.x:8080/video)
//    - The <img> tag natively renders the MJPEG stream
//
//  Mode B (Local / Lightning USB):
//    - Backend opens the selected device via OpenCV (DirectShow)
//    - Backend WebSocket pushes JPEG frames as base64 at ~30 fps
//    - Frontend draws frames into an <img> tag via data URI
//    - iPhone must be connected via Lightning + Iriun Webcam running
//      (install Iriun Webcam app on iPhone + Iriun Webcam for Windows on PC)
// ============================================================================

import { useState, useEffect, useRef, useCallback } from 'react';
import { Camera, Wifi, WifiOff, RefreshCcw, Usb, ChevronDown, Monitor } from 'lucide-react';

const WS_CAMERA_BASE = 'ws://localhost:8000/ws/camera-stream';
const API_CAMERAS    = 'http://localhost:8000/api/cameras';

// ── Shared styles ──────────────────────────────────────────────────────────

const inputStyle = {
  flex:         1,
  background:   'rgba(255,255,255,0.04)',
  border:       '1px solid rgba(99,179,237,0.15)',
  borderRadius: '0.5rem',
  padding:      '0.55rem 0.75rem',
  fontSize:     '0.8rem',
  color:        '#e2e8f0',
  fontFamily:   'var(--font-mono)',
  outline:      'none',
  transition:   'border-color 0.2s',
  width:        '100%',
};

// ── Shared sub-components ──────────────────────────────────────────────────

function Viewport({ live, children }) {
  return (
    <div
      className="card"
      style={{
        position:       'relative',
        aspectRatio:    '16 / 9',
        overflow:       'hidden',
        display:        'flex',
        alignItems:     'center',
        justifyContent: 'center',
        background:     '#0a0d12',
      }}
    >
      {live && (
        <div
          style={{
            position:    'absolute',
            top: 10, left: 10,
            display:     'flex',
            alignItems:  'center',
            gap:         4,
            zIndex:      10,
            background:  'rgba(0,0,0,0.5)',
            borderRadius: 3,
            padding:     '2px 6px',
          }}
        >
          <span
            className="animate-pulse-glow"
            style={{ width: 6, height: 6, borderRadius: '50%', background: '#ef4444', display: 'block' }}
          />
          <span style={{ fontSize: '0.6rem', fontWeight: 600, color: '#f87171' }}>
            LIVE
          </span>
        </div>
      )}

      {children}
    </div>
  );
}

function IdleOverlay({ hint, icon }) {
  return (
    <div style={{
      position: 'absolute', inset: 0,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
    }}>
      <div style={{ textAlign: 'center', color: '#475569' }}>
        {icon ?? <Camera size={48} style={{ margin: '0 auto 0.75rem', opacity: 0.4 }} />}
        <p style={{ fontSize: '0.85rem' }}>No camera connected</p>
        <p style={{ fontSize: '0.72rem', marginTop: '0.3rem', color: '#334155' }}>{hint}</p>
      </div>
    </div>
  );
}

function StreamError({ message, onRetry }) {
  return (
    <div style={{ textAlign: 'center', color: '#64748b', padding: '1.5rem', maxWidth: 280 }}>
      <RefreshCcw size={28} style={{ margin: '0 auto 0.5rem', opacity: 0.5 }} />
      <p style={{ fontSize: '0.8rem', fontWeight: 600, color: '#94a3b8', marginBottom: '0.35rem' }}>
        Stream unavailable
      </p>
      {message && (
        <p style={{ fontSize: '0.7rem', color: '#475569', marginBottom: '0.75rem' }}>{message}</p>
      )}
      <button
        className="btn btn-primary"
        style={{ fontSize: '0.75rem', padding: '5px 14px' }}
        onClick={onRetry}
      >
        <RefreshCcw size={13} /> Retry
      </button>
    </div>
  );
}

// ── Mode A: IP Camera (MJPEG) ──────────────────────────────────────────────

function IpCameraMode() {
  const [inputUrl, setInputUrl]   = useState('');
  const [streamUrl, setStreamUrl] = useState(null);
  const [imgError, setImgError]   = useState(false);

  const handleConnect = () => {
    if (!inputUrl.trim()) return;
    setImgError(false);
    setStreamUrl(inputUrl.trim());
  };
  const handleDisconnect = () => {
    setStreamUrl(null);
    setImgError(false);
  };

  return (
    <>
      {/* URL input row */}
      <div style={{ display: 'flex', gap: '0.5rem' }}>
        <input
          id="camera-url-input"
          type="text"
          value={inputUrl}
          onChange={(e) => setInputUrl(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleConnect()}
          placeholder="http://192.168.1.100:8080/video"
          style={inputStyle}
          onFocus={(e) => (e.target.style.borderColor = 'rgba(59,130,246,0.5)')}
          onBlur={(e)  => (e.target.style.borderColor = 'rgba(99,179,237,0.15)')}
        />
        {streamUrl ? (
          <button id="camera-disconnect-btn" className="btn btn-danger" onClick={handleDisconnect}>
            <WifiOff size={14} /> Disconnect
          </button>
        ) : (
          <button id="camera-connect-btn" className="btn btn-primary" onClick={handleConnect}>
            <Wifi size={14} /> Connect
          </button>
        )}
      </div>

      {/* Viewport */}
      <Viewport live={streamUrl && !imgError}>
        {streamUrl && !imgError && (
          <img
            id="camera-stream-img"
            src={streamUrl}
            alt="IP camera live feed"
            onError={() => setImgError(true)}
            style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
          />
        )}
        {imgError && (
          <StreamError
            message="Check the URL or camera app connection."
            onRetry={() => { setImgError(false); setStreamUrl(null); }}
          />
        )}
        {!streamUrl && (
          <IdleOverlay hint="Enter an MJPEG stream URL above and click Connect." />
        )}
      </Viewport>
    </>
  );
}

// ── Mode B: Local USB / Lightning Camera ───────────────────────────────────

function LocalCameraMode() {
  const [deviceIndex, setDeviceIndex] = useState(0);
  const [cameras, setCameras]         = useState([]);   // [{index, width, height}]
  const [scanning, setScanning]       = useState(false);
  const [streaming, setStreaming]     = useState(false);
  const [frameData, setFrameData]     = useState(null); // base64 JPEG string
  const [error, setError]             = useState(null);

  const wsRef = useRef(null);

  // ── Scan available DirectShow devices via backend REST ─────────────────
  const scanCameras = useCallback(async () => {
    setScanning(true);
    setError(null);
    try {
      const res  = await fetch(API_CAMERAS);
      const data = await res.json();
      const list = data.cameras ?? [];
      setCameras(list);
      if (list.length > 0) setDeviceIndex(list[0].index);
    } catch {
      setError('Could not reach backend. Is the FastAPI server running on :8000?');
    } finally {
      setScanning(false);
    }
  }, []);

  // ── Open WebSocket to /ws/camera-stream?device=N ──────────────────────
  const startStream = useCallback(() => {
    if (wsRef.current) wsRef.current.close();
    setError(null);
    setFrameData(null);

    const ws = new WebSocket(`${WS_CAMERA_BASE}?device=${deviceIndex}`);
    wsRef.current = ws;

    ws.onopen  = () => setStreaming(true);
    ws.onerror = () => setError('WebSocket connection failed. Check the backend server.');
    ws.onclose = () => setStreaming(false);

    ws.onmessage = (evt) => {
      try {
        const msg = JSON.parse(evt.data);
        if (msg.kind === 'frame') {
          // Replace the displayed frame — the browser reuses the same <img> node
          setFrameData(msg.data);
        } else if (msg.kind === 'error') {
          setError(msg.message);
          ws.close();
        }
      } catch { /* ignore malformed messages */ }
    };
  }, [deviceIndex]);

  const stopStream = useCallback(() => {
    wsRef.current?.close();
    setFrameData(null);
    setStreaming(false);
  }, []);

  // Close WS on unmount
  useEffect(() => () => wsRef.current?.close(), []);

  return (
    <>
      {/* Device selector + controls row */}
      <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>

        {/* Device dropdown */}
        <div style={{ position: 'relative', flex: 1, minWidth: 0 }}>
          <select
            id="camera-device-select"
            value={deviceIndex}
            onChange={(e) => setDeviceIndex(Number(e.target.value))}
            style={{ ...inputStyle, paddingRight: '2rem', appearance: 'none', cursor: 'pointer' }}
          >
            {cameras.length === 0 ? (
              <option value={0}>Device 0 (default — click Scan first)</option>
            ) : (
              cameras.map((c) => (
                <option key={c.index} value={c.index}>
                  Device {c.index} — {c.width}×{c.height}
                </option>
              ))
            )}
          </select>
          <ChevronDown
            size={14}
            style={{
              position: 'absolute', right: 10, top: '50%',
              transform: 'translateY(-50%)',
              color: '#64748b', pointerEvents: 'none',
            }}
          />
        </div>

        {/* Scan button */}
        <button
          id="camera-scan-btn"
          className="btn"
          onClick={scanCameras}
          disabled={scanning}
          style={{
            background: 'rgba(255,255,255,0.05)',
            border:     '1px solid rgba(255,255,255,0.1)',
            color:      '#94a3b8',
          }}
        >
          <RefreshCcw
            size={14}
            style={scanning ? { animation: 'spin 1s linear infinite' } : {}}
          />
          {scanning ? 'Scanning…' : 'Scan'}
        </button>

        {/* Stream toggle */}
        {streaming ? (
          <button id="camera-stop-btn" className="btn btn-danger" onClick={stopStream}>
            <WifiOff size={14} /> Stop
          </button>
        ) : (
          <button id="camera-start-btn" className="btn btn-primary" onClick={startStream}>
            <Usb size={14} /> Stream
          </button>
        )}
      </div>

      {/* Setup hint */}
      {!streaming && (
        <p style={{ fontSize: '0.7rem', color: '#475569', lineHeight: 1.5 }}>
          💡 iPhone via Lightning?&nbsp;
          <strong style={{ color: '#60a5fa' }}>① </strong>
          Install{' '}
          <a href="https://iriun.com" target="_blank" rel="noreferrer" style={{ color: '#60a5fa' }}>
            Iriun Webcam for Windows
          </a>{' '}
          on your PC,{' '}
          <strong style={{ color: '#60a5fa' }}>② </strong>
          install the <strong style={{ color: '#60a5fa' }}>Iriun Webcam</strong> app on your iPhone, connect via Lightning cable and open the app. Then click <em>Scan</em> to auto-detect the device.
        </p>
      )}

      {/* Viewport */}
      <Viewport live={streaming && !!frameData}>
        {/* Live frame rendered as data URI — backend pushes base64 JPEG via WS */}
        {streaming && frameData && (
          <img
            id="camera-local-stream-img"
            src={`data:image/jpeg;base64,${frameData}`}
            alt="Local USB camera live feed"
            style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
          />
        )}

        {/* Connecting spinner */}
        {streaming && !frameData && !error && (
          <div style={{ textAlign: 'center', color: '#64748b' }}>
            <RefreshCcw
              size={28}
              style={{ margin: '0 auto 0.5rem', opacity: 0.6, animation: 'spin 1s linear infinite' }}
            />
            <p style={{ fontSize: '0.8rem' }}>Connecting to device {deviceIndex}…</p>
          </div>
        )}

        {/* Error state */}
        {error && (
          <StreamError
            message={error}
            onRetry={() => { setError(null); startStream(); }}
          />
        )}

        {/* Idle state */}
        {!streaming && !error && (
          <IdleOverlay
            hint="Select a device and click Stream."
            icon={<Usb size={48} style={{ margin: '0 auto 0.75rem', opacity: 0.35 }} />}
          />
        )}
      </Viewport>
    </>
  );
}

// ── Mode C: Browser Camera + TensorFlow.js Traffic Sign Detection ────────

const CONFIDENCE_THRESHOLD = 0.5;
const DETECTION_INTERVAL = 150;
const SPEED_THRESHOLD = 15;
const MIN_FRAMES_FOR_STOP = 8;
const COOLDOWN_MS = 3000;
const STOP_SIGN_HOLD_MS = 500;
const STOP_SPEED_THRESHOLD = 10;
const STOP_SMOOTH_WINDOW = 2;

const TM_MODEL_URL = '/traffic-light-model/model.json';
const TM_LABELS = ['off', 'red', 'green', 'yellow', 'switch'];
const TM_IMAGE_SIZE = 224;
const TM_CONFIDENCE = 0.40;
const MIN_RED_FRAMES = 5;
const RED_BRIGHT_THRESHOLD = 150;
const RED_DOMINANCE = 40;
const RED_PIXEL_RATIO = 0.005;

function isRedLightOn(video, canvas) {
  const sample = document.createElement('canvas');
  const sw = 160, sh = 120;
  sample.width = sw;
  sample.height = sh;
  const sctx = sample.getContext('2d');
  sctx.drawImage(video, 0, 0, sw, sh);
  const data = sctx.getImageData(0, 0, sw, sh).data;
  let brightRed = 0;
  const total = sw * sh;
  for (let i = 0; i < data.length; i += 4) {
    const r = data[i], g = data[i + 1], b = data[i + 2];
    if (r > RED_BRIGHT_THRESHOLD && r - g > RED_DOMINANCE && r - b > RED_DOMINANCE) {
      brightRed++;
    }
  }
  const ratio = brightRed / total;
  return ratio >= RED_PIXEL_RATIO;
}

function BrowserCameraMode({ onDetection }) {
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const modelRef = useRef(null);
  const tmModelRef = useRef(null);
  const stopTrackingRef = useRef(null);
  const redLightTrackingRef = useRef(null);
  const lastRedViolationRef = useRef(0);
  const lastStopViolationRef = useRef(0);
  const intervalRef = useRef(null);
  const streamRef = useRef(null);
  const tmDisplayRef = useRef(null);

  const [status, setStatus] = useState('loading model...');
  const [cameras, setCameras] = useState([]);
  const [selectedCamera, setSelectedCamera] = useState('');
  const [modelReady, setModelReady] = useState(false);
  const [detecting, setDetecting] = useState(false);
  const [redLightActive, setRedLightActive] = useState(false);
  const [stopViolationActive, setStopViolationActive] = useState(false);

  // ── Red light violation — banner only on actual violation ───────────────
  const addRedLightViolation = useCallback((avgSpeed, framesVisible) => {
    const now = Date.now();
    if (now - lastRedViolationRef.current < COOLDOWN_MS) return;
    lastRedViolationRef.current = now;

    // Show warning banner only when violation is confirmed; auto-hide after 3s
    setRedLightActive(true);
    setTimeout(() => setRedLightActive(false), 3000);

    if (onDetection) {
      onDetection({
        type: 'critical',
        message: `🚨 Red Light Violation — vehicle passed at ${Math.round(avgSpeed)}px/f avg speed (${framesVisible} frames visible, needed ${MIN_FRAMES_FOR_STOP}+ to count as stopped)`,
        scoreChange: -10,
      });
    }
  }, [onDetection]);

  const addStopSignViolation = useCallback((avgSpeed, framesVisible) => {
    const now = Date.now();
    if (now - lastStopViolationRef.current < COOLDOWN_MS) return;
    lastStopViolationRef.current = now;

    setStopViolationActive(true);
    setTimeout(() => setStopViolationActive(false), 3000);

    if (onDetection) {
      onDetection({
        type: 'critical',
        message: `🛑 Stop Sign Violation — vehicle did not stop for the required ${STOP_SIGN_HOLD_MS / 1000}s (avg speed ${Math.round(avgSpeed)}px/f, ${framesVisible} frames visible)`,
        scoreChange: -10,
      });
    }
  }, [onDetection]);


  const evaluateStopSignTracking = useCallback((track) => {
    if (track.stopFulfilled) return;
    if (track.positions.length < 2) return;
    let totalDisplacement = 0;
    for (let i = 1; i < track.positions.length; i++) {
      const dx = track.positions[i].x - track.positions[i - 1].x;
      const dy = track.positions[i].y - track.positions[i - 1].y;
      totalDisplacement += Math.sqrt(dx * dx + dy * dy);
    }
    const avgSpeed = totalDisplacement / (track.positions.length - 1);
    addStopSignViolation(avgSpeed, track.framesVisible);
  }, [addStopSignViolation]);

  useEffect(() => {
    let cancelled = false;
    async function loadModels() {
      try {
        setStatus('loading models...');
        const tf = await import('@tensorflow/tfjs');
        await tf.ready();
        window.__tfjs = tf;

        const cocoSsd = await import('@tensorflow-models/coco-ssd');
        const cocoModel = await cocoSsd.load();
        if (cancelled) return;
        modelRef.current = cocoModel;

        const tmModel = await tf.loadLayersModel(TM_MODEL_URL);
        if (cancelled) return;
        tmModelRef.current = tmModel;
        setModelReady(true);
        setStatus('models ready — select a camera');
      } catch (err) {
        console.error('Model load error:', err);
        setStatus('failed to load models');
      }
    }
    loadModels();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    async function enumerateCameras() {
      try {
        const tempStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
        tempStream.getTracks().forEach((t) => t.stop());
        const devices = await navigator.mediaDevices.enumerateDevices();
        const videoDevices = devices
          .filter((d) => d.kind === 'videoinput')
          .map((d) => ({ deviceId: d.deviceId, label: d.label || `Camera ${d.deviceId.slice(0, 8)}` }));
        setCameras(videoDevices);
        const iphone = videoDevices.find((d) => d.label.toLowerCase().includes('iphone'));
        if (iphone && !selectedCamera) {
          setSelectedCamera(iphone.deviceId);
        }
      } catch {
        setStatus('camera permission denied');
      }
    }
    enumerateCameras();
    const handler = () => enumerateCameras();
    navigator.mediaDevices.addEventListener('devicechange', handler);
    return () => navigator.mediaDevices.removeEventListener('devicechange', handler);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!selectedCamera || !modelReady) return;
    let cancelled = false;

    async function startCamera() {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop());
      }
      if (intervalRef.current) clearInterval(intervalRef.current);
      stopTrackingRef.current = null;
      redLightTrackingRef.current = null;

      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { deviceId: { exact: selectedCamera }, width: { ideal: 640 }, height: { ideal: 480 } },
          audio: false,
        });
        if (cancelled) { stream.getTracks().forEach((t) => t.stop()); return; }
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play();
        }
        setStatus('detecting');
        setDetecting(true);
        intervalRef.current = setInterval(detect, DETECTION_INTERVAL);
      } catch {
        setStatus('failed to start camera');
      }
    }

    function detect() {
      const video = videoRef.current;
      const canvas = canvasRef.current;
      const cocoModel = modelRef.current;
      const tmModel = tmModelRef.current;
      if (!video || !canvas || !cocoModel || !tmModel || video.readyState < 2) return;

      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      // ── Draw last TM result (persisted in ref so it survives clearRect) ──
      const tmDraw = tmDisplayRef.current;
      if (tmDraw) {
        const boxW = 200, boxH = 36, boxX = canvas.width - boxW - 10, boxY = 10;
        ctx.fillStyle = 'rgba(0,0,0,0.6)';
        ctx.beginPath();
        ctx.roundRect(boxX, boxY, boxW, boxH, 6);
        ctx.fill();
        ctx.strokeStyle = tmDraw.color;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.roundRect(boxX, boxY, boxW, boxH, 6);
        ctx.stroke();
        ctx.fillStyle = tmDraw.color;
        ctx.beginPath();
        ctx.arc(boxX + 16, boxY + boxH / 2, 6, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#fff';
        ctx.font = 'bold 13px monospace';
        ctx.fillText(tmDraw.label, boxX + 28, boxY + boxH / 2 + 4);
      }

      const tf = window.__tfjs;
      if (!tf) return;

      // ── Traffic light detection (custom Teachable Machine model) ────
      const tmResult = tf.tidy(() => {
        const img = tf.browser.fromPixels(video)
          .resizeBilinear([TM_IMAGE_SIZE, TM_IMAGE_SIZE])
          .toFloat()
          .div(127.5)
          .sub(1)
          .expandDims(0);
        return tmModel.predict(img);
      });

      tmResult.data().then((probabilities) => {
        tmResult.dispose();
        if (cancelled) return;

        let maxIdx = 0;
        for (let i = 1; i < probabilities.length; i++) {
          if (probabilities[i] > probabilities[maxIdx]) maxIdx = i;
        }
        const confidence = probabilities[maxIdx];
        const detected = TM_LABELS[maxIdx];

        if (confidence >= TM_CONFIDENCE && detected !== 'switch') {
          const colorMap = { red: '#ef4444', yellow: '#eab308', green: '#22c55e', off: '#64748b' };

          if (detected === 'red') {
            const redConfirmed = isRedLightOn(video, canvas);
            console.log('TM: red', (confidence * 100).toFixed(1) + '%', 'LED on:', redConfirmed);

            if (redConfirmed) {
              const pct = Math.round(confidence * 100);
              tmDisplayRef.current = { color: colorMap.red, label: `RED ${pct}%` };
              if (!redLightTrackingRef.current) {
                redLightTrackingRef.current = { framesVisible: 0, violated: false };
              }
              redLightTrackingRef.current.framesVisible++;
              if (!redLightTrackingRef.current.violated && redLightTrackingRef.current.framesVisible >= MIN_RED_FRAMES) {
                redLightTrackingRef.current.violated = true;
                addRedLightViolation(0, redLightTrackingRef.current.framesVisible);
              }
            } else {
              tmDisplayRef.current = { color: colorMap.off, label: 'TRAFFIC LIGHT' };
              redLightTrackingRef.current = null;
            }
          } else {
            const color = colorMap[detected] || '#64748b';
            const pct = Math.round(confidence * 100);
            const label = detected === 'off' ? 'TRAFFIC LIGHT' : `${detected.toUpperCase()} ${pct}%`;
            tmDisplayRef.current = { color, label };
            redLightTrackingRef.current = null;
          }
        } else {
          tmDisplayRef.current = null;
          redLightTrackingRef.current = null;
        }
      });

      // ── Stop sign detection (COCO-SSD) ──────────────────────────────
      cocoModel.detect(video).then((predictions) => {
        if (cancelled) return;
        const stopSign = predictions.find(
          (p) => p.class === 'stop sign' && p.score >= CONFIDENCE_THRESHOLD
        );

        if (stopSign) {
          const [sx, sy, sw, sh] = stopSign.bbox;
          const scx = sx + sw / 2;
          const scy = sy + sh / 2;
          const now = Date.now();

          if (!stopTrackingRef.current) {
            stopTrackingRef.current = {
              positions: [], timestamps: [], framesVisible: 0,
              stopStartedAt: null, stopFulfilled: false,
            };
          }
          const track = stopTrackingRef.current;
          track.positions.push({ x: scx, y: scy });
          track.timestamps.push(now);
          track.framesVisible++;

          let currentSpeed = 0;
          if (track.positions.length >= 2) {
            const prev = track.positions[track.positions.length - 2];
            const curr = track.positions[track.positions.length - 1];
            const dx = curr.x - prev.x;
            const dy = curr.y - prev.y;
            currentSpeed = Math.sqrt(dx * dx + dy * dy);
          }

          if (!track.stopFulfilled) {
            let smoothedSpeed = currentSpeed;
            const pos = track.positions;
            if (pos.length >= STOP_SMOOTH_WINDOW + 1) {
              let total = 0;
              for (let j = pos.length - STOP_SMOOTH_WINDOW; j < pos.length; j++) {
                const ddx = pos[j].x - pos[j - 1].x;
                const ddy = pos[j].y - pos[j - 1].y;
                total += Math.sqrt(ddx * ddx + ddy * ddy);
              }
              smoothedSpeed = total / STOP_SMOOTH_WINDOW;
            }

            if (smoothedSpeed <= STOP_SPEED_THRESHOLD) {
              if (track.stopStartedAt === null) track.stopStartedAt = now;
              if (now - track.stopStartedAt >= STOP_SIGN_HOLD_MS) {
                track.stopFulfilled = true;
              }
            } else {
              track.stopStartedAt = null;
            }
          }

          const stopColor = track.stopFulfilled ? '#22c55e' : currentSpeed > SPEED_THRESHOLD ? '#ef4444' : '#eab308';
          ctx.strokeStyle = stopColor;
          ctx.lineWidth = 3;
          ctx.strokeRect(sx, sy, sw, sh);
          ctx.fillStyle = stopColor;
          ctx.font = 'bold 14px monospace';
          const stopLabel = track.stopFulfilled
            ? `STOP ✓ ${Math.round(stopSign.score * 100)}%`
            : `STOP ${Math.round(stopSign.score * 100)}% | ${Math.round(currentSpeed)}px/f`;
          ctx.fillText(stopLabel, sx, sy > 20 ? sy - 6 : sy + sh + 16);
        } else {
          if (stopTrackingRef.current) {
            evaluateStopSignTracking(stopTrackingRef.current);
            stopTrackingRef.current = null;
          }
        }

      });
    }

    startCamera();
    return () => {
      cancelled = true;
      if (intervalRef.current) clearInterval(intervalRef.current);
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop());
        streamRef.current = null;
      }
      setDetecting(false);
      setRedLightActive(false);
      setStopViolationActive(false);
    };
  }, [selectedCamera, modelReady, evaluateStopSignTracking, addRedLightViolation, onDetection]);

  return (
    <>
      <div style={{ display: 'flex', gap: '0.5rem' }}>
        <div style={{ position: 'relative', flex: 1, minWidth: 0 }}>
          <select
            value={selectedCamera}
            onChange={(e) => setSelectedCamera(e.target.value)}
            style={{ ...inputStyle, paddingRight: '2rem', appearance: 'none', cursor: 'pointer' }}
          >
            <option value="">select camera...</option>
            {cameras.map((c) => (
              <option key={c.deviceId} value={c.deviceId}>{c.label}</option>
            ))}
          </select>
          <ChevronDown
            size={14}
            style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', color: '#64748b', pointerEvents: 'none' }}
          />
        </div>
        <span
          style={{
            display: 'flex', alignItems: 'center', gap: '0.4rem',
            padding: '4px 12px', borderRadius: '999px', fontSize: '0.7rem', fontWeight: 600,
            background: modelReady ? 'rgba(34,197,94,0.12)' : 'rgba(234,179,8,0.12)',
            border: `1px solid ${modelReady ? 'rgba(34,197,94,0.3)' : 'rgba(234,179,8,0.3)'}`,
            color: modelReady ? '#86efac' : '#fde68a',
          }}
        >
          {status}
        </span>
      </div>

      <Viewport live={detecting}>
        <video
          ref={videoRef}
          playsInline
          muted
          style={{
            width: '100%', height: '100%', objectFit: 'cover', display: 'block',
            visibility: detecting ? 'visible' : 'hidden',
          }}
        />
        <canvas
          ref={canvasRef}
          style={{
            position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover',
            pointerEvents: 'none',
          }}
        />

        {/* ── Violation Banners — top-center, pulse while active ── */}
        {(redLightActive || stopViolationActive) && (
          <div
            style={{
              position:      'absolute',
              top:           14,
              left:          '50%',
              transform:     'translateX(-50%)',
              zIndex:        20,
              background:    'rgba(220,38,38,0.92)',
              border:        '1px solid rgba(255,255,255,0.2)',
              borderRadius:  '6px',
              padding:       '6px 16px',
              display:       'flex',
              alignItems:    'center',
              gap:           '6px',
              boxShadow:     '0 4px 16px rgba(0,0,0,0.4)',
              animation:     'pulse 0.9s ease-in-out infinite',
              whiteSpace:    'nowrap',
              pointerEvents: 'none',
            }}
          >
            <span style={{ fontSize: '0.8rem', fontWeight: 700, color: 'white', letterSpacing: '0.04em' }}>
              {redLightActive ? 'RED LIGHT VIOLATION' : 'STOP SIGN VIOLATION'}
            </span>
          </div>
        )}

        {!selectedCamera && !detecting && (
          <IdleOverlay
            hint="Select a browser camera above. TF.js will detect traffic lights and stop signs in real time."
            icon={<Monitor size={48} style={{ margin: '0 auto 0.75rem', opacity: 0.35 }} />}
          />
        )}
      </Viewport>
    </>
  );
}

// ── Root component — Browser Detect only ──────────────────────────────────

export default function CameraFeed({ onDetection }) {
  return (
    <div
      className="card"
      style={{ padding: '1rem', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}
    >
      <BrowserCameraMode onDetection={onDetection} />
    </div>
  );
}
