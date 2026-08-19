import { useState } from 'react'
import { NavLink, useLocation } from 'react-router-dom'
import { Home, PiggyBank, Plus, UserPlus, BarChart3, Settings } from 'lucide-react'
import { useActions } from '../context/ActionsContext'
import { useConnection } from '../context/ConnectionContext'
import { haptic } from '../lib/haptique'
import { t, useLangue } from '../lib/i18n'
import Modal from './Modal'

const OCCULTER_SUR = ['/parametres', '/connexion']
const OCCULTER_PREFIXES = ['/groupe/']

export default function BottomNav() {
  const { pathname } = useLocation()
  const { ouvrirNouvelle, ouvrirRejoindre } = useActions()
  const { modeHorsLigne } = useConnection()
  useLangue()
  const [menuOpen, setMenuOpen] = useState(false)
  const [presse, setPresse] = useState(false)

  const ACTIVE = '#007AFF'
  const INACTIVE = '#8E8E93'

  if (OCCULTER_SUR.includes(pathname) || OCCULTER_PREFIXES.some((p) => pathname.startsWith(p))) return null

  const fermer = () => setMenuOpen(false)

  const Tab = ({ to, end, Icon, libelle }) => (
    <NavLink
      to={to}
      end={end}
      onClick={() => haptic.tap()}
      className={({ isActive }) =>
        `relative flex min-w-0 flex-1 flex-col items-center justify-center transition-transform duration-100 active:scale-90 ${
          isActive ? 'text-[#007AFF]' : 'text-[#8E8E93] hover:text-gray-500'
        }`
      }
    >
      {({ isActive }) => (
        <span
          className={`flex min-h-[48px] flex-col items-center justify-center gap-1 rounded-full px-3 py-1.5 transition-colors duration-150 ${
            isActive ? 'bg-[#007AFF]/10' : ''
          }`}
        >
          <Icon size={22} strokeWidth={isActive ? 2.4 : 1.75} fill={isActive ? 'currentColor' : 'none'} />
          <span className={`text-[11px] leading-none ${isActive ? 'font-bold' : 'font-medium'}`}>{libelle}</span>
        </span>
      )}
    </NavLink>
  )

  return (
    <>
      <nav
        className="fixed inset-x-0 bottom-0 z-30 border-t border-[rgb(var(--border))] bg-surface/95 pb-safe backdrop-blur"
        aria-label={t('nav.ariaPrincipale')}
      >
        <div className="mx-auto flex h-16 max-w-lg items-stretch">
          <Tab to="/" end Icon={Home} libelle={t('nav.accueil')} />
          <Tab to="/epargne" Icon={PiggyBank} libelle={t('nav.epargne')} />
          <div className="relative flex flex-1 items-center justify-center self-stretch">
            <button
              className={`grid h-14 w-14 -mt-5 place-items-center rounded-full bg-gradient-to-b from-[#0A84FF] to-[#0066D6] text-white shadow-[0_10px_22px_-3px_rgba(10,132,255,0.55)] ring-4 ring-white transition-all duration-150 active:scale-90 hover:shadow-[0_12px_26px_-2px_rgba(10,132,255,0.65)] ${presse ? 'fab-pressed' : ''}`}
              onClick={() => { haptic.tap(); setMenuOpen(true) }}
              onPointerDown={() => setPresse(true)}
              onAnimationEnd={() => setPresse(false)}
              aria-label={t('nav.ariaNouvelle')}
            >
              <Plus
                size={26}
                strokeWidth={2.5}
                className={`transition-transform duration-300 ${menuOpen ? 'rotate-45' : ''}`}
              />
            </button>
          </div>
          <Tab to="/stats" Icon={BarChart3} libelle={t('nav.stats')} />
          <Tab to="/parametres" Icon={Settings} libelle={t('nav.reglages')} />
        </div>
      </nav>

      <Modal open={menuOpen} onClose={fermer} title={t('nav.creerOuRejoindre')}>
        <div className="flex flex-col gap-3">
          <button
            className="btn btn-primary w-full !py-4 text-base"
            onClick={() => { fermer(); ouvrirNouvelle() }}
            disabled={modeHorsLigne}
          >
            <Plus size={20} />
            {t('nav.nouvelleTontine')}
          </button>
          <button
            className="btn btn-secondary w-full !py-4 text-base"
            onClick={() => { fermer(); ouvrirRejoindre() }}
            disabled={modeHorsLigne}
          >
            <UserPlus size={20} />
            {t('nav.rejoindreGroupe')}
          </button>
        </div>
      </Modal>
    </>
  )
}
