import { useState } from 'react'
import { CheckCircle2, CalendarDays, ScanLine, Wand2 } from 'lucide-react'
import { useData } from '../../../context/DataContext'
import { useAuth } from '../../../context/AuthContext'
import { useToast } from '../../../context/ToastContext'
import { haptic } from '../../../lib/haptique'
import { marquerTourRecu } from '../../../lib/db'
import { todayStr } from '../../../lib/storage'
import useGenerationPlanning from '../../../hooks/useGenerationPlanning'
import { resumeTour } from '../../../lib/paiements'
import { formatMontant } from '../../../lib/format'
import Modal from '../../../components/Modal'
import ConfirmationRenforcee from '../../../components/ConfirmationRenforcee'
import EmptyState from '../../../components/EmptyState'
import Tresorerie from '../Tresorerie'
import PaiementTour from './PaiementsUnifies'
import RapprochementAssiste from './RapprochementAssiste'
import SelecteurTour from './SelecteurTour'

export default function PaiementsGerant({ group, readOnly }) {
  const { refresh } = useData()
  const toast = useToast()
  const { utilisateur } = useAuth()
  const uid = utilisateur ? utilisateur.uid : null

  const { tours, membres, confirmGen, demanderGeneration, annulerGeneration, generer } =
    useGenerationPlanning(group)
  const actifs = tours.filter((t) => t.statut === 'en_attente' || t.statut === 'recu')
  const [tourId, setTourId] = useState(() => actifs[0]?.id || null)
  const tour = actifs.find((t) => t.id === Number(tourId)) || null

  const resume = tour ? resumeTour(group, tour) : null
  const [confirmPot, setConfirmPot] = useState(false)
  const [confirmCodePot, setConfirmCodePot] = useState(false)
  const [rappr, setRappr] = useState(false)

  // Distribution du pot = action sensible : anti-fraud (pas de double
  // distribution) + confirmation renforcée (code) gérée par le modal.
  const distribuerPot = () => {
    if (!tour) return
    if (tour.statut === 'recu') {
      toast.warning(`Le pot du tour #${tour.numero} a déjà été distribué`)
      return
    }
    const maj = marquerTourRecu(tour.id, todayStr())
    refresh()
    // marquerTourRecu renvoie null quand rien n'a été écrit (groupe invité, hors
    // ligne, tour déjà distribué) : on n'annonce la distribution qu'après relecture.
    if (maj?.statut !== 'recu') {
      toast.error('Enregistrement impossible (groupe en lecture seule ou hors ligne).')
      return
    }
    haptic.success()
    toast.success(`Pot du tour #${tour.numero} reçu par ${tour.membre?.nom}`)
  }

  // Aucun tour = aucune cotisation à encaisser : la génération doit se déclencher
  // ici, sinon la section Paiements est une impasse (il n'y a pas d'onglet « Tours »).
  if (tours.length === 0) {
    return (
      <div>
        <EmptyState
          icon={CalendarDays}
          title="Aucun tour"
          description={membres.length
            ? `Générez le planning : un tour par membre, espacé de ${group.periodeJours} jour(s).`
            : "Ajoutez des membres dans l'onglet Membres, puis générez le planning."}
          action={!readOnly && membres.length > 0 && (
            <button className="btn btn-primary" onClick={demanderGeneration}>
              <Wand2 size={16} /> Générer le planning
            </button>
          )}
        />
        <Modal
          open={confirmGen}
          onClose={annulerGeneration}
          title="Générer le planning"
          footer={
            <>
              <button className="btn btn-secondary" onClick={annulerGeneration}>Annuler</button>
              <button className="btn btn-primary" onClick={generer}><Wand2 size={16} /> Générer</button>
            </>
          }
        >
          <p className="text-sm text-gray-600">
            Un tour sera créé pour chaque membre, espacé de {group.periodeJours} jour(s). Les cotisations
            pourront alors être encaissées tour par tour.
          </p>
        </Modal>
      </div>
    )
  }

  return (
    <div className="animate-fade-up">
      <Tresorerie group={group} uid={uid} estGerant />

      <SelecteurTour tours={actifs} tourId={tourId} onChange={setTourId} libelle="Tour à régler" />

      {tour && resume && resume.payes >= resume.total && tour.statut === 'en_attente' && (
        <div className="card mb-4 p-4">
          <button className="btn btn-primary w-full" onClick={() => setConfirmPot(true)}>
            <CheckCircle2 size={16} /> Pot complet — marquer reçu
          </button>
        </div>
      )}

      {/* Le rapprochement dépend du tour choisi : key force une nouvelle
          analyse quand le responsable change de tour. */}
      {tour && rappr && (
        <RapprochementAssiste key={tour.id} group={group} tour={tour} onFermer={() => setRappr(false)} />
      )}
      {tour && !rappr && (
        <button className="btn btn-secondary mb-4 w-full" onClick={() => setRappr(true)}>
          <ScanLine size={16} /> Rapprocher un relevé Wave / Orange Money
        </button>
      )}

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
