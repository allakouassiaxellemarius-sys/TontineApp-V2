import { useAuth } from '../../context/AuthContext'
import PaiementsGerant from './payments/PaiementsGerant'
import PaiementsMembre from './payments/PaiementsMembre'

export default function PaymentsTab({ group, readOnly }) {
  const { utilisateur } = useAuth()
  const uid = utilisateur ? utilisateur.uid : null
  // Un groupe non invité (rejoint:false) est celui de l'utilisateur sur cet
  // appareil : il en est le responsable. Un groupe invité garde la règle stricte.
  const estGerant = group.rejoint
    ? (!!uid && (group.proprietaire === uid || !!(group.coGerants && group.coGerants[uid])))
    : true

  if (estGerant) return <PaiementsGerant group={group} readOnly={readOnly} />
  return <PaiementsMembre group={group} />
}
