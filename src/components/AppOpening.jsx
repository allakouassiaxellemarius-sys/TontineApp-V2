import { useEffect, useState } from 'react'

const BULLES = [
  'On fait grossir la cagnotte ? 💰',
  'Votre groupe compte sur vous !',
  '1 cotisation = 1 pas de plus 🚀',
]

export default function AppOpening({ onFinish }) {
  const [bulle] = useState(() => BULLES[Math.floor(Math.random() * BULLES.length)])
  const [wink, setWink] = useState(false)

  useEffect(() => {
    const t1 = setTimeout(() => setWink(true), 1200)
    const t2 = setTimeout(() => onFinish && onFinish(), 1500)
    return () => { clearTimeout(t1); clearTimeout(t2) }
  }, [onFinish])

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center overflow-hidden" style={{ background: '#00C853' }}>
      <style>{`
        @keyframes cfaPop { 0%{transform:scale(0)} 60%{transform:scale(1.15)} 100%{transform:scale(1)} }
        @keyframes cfaBubble { 0%{opacity:0;transform:translateY(6px)} 25%{opacity:1;transform:translateY(0)} 78%{opacity:1} 100%{opacity:0} }
        @keyframes cfaCoin { 0%{transform:translateY(-130px);opacity:0} 35%{opacity:1} 100%{transform:translateY(0);opacity:1} }
        @keyframes cfaProg { from{width:0%} to{width:100%} }
        @keyframes cfaThumb { 0%{opacity:0;transform:scale(0.4) rotate(-20deg)} 100%{opacity:1;transform:scale(1) rotate(0)} }
        .cfa-pop{animation:cfaPop 300ms cubic-bezier(.34,1.56,.64,1) both}
        .cfa-bubble{animation:cfaBubble 500ms ease-out both;animation-delay:300ms}
        .cfa-coin{animation:cfaCoin 320ms ease-in both}
        .cfa-prog{animation:cfaProg 400ms linear both;animation-delay:800ms}
        .cfa-thumb{animation:cfaThumb 300ms cubic-bezier(.34,1.56,.64,1) both;animation-delay:1200ms}
      `}</style>

      <div className="relative flex w-full max-w-sm flex-col items-center px-6 text-center">
        {/* CFA + pouce */}
        <div className="relative">
          <svg className="cfa-pop" width="150" height="170" viewBox="0 0 120 140">
            {/* jambes */}
            <rect x="45" y="106" width="9" height="24" rx="4" fill="#E6B800" />
            <rect x="66" y="106" width="9" height="24" rx="4" fill="#E6B800" />
            {/* bras */}
            <rect x="18" y="66" width="9" height="24" rx="4" fill="#E6B800" transform="rotate(18 22 78)" />
            {/* corps pièce */}
            <circle cx="60" cy="60" r="38" fill="#FFD700" stroke="#E6B800" strokeWidth="3" />
            {/* yeux */}
            <circle cx="48" cy="54" r="9" fill="#fff" />
            <circle cx="72" cy="54" r="9" fill="#fff" />
            <circle cx="50" cy="56" r="4.5" fill="#1f2937" />
            {wink ? (
              <path d="M67 56 Q72 52 77 56" stroke="#1f2937" strokeWidth="3" fill="none" strokeLinecap="round" />
            ) : (
              <circle cx="74" cy="56" r="4.5" fill="#1f2937" />
            )}
            {/* sourire */}
            <path d="M48 72 Q60 82 72 72" stroke="#1f2937" strokeWidth="3" fill="none" strokeLinecap="round" />
            {/* marque FCFA */}
            <text x="60" y="42" textAnchor="middle" fontSize="13" fontWeight="800" fill="#B8860B">F</text>
          </svg>
          <div className="cfa-thumb absolute -right-2 top-2 text-4xl" style={{ opacity: 0 }}>👍</div>
        </div>

        {/* bulle */}
        <div className="cfa-bubble mt-3 max-w-[260px] rounded-2xl bg-white px-4 py-2 text-sm font-extrabold text-[#00C853]" style={{ opacity: 0 }}>
          {bulle}
        </div>

        {/* tirelire + pièces */}
        <div className="relative mt-6 flex h-24 w-40 items-end justify-center">
          {/* pièces qui tombent */}
          <span className="cfa-coin absolute left-1/2 top-0 h-5 w-5 -translate-x-1/2 rounded-full border-2 border-[#E6B800] bg-[#FFD700]" style={{ animationDelay: '800ms' }} />
          <span className="cfa-coin absolute left-[38%] top-0 h-5 w-5 -translate-x-1/2 rounded-full border-2 border-[#E6B800] bg-[#FFD700]" style={{ animationDelay: '900ms' }} />
          <span className="cfa-coin absolute left-[62%] top-0 h-5 w-5 -translate-x-1/2 rounded-full border-2 border-[#E6B800] bg-[#FFD700]" style={{ animationDelay: '1000ms' }} />
          {/* tirelire */}
          <svg width="120" height="84" viewBox="0 0 120 84">
            <rect x="14" y="26" width="92" height="52" rx="22" fill="#FF8FB3" stroke="#E36B95" strokeWidth="3" />
            <rect x="8" y="44" width="12" height="18" rx="6" fill="#FF8FB3" stroke="#E36B95" strokeWidth="3" />
            <circle cx="92" cy="44" r="9" fill="#fff" stroke="#E36B95" strokeWidth="3" />
            <circle cx="92" cy="44" r="3" fill="#E36B95" />
            <rect x="44" y="16" width="32" height="7" rx="3" fill="#E36B95" />
          </svg>
        </div>

        {/* progression */}
        <div className="mt-6 h-2.5 w-44 overflow-hidden rounded-full bg-white/30">
          <div className="cfa-prog h-full rounded-full bg-white" style={{ width: '0%' }} />
        </div>
      </div>
    </div>
  )
}
