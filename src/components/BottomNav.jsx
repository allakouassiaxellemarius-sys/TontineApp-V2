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

const tabCls = (isActive) =>
  `relative flex min-w-0 flex-1 flex-col items-center justify-center gap-0.5 overflow-hidden text-[10px] font-extrabold uppercase tracking-wide transition ${isActive ? 'text-brand-600' : 'text-gray-400 hover:text-gray-600'}`
const libelleCls = 'block w-full truncate px-0.5 leading-none'

export default function BottomNav() {
  const { pathname } = useLocation()
  const { ouvrirNouvelle, ouvrirRejoindre } = useActions()
  const { modeHorsLigne } = useConnection()
  useLangue()
  const [menuOpen, setMenuOpen] = useState(false)
  const [presse, setPresse] = useState(false)

  if (OCCULTER_SUR.includes(pathname) || OCCULTER_PREFIXES.some((p) => pathname.startsWith(p))) return null

  const fermer = () => setMenuOpen(false)

  return (
    <>
      <nav
        className="fixed inset-x-0 bottom-0 z-30 border-t border-[rgb(var(--border))] bg-surface/95 pb-safe backdrop-blur"
        aria-label={t('nav.ariaPrincipale')}
      >
        <div className="mx-auto flex h-16 max-w-lg items-center">
          <NavLink to="/" end className={({ isActive }) => tabCls(isActive)} onClick={() => haptic.tap()}>
            <Home size={20} />
            <span className={libelleCls}>{t('nav.accueil')}</span>
          </NavLink>
          <NavLink to="/epargne" className={({ isActive }) => tabCls(isActive)} onClick={() => haptic.tap()}>
            <PiggyBank size={20} />
            <span className={libelleCls}>{t('nav.epargne')}</span>
          </NavLink>
          <div className="relative flex flex-1 items-center justify-center self-stretch">
            <span
              className="pointer-events-none absolute -ml-6 -mt-6 h-12 w-12 rounded-full bg-brand-600/40 animate-pulse-ring"
              style={{ top: 12, left: '50%' }}
            />
            <button
              className={`grid h-14 w-14 -mt-5 place-items-center rounded-full bg-brand-600 text-white shadow-lg shadow-brand-600/30 animate-fab-pop ${presse ? 'fab-pressed' : ''}`}
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
          <NavLink to="/stats" className={({ isActive }) => tabCls(isActive)} onClick={() => haptic.tap()}>
            <BarChart3 size={20} />
            <span className={libelleCls}>{t('nav.stats')}</span>
          </NavLink>
          <NavLink to="/parametres" className={({ isActive }) => tabCls(isActive)} onClick={() => haptic.tap()}>
            <Settings size={20} />
            <span className={libelleCls}>{t('nav.reglages')}</span>
          </NavLink>
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
