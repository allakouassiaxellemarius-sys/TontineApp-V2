import { NavLink, useLocation } from 'react-router-dom'
import { Home, Calendar, Bell, User, MoreHorizontal } from 'lucide-react'
import { haptic } from '../lib/haptique'
import { t, useLangue } from '../lib/i18n'

const OCCULTER_SUR = ['/parametres', '/connexion']
const OCCULTER_PREFIXES = ['/groupe/']

export default function BottomNav() {
  const { pathname } = useLocation()
  useLangue()

  if (OCCULTER_SUR.includes(pathname) || OCCULTER_PREFIXES.some((p) => pathname.startsWith(p))) return null

  const Tab = ({ to, end, Icon, libelle }) => (
    <NavLink
      to={to}
      end={end}
      onClick={() => haptic.tap()}
      className={({ isActive }) =>
        `relative flex min-w-0 flex-1 flex-col items-center justify-center ${
          isActive ? 'text-brand-700' : 'text-gray-500 hover:text-gray-700'
        }`
      }
    >
      {({ isActive }) => (
        <span className="flex min-h-[48px] flex-col items-center justify-center gap-1 rounded-full px-3 py-1.5 transition-colors duration-150">
          {isActive && <span className="losange mb-0.5" style={{ width: 6, height: 6 }} />}
          <Icon size={22} strokeWidth={isActive ? 2.4 : 1.75} fill={isActive ? 'currentColor' : 'none'} />
          <span className={`text-[11px] leading-none ${isActive ? 'font-bold' : 'font-medium'}`}>{libelle}</span>
        </span>
      )}
    </NavLink>
  )

  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-30 px-3 pb-safe"
      aria-label={t('nav.ariaPrincipale')}
      style={{ willChange: 'transform' }}
    >
      <div className="glass mx-auto flex h-[68px] max-w-lg items-stretch rounded-[24px] border border-brand-200/70 px-2 shadow-[0_-4px_20px_rgba(15,23,42,0.08)]">
        <Tab to="/" end Icon={Home} libelle={t('nav.accueil')} />
        <Tab to="/calendrier" Icon={Calendar} libelle={t('nav.calendrier')} />
        <Tab to="/notifications" Icon={Bell} libelle={t('nav.alertes')} />
        <Tab to="/profil" Icon={User} libelle={t('nav.profil')} />
        <Tab to="/parametres" Icon={MoreHorizontal} libelle={t('nav.plus')} />
      </div>
    </nav>
  )
}
