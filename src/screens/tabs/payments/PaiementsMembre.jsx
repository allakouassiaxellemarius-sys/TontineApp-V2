import { useState } from 'react'
import { AlertTriangle, CalendarDays } from 'lucide-react'
import { useAuth } from '../../../context/AuthContext'
import { getToursAvecMembre, getMembres } from '../../../lib/db'
import { formatDate } from '../../../lib/format'
import EmptyState from '../../../components/EmptyState'
import PayerMaCotisation from '../PayerMaCotisation'
import PaiementTour from './PaiementsUnifies'

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
    return (
      <EmptyState
        icon={CalendarDays}
        title="Aucun tour"
        description="Le planning des tours n'a pas encore été généré par le responsable."
      />
    )
  }

  return (
    <div className="animate-fade-up">
      <div className="mb-4 flex items-start gap-2 rounded-2xl border border-info-200 bg-info-50 p-3">
        <AlertTriangle size={16} className="mt-0.5 shrink-0 text-info-500" />
        <p className="text-xs text-info-700">Lecture seule : vos cotisations sont confirmées par le responsable.</p>
      </div>

      {group.codeUnique && <PayerMaCotisation group={group} membre={membreConnecte} tour={tour} />}

      <div className="card mb-4 p-4">
        <label className="label">Tour en cours</label>
        <select className="input" value={tourId || ''} onChange={(e) => setTourId(e.target.value)}>
          {actifs.map((t) => (
            <option key={t.id} value={t.id}>
              Tour #{t.numero} — {t.membre?.nom} ({t.statut === 'recu' ? 'reçu' : formatDate(t.datePrevue)})
            </option>
          ))}
        </select>
      </div>

      {tour && <PaiementTour groupe={group} tour={tour} estGerant={false} membreConnecte={membreConnecte} />}
    </div>
  )
}
