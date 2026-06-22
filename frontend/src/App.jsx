// ============================================================================
//  App.jsx — P2P Car-Sharing Real-Time Driving Analysis
// ============================================================================
//
//  State                  Source
//  ─────────────────────────────────────────────────────────────────────────
//  trustScore (number)    Starts at 100; decremented by WS scoreChange events
//  eventLogs  (array)     Prepended on every incoming WS message
//  wsConnection (bool)    Connected flag from useWebSocket hook
//
//  Layout (two columns):
//   ┌───────────────────────┬────────────────────────────────┐
//   │  Left — Camera Feed   │  Right — Trust Score + Events  │
//   └───────────────────────┴────────────────────────────────┘
// ============================================================================

import { useEffect, useState, useCallback } from 'react';
import { ShieldCheck, Activity, RotateCcw } from 'lucide-react';

import { useWebSocket }      from './hooks/useWebSocket';
import TrustScore            from './components/TrustScore';
import EventLog              from './components/EventLog';
import CameraFeed            from './components/CameraFeed';
import ConnectionStatus      from './components/ConnectionStatus';

// Initial trust score — change this constant to adjust the starting value
const INITIAL_TRUST_SCORE = 100;
const SCORE_FLOOR         = 0;   // score can never go below this
const SCORE_CEILING       = 100; // score can never exceed this

