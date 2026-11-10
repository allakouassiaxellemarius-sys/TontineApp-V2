import { HEX } from '../lib/charte'

export default function Logo({ size = 40, className = '' }) {
  const uid = 'lg' + Math.random().toString(36).slice(2, 8)
  return (
    <svg
      viewBox="0 0 512 512"
      width={size}
      height={size}
      className={className}
      aria-hidden="true"
    >
      <defs>
        <linearGradient id={`${uid}-g`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor={HEX.vertClair} />
          <stop offset="45%" stopColor={HEX.vert} />
          <stop offset="100%" stopColor={HEX.vertFonce} />
        </linearGradient>
        <radialGradient id={`${uid}-h`} cx="32%" cy="22%" r="70%">
          <stop offset="0%" stopColor="#ffffff" stopOpacity="0.55" />
          <stop offset="55%" stopColor="#ffffff" stopOpacity="0.06" />
          <stop offset="100%" stopColor="#ffffff" stopOpacity="0" />
        </radialGradient>
      </defs>

      {/* Fond dégradé */}
      <rect x="36" y="36" width="440" height="440" rx="120" fill={`url(#${uid}-g)`} />

      {/* Glyphe : monogramme « T » surmontant une pièce (la cagnotte qui monte) */}
      <g>
        <path d="M152 142 H360" stroke="#ffffff" strokeWidth="64" strokeLinecap="round" fill="none" />
        <path d="M256 142 V318" stroke="#ffffff" strokeWidth="64" strokeLinecap="round" fill="none" />
        <circle cx="256" cy="386" r="36" fill="#FFD700" stroke="#E6B800" strokeWidth="9" />
        <circle cx="256" cy="386" r="14" fill="#ffffff" opacity="0.55" />
      </g>

      {/* Reflet verre */}
      <rect x="36" y="36" width="440" height="440" rx="120" fill={`url(#${uid}-h)`} />
      <rect x="36" y="36" width="440" height="440" rx="120" fill="none" stroke="#ffffff" strokeWidth="10" opacity="0.18" />
    </svg>
  )
}
