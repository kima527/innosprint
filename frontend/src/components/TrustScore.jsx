export default function TrustScore({ score }) {
  const colour =
    score > 80 ? 'safe' :
    score > 50 ? 'warn' :
    'danger';

  const colourMap = {
    safe:   { text: '#22c55e', glow: 'rgba(34, 197, 94,  0.25)', label: 'Excellent',  ring: '#22c55e' },
    warn:   { text: '#eab308', glow: 'rgba(234, 179, 8,   0.25)', label: 'Moderate',   ring: '#eab308' },
    danger: { text: '#ef4444', glow: 'rgba(239, 68,  68,  0.25)', label: 'Poor',       ring: '#ef4444' },
  };
  const { text, glow, label, ring } = colourMap[colour];

  const radius        = 52;
  const circumference = 2 * Math.PI * radius;
  const progress      = (score / 100) * circumference;

  return (
    <div className="flex flex-col items-center gap-3">
      <div
        className="relative flex items-center justify-center rounded-full score-ring"
        style={{
          width: 148,
          height: 148,
          '--score-glow': glow,
        }}
      >
        <svg width="148" height="148" className="absolute inset-0 -rotate-90">
          <circle
            cx="74" cy="74" r={radius}
            fill="none"
            stroke="rgba(255,255,255,0.05)"
            strokeWidth="6"
          />
          <circle
            cx="74" cy="74" r={radius}
            fill="none"
            stroke={ring}
            strokeWidth="6"
            strokeLinecap="round"
            strokeDasharray={`${progress} ${circumference}`}
            style={{ transition: 'stroke-dasharray 0.5s ease, stroke 0.5s ease' }}
          />
        </svg>

        <span
          className="relative text-4xl font-bold tabular-nums"
          style={{ color: text, transition: 'color 0.5s ease' }}
        >
          {score}
        </span>
      </div>

      <div className="text-center">
        <p className="text-xs uppercase tracking-wide text-slate-500 font-medium">
          Trust Score
        </p>
        <p
          className="text-sm font-semibold mt-0.5"
          style={{ color: text, transition: 'color 0.5s ease' }}
        >
          {label}
        </p>
      </div>
    </div>
  );
}
