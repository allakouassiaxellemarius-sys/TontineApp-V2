import { useEffect, useState } from 'react'
import Logo from './Logo'
import { getSettings } from '../lib/format'
import sonOuverture from '../assets/ouverture.wav'

const BULLES = [
  'On fait grossir la cagnotte ? 💰',
  'Votre groupe compte sur vous !',
  '1 cotisation = 1 pas de plus 🚀',
]

export default function AppOpening({ onFinish }) {
  const [bulle] = useState(() => BULLES[Math.floor(Math.random() * BULLES.length)])

  useEffect(() => {
    // Le WebView Capacitor autorise la lecture sans geste utilisateur, mais un
    // navigateur web refusera : on avale le rejet plutôt que de polluer la console.
    if (getSettings().sonOuverture !== false) {
      const audio = new Audio(sonOuverture)
      audio.volume = 0.45
      audio.play().catch(() => {})
    }
    const t2 = setTimeout(() => onFinish && onFinish(), 1500)
    return () => { clearTimeout(t2) }
  }, [onFinish])

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center overflow-hidden gradient-primary">
      <div className="relative flex w-full max-w-sm flex-col items-center px-6 text-center">
        <div className="relative flex items-center justify-center">
          <div className="absolute h-44 w-44 rounded-full bg-white/30 blur-3xl" />
          <Logo size={132} />
        </div>

        {/* Bulle figée sur la charte : le splash reste vert quel que soit le
            thème, `.bg-white` deviendrait une surface sombre en mode sombre. */}
        <div className="mt-3 max-w-[260px] rounded-2xl bg-[#FFFFFF] px-4 py-2 text-sm font-extrabold text-[#18281D]">
          {bulle}
        </div>

        {/* pièces déposées au-dessus de la tirelire */}
        <div className="relative mt-6 flex h-24 w-40 items-end justify-center">
          <span className="absolute left-1/2 top-0 h-5 w-5 -translate-x-1/2 rounded-full border-2 border-[#E6B800] bg-[#FFD700]" />
          <span className="absolute left-[38%] top-0 h-5 w-5 -translate-x-1/2 rounded-full border-2 border-[#E6B800] bg-[#FFD700]" />
          <span className="absolute left-[62%] top-0 h-5 w-5 -translate-x-1/2 rounded-full border-2 border-[#E6B800] bg-[#FFD700]" />
          <svg width="120" height="84" viewBox="0 0 120 84">
            <rect x="14" y="26" width="92" height="52" rx="22" fill="#17A566" stroke="#0E6B42" strokeWidth="3" />
            <rect x="8" y="44" width="12" height="18" rx="6" fill="#17A566" stroke="#0E6B42" strokeWidth="3" />
            <circle cx="92" cy="44" r="9" fill="#fff" stroke="#0E6B42" strokeWidth="3" />
            <circle cx="92" cy="44" r="3" fill="#0E6B42" />
            <rect x="44" y="16" width="32" height="7" rx="3" fill="#0E6B42" />
          </svg>
        </div>
      </div>
    </div>
  )
}
