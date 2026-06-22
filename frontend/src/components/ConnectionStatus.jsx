import { Wifi, WifiOff, RefreshCw } from 'lucide-react';

export default function ConnectionStatus({ connected, reconnectCount }) {
  if (connected) {
    return (
      <div
        style={{
          display:      'flex',
          alignItems:   'center',
          gap:          '0.35rem',
          padding:      '3px 10px',
          borderRadius: '999px',
          background:   'rgba(34,197,94,0.08)',
          border:       '1px solid rgba(34,197,94,0.2)',
        }}
      >
        <span
          className="animate-pulse-glow"
          style={{ width: 6, height: 6, borderRadius: '50%', background: '#22c55e', display: 'block' }}
        />
        <span style={{ fontSize: '0.65rem', fontWeight: 500, color: '#86efac' }}>Connected</span>
      </div>
    );
  }

  return (
    <div
      style={{
        display:      'flex',
        alignItems:   'center',
        gap:          '0.35rem',
        padding:      '3px 10px',
        borderRadius: '999px',
        background:   'rgba(239,68,68,0.08)',
        border:       '1px solid rgba(239,68,68,0.15)',
      }}
    >
      {reconnectCount > 0 ? (
        <>
          <RefreshCw size={11} color="#f87171" style={{ animation: 'spin 1.2s linear infinite' }} />
          <span style={{ fontSize: '0.65rem', fontWeight: 500, color: '#f87171' }}>
            Reconnecting
          </span>
        </>
      ) : (
        <>
          <WifiOff size={11} color="#f87171" />
          <span style={{ fontSize: '0.65rem', fontWeight: 500, color: '#f87171' }}>Offline</span>
        </>
      )}
    </div>
  );
}
