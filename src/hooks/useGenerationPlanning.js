import { useState } from 'react'
import { useData } from '../context/DataContext'
import { useToast } from '../context/ToastContext'
import { haptic } from '../lib/haptique'
import { generateTours, getMembres, getToursAvecMembre, membreSansTour } from '../lib/db'

// generateTours ne crée rien en silence (aucun membre, hors ligne, ou tous déjà
// planifiés) : annoncer « Planning généré » dans ce cas ferait croire à une perte
// de données. Le retour de l'écriture est donc mesuré, pas supposé.
export default function useGenerationPlanning(group) {
  const { refresh } = useData()
  const toast = useToast()
  const [confirmGen, setConfirmGen] = useState(false)

  const tours = getToursAvecMembre(group.id)
  const membres = getMembres(group.id)
  const sansTour = membreSansTour(membres, tours)

  const generer = () => {
    const avant = tours.length
    const apres = (generateTours(group.id) || []).length
    setConfirmGen(false)
    refresh()
    const crees = apres - avant
    if (crees > 0) {
      haptic.success()
      toast.success(`${crees} tour${crees > 1 ? 's' : ''} planifié${crees > 1 ? 's' : ''}`)
    } else if (membres.length === 0) {
      toast.warning("Ajoute d'abord des membres : un tour par membre.")
    } else if (avant === apres) {
      toast.info('Tous les membres ont déjà un tour planifié.')
    } else {
      toast.error('Génération impossible (groupe en lecture seule ou hors ligne).')
    }
    return crees
  }

  return {
    tours,
    membres,
    sansTour,
    confirmGen,
    demanderGeneration: () => setConfirmGen(true),
    annulerGeneration: () => setConfirmGen(false),
    generer,
  }
}