export default function App() {
  // ── State ──────────────────────────────────────────────────────────────
  const [trustScore, setTrustScore] = useState(INITIAL_TRUST_SCORE);
  const [eventLogs,  setEventLogs]  = useState([]);

  // WebSocket hook — connects automatically and auto-reconnects
  const { messages, connected, reconnectCount } = useWebSocket();

  // ── Process incoming WS messages ───────────────────────────────────────
  useEffect(() => {
    if (messages.length === 0) return;

    // The hook always prepends, so messages[0] is the newest
    const latest = messages[0];

    // Only update state if there is a meaningful score change
    if (typeof latest.scoreChange === 'number' && latest.scoreChange !== 0) {
      setTrustScore((prev) =>
        Math.min(SCORE_CEILING, Math.max(SCORE_FLOOR, prev + latest.scoreChange))
      );
    }

    // Sync full message array into eventLogs (already newest-first)
    setEventLogs(messages);
  }, [messages]);

  // ── Handle detections from browser camera (TF.js) ─────────────────────
  const handleDetection = useCallback((event) => {
    const enriched = {
      ...event,
      timestamp: new Date().toISOString(),
    };

    if (typeof event.scoreChange === 'number' && event.scoreChange !== 0) {
      setTrustScore((prev) =>
        Math.min(SCORE_CEILING, Math.max(SCORE_FLOOR, prev + event.scoreChange))
      );
    }

    setEventLogs((prev) => [enriched, ...prev].slice(0, 100));
  }, []);

  // ── Reset handler ──────────────────────────────────────────────────────
  const handleReset = () => {
    setTrustScore(INITIAL_TRUST_SCORE);
    setEventLogs([]);
  };

  // ── Derived values ─────────────────────────────────────────────────────
  const criticalCount = eventLogs.filter((e) => e.type === 'critical').length;
  const warningCount  = eventLogs.filter((e) => e.type === 'warning').length;

  // ── Render ─────────────────────────────────────────────────────────────
  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>

      {/* ═══════════════════════════════════════════════════════════════
          Header
      ═══════════════════════════════════════════════════════════════ */}
      <header
        style={{
          borderBottom:    '1px solid var(--clr-border)',
          padding:         '0.9rem 2rem',
          display:         'flex',
          alignItems:      'center',
          justifyContent:  'space-between',
          background:      'rgba(15,23,36,0.8)',
          backdropFilter:  'blur(12px)',
          position:        'sticky',
          top:             0,
          zIndex:          50,
        }}
      >
        {/* Brand */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <div
            style={{
              width:        36,
              height:       36,
              borderRadius: '10px',
              background:   'linear-gradient(135deg, #2563eb, #4f46e5)',
              display:      'flex',
              alignItems:   'center',
              justifyContent:'center',
              boxShadow:    '0 0 16px rgba(59,130,246,0.4)',
            }}
          >
            <ShieldCheck size={20} color="white" />
          </div>
          <div>
            <h1
              className="gradient-text"
              style={{ fontSize: '1.1rem', fontWeight: 800, lineHeight: 1.2 }}
            >
              DriveSafe AI
            </h1>
            <p style={{ fontSize: '0.65rem', color: '#475569', letterSpacing: '0.06em' }}>
              P2P REAL-TIME DRIVING ANALYSIS
            </p>
          </div>
        </div>

        {/* Right side — status + reset */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <ConnectionStatus connected={connected} reconnectCount={reconnectCount} />
          <button
            id="reset-session-btn"
            className="btn"
            title="Reset session score and logs"
            onClick={handleReset}
            style={{
              padding:     '5px 12px',
              background:  'rgba(255,255,255,0.05)',
              border:      '1px solid rgba(255,255,255,0.08)',
              color:       '#94a3b8',
              borderRadius:'0.5rem',
            }}
          >
            <RotateCcw size={14} />
            Reset
          </button>
        </div>
      </header>

      {/* ═══════════════════════════════════════════════════════════════
          Main content — two-column layout
      ═══════════════════════════════════════════════════════════════ */}
      <main
        style={{
          flex:    1,
          padding: '1.5rem 2rem',
          display: 'grid',
          gridTemplateColumns: '1fr 380px',
          gap:     '1.5rem',
          maxWidth:'1400px',
          margin:  '0 auto',
          width:   '100%',
        }}
      >

        {/* ── LEFT COLUMN — Camera feed ─────────────────────────────── */}
        <section aria-label="Camera feed">
          <div style={{ marginBottom: '0.75rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <Activity size={15} color="#60a5fa" />
            <h2 style={{ fontSize: '0.75rem', fontWeight: 700, letterSpacing: '0.1em', color: '#64748b', textTransform: 'uppercase' }}>
              Camera Feed
            </h2>
          </div>
          <CameraFeed onDetection={handleDetection} />
        </section>

        {/* ── RIGHT COLUMN — Dashboard ──────────────────────────────── */}
        <aside aria-label="Driving dashboard" style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>

          {/* Trust Score card */}
          <div className="card" style={{ padding: '1.75rem', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1.25rem' }}>
            <TrustScore score={trustScore} />

            {/* Mini stats row */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem', width: '100%' }}>
              {[
                { label: 'Violations', value: criticalCount, colour: '#f87171' },
                { label: 'Warnings',   value: warningCount,  colour: '#fde047' },
              ].map(({ label, value, colour }) => (
                <div
                  key={label}
                  style={{
                    background:    'rgba(255,255,255,0.03)',
                    border:        '1px solid rgba(255,255,255,0.06)',
                    borderRadius:  '0.6rem',
                    padding:       '0.75rem',
                    textAlign:     'center',
                  }}
                >
                  <p style={{ fontSize: '1.5rem', fontWeight: 800, color: colour, lineHeight: 1 }}>{value}</p>
                  <p style={{ fontSize: '0.65rem', color: '#64748b', marginTop: '0.3rem', textTransform: 'uppercase', letterSpacing: '0.07em' }}>
                    {label}
                  </p>
                </div>
              ))}
            </div>
          </div>

          {/* Event log card */}
          <div className="card" style={{ padding: '1.25rem', flex: 1 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.9rem' }}>
              <h2 style={{ fontSize: '0.7rem', fontWeight: 700, letterSpacing: '0.1em', color: '#64748b', textTransform: 'uppercase' }}>
                Detection Log
              </h2>
              <span
                style={{
                  fontSize:   '0.65rem',
                  fontWeight: 600,
                  color:      '#475569',
                  background: 'rgba(255,255,255,0.04)',
                  border:     '1px solid rgba(255,255,255,0.06)',
                  borderRadius:'4px',
                  padding:    '2px 7px',
                }}
              >
                {eventLogs.length} event{eventLogs.length !== 1 ? 's' : ''}
              </span>
            </div>

            <EventLog events={eventLogs} />
          </div>

        </aside>
      </main>

      {/* ═══════════════════════════════════════════════════════════════
          Footer
      ═══════════════════════════════════════════════════════════════ */}
      <footer
        style={{
          borderTop:  '1px solid var(--clr-border)',
          padding:    '0.6rem 2rem',
          display:    'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}
      >
        <p style={{ fontSize: '0.65rem', color: '#334155' }}>
          © 2026 DriveSafe AI — Powered by YOLOv8 + FastAPI
        </p>
        <p style={{ fontSize: '0.65rem', color: '#334155', fontFamily: 'var(--font-mono)' }}>
          WS: ws://localhost:8000/ws/driving-analysis
        </p>
      </footer>
    </div>
  );
}
