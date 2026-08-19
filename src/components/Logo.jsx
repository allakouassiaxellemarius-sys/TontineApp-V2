export default function Logo({ size = 40, className = '' }) {
  return (
    <svg viewBox="0 0 512 512" width={size} height={size} className={className} aria-hidden="true">
      <rect width="512" height="512" rx="112" fill="#58cc02" />
      <rect x="22" y="22" width="468" height="468" rx="92" fill="none" stroke="#2e7d00" strokeWidth="14" opacity="0.4" />
      <circle cx="196" cy="312" r="84" fill="#ffffff" />
      <circle cx="316" cy="312" r="84" fill="#ffffff" />
      <circle cx="256" cy="212" r="84" fill="#ffffff" />
      <circle cx="196" cy="312" r="30" fill="#3c9e00" />
      <circle cx="316" cy="312" r="30" fill="#3c9e00" />
      <circle cx="256" cy="212" r="30" fill="#3c9e00" />
    </svg>
  )
}
