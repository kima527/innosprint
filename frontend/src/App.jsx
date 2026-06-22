import { useEffect, useState, useCallback } from 'react';
import { ShieldCheck, RotateCcw } from 'lucide-react';

import { useWebSocket }      from './hooks/useWebSocket';
import TrustScore            from './components/TrustScore';
import EventLog              from './components/EventLog';
import CameraFeed            from './components/CameraFeed';
import ConnectionStatus      from './components/ConnectionStatus';

const INITIAL_TRUST_SCORE = 100;
const SCORE_FLOOR         = 0;
const SCORE_CEILING       = 100;

export default function App() {
  const [trustScore, setTrustScore] = useState(INITIAL_TRUST_SCORE);
  const [eventLogs,  setEventLogs]  = useState([]);

  const { messages, connected, reconnectCount } = useWebSocket();

  useEffect(() => {
    if (messages.length === 0) return;
    const latest = messages[0];
    if (typeof latest.scoreChange === 'number' && latest.scoreChange !== 0) {
      setTrustScore((prev) =>
        Math.min(SCORE_CEILING, Math.max(SCORE_FLOOR, prev + latest.scoreChange))
      );
    }
  }, [messages]);

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

  const handleReset = () => {
    setTrustScore(INITIAL_TRUST_SCORE);
    setEventLogs([]);
  };

  const criticalCount = eventLogs.filter((e) => e.type === 'critical').length;
  const warningCount  = eventLogs.filter((e) => e.type === 'warning').length;

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>

      <header
        style={{
          borderBottom:    '1px solid var(--clr-border)',
          padding:         '0.75rem 1.5rem',
          display:         'flex',
          alignItems:      'center',
          justifyContent:  'space-between',
          background:      'var(--clr-surface)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
          <ShieldCheck size={20} color="#3b82f6" />
          <div>
            <h1 style={{ fontSize: '0.95rem', fontWeight: 700, color: '#e2e8f0', lineHeight: 1.2 }}>
              DashCam
            </h1>
            <p style={{ fontSize: '0.6rem', color: '#64748b', letterSpacing: '0.05em' }}>
              Real-time driving analysis
            </p>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
          <ConnectionStatus connected={connected} reconnectCount={reconnectCount} />
          <button
            className="btn"
            onClick={handleReset}
            style={{
              padding:     '4px 10px',
              background:  'rgba(255,255,255,0.04)',
              border:      '1px solid var(--clr-border)',
              color:       '#94a3b8',
              fontSize:    '0.75rem',
            }}
          >
            <RotateCcw size={12} />
            Reset
          </button>
        </div>
      </header>

      <main
        style={{
          flex:    1,
          padding: '1.25rem 1.5rem',
          display: 'grid',
          gridTemplateColumns: '1fr 340px',
          gap:     '1.25rem',
          maxWidth:'1400px',
          margin:  '0 auto',
          width:   '100%',
        }}
      >

        <section>
          <CameraFeed onDetection={handleDetection} />
        </section>

        <aside style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>

          <div className="card" style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1rem' }}>
            <TrustScore score={trustScore} />

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem', width: '100%' }}>
              {[
                { label: 'Violations', value: criticalCount, colour: '#f87171' },
                { label: 'Warnings',   value: warningCount,  colour: '#fbbf24' },
              ].map(({ label, value, colour }) => (
                <div
                  key={label}
                  style={{
                    background:    'rgba(255,255,255,0.02)',
                    border:        '1px solid var(--clr-border)',
                    borderRadius:  '0.5rem',
                    padding:       '0.6rem',
                    textAlign:     'center',
                  }}
                >
                  <p style={{ fontSize: '1.25rem', fontWeight: 700, color: colour, lineHeight: 1 }}>{value}</p>
                  <p style={{ fontSize: '0.6rem', color: '#64748b', marginTop: '0.25rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                    {label}
                  </p>
                </div>
              ))}
            </div>
          </div>

          <div className="card" style={{ padding: '1rem', flex: 1 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.75rem' }}>
              <h2 style={{ fontSize: '0.7rem', fontWeight: 600, letterSpacing: '0.06em', color: '#64748b', textTransform: 'uppercase' }}>
                Detection Log
              </h2>
              <span
                style={{
                  fontSize:   '0.6rem',
                  fontWeight: 500,
                  color:      '#475569',
                  background: 'rgba(255,255,255,0.03)',
                  border:     '1px solid var(--clr-border)',
                  borderRadius:'3px',
                  padding:    '1px 6px',
                }}
              >
                {eventLogs.length}
              </span>
            </div>

            <EventLog events={eventLogs} />
          </div>

        </aside>
      </main>

      <footer
        style={{
          borderTop:  '1px solid var(--clr-border)',
          padding:    '0.5rem 1.5rem',
          display:    'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}
      >
        <p style={{ fontSize: '0.6rem', color: '#475569' }}>
          DashCam — TF.js + FastAPI
        </p>
        <p style={{ fontSize: '0.6rem', color: '#475569', fontFamily: 'var(--font-mono)' }}>
          ws://localhost:8000
        </p>
      </footer>
    </div>
  );
}
