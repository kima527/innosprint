import { AlertTriangle, XOctagon, Info } from 'lucide-react';
import { useRef, useEffect } from 'react';

function EventRow({ event, isNew }) {
  const typeConfig = {
    critical: {
      Icon:       XOctagon,
      iconColour: '#ef4444',
      bg:         'rgba(239,68,68,0.05)',
      border:     'rgba(239,68,68,0.15)',
      badge:      'VIOLATION',
      badgeBg:    'rgba(239,68,68,0.12)',
      badgeText:  '#fca5a5',
    },
    warning: {
      Icon:       AlertTriangle,
      iconColour: '#eab308',
      bg:         'rgba(234,179,8,0.04)',
      border:     'rgba(234,179,8,0.12)',
      badge:      'WARNING',
      badgeBg:    'rgba(234,179,8,0.12)',
      badgeText:  '#fde68a',
    },
    info: {
      Icon:       Info,
      iconColour: '#06b6d4',
      bg:         'rgba(6,182,212,0.04)',
      border:     'rgba(6,182,212,0.12)',
      badge:      'INFO',
      badgeBg:    'rgba(6,182,212,0.1)',
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
        gap:           '0.6rem',
        padding:       '0.6rem 0.75rem',
        background:    cfg.bg,
        border:        `1px solid ${cfg.border}`,
        borderRadius:  '0.5rem',
        marginBottom:  '0.4rem',
      }}
    >
      <Icon size={15} color={cfg.iconColour} style={{ flexShrink: 0, marginTop: 2 }} />

      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', marginBottom: '0.2rem', flexWrap: 'wrap' }}>
          <span
            style={{
              fontSize:       '0.55rem',
              fontWeight:     600,
              letterSpacing:  '0.06em',
              padding:        '1px 5px',
              borderRadius:   '3px',
              background:     cfg.badgeBg,
              color:          cfg.badgeText,
            }}
          >
            {cfg.badge}
          </span>
          {event.scoreChange !== 0 && (
            <span style={{ fontSize: '0.7rem', fontWeight: 600, color: '#f87171' }}>
              {event.scoreChange > 0 ? '+' : ''}{event.scoreChange}
            </span>
          )}
          <span style={{ fontSize: '0.65rem', color: '#64748b', marginLeft: 'auto', fontFamily: 'var(--font-mono)' }}>
            {time}
          </span>
        </div>
        <p style={{ fontSize: '0.75rem', color: '#9ca3af', lineHeight: 1.4, wordBreak: 'break-word' }}>
          {event.message}
        </p>
      </div>
    </div>
  );
}

export default function EventLog({ events }) {
  const topRef = useRef(null);

  useEffect(() => {
    topRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }, [events.length]);

  return (
    <div style={{ overflowY: 'auto', maxHeight: '420px', paddingRight: '2px' }}>
      <div ref={topRef} />
      {events.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '2.5rem 0', color: '#475569' }}>
          <p style={{ fontSize: '0.8rem' }}>No detections yet</p>
        </div>
      ) : (
        events.map((ev, idx) => (
          <EventRow key={`${ev.timestamp}-${idx}`} event={ev} isNew={idx === 0} />
        ))
      )}
    </div>
  );
}
