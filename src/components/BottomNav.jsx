import { useState } from 'react'
import { NavLink, useLocation } from 'react-router-dom'
import { Home, Calendar, Bell, User, Plus, UserPlus, MoreHorizontal } from 'lucide-react'
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

  if (OCCULTER_SUR.includes(pathname) || OCCULTER_PREFIXES.some((p) => pathname.startsWith(p))) return null

  const fermer = () => setMenuOpen(false)

  const Tab = ({ to, end, Icon, libelle }) => (
    <NavLink
      to={to}
      end={end}
      onClick={() => haptic.tap()}
      className={({ isActive }) =>
        `relative flex min-w-0 flex-1 flex-col items-center justify-center ${
          isActive ? 'text-[var(--accent)]' : 'text-[var(--text-muted)] hover:text-[var(--text-dim)]'
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
    <>
      <nav
        className="fixed inset-x-0 bottom-0 z-30 px-3 pb-safe"
        aria-label={t('nav.ariaPrincipale')}
        style={{ willChange: 'transform' }}
      >
        <div className="glass mx-auto flex h-[68px] max-w-lg items-stretch rounded-[24px] border border-[var(--border-subtle)] px-2 shadow-[0_-4px_20px_rgba(15,23,42,0.08)]">
          <Tab to="/" end Icon={Home} libelle={t('nav.accueil')} />
          <Tab to="/calendrier" Icon={Calendar} libelle={t('nav.calendrier')} />
          <div className="relative flex flex-1 items-center justify-center self-stretch">
            <button
              className="grid h-14 w-14 -mt-6 place-items-center rounded-full gradient-primary text-white ring-4 ring-white transition-all duration-150 hover:brightness-110"
              style={{ boxShadow: '0 8px 18px rgba(34,197,94,0.38)' }}
              onClick={() => { haptic.tap(); setMenuOpen(true) }}
              aria-label={t('nav.ariaNouvelle')}
            >
              <Plus
                size={26}
                strokeWidth={2.5}
                className={`transition-transform duration-300 ${menuOpen ? 'rotate-45' : ''}`}
              />
            </button>
          </div>
          <Tab to="/notifications" Icon={Bell} libelle={t('nav.alertes')} />
          <Tab to="/profil" Icon={User} libelle={t('nav.profil')} />
          <Tab to="/parametres" Icon={MoreHorizontal} libelle={t('nav.plus')} />
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
