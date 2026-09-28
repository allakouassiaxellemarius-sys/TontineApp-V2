import { useState } from 'react'
import { CheckCircle2, CalendarDays } from 'lucide-react'
import { useData } from '../../../context/DataContext'
import { useAuth } from '../../../context/AuthContext'
import { useToast } from '../../../context/ToastContext'
import { haptic } from '../../../lib/haptique'
import { getToursAvecMembre, marquerTourRecu } from '../../../lib/db'
import { resumeTour } from '../../../lib/paiements'
import { formatMontant, formatDate } from '../../../lib/format'
import Modal from '../../../components/Modal'
import ConfirmationRenforcee from '../../../components/ConfirmationRenforcee'
import EmptyState from '../../../components/EmptyState'
import Tresorerie from '../Tresorerie'
import PaiementTour from './PaiementsUnifies'

export default function PaiementsGerant({ group }) {
  const { refresh } = useData()
  const toast = useToast()
  const { utilisateur } = useAuth()
  const uid = utilisateur ? utilisateur.uid : null

  const tours = getToursAvecMembre(group.id)
  const actifs = tours.filter((t) => t.statut === 'en_attente' || t.statut === 'recu')
  const [tourId, setTourId] = useState(() => actifs[0]?.id || null)
  const tour = actifs.find((t) => t.id === Number(tourId)) || null

  const resume = tour ? resumeTour(group, tour) : null
  const [confirmPot, setConfirmPot] = useState(false)
  const [confirmCodePot, setConfirmCodePot] = useState(false)

  // Distribution du pot = action sensible : anti-fraud (pas de double
  // distribution) + confirmation renforcée (code) gérée par le modal.
  const distribuerPot = () => {
    if (!tour) return
    if (tour.statut === 'recu') {
      toast.warning(`Le pot du tour #${tour.numero} a déjà été distribué`)
      return
    }
    marquerTourRecu(tour.id, new Date().toISOString().slice(0, 10))
    refresh()
    haptic.success()
    toast.success(`Pot du tour #${tour.numero} reçu par ${tour.membre?.nom}`)
  }

  if (tours.length === 0) {
    return (
      <EmptyState
        icon={CalendarDays}
        title="Aucun tour"
        description="Générez le planning dans l'onglet Tours pour commencer à enregistrer les cotisations."
      />
    )
  }

  return (
    <div className="animate-fade-up">
      <Tresorerie group={group} uid={uid} estGerant />

      <div className="card mb-4 p-4">
        <label className="label">Tour à régler</label>
        <select className="input" value={tourId || ''} onChange={(e) => setTourId(e.target.value)}>
          {actifs.map((t) => (
            <option key={t.id} value={t.id}>
              Tour #{t.numero} — {t.membre?.nom} ({t.statut === 'recu' ? 'reçu' : formatDate(t.datePrevue)})
            </option>
          ))}
        </select>
        {tour && resume && resume.payes >= resume.total && tour.statut === 'en_attente' && (
          <button className="btn btn-primary mt-3 w-full" onClick={() => setConfirmPot(true)}>
            <CheckCircle2 size={16} /> Pot complet — marquer reçu
          </button>
        )}
      </div>

      {tour && <PaiementTour groupe={group} tour={tour} estGerant membreConnecte={null} />}

      <Modal
        open={confirmPot && !!tour}
        onClose={() => setConfirmPot(false)}
        title="Marquer le pot comme reçu ?"
        footer={
          <>
            <button className="btn btn-secondary" onClick={() => setConfirmPot(false)}>Annuler</button>
            <button
              className="btn btn-primary"
              onClick={() => { setConfirmPot(false); setConfirmCodePot(true) }}
            >
              <CheckCircle2 size={16} /> Confirmer
            </button>
          </>
        }
      >
        {tour && resume && (
          <p className="text-sm text-gray-600">
            Toutes les cotisations du tour #{tour.numero} sont payées. « {tour.membre?.nom} » reçoit{' '}
            <span className="font-semibold">{formatMontant(tour.montantPot || 0, group)}</span>.
          </p>
        )}
      </Modal>

      <ConfirmationRenforcee
        open={confirmCodePot}
        titre="Vérification du pot"
        message={`Confirmer la distribution du pot du tour #${tour?.numero} à ${tour?.membre?.nom} (${formatMontant(tour?.montantPot || 0, group)}) ?`}
        onFermer={() => setConfirmCodePot(false)}
        onConfirmer={distribuerPot}
      />
    </div>
  )
}
