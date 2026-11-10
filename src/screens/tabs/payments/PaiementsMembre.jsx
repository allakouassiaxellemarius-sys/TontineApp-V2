import { useState } from 'react'
import { AlertTriangle, CalendarDays, MessageCircle } from 'lucide-react'
import { useAuth } from '../../../context/AuthContext'
import { getToursAvecMembre, getMembres } from '../../../lib/db'
import { telephoneValide, lienWhatsApp, ouvrirLien } from '../../../lib/remind'
import EmptyState from '../../../components/EmptyState'
import PayerMaCotisation from '../PayerMaCotisation'
import PaiementTour from './PaiementsUnifies'
import SelecteurTour from './SelecteurTour'

export default function PaiementsMembre({ group }) {
  const { utilisateur } = useAuth()
  const uid = utilisateur ? utilisateur.uid : null

  const tours = getToursAvecMembre(group.id)
  const membres = getMembres(group.id)
  const membreConnecte = membres.find((m) => m.uid === uid) || null
  const actifs = tours.filter((t) => t.statut === 'en_attente' || t.statut === 'recu')
  const [tourId, setTourId] = useState(() => actifs[0]?.id || null)
  const tour = actifs.find((t) => t.id === Number(tourId)) || null

  if (tours.length === 0) {
    const responsable = membres.find((m) => m.uid === group.proprietaire) || null
    const tel = responsable ? responsable.telephone || responsable.tel : ''
    return (
      <EmptyState
        icon={CalendarDays}
        title="Aucun tour"
        description="Le planning des tours n'a pas encore été généré par le responsable."
        action={responsable && telephoneValide(tel) && (
          <button
            className="btn btn-primary"
            onClick={() => ouvrirLien(lienWhatsApp(
              tel,
              `Bonjour ${responsable.nom}, le planning des tours de « ${group.nom} » n'est pas encore généré. Tu peux le créer dans Tontine Manager (onglet Argent) pour qu'on commence à cotiser.`,
            ))}
          >
            <MessageCircle size={16} /> Prévenir le responsable
          </button>
        )}
      />
    )
  }

  return (
    <div>
      <div className="mb-4 flex items-start gap-2 rounded-2xl border border-info-200 bg-info-50 p-3">
        <AlertTriangle size={16} className="mt-0.5 shrink-0 text-info-500" />
        <p className="text-xs text-info-700">Lecture seule : vos cotisations sont confirmées par le responsable.</p>
      </div>

      <SelecteurTour tours={actifs} tourId={tourId} onChange={setTourId} libelle="Tour en cours" />

      {group.codeUnique && <PayerMaCotisation group={group} membre={membreConnecte} tour={tour} />}

      {tour && <PaiementTour groupe={group} tour={tour} estGerant={false} membreConnecte={membreConnecte} />}
    </div>
  )
}
