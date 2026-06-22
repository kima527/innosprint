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
import { Camera, Wifi, WifiOff, RefreshCcw, Usb, ChevronDown } from 'lucide-react';

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
        {mode === 'ip' ? '📡 IP STREAM' : '🔌 USB / LIGHTNING'}
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
          <a href="https://iriun.com" target="_blank" rel="noreferrer" style={{ color: '#60a5fa' }}>
            Iriun Webcam for Windows
          </a>{' '}
          를 PC에 설치하고,{' '}
          <strong style={{ color: '#60a5fa' }}>② </strong>
          iPhone에 <strong style={{ color: '#60a5fa' }}>Iriun Webcam</strong> 앱을 설치한 뒤,{' '}
          Lightning 케이블로 연결하고 앱을 실행하세요. 그 다음 <em>Scan</em>을 클릭하면 장치가 자동으로 감지됩니다.
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

// ── Root component — mode tab switcher ────────────────────────────────────

const MODES = [
  { id: 'ip',    label: '📡 IP Camera'      },
  { id: 'local', label: '🔌 Lightning / USB' },
];

export default function CameraFeed() {
  const [mode, setMode] = useState('ip');

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>

      {/* Tab bar */}
      <div
        className="card"
        style={{ padding: '0.35rem', display: 'flex', gap: '0.25rem' }}
      >
        {MODES.map(({ id, label }) => (
          <button
            key={id}
            id={`camera-mode-${id}`}
            onClick={() => setMode(id)}
            style={{
              flex:         1,
              padding:      '0.45rem 0.75rem',
              borderRadius: '0.5rem',
              border:       'none',
              cursor:       'pointer',
              fontWeight:   600,
              fontSize:     '0.75rem',
              transition:   'all 0.2s',
              background:   mode === id
                ? 'linear-gradient(135deg, #2563eb, #4f46e5)'
                : 'transparent',
              color:        mode === id ? 'white' : '#64748b',
              boxShadow:    mode === id ? '0 0 14px rgba(59,130,246,0.3)' : 'none',
            }}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Active mode controls + viewport */}
      <div
        className="card"
        style={{ padding: '1rem', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}
      >
        {mode === 'ip' ? <IpCameraMode /> : <LocalCameraMode />}
      </div>
    </div>
  );
}
