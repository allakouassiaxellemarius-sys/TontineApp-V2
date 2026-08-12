import { useEffect, useState } from 'react'
import Logo from './Logo'
import WelcomeMascots from './WelcomeMascots'

const TITRE = 'Tontine Manager'.split('')

export default function AppOpening({ onFinish }) {
  const [leaving, setLeaving] = useState(false)

  useEffect(() => {
    const t = setTimeout(() => setLeaving(true), 2400)
    return () => clearTimeout(t)
  }, [])

  useEffect(() => {
    if (!leaving) return
    const t = setTimeout(() => onFinish && onFinish(), 500)
    return () => clearTimeout(t)
  }, [leaving, onFinish])

  return (
    <div
      className={`fixed inset-0 z-50 flex items-center justify-center overflow-hidden bg-gradient-to-b from-brand-500 to-brand-700 transition-all duration-500 ${
        leaving ? 'scale-110 opacity-0' : 'scale-100 opacity-100'
      }`}
    >
      <div className="flex w-full max-w-lg flex-col items-center px-6 text-center">
        <div className="animate-logo-pop flex h-20 w-20 items-center justify-center rounded-[24px] bg-surface shadow-[0_5px_0_rgba(46,125,0,0.35)] sm:h-24 sm:w-24 sm:rounded-[28px]">
          <Logo className="animate-logo-wiggle h-12 w-12 sm:h-[62px] sm:w-[62px]" />
        </div>

        <h1 className="mt-6 flex whitespace-nowrap text-2xl font-extrabold uppercase tracking-wide text-white sm:text-4xl">
          {TITRE.map((l, i) => (
            <span
              key={i}
              className="animate-letter inline-block"
              style={{ animationDelay: `${300 + i * 55}ms` }}
            >
              {l === ' ' ? '\u00A0' : l}
            </span>
          ))}
        </h1>

        <p className="animate-fade-up mt-2.5 text-xs font-bold text-brand-100 sm:text-sm" style={{ animationDelay: '1300ms' }}>
          Gérez vos tontines en toute simplicité
        </p>

        <div className="animate-fade-up mt-6" style={{ animationDelay: '1400ms' }}>
          <WelcomeMascots />
        </div>

        <div className="mt-8 h-2 w-40 overflow-hidden rounded-full bg-surface/20 sm:mt-10">
          <div className="animate-progress h-full w-full origin-left rounded-full bg-surface" />
        </div>
      </div>
    </div>
  )
}
