import { useState } from 'react'
import { Wallet, HandCoins, CalendarRange, History } from 'lucide-react'
import { haptic } from '../../lib/haptique'
import PaymentsTab from './PaymentsTab'
import PretsTab from './PretsTab'
import ToursTab from './ToursTab'
import OrdreTab from './OrdreTab'
import HistoryTab from './HistoryTab'
import JournalTab from './JournalTab'

// Onglet « Argent » : quatre sections, une seule à l'écran à la fois. Tout
// l'empilement précédent obligeait à traverser prêts, planning et journal pour
// retrouver ses paiements ; ici l'écran s'ouvre sur Paiements et le reste est
// à un tap, sans rien retirer.
const SECTIONS = [
  { id: 'paiements', label: 'Paiements', icon: Wallet },
  { id: 'prets', label: 'Prêts', icon: HandCoins },
  { id: 'planning', label: 'Planning', icon: CalendarRange },
  { id: 'historique', label: 'Historique', icon: History },
]

export default function ArgentTab({ group, readOnly, onGoTo }) {
  const [section, setSection] = useState('paiements')

  const choisir = (id) => {
    setSection(id)
    haptic.tap()
  }

  // Raccourcis internes (ToursTab) : « paiements » reste dans cet onglet,
  // « membres » remonte à la navigation du groupe.
  const go = (id) => {
    if (id === 'paiements') {
      setSection('paiements')
      return
    }
    onGoTo && onGoTo(id)
  }

  return (
    <div>
      <div
        role="tablist"
        aria-label="Sections de l'onglet Argent"
        className="mb-4 flex gap-1.5 overflow-x-auto pb-1"
      >
        {SECTIONS.map((s) => {
          const actif = section === s.id
          return (
            <button
              key={s.id}
              type="button"
              role="tab"
              aria-selected={actif}
              onClick={() => choisir(s.id)}
              className={`flex shrink-0 items-center gap-1.5 rounded-full px-3.5 py-2 text-xs font-extrabold ${
                actif
                  ? 'bg-brand-600 text-white shadow-[0_4px_12px_rgba(13,122,80,0.25)]'
                  : 'bg-[rgb(var(--surface-muted))] text-gray-500'
              }`}
            >
              <s.icon size={14} />
              {s.label}
            </button>
          )
        })}
      </div>

      <div role="tabpanel">
        {section === 'paiements' && <PaymentsTab group={group} readOnly={readOnly} />}

        {section === 'prets' && <PretsTab group={group} readOnly={readOnly} />}

        {section === 'planning' && (
          <div className="space-y-8">
            <ToursTab group={group} readOnly={readOnly} onGoTo={go} />
            <section>
              <h2 className="mb-2 px-1 text-sm font-extrabold uppercase tracking-wide text-gray-500">
                Ordre de passage
              </h2>
              <OrdreTab group={group} readOnly={readOnly} />
            </section>
          </div>
        )}

        {section === 'historique' && (
          <div className="space-y-8">
            <HistoryTab group={group} />
            <section>
              <h2 className="mb-2 px-1 text-sm font-extrabold uppercase tracking-wide text-gray-500">
                Journal d'audit
              </h2>
              <JournalTab group={group} readOnly={readOnly} />
            </section>
          </div>
        )}
      </div>
    </div>
  )
}
