export default function Logo({ size = 40, className = '' }) {
  return (
    <svg viewBox="0 0 512 512" width={size} height={size} className={className} aria-hidden="true">
      <defs>
        <linearGradient id="tontine-gold" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#ffd54a" />
          <stop offset="1" stopColor="#ffb300" />
        </linearGradient>
      </defs>
      <circle cx="196" cy="100" r="38" fill="#ffd54a" stroke="#c98a00" strokeWidth="10" />
      <circle cx="256" cy="74" r="38" fill="#ffd54a" stroke="#c98a00" strokeWidth="10" />
      <circle cx="320" cy="104" r="38" fill="#ffd54a" stroke="#c98a00" strokeWidth="10" />
      <circle cx="196" cy="100" r="16" fill="none" stroke="#c98a00" strokeWidth="8" />
      <circle cx="256" cy="74" r="16" fill="none" stroke="#c98a00" strokeWidth="8" />
      <circle cx="320" cy="104" r="16" fill="none" stroke="#c98a00" strokeWidth="8" />
      <rect x="142" y="150" width="228" height="52" rx="26" fill="#ffc400" stroke="#c98a00" strokeWidth="10" />
      <path
        d="M 176 190 L 336 190 Q 356 190 352.9 209.8 L 322.9 362.3 Q 326 380 306 380 L 206 380 Q 186 380 182.9 360.2 L 159.1 209.8 Q 156 190 176 190 Z"
        fill="url(#tontine-gold)"
        stroke="#c98a00"
        strokeWidth="10"
        strokeLinejoin="round"
      />
      <rect x="196" y="216" width="72" height="120" rx="24" fill="#fff" opacity="0.3" transform="rotate(-12 232 276)" />
      <rect x="228" y="356" width="56" height="18" rx="9" fill="#e6a200" stroke="#c98a00" strokeWidth="6" />
    </svg>
  )
}
