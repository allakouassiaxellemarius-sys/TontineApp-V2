import { useEffect, useState } from 'react'

function useUID() {
  const [uid] = useState(() => Math.random().toString(36).slice(2, 9))
  return uid
}

export default function ProgressRing({
  value = 0,
  size = 84,
  stroke = 9,
  gradient = ['#8B5CF6', '#22D3EE'],
  trackColor = 'rgba(120,120,140,0.18)',
  label,
  sublabel,
}) {
  const uid = useUID()
  const pct = Math.max(0, Math.min(100, value))
  const r = (size - stroke) / 2
  const c = 2 * Math.PI * r
  const offset = c - (pct / 100) * c

  return (
    <div className="relative inline-grid place-items-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <defs>
          <linearGradient id={`ring-${uid}`} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor={gradient[0]} />
            <stop offset="100%" stopColor={gradient[1]} />
          </linearGradient>
        </defs>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={trackColor} strokeWidth={stroke} />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={`url(#ring-${uid})`}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={offset}
          style={{ transition: 'stroke-dashoffset 0.7s cubic-bezier(0.22,1,0.36,1)' }}
        />
      </svg>
      <div className="absolute text-center">
        {label != null && <div className="text-sm font-extrabold leading-none" style={{ color: gradient[0] }}>{label}</div>}
        {sublabel && <div className="mt-0.5 text-[9px] font-bold uppercase tracking-wide text-[rgb(var(--text-dim))]">{sublabel}</div>}
      </div>
    </div>
  )
}
