// ============================================================================
//  ConnectionStatus.jsx — WS connection status badge
// ============================================================================

import { Wifi, WifiOff, RefreshCw } from 'lucide-react';

export default function ConnectionStatus({ connected, reconnectCount }) {
  if (connected) {
    return (
      <div
        style={{
          display:      'flex',
          alignItems:   'center',
          gap:          '0.4rem',
          padding:      '4px 12px',
          borderRadius: '999px',
          background:   'rgba(34,197,94,0.12)',
          border:       '1px solid rgba(34,197,94,0.3)',
        }}
      >
        <span
          className="animate-pulse-glow"
          style={{ width: 7, height: 7, borderRadius: '50%', background: '#22c55e', display: 'block' }}
        />
        <Wifi size={13} color="#22c55e" />
        <span style={{ fontSize: '0.7rem', fontWeight: 600, color: '#86efac' }}>LIVE</span>
      </div>
    );
  }

  return (
    <div
      style={{
        display:      'flex',
        alignItems:   'center',
        gap:          '0.4rem',
        padding:      '4px 12px',
        borderRadius: '999px',
        background:   'rgba(239,68,68,0.1)',
        border:       '1px solid rgba(239,68,68,0.25)',
      }}
    >
      {reconnectCount > 0 ? (
        <>
          <RefreshCw size={12} color="#f87171" style={{ animation: 'spin 1.2s linear infinite' }} />
          <span style={{ fontSize: '0.7rem', fontWeight: 600, color: '#f87171' }}>
            RECONNECTING ({reconnectCount})
          </span>
        </>
      ) : (
        <>
          <WifiOff size={13} color="#f87171" />
          <span style={{ fontSize: '0.7rem', fontWeight: 600, color: '#f87171' }}>OFFLINE</span>
        </>
      )}
    </div>
  );
}
