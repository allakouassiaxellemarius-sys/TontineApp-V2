import { useAuth } from '../../context/AuthContext'
import { estResponsableDuGroupe } from '../../lib/administration'
import PaiementsGerant from './payments/PaiementsGerant'
import PaiementsMembre from './payments/PaiementsMembre'

export default function PaymentsTab({ group, readOnly }) {
  const { utilisateur } = useAuth()
  const uid = utilisateur ? utilisateur.uid : null
  // La gestion des paiements (confirmer, rapprocher, répartir) revient au
  // responsable de la tontine — propriétaire ou co-responsable — et à
  // l'administrateur de l'app. Un membre simple garde l'écran membre : voir
  // son tour et signaler « j'ai payé ».
  const estGerant = estResponsableDuGroupe(group, uid)

  if (estGerant) return <PaiementsGerant group={group} readOnly={readOnly} />
  return <PaiementsMembre group={group} />
}
