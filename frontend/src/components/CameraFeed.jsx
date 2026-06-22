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

function Viewport({ live, mode, children }) {
  return (
    <div
      className="card scanlines"
      style={{
        position:       'relative',
        aspectRatio:    '16 / 9',
        overflow:       'hidden',
        display:        'flex',
        alignItems:     'center',
        justifyContent: 'center',
      }}
    >
      {/* Corner bracket decorations */}
      {['top-left', 'top-right', 'bottom-left', 'bottom-right'].map((pos) => {
        const [v, h] = pos.split('-');
        return (
          <div
            key={pos}
            style={{
              position:    'absolute',
              [v]: 12, [h]: 12,
              width: 20, height: 20,
              borderTop:    v === 'top'    ? '2px solid rgba(59,130,246,0.6)' : 'none',
              borderBottom: v === 'bottom' ? '2px solid rgba(59,130,246,0.6)' : 'none',
              borderLeft:   h === 'left'   ? '2px solid rgba(59,130,246,0.6)' : 'none',
              borderRight:  h === 'right'  ? '2px solid rgba(59,130,246,0.6)' : 'none',
              zIndex: 10,
            }}
          />
        );
      })}

      {/* LIVE badge */}
      {live && (
        <div
          style={{
            position:    'absolute',
            top: 14, left: 14,
            display:     'flex',
            alignItems:  'center',
            gap:         5,
            zIndex:      10,
            background:  'rgba(0,0,0,0.5)',
            borderRadius: 4,
            padding:     '3px 8px',
          }}
        >
          <span
            className="animate-pulse-glow"
            style={{ width: 7, height: 7, borderRadius: '50%', background: '#ef4444', display: 'block' }}
          />
          <span style={{ fontSize: '0.65rem', fontWeight: 700, color: '#f87171', letterSpacing: '0.1em' }}>
            LIVE
          </span>
        </div>
      )}

      {/* Source badge */}
      <div
        style={{
          position:     'absolute',
          bottom: 12, right: 12,
          zIndex:       10,
          background:   'rgba(0,0,0,0.45)',
          borderRadius: 4,
          padding:      '2px 7px',
          fontSize:     '0.6rem',
          color:        '#475569',
          letterSpacing:'0.06em',
        }}
      >
        {mode === 'ip' ? '📡 IP STREAM' : mode === 'local' ? '🔌 USB / LIGHTNING' : '🎯 TF.js DETECT'}
      </div>

      {children}
    </div>
  );
}

