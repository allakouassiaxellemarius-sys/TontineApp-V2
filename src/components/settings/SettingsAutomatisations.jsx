import { BellRing, CalendarClock, Cloud, RefreshCw, Zap } from 'lucide-react'
import { useAuth } from '../../context/AuthContext'
import SectionCard from './SectionCard'
import ActionRow from './ActionRow'
import ToggleRow from './ToggleRow'

export default function SettingsAutomatisations({ s, setS }) {
  const { utilisateur } = useAuth()

  return (
    <SectionCard icon={Zap} title="Automatisations">
      <ToggleRow
        icon={CalendarClock}
        title="Récap quotidien"
        subtitle={s.recapQuotidienActif ? 'Actif — résumé des tours et retardataires chaque matin à 07h30' : 'Inactif'}
        checked={s.recapQuotidienActif}
        onChange={() => setS((prev) => ({ ...prev, recapQuotidienActif: !prev.recapQuotidienActif }))}
      />

      <div className="mt-2">
        <ActionRow
          title="Relance des retardataires"
          subtitle="Active — notification chaque matin tant qu'un tour est en retard, et bouton « Relancer » qui rappelle les non payés sur WhatsApp."
        >
          <BellRing size={16} className="shrink-0 text-brand-600" />
        </ActionRow>
      </div>

      <div className="mt-2">
        <ActionRow
          title="Sauvegarde cloud automatique"
          subtitle={
            utilisateur
              ? 'Active — vos groupes synchronisés sont poussés vers Google toutes les 5 min et à chaque modification.'
              : 'En attente — connectez un compte Google pour activer la sauvegarde automatique.'
          }
        >
          <Cloud size={16} className={`shrink-0 ${utilisateur ? 'text-success-600' : 'text-gray-300'}`} />
        </ActionRow>
      </div>

      <div className="mt-2">
        <ActionRow
          title="Tour suivant automatique"
          subtitle="Active — le tour suivant (échéance + période) est créé dès qu'un pot est reçu et qu'un membre attend encore son tour."
        >
          <RefreshCw size={16} className="shrink-0 text-success-600" />
        </ActionRow>
      </div>
    </SectionCard>
  )
}
