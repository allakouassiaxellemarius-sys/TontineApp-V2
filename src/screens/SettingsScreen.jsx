import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  ArrowLeft, BellRing, Users, Lock, ChevronDown, LogOut,
} from 'lucide-react'
import { useData } from '../context/DataContext'
import { getSettings, saveSettingsLocal } from '../lib/format'
import { programmerRappelsLocaux } from '../lib/rappelLocal'
import { VERSION_APP } from '../lib/version'
import { usePin } from '../context/PinContext'
import { useAuth } from '../context/AuthContext'
import SettingsNotifications from '../components/settings/SettingsNotifications'
import SettingsSms from '../components/settings/SettingsSms'
import SettingsBienvenue from '../components/settings/SettingsBienvenue'
import Avatar from '../components/Avatar'
import { choisirPhoto } from '../lib/photo'

function Section({ icon: Icon, title, subtitle, action, children, ouvert, onToggle }) {
  return (
    <div className="card mb-3 overflow-hidden">
      <button type="button" onClick={onToggle} className="flex w-full items-center gap-3 px-4 py-3.5 text-left">
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-brand-50 text-brand-600">
          <Icon size={18} />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-bold text-gray-800">{title}</span>
          {subtitle && <span className="block truncate text-xs text-gray-400">{subtitle}</span>}
        </span>
        <span className="shrink-0 text-[11px] font-bold uppercase tracking-wide text-brand-600">{action}</span>
        <ChevronDown size={18} className={`shrink-0 text-gray-300 transition-transform ${ouvert ? 'rotate-180' : ''}`} />
      </button>
      {ouvert && <div className="border-t border-gray-100 px-4 py-4">{children}</div>}
    </div>
  )
}

export default function SettingsScreen({ maj }) {
  const navigate = useNavigate()
  const { refresh } = useData()
  const { verrouiller } = usePin()
  const { utilisateur, deconnecter, setPhotoProfil } = useAuth()
  const [s, setS] = useState(() => getSettings())
  const [ouvert, setOuvert] = useState({})

  const patchS = (arg) => {
    setS((prev) => {
      const next = typeof arg === 'function' ? arg(prev) : { ...prev, ...arg }
      saveSettingsLocal(next)
      if (next.recapQuotidienActif !== prev.recapQuotidienActif) programmerRappelsLocaux()
      return next
    })
    refresh()
  }
  const set = (k) => (e) => patchS({ [k]: e.target.value })
  const toggleSection = (id) => setOuvert((o) => ({ ...o, [id]: !o[id] }))

  const surDeconnexion = async () => {
    await deconnecter()
    navigate('/')
  }

  const changerPhoto = async () => {
    const data = await choisirPhoto()
    if (data) {
      setPhotoProfil(data)
      refresh()
    }
  }

  return (
    <div className="mx-auto max-w-lg px-4 pb-24 pt-4 pt-safe">
      <div className="mb-5 flex items-center gap-3">
        <button className="btn btn-icon" onClick={() => navigate('/')} aria-label="Retour">
          <ArrowLeft size={18} />
        </button>
        <h1 className="text-xl font-bold text-gray-800">Réglages</h1>
      </div>

      <Section
        icon={BellRing}
        title="Argent"
        subtitle="Combien, quand, et où on envoie"
        action="Régler"
        ouvert={!!ouvert.money}
        onToggle={() => toggleSection('money')}
      >
        <SettingsNotifications enLigne={true} />
      </Section>

      <Section
        icon={Users}
        title="Membres"
        subtitle="Ajouter et gérer les gens du groupe"
        action="Régler"
        ouvert={!!ouvert.people}
        onToggle={() => toggleSection('people')}
      >
        <SettingsSms s={s} set={set} />
        <div className="mt-4 border-t border-gray-100 pt-4">
          <SettingsBienvenue s={s} setS={patchS} />
        </div>
      </Section>

      <Section
        icon={Users}
        title="Compte"
        subtitle="Votre profil et photo"
        action="Modifier"
        ouvert={!!ouvert.compte}
        onToggle={() => toggleSection('compte')}
      >
        <div className="flex items-center gap-3">
          <Avatar src={utilisateur?.photoURL} nom={utilisateur?.displayName || utilisateur?.email || 'Moi'} size={56} />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-bold text-gray-800">{utilisateur?.displayName || 'Mon compte'}</p>
            {utilisateur?.email && <p className="truncate text-xs text-gray-400">{utilisateur.email}</p>}
          </div>
        </div>
        <button className="btn btn-secondary mt-3 w-full" onClick={changerPhoto}>
          Changer la photo
        </button>
      </Section>

      <Section
        icon={Lock}
        title="Contrôle"
        subtitle="Verrouillez à tout moment"
        action="Fermer"
        ouvert={!!ouvert.control}
        onToggle={() => toggleSection('control')}
      >
        <button className="btn btn-primary w-full" onClick={verrouiller}>
          <Lock size={16} /> Verrouiller maintenant
        </button>
      </Section>

      <button
        onClick={surDeconnexion}
        className="mt-2 flex w-full items-center justify-center gap-2 rounded-2xl border border-danger-200 bg-danger-50 py-3 text-sm font-bold text-danger-600"
      >
        <LogOut size={16} /> Déconnexion
      </button>
      <p className="mt-2 text-center text-[11px] text-gray-400">Vous allez perdre l'accès aux notifications</p>

      <div className="mt-4 text-center">
        <p className="text-xs text-gray-400">Tontine Manager v{VERSION_APP}</p>
      </div>
    </div>
  )
}
