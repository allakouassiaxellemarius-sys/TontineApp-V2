import { useState } from 'react'
import { ChevronRight, Play, X } from 'lucide-react'
import { t, useLangue } from '../lib/i18n'

// ── Illustrations animées (façon Duolingo) ─────────────────────

function PouletScene() {
  const Poulet = ({ delay }) => (
    <div className="animate-bounce-soft" style={{ animationDelay: `${delay}ms` }}>
      <svg viewBox="0 0 64 64" className="h-full w-full drop-shadow-[0_4px_0_rgba(46,125,0,0.2)]">
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
    </div>
  )
  return (
    <div className="flex items-end gap-1">
      <div className="h-24 w-24"><Poulet delay={0} /></div>
      <div className="relative flex h-24 w-24 items-center justify-center">
        <span className="animate-pulse-ring absolute h-14 w-14 rounded-2xl bg-surface" />
        <div className="relative flex h-14 w-14 items-center justify-center rounded-2xl bg-[#1B87DA] text-3xl font-black text-white shadow-[0_5px_0_#0A5790]">
          +
        </div>
      </div>
      <div className="h-20 w-20"><Poulet delay={350} /></div>
    </div>
  )
}

function CalendrierScene() {
  return (
    <div className="flex items-center gap-4">
      <div className="animate-float">
        <svg viewBox="0 0 96 96" className="h-28 w-28 drop-shadow-[0_5px_0_rgba(27,135,218,0.25)]">
          <rect x="10" y="18" width="76" height="66" rx="16" fill="#fff" stroke="#1B87DA" strokeWidth="4" />
          <rect x="10" y="18" width="76" height="20" rx="16" fill="#1B87DA" />
          <circle cx="32" cy="14" r="6" fill="#0D6EB8" />
          <circle cx="64" cy="14" r="6" fill="#0D6EB8" />
          <circle cx="32" cy="50" r="7" fill="#ffc93c" />
          <rect x="24" y="62" width="16" height="10" rx="4" fill="#1B87DA" />
          <rect x="48" y="44" width="20" height="24" rx="5" fill="#ffd02f" stroke="#e6a817" strokeWidth="2" />
          <rect x="48" y="52" width="20" height="4" fill="#e6a817" />
        </svg>
      </div>
      <div className="animate-float" style={{ animationDelay: '600ms' }}>
        <svg viewBox="0 0 96 96" className="h-24 w-24 drop-shadow-[0_5px_0_rgba(27,135,218,0.25)]">
          <path d="M48 12 L84 84 L12 84 Z" fill="#ffd02f" stroke="#e6a817" strokeWidth="3.5" strokeLinejoin="round" />
          <circle cx="48" cy="60" r="13" fill="#fff3c4" />
          <circle cx="42" cy="58" r="3.4" fill="#263238" />
          <circle cx="54" cy="58" r="3.4" fill="#263238" />
          <path d="M42 66 q6 5 12 0" stroke="#263238" strokeWidth="2.6" strokeLinecap="round" fill="none" />
          <path d="M20 30 a14 14 0 0 1 12-9" stroke="#ffe08a" strokeWidth="3" strokeLinecap="round" fill="none" />
        </svg>
      </div>
    </div>
  )
}

