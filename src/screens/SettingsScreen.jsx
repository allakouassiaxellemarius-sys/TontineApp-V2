import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  ArrowLeft, Cloud, ShieldCheck, BellRing, Zap, Landmark,
  MessageSquareText, DownloadCloud, GraduationCap, ChevronDown, Palette, RefreshCw, Languages,
} from 'lucide-react'
import { useData } from '../context/DataContext'
import { useConnection } from '../context/ConnectionContext'
import { getSettings, saveSettingsLocal } from '../lib/format'
import { programmerRappelsLocaux } from '../lib/rappelLocal'
import { VERSION_APP } from '../lib/version'
import { t, useLangue } from '../lib/i18n'
import SettingsSecurite from '../components/settings/SettingsSecurite'
import SettingsCompte from '../components/settings/SettingsCompte'
import SettingsNotifications from '../components/settings/SettingsNotifications'
import SettingsMisesAJour from '../components/settings/SettingsMisesAJour'
import SettingsDecouverte from '../components/settings/SettingsDecouverte'
import SettingsAutomatisations from '../components/settings/SettingsAutomatisations'
import SettingsDevise from '../components/settings/SettingsDevise'
import SettingsSms from '../components/settings/SettingsSms'
import SettingsBienvenue from '../components/settings/SettingsBienvenue'
import SettingsApparence from '../components/settings/SettingsApparence'
import SettingsSauvegarde from '../components/settings/SettingsSauvegarde'
import SettingsLangue from '../components/settings/SettingsLangue'

function Section({ icon: Icon, title, subtitle, children, ouvert, onToggle }) {
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
        <ChevronDown size={18} className={`shrink-0 text-gray-300 transition-transform ${ouvert ? 'rotate-180' : ''}`} />
      </button>
      {ouvert && <div className="border-t border-gray-100 px-4 py-4">{children}</div>}
    </div>
  )
}

export default function SettingsScreen({ maj }) {
  const navigate = useNavigate()
  const { refresh } = useData()
  const { enLigne, modeHorsLigne } = useConnection()
  useLangue()
  const [s, setS] = useState(() => getSettings())
  const [ouvert, setOuvert] = useState({ compte: true })

  // Enregistre immédiatement chaque modification locale (même hors ligne).
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

  return (
    <div className="mx-auto max-w-lg px-4 pb-24 pt-4 pt-safe">
      <div className="mb-5 flex items-center gap-3">
        <button className="btn btn-icon" onClick={() => navigate('/')} aria-label={t('commun.retour')}>
          <ArrowLeft size={18} />
        </button>
        <h1 className="text-xl font-bold text-gray-800">{t('settings.titre')}</h1>
      </div>

      <Section
        icon={Cloud}
        title={t('settings.compte.title')}
        subtitle={t('settings.compte.subtitle')}
        ouvert={!!ouvert.compte}
        onToggle={() => toggleSection('compte')}
      >
        <SettingsCompte refresh={refresh} modeHorsLigne={modeHorsLigne} />
      </Section>

      <Section
        icon={DownloadCloud}
        title={t('settings.sauvegarde.title')}
        subtitle={t('settings.sauvegarde.subtitle')}
        ouvert={!!ouvert.sauvegarde}
        onToggle={() => toggleSection('sauvegarde')}
      >
        <SettingsSauvegarde refresh={refresh} />
      </Section>

      <Section
        icon={ShieldCheck}
        title={t('settings.securite.title')}
        subtitle={t('settings.securite.subtitle')}
        ouvert={!!ouvert.securite}
        onToggle={() => toggleSection('securite')}
      >
        <SettingsSecurite enLigne={enLigne} refresh={refresh} />
      </Section>

      <Section
        icon={BellRing}
        title={t('settings.notifications.title')}
        subtitle={t('settings.notifications.subtitle')}
        ouvert={!!ouvert.notifications}
        onToggle={() => toggleSection('notifications')}
      >
        <SettingsNotifications enLigne={enLigne} />
      </Section>

      <Section
        icon={Zap}
        title={t('settings.automatisations.title')}
        subtitle={t('settings.automatisations.subtitle')}
        ouvert={!!ouvert.automatisations}
        onToggle={() => toggleSection('automatisations')}
      >
        <SettingsAutomatisations s={s} setS={patchS} />
      </Section>

      <Section
        icon={Landmark}
        title={t('settings.devise.title')}
        subtitle={t('settings.devise.subtitle')}
        ouvert={!!ouvert.devise}
        onToggle={() => toggleSection('devise')}
      >
        <SettingsDevise s={s} set={set} />
      </Section>

      <Section
        icon={MessageSquareText}
        title={t('settings.messages.title')}
        subtitle={t('settings.messages.subtitle')}
        ouvert={!!ouvert.messages}
        onToggle={() => toggleSection('messages')}
      >
        <SettingsSms s={s} set={set} />
        <div className="mt-4 border-t border-gray-100 pt-4">
          <SettingsBienvenue s={s} setS={patchS} />
        </div>
      </Section>

      <Section
        icon={Palette}
        title={t('settings.apparence.title')}
        subtitle={t('settings.apparence.subtitle')}
        ouvert={!!ouvert.apparence}
        onToggle={() => toggleSection('apparence')}
      >
        <SettingsApparence />
      </Section>

      <Section
        icon={Languages}
        title={t('settings.langue.title')}
        subtitle={t('settings.langue.subtitle')}
        ouvert={!!ouvert.langue}
        onToggle={() => toggleSection('langue')}
      >
        <SettingsLangue />
      </Section>

      <Section
        icon={GraduationCap}
        title={t('settings.decouverte.title')}
        subtitle={t('settings.decouverte.subtitle')}
        ouvert={!!ouvert.decouverte}
        onToggle={() => toggleSection('decouverte')}
      >
        <SettingsDecouverte />
      </Section>

      <Section
        icon={RefreshCw}
        title={t('settings.maj.title')}
        subtitle={t('settings.maj.subtitle')}
        ouvert={!!ouvert.maj}
        onToggle={() => toggleSection('maj')}
      >
        <SettingsMisesAJour maj={maj} />
      </Section>

      <div className="mt-4 text-center">
        <p className="text-xs text-gray-400">Tontine Manager v{VERSION_APP}</p>
        <p className="text-[11px] text-gray-300">{t('settings.footer')}</p>
      </div>
    </div>
  )
}
