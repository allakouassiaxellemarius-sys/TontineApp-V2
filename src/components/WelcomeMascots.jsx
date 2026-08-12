function Poulet() {
  return (
    <svg viewBox="0 0 64 64" className="h-full w-full drop-shadow-[0_4px_0_rgba(46,125,0,0.25)]">
      <path d="M32 10 q4-7 9-2 q-6 1 -9 2" fill="#f5b92b" />
      <circle cx="32" cy="36" r="24" fill="#ffd02f" stroke="#e6a817" strokeWidth="2.5" />
      <ellipse cx="32" cy="45" rx="13" ry="11" fill="#fff3c4" />
      <circle cx="23" cy="33" r="5" fill="#263238" />
      <circle cx="41" cy="33" r="5" fill="#263238" />
      <circle cx="25" cy="31" r="1.8" fill="#fff" />
      <circle cx="43" cy="31" r="1.8" fill="#fff" />
      <circle cx="17" cy="39" r="3" fill="#ff9d66" opacity="0.8" />
      <circle cx="47" cy="39" r="3" fill="#ff9d66" opacity="0.8" />
      <path d="M28 42 L36 42 L32 49 Z" fill="#ff7043" />
      <rect x="20" y="57" width="5" height="5" rx="2" fill="#ff8a50" />
      <rect x="39" y="57" width="5" height="5" rx="2" fill="#ff8a50" />
    </svg>
  )
}

function Tirelire() {
  return (
    <svg viewBox="0 0 64 64" className="h-full w-full drop-shadow-[0_4px_0_rgba(46,125,0,0.25)]">
      <path d="M18 20 L13 7 L27 14 Z" fill="#ff8fb0" stroke="#e56a8d" strokeWidth="2" strokeLinejoin="round" />
      <ellipse cx="32" cy="42" rx="23" ry="17" fill="#ff9cb4" />
      <ellipse cx="32" cy="42" rx="23" ry="17" fill="none" stroke="#e56a8d" strokeWidth="2.5" />
      <rect x="15" y="55" width="8" height="6" rx="3" fill="#f57f9f" />
      <rect x="41" y="55" width="8" height="6" rx="3" fill="#f57f9f" />
      <ellipse cx="31" cy="46" rx="10" ry="8" fill="#ffb8cb" />
      <ellipse cx="31" cy="46" rx="10" ry="8" fill="none" stroke="#e56a8d" strokeWidth="2" />
      <circle cx="27" cy="46" r="2" fill="#d14b70" />
      <circle cx="35" cy="46" r="2" fill="#d14b70" />
      <circle cx="43" cy="31" r="4.5" fill="#263238" />
      <circle cx="45" cy="29.5" r="1.6" fill="#fff" />
      <circle cx="19" cy="34" r="3" fill="#f06595" opacity="0.7" />
      <rect x="24" y="15" width="16" height="5" rx="2.5" fill="#e56a8d" />
      <circle cx="47" cy="11" r="7" fill="#ffc93c" stroke="#e6a817" strokeWidth="2" />
      <circle cx="47" cy="11" r="3" fill="#ffe08a" />
      <path d="M50 6 l2 2 l-2 2" stroke="#e6a817" strokeWidth="2" fill="none" strokeLinecap="round" />
    </svg>
  )
}

function Piece() {
  return (
    <svg viewBox="0 0 64 64" className="h-full w-full drop-shadow-[0_4px_0_rgba(46,125,0,0.25)]">
      <circle cx="32" cy="32" r="26" fill="#ffc93c" stroke="#e6a817" strokeWidth="2.5" />
      <circle cx="32" cy="32" r="19" fill="none" stroke="#ffe08a" strokeWidth="2.5" />
      <circle cx="23" cy="28" r="4" fill="#263238" />
      <circle cx="41" cy="28" r="4" fill="#263238" />
      <circle cx="25" cy="26.5" r="1.5" fill="#fff" />
      <circle cx="43" cy="26.5" r="1.5" fill="#fff" />
      <circle cx="19" cy="36" r="3" fill="#ff9d66" />
      <circle cx="45" cy="36" r="3" fill="#ff9d66" />
      <path d="M26 38 q6 5 12 0" stroke="#263238" strokeWidth="2.5" strokeLinecap="round" fill="none" />
      <path d="M18 14 a9 9 0 0 1 8 -5" stroke="#ffe08a" strokeWidth="2.5" strokeLinecap="round" fill="none" />
    </svg>
  )
}

export default function WelcomeMascots({ titre = 'Bienvenue !' }) {
  return (
    <div className="flex flex-col items-center">
      <div
        className="animate-bubble-pop relative z-10 rounded-2xl bg-surface px-4 py-2 shadow-[0_4px_0_rgba(46,125,0,0.3)]"
        style={{ animationDelay: '1100ms' }}
      >
        <p className="whitespace-nowrap text-sm font-extrabold text-brand-700 sm:text-base">{titre}</p>
        <span className="absolute -bottom-2 left-1/2 h-4 w-4 -translate-x-1/2 rotate-45 bg-surface" />
      </div>

      <div className="mt-4 flex items-end gap-1">
        <div className="animate-mascot-pop animate-mascot-bob h-16 w-16 sm:h-20 sm:w-20" style={{ animationDelay: '600ms, 1600ms' }}>
          <Poulet />
        </div>
        <div className="animate-mascot-pop animate-mascot-wave relative h-24 w-24 sm:h-28 sm:w-28" style={{ animationDelay: '800ms, 1900ms' }}>
          <Tirelire />
        </div>
        <div className="animate-mascot-pop animate-mascot-bob h-16 w-16 sm:h-20 sm:w-20" style={{ animationDelay: '1000ms, 2200ms' }}>
          <Piece />
        </div>
      </div>
    </div>
  )
}