function TirelireScene() {
  const Piece = ({ delay, left }) => (
    <div className="animate-coin absolute" style={{ animationDelay: `${delay}ms`, left: `${left}%`, top: '-6px' }}>
      <svg viewBox="0 0 40 40" className="h-8 w-8 drop-shadow-[0_3px_0_rgba(230,168,23,0.4)]">
        <circle cx="20" cy="20" r="18" fill="#ffc93c" stroke="#e6a817" strokeWidth="2.5" />
        <circle cx="20" cy="20" r="12" fill="none" stroke="#ffe08a" strokeWidth="2.5" />
        <path d="M14 24 q6 5 12 0" stroke="#e6a817" strokeWidth="2.5" strokeLinecap="round" fill="none" />
      </svg>
    </div>
  )
  return (
    <div className="relative">
      <div className="animate-float">
        <svg viewBox="0 0 96 96" className="h-32 w-32 drop-shadow-[0_5px_0_rgba(27,135,218,0.3)]">
          <path d="M28 30 L20 10 L40 21 Z" fill="#7CBDF0" stroke="#0D6EB8" strokeWidth="2.5" strokeLinejoin="round" />
          <ellipse cx="48" cy="63" rx="34" ry="25" fill="#DCEBF9" />
          <ellipse cx="48" cy="63" rx="34" ry="25" fill="none" stroke="#0D6EB8" strokeWidth="3" />
          <rect x="23" y="83" width="12" height="9" rx="4" fill="#7CBDF0" />
          <rect x="61" y="83" width="12" height="9" rx="4" fill="#7CBDF0" />
          <ellipse cx="47" cy="69" rx="15" ry="12" fill="#C3E1F6" />
          <ellipse cx="47" cy="69" rx="15" ry="12" fill="none" stroke="#0D6EB8" strokeWidth="2.5" />
          <circle cx="41" cy="69" r="2.8" fill="#08416C" />
          <circle cx="53" cy="69" r="2.8" fill="#08416C" />
          <circle cx="64" cy="46" r="6.5" fill="#263238" />
          <circle cx="66.5" cy="43.5" r="2.4" fill="#fff" />
          <circle cx="28" cy="51" r="4.5" fill="#4CA2E5" opacity="0.7" />
          <circle cx="70" cy="16" r="10" fill="#ffc93c" stroke="#e6a817" strokeWidth="2.5" />
          <circle cx="70" cy="16" r="4" fill="#ffe08a" />
        </svg>
      </div>
      <Piece delay={0} left={22} />
      <Piece delay={220} left={46} />
      <Piece delay={440} left={66} />
      <Piece delay={660} left={38} />
    </div>
  )
}

function RoueScene() {
  return (
    <div className="relative">
      <span className="absolute left-1/2 top-0 z-10 -translate-x-1/2 text-3xl leading-none text-[#3c3c3c]">▼</span>
      <svg viewBox="0 0 200 200" className="h-44 w-44">
        <g className="animate-wheel">
          {['#1B87DA', '#1B87DA', '#ffc93c', '#f59e0b', '#1B87DA', '#f97316'].map((c, i) => {
            const a1 = i * 60
            const a2 = (i + 1) * 60
            const p1a = ((a1 - 90) * Math.PI) / 180
            const p2a = ((a2 - 90) * Math.PI) / 180
            const p1 = { x: 100 + 86 * Math.cos(p1a), y: 100 + 86 * Math.sin(p1a) }
            const p2 = { x: 100 + 86 * Math.cos(p2a), y: 100 + 86 * Math.sin(p2a) }
            const la = (a2 - a1) > 180 ? 1 : 0
            const mid = ((a1 + a2) / 2 - 90) * Math.PI / 180
            const lp = { x: 100 + 52 * Math.cos(mid), y: 100 + 52 * Math.sin(mid) }
            return (
              <g key={c}>
                <path d={`M 100 100 L ${p1.x} ${p1.y} A 86 86 0 ${la} 1 ${p2.x} ${p2.y} Z`} fill={c} stroke="#fff" strokeWidth="3" />
                <circle cx={lp.x} cy={lp.y} r="5" fill="#fff" opacity="0.85" />
              </g>
            )
          })}
          <circle cx="100" cy="100" r="22" fill="#fff" />
          <circle cx="100" cy="100" r="22" fill="none" stroke="#e5e5e5" strokeWidth="3" />
        </g>
      </svg>
    </div>
  )
}

function TelScene() {
  return (
    <div className="flex items-center gap-3">
      <div className="animate-float">
        <svg viewBox="0 0 96 96" className="h-32 w-32 drop-shadow-[0_5px_0_rgba(27,135,218,0.3)]">
          <rect x="20" y="6" width="56" height="84" rx="14" fill="#fff" stroke="#1B87DA" strokeWidth="3.5" />
          <rect x="26" y="14" width="44" height="60" rx="8" fill="#F0F7FD" />
          <rect x="32" y="22" width="26" height="6" rx="3" fill="#1B87DA" />
          <rect x="32" y="34" width="32" height="6" rx="3" fill="#C3E1F6" />
          <rect x="32" y="46" width="22" height="6" rx="3" fill="#C3E1F6" />
          <rect x="42" y="80" width="12" height="4" rx="2" fill="#d8d8d8" />
        </svg>
      </div>
      <div className="animate-bounce-soft" style={{ animationDelay: '400ms' }}>
        <svg viewBox="0 0 96 96" className="h-24 w-24">
          <path d="M10 20 q0 -12 14 -12 l48 0 q14 0 14 12 l0 30 q0 12 -14 12 l-10 0 -12 14 2 -14 -12 0 q-14 0 -14 -12 z" fill="#1B87DA" stroke="#0A5790" strokeWidth="2.5" strokeLinejoin="round" />
          <path d="M26 34 h44 M26 48 h32" stroke="#fff" strokeWidth="6" strokeLinecap="round" />
        </svg>
      </div>
      <div className="animate-float" style={{ animationDelay: '800ms' }}>
        <svg viewBox="0 0 96 96" className="h-20 w-20">
          <path d="M24 44 l10 -24 10 24 z" fill="#C3E1F6" opacity="0.6" />
          <path d="M52 40 a22 22 0 1 1 -2 -30 l-8 8 a14 14 0 1 0 4 22 z" fill="#1B87DA" stroke="#0A5790" strokeWidth="2.5" strokeLinejoin="round" />
        </svg>
      </div>
    </div>
  )
}

