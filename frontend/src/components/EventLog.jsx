// ============================================================================
//  EventLog.jsx — Scrollable list of AI-detected driving events
// ============================================================================

import { AlertTriangle, XOctagon, Info } from 'lucide-react';
import { useRef, useEffect } from 'react';

/**
 * Individual log row.
 */
function EventRow({ event, isNew }) {
  const typeConfig = {
    critical: {
      Icon:       XOctagon,
      iconColour: '#ef4444',
      bg:         'rgba(239,68,68,0.07)',
      border:     'rgba(239,68,68,0.25)',
      badge:      'CRITICAL',
      badgeBg:    'rgba(239,68,68,0.18)',
      badgeText:  '#fca5a5',
    },
    warning: {
      Icon:       AlertTriangle,
      iconColour: '#eab308',
      bg:         'rgba(234,179,8,0.06)',
      border:     'rgba(234,179,8,0.22)',
      badge:      'WARNING',
      badgeBg:    'rgba(234,179,8,0.18)',
      badgeText:  '#fde68a',
    },
    info: {
      Icon:       Info,
      iconColour: '#06b6d4',
      bg:         'rgba(6,182,212,0.06)',
      border:     'rgba(6,182,212,0.2)',
      badge:      'INFO',
      badgeBg:    'rgba(6,182,212,0.15)',
      badgeText:  '#67e8f9',
    },
  };

  const cfg  = typeConfig[event.type] ?? typeConfig.info;
  const { Icon } = cfg;
  const time = new Date(event.timestamp).toLocaleTimeString();

  return (
    <div
      className={isNew ? 'animate-slide-in' : ''}
      style={{
        display:       'flex',
        alignItems:    'flex-start',
        gap:           '0.75rem',
        padding:       '0.75rem 1rem',
        background:    cfg.bg,
        border:        `1px solid ${cfg.border}`,
        borderRadius:  '0.6rem',
        marginBottom:  '0.5rem',
        transition:    'background 0.2s ease',
      }}
    >
      {/* Icon */}
      <Icon size={18} color={cfg.iconColour} style={{ flexShrink: 0, marginTop: 2 }} />

      {/* Body */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.25rem', flexWrap: 'wrap' }}>
          {/* Badge */}
          <span
            style={{
              fontSize:       '0.6rem',
              fontWeight:     700,
              letterSpacing:  '0.08em',
              padding:        '1px 6px',
              borderRadius:   '4px',
              background:     cfg.badgeBg,
              color:          cfg.badgeText,
            }}
          >
            {cfg.badge}
          </span>
          {/* Score change */}
          {event.scoreChange !== 0 && (
            <span style={{ fontSize: '0.75rem', fontWeight: 700, color: '#f87171' }}>
              {event.scoreChange > 0 ? '+' : ''}{event.scoreChange} pts
            </span>
          )}
          {/* Time */}
          <span style={{ fontSize: '0.7rem', color: '#64748b', marginLeft: 'auto', fontFamily: 'var(--font-mono)' }}>
            {time}
          </span>
        </div>
        <p style={{ fontSize: '0.8rem', color: '#cbd5e1', lineHeight: 1.5, wordBreak: 'break-word' }}>
          {event.message}
        </p>
      </div>
    </div>
  );
}

/**
 * Container with auto-scroll to top (newest events appear first).
 */
export default function EventLog({ events }) {
  const topRef = useRef(null);

  // Scroll to top whenever a new event arrives
  useEffect(() => {
    topRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }, [events.length]);

  return (
    <div
      style={{
        overflowY:    'auto',
        maxHeight:    '420px',
        paddingRight: '4px',
      }}
    >
      <div ref={topRef} />
      {events.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '3rem 0', color: '#475569' }}>
          <p style={{ fontSize: '0.85rem' }}>Awaiting AI detections…</p>
        </div>
      ) : (
        events.map((ev, idx) => (
          <EventRow key={`${ev.timestamp}-${idx}`} event={ev} isNew={idx === 0} />
        ))
      )}
    </div>
  );
}
