import { useNavigate } from 'react-router-dom'
import { ArrowLeft, Settings, ShieldCheck, LogOut, ChevronRight } from 'lucide-react'
import { useData } from '../context/DataContext'
import { useAuth } from '../context/AuthContext'
import { t, useLangue } from '../lib/i18n'
import Avatar from '../components/Avatar'

export default function ProfilScreen() {
  const navigate = useNavigate()
  const { utilisateur, deconnecter } = useAuth()
  const { groups } = useData()
  useLangue()

  const nom =
    utilisateur?.displayName || utilisateur?.email?.split('@')[0] || t('profil.compteLocal')
  const initiales = nom
    .split(/\s+/)
    .map((mot) => mot[0])
    .join('')
    .slice(0, 2)
    .toUpperCase()

  const sortie = async () => {
    await deconnecter()
    navigate('/connexion')
  }

  return (
    <div className="app-shell mx-auto min-h-screen max-w-lg px-4 pb-24 pt-4 pt-safe">
      <div className="mb-5 flex items-center gap-3">
        <button className="btn btn-icon" onClick={() => navigate('/')} aria-label={t('commun.retour')}>
          <ArrowLeft size={18} />
        </button>
        <div>
          <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-[var(--success)]">
            {t('profil.eyebrow')}
          </p>
          <h1 className="font-serif text-xl font-bold text-[var(--text)]">{t('profil.titre')}</h1>
        </div>
      </div>

      <div className="hero-wallet mb-5 rounded-[26px] p-5">
        <div className="relative z-10 flex items-center gap-4">
          <div className="rounded-full bg-white p-1 shadow-lg">
            <Avatar src={utilisateur?.photoURL} nom={initiales} size={58} />
          </div>
          <div className="min-w-0">
            <h2 className="truncate text-lg font-extrabold">{nom}</h2>
            <p className="truncate text-xs text-white/80">{utilisateur?.email || t('profil.compteLocal')}</p>
          </div>
        </div>
      </div>

      <div className="mb-4 grid grid-cols-2 gap-3">
        <div className="card text-center">
          <p className="text-2xl font-extrabold text-[var(--success)]">{groups.length}</p>
          <p className="text-xs text-[var(--text-muted)]">{t('profil.tontines')}</p>
        </div>
        <div className="card text-center">
          <p className="text-2xl font-extrabold text-[var(--success)]">{t('profil.actif')}</p>
          <p className="text-xs text-[var(--text-muted)]">{t('profil.statutCompte')}</p>
        </div>
      </div>

      <div className="space-y-3">
        <button className="card flex w-full items-center gap-3 text-left" onClick={() => navigate('/parametres')}>
          <Settings size={20} className="text-[var(--success)]" />
          <span className="flex-1">
            <b className="block text-sm text-[var(--text)]">{t('profil.reglagesTitre')}</b>
            <small className="text-xs text-[var(--text-muted)]">{t('profil.reglagesTexte')}</small>
          </span>
          <ChevronRight size={18} className="text-[var(--text-muted)]" />
        </button>

        <div className="card flex items-center gap-3">
          <ShieldCheck size={20} className="text-[var(--success)]" />
          <span>
            <b className="block text-sm text-[var(--text)]">{t('profil.protegeTitre')}</b>
            <small className="text-xs text-[var(--text-muted)]">{t('profil.protegeTexte')}</small>
          </span>
        </div>

        <button className="btn w-full border border-danger-200 bg-danger-50 text-danger-600" onClick={sortie}>
          <LogOut size={17} /> {t('profil.deconnexion')}
        </button>
      </div>
    </div>
  )
}