// ── Diapositives ───────────────────────────────────────────────

const SLIDES = [
  {
    bg: 'linear-gradient(160deg, #e8f5e9 0%, #c8e6c9 100%)',
    accent: '#1B87DA',
    Illustration: TelScene,
    titreKey: 'onboarding.s1.titre',
    texteKey: 'onboarding.s1.texte',
  },
  {
    bg: 'linear-gradient(160deg, #e6f8ee 0%, #c6f0d8 100%)',
    accent: '#1B87DA',
    Illustration: CalendrierScene,
    titreKey: 'onboarding.s2.titre',
    texteKey: 'onboarding.s2.texte',
  },
  {
    bg: 'linear-gradient(160deg, #fdf3d7 0%, #fbe7b3 100%)',
    accent: '#1B87DA',
    Illustration: TirelireScene,
    titreKey: 'onboarding.s3.titre',
    texteKey: 'onboarding.s3.texte',
  },
  {
    bg: 'linear-gradient(160deg, #e6f8ee 0%, #c6f0d8 100%)',
    accent: '#1B87DA',
    Illustration: RoueScene,
    titreKey: 'onboarding.s4.titre',
    texteKey: 'onboarding.s4.texte',
  },
  {
    bg: 'linear-gradient(160deg, #e9f6ef 0%, #d5efdf 100%)',
    accent: '#1B87DA',
    Illustration: TelScene,
    titreKey: 'onboarding.s5.titre',
    texteKey: 'onboarding.s5.texte',
  },
  {
    bg: 'linear-gradient(160deg, var(--surface-muted) 0%, var(--gray-100) 100%)',
    accent: '#1B87DA',
    Illustration: TelScene,
    titreKey: 'onboarding.s6.titre',
    texteKey: 'onboarding.s6.texte',
  },
]

export default function Onboarding({ onFinish }) {
  const [index, setIndex] = useState(0)
  useLangue()
  const slide = SLIDES[index]
  const dernier = index === SLIDES.length - 1

  const terminer = () => {
    localStorage.setItem('tontine_tutoriel', '1')
    onFinish && onFinish()
  }

  const suivant = () => {
    if (dernier) return terminer()
    setIndex(index + 1)
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-surface">
      <button className="btn btn-ghost absolute right-4 top-4 top-safe z-10 !py-2" onClick={terminer} aria-label={t('tuto.passer')}>
        <X size={16} /> {t('tuto.passer')}
      </button>

      <div key={index} className="animate-slide-in flex flex-1 items-center justify-center px-6" style={{ background: slide.bg }}>
        <div className="flex h-64 items-center justify-center sm:h-72">
          <slide.Illustration />
        </div>
      </div>

      <div className="px-6 pb-9 pt-5">
        <h2 className="text-center text-2xl font-extrabold text-gray-800">{t(slide.titreKey)}</h2>
        <p className="mx-auto mt-2 max-w-sm text-center text-sm font-medium text-gray-500">{t(slide.texteKey)}</p>

        <div className="mt-6 flex justify-center gap-2">
          {SLIDES.map((s, i) => (
            <span
              key={i}
              className="h-2.5 rounded-full transition-all"
              style={{
                width: i === index ? 26 : 10,
                background: i <= index ? slide.accent : '#e5e5e5',
              }}
            />
          ))}
        </div>

        <button className="btn mt-6 w-full" style={{ background: slide.accent, color: '#fff', boxShadow: `0 5px 0 ${slide.accent}` }} onClick={suivant}>
          {dernier ? <><Play size={18} /> {t('tuto.commencer')}</> : <>{t('tuto.continuer')} <ChevronRight size={18} /></>}
        </button>
      </div>
    </div>
  )
}
