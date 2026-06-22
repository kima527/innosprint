// ============================================================================
//  TrustScore.jsx — Large animated trust score display
// ============================================================================

/**
 * Renders the trust score ring + number.
 * Colour transitions:
 *   green  (score > 80)
 *   yellow (score > 50)
 *   red    (score ≤ 50)
 */
export default function TrustScore({ score }) {
  // Derive colour based on score thresholds
  const colour =
    score > 80 ? 'safe' :
    score > 50 ? 'warn' :
    'danger';

  const colourMap = {
    safe:   { text: '#22c55e', glow: 'rgba(34, 197, 94,  0.45)', label: 'Excellent',  ring: '#22c55e' },
    warn:   { text: '#eab308', glow: 'rgba(234, 179, 8,   0.45)', label: 'Moderate',   ring: '#eab308' },
    danger: { text: '#ef4444', glow: 'rgba(239, 68,  68,  0.45)', label: 'Poor',       ring: '#ef4444' },
  };
  const { text, glow, label, ring } = colourMap[colour];

  // SVG circle ring progress
  const radius      = 56;
  const circumference = 2 * Math.PI * radius;
  const progress    = (score / 100) * circumference;

  return (
    <div className="flex flex-col items-center gap-4">
      {/* Ring + number */}
      <div
        className="relative flex items-center justify-center rounded-full score-ring"
        style={{
          width: 168,
          height: 168,
          '--score-glow': glow,
          background: `radial-gradient(circle at center, ${glow} 0%, transparent 70%)`,
        }}
      >
        {/* SVG progress ring */}
        <svg width="168" height="168" className="absolute inset-0 -rotate-90">
          {/* Background track */}
          <circle
            cx="84" cy="84" r={radius}
            fill="none"
            stroke="rgba(255,255,255,0.07)"
            strokeWidth="8"
          />
          {/* Foreground progress */}
          <circle
            cx="84" cy="84" r={radius}
            fill="none"
            stroke={ring}
            strokeWidth="8"
            strokeLinecap="round"
            strokeDasharray={`${progress} ${circumference}`}
            style={{ transition: 'stroke-dasharray 0.6s ease, stroke 0.6s ease' }}
          />
        </svg>

        {/* Score number */}
        <span
          className="relative text-5xl font-black tabular-nums"
          style={{ color: text, transition: 'color 0.6s ease' }}
        >
          {score}
        </span>
      </div>

      {/* Label */}
      <div className="text-center">
        <p className="text-xs uppercase tracking-widest text-slate-500 font-semibold">
          Trust Score
        </p>
        <p
          className="text-sm font-bold mt-0.5"
          style={{ color: text, transition: 'color 0.6s ease' }}
        >
          {label} Driver
        </p>
      </div>
    </div>
  );
}