function IdleOverlay({ hint, icon }) {
  return (
    <div style={{ textAlign: 'center', color: '#475569' }}>
      {icon ?? <Camera size={48} style={{ margin: '0 auto 0.75rem', opacity: 0.4 }} />}
      <p style={{ fontSize: '0.85rem' }}>No camera connected</p>
      <p style={{ fontSize: '0.72rem', marginTop: '0.3rem', color: '#334155' }}>{hint}</p>
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
      <Viewport live={streamUrl && !imgError} mode="ip">
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
      <Viewport live={streaming && !!frameData} mode="local">
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
const STOP_SIGN_HOLD_MS = 3000;
const STOP_SPEED_THRESHOLD = 3;

function classifyLightColor(video, bbox) {
  const [x, y, w, h] = bbox;
  const sampleCanvas = document.createElement('canvas');
  sampleCanvas.width = w;
  sampleCanvas.height = h;
  const sCtx = sampleCanvas.getContext('2d');
  if (!sCtx) return 'unknown';
  sCtx.drawImage(video, x, y, w, h, 0, 0, w, h);

  const thirdH = Math.floor(h / 3);
  const regions = [
    { name: 'red',    yStart: 0,            yEnd: thirdH },
    { name: 'yellow', yStart: thirdH,       yEnd: thirdH * 2 },
    { name: 'green',  yStart: thirdH * 2,   yEnd: h },
  ];

  let brightest = { name: 'unknown', brightness: 0, r: 0, g: 0, b: 0 };
  for (const region of regions) {
    const imgData = sCtx.getImageData(0, region.yStart, w, region.yEnd - region.yStart);
    const px = imgData.data;
    let totalR = 0, totalG = 0, totalB = 0, totalBrightness = 0;
    const pixelCount = px.length / 4;
    for (let i = 0; i < px.length; i += 4) {
      totalR += px[i];
      totalG += px[i + 1];
      totalB += px[i + 2];
      totalBrightness += px[i] * 0.299 + px[i + 1] * 0.587 + px[i + 2] * 0.114;
    }
    const avg = totalBrightness / pixelCount;
    if (avg > brightest.brightness) {
      brightest = {
        name: region.name, brightness: avg,
        r: totalR / pixelCount, g: totalG / pixelCount, b: totalB / pixelCount,
      };
    }
  }

  const { r, g, b, name } = brightest;
  if (name === 'red' && r > g * 1.2 && r > b * 1.2) return 'red';
  if (name === 'yellow' && r > b * 1.3 && g > b * 1.3) return 'yellow';
  if (name === 'green' && g > r * 0.8 && g > b) return 'green';

  if (r > g * 1.4 && r > b * 1.4) return 'red';
  if (g > r * 1.0 && g > b * 1.2) return 'green';
  if (r > b * 1.3 && g > b * 1.3 && r > 80) return 'yellow';

  return brightest.name;
}

function BrowserCameraMode({ onDetection }) {
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const modelRef = useRef(null);
  const stopTrackingRef = useRef(null);     // stop sign tracking
  const redLightTrackingRef = useRef(null); // red light tracking
  const lastRedViolationRef = useRef(0);
  const lastStopViolationRef = useRef(0);
  const intervalRef = useRef(null);
  const streamRef = useRef(null);

  const [status, setStatus] = useState('loading model...');
  const [cameras, setCameras] = useState([]);
  const [selectedCamera, setSelectedCamera] = useState('');
  const [modelReady, setModelReady] = useState(false);
  const [detecting, setDetecting] = useState(false);
  const [redLightActive, setRedLightActive] = useState(false); // for warning banner

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

  // ── Stop sign violation (logs only on actual violation) ───────────────
  const addStopSignViolation = useCallback((avgSpeed, framesVisible) => {
    const now = Date.now();
    if (now - lastStopViolationRef.current < COOLDOWN_MS) return;
    lastStopViolationRef.current = now;

    if (onDetection) {
      onDetection({
        type: 'critical',
        message: `🛑 Stop Sign Violation — vehicle did not stop for the required ${STOP_SIGN_HOLD_MS / 1000}s (avg speed ${Math.round(avgSpeed)}px/f, ${framesVisible} frames visible)`,
        scoreChange: -10,
      });
    }
  }, [onDetection]);

  const evaluateRedLightTracking = useCallback((track) => {
    if (track.positions.length < 2) return;
    let totalDisplacement = 0;
    for (let i = 1; i < track.positions.length; i++) {
      const dx = track.positions[i].x - track.positions[i - 1].x;
      const dy = track.positions[i].y - track.positions[i - 1].y;
      totalDisplacement += Math.sqrt(dx * dx + dy * dy);
    }
    const avgSpeed = totalDisplacement / (track.positions.length - 1);
    if (avgSpeed > SPEED_THRESHOLD && track.framesVisible < MIN_FRAMES_FOR_STOP) {
      addRedLightViolation(avgSpeed, track.framesVisible);
    }
  }, [addRedLightViolation]);

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
    async function loadModel() {
      try {
        const tf = await import('@tensorflow/tfjs');
        await tf.ready();
        const cocoSsd = await import('@tensorflow-models/coco-ssd');
        const model = await cocoSsd.load();
        if (cancelled) return;
        modelRef.current = model;
        setModelReady(true);
        setStatus('model ready — select a camera');
      } catch {
        setStatus('failed to load model');
      }
    }
    loadModel();
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
      const model = modelRef.current;
      if (!video || !canvas || !model || video.readyState < 2) return;

      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      model.detect(video).then((predictions) => {
        if (cancelled) return;

        // ── Traffic light detection ────────────────────────────────────
        const trafficLight = predictions.find(
          (p) => p.class === 'traffic light' && p.score >= CONFIDENCE_THRESHOLD
        );

        if (trafficLight) {
          const [x, y, w, h] = trafficLight.bbox;
          const lightColor = classifyLightColor(video, trafficLight.bbox);
          const cx = x + w / 2;
          const cy = y + h / 2;

          const colorMap = { red: '#ef4444', yellow: '#eab308', green: '#22c55e', unknown: '#64748b' };
          const boxColor = colorMap[lightColor] || '#64748b';

          ctx.strokeStyle = boxColor;
          ctx.lineWidth = 3;
          ctx.strokeRect(x, y, w, h);
          ctx.fillStyle = boxColor;
          ctx.font = 'bold 14px monospace';
          const label = `${lightColor.toUpperCase()} ${Math.round(trafficLight.score * 100)}%`;
          ctx.fillText(label, x, y > 20 ? y - 6 : y + h + 16);

          if (lightColor === 'red') {
            if (!redLightTrackingRef.current) {
              redLightTrackingRef.current = { positions: [], framesVisible: 0 };
            }
            const track = redLightTrackingRef.current;
            track.positions.push({ x: cx, y: cy });
            track.framesVisible++;
          } else {
            // green / yellow / unknown — no penalty, no log, no banner
            if (redLightTrackingRef.current) {
              evaluateRedLightTracking(redLightTrackingRef.current);
              redLightTrackingRef.current = null;
            }
          }
        } else {
          if (redLightTrackingRef.current) {
            evaluateRedLightTracking(redLightTrackingRef.current);
            redLightTrackingRef.current = null;
          }
        }

        // ── Stop sign detection ────────────────────────────────────────
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
            if (currentSpeed <= STOP_SPEED_THRESHOLD) {
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

        // ── Other detections (speeding, tailgating, phone use, etc.) ──
        // Commented out — only red light & stop sign violations are logged
        // const otherEvents = predictions.filter(p => !['traffic light','stop sign'].includes(p.class));
        // ... handle other events here if needed in the future
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
    };
  }, [selectedCamera, modelReady, evaluateRedLightTracking, evaluateStopSignTracking, onDetection]);

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

      <Viewport live={detecting} mode="browser">
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

        {/* ── Red Light Warning Banner — top-center, pulses while active ── */}
        {redLightActive && (
          <div
            style={{
              position:      'absolute',
              top:           14,
              left:          '50%',
              transform:     'translateX(-50%)',
              zIndex:        20,
              background:    'rgba(220,38,38,0.92)',
              border:        '2px solid #ef4444',
              borderRadius:  '8px',
              padding:       '6px 20px',
              display:       'flex',
              alignItems:    'center',
              gap:           '8px',
              boxShadow:     '0 0 24px rgba(239,68,68,0.7)',
              animation:     'pulse 0.9s ease-in-out infinite',
              whiteSpace:    'nowrap',
              pointerEvents: 'none',
            }}
          >
            <span style={{ fontSize: '1rem' }}>🔴</span>
            <span style={{ fontSize: '0.78rem', fontWeight: 800, color: 'white', letterSpacing: '0.06em' }}>
              RED LIGHT DETECTED
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
