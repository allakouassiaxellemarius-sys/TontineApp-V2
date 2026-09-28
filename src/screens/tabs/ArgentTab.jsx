import PaymentsTab from './PaymentsTab'
import PretsTab from './PretsTab'
import ToursTab from './ToursTab'
import OrdreTab from './OrdreTab'
import HistoryTab from './HistoryTab'
import JournalTab from './JournalTab'

// Onglet « Argent » : hub consolidé. Regroupe en sections claires les
// paiements, prêts, planning/ordre, historique et le journal d'audit.
export default function ArgentTab({ group, readOnly, onGoTo }) {
  const go = (id) => onGoTo && onGoTo(id === 'paiements' ? 'argent' : id)
  return (
    <div className="space-y-6">
      <PaymentsTab group={group} readOnly={readOnly} />
      <PretsTab group={group} readOnly={readOnly} />

      <section>
        <h2 className="mb-2 px-1 text-sm font-extrabold uppercase tracking-wide text-gray-500">
          Planning &amp; ordre
        </h2>
        <ToursTab group={group} readOnly={readOnly} onGoTo={go} />
        <OrdreTab group={group} readOnly={readOnly} />
      </section>

      <section>
        <h2 className="mb-2 px-1 text-sm font-extrabold uppercase tracking-wide text-gray-500">
          Historique
        </h2>
        <HistoryTab group={group} />
      </section>

      <section>
        <h2 className="mb-2 px-1 text-sm font-extrabold uppercase tracking-wide text-gray-500">
          Journal d'audit
        </h2>
        <JournalTab group={group} readOnly={readOnly} />
      </section>
    </div>
  )
}
