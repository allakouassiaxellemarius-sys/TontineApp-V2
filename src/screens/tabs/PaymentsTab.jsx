import { useAuth } from '../../context/AuthContext'
import { peutAdministrer } from '../../lib/administration'
import PaiementsGerant from './payments/PaiementsGerant'
import PaiementsMembre from './payments/PaiementsMembre'

export default function PaymentsTab({ group, readOnly }) {
  const { utilisateur } = useAuth()
  const uid = utilisateur ? utilisateur.uid : null
  // Régime administrateur unique : la gestion des paiements (confirmer,
  // rapprocher, répartir) ne revient plus au responsable du groupe mais à
  // l'administrateur de l'app. Tout autre compte garde l'écran membre : voir
  // son tour et signaler « j'ai payé ».
  const estGerant = peutAdministrer(uid)

  if (estGerant) return <PaiementsGerant group={group} readOnly={readOnly} />
  return <PaiementsMembre group={group} />
}
