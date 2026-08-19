import PaymentsTab from './PaymentsTab'
import PretsTab from './PretsTab'

// Onglet « Argent » : consolidé (paiements + prêts). Remplace les onglets
// « Paiements » et « Prêts » séparés de la barre principale.
export default function ArgentTab({ group, readOnly }) {
  return (
    <div className="space-y-6">
      <PaymentsTab group={group} readOnly={readOnly} />
      <PretsTab group={group} readOnly={readOnly} />
    </div>
  )
}
