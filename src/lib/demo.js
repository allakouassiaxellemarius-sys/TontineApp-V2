// ═══════════════════════════════════════════════════════════════
// Tontine de démonstration — un groupe pré-rempli pour essayer
// l'application sans risque (aucune donnée réelle, numéros fictifs).
// ═══════════════════════════════════════════════════════════════
import {
  createGroup, addMembre, generateTours, getTours, getMembres,
  payerCotisation, marquerTourRecu,
} from './db'
import { todayStr } from './storage'

const DEMO_MEMBRES = [
  { nom: 'Aya Kouassi', telephone: '07 00 00 00 01', role: 'responsable' },
  { nom: 'Konan Yao', telephone: '07 00 00 00 02', role: 'membre' },
  { nom: 'Fatou Traoré', telephone: '07 00 00 00 03', role: 'membre' },
  { nom: 'Ibrahim Bakayoko', telephone: '07 00 00 00 04', role: 'membre' },
  { nom: "Adjoua N'Guessan", telephone: '07 00 00 00 05', role: 'membre' },
]

// Crée un groupe de démonstration vivant : 5 membres, planning de 5 tours,
// 1er tour encaissé et distribué, 2e tour en cours avec un retardataire.
// Renvoie le groupe créé, ou null si hors ligne.
export function creerTontineDemo() {
  const groupe = createGroup({
    nom: '🌟 Tontine Démo (Nzassa)',
    montantCotisation: 5000,
    periodeJours: 7,
    moyensPaiement: ['Money Fusion'],
    penalitePctParJour: 2,
    responsableParticipe: true,
    leReceveurCotonise: true,
  })
  if (!groupe) return null
  for (const m of DEMO_MEMBRES) addMembre(groupe.id, m)
  const tours = generateTours(groupe.id)
  if (!tours.length) return groupe

  const membres = getMembres(groupe.id)
  const auj = todayStr()
  const moyens = ['Money Fusion', 'Espèces', 'Money Fusion', 'Money Fusion']

  // Tour 1 : 4 cotisations encaissées, pot distribué, tour 2 créé auto.
  const tour1 = tours[0]
  membres.slice(0, 4).forEach((m, i) => {
    payerCotisation(groupe.id, tour1.id, m.id, groupe.montantCotisation, auj, moyens[i], {})
  })
  marquerTourRecu(tour1.id, auj)

  // Tour 2 : en cours — 2 cotisations, 1 retardataire (Ibrahim).
  const tour2 = getTours(groupe.id).find((t) => t.statut === 'en_attente')
  if (tour2) {
    membres.slice(0, 2).forEach((m, i) => {
      payerCotisation(groupe.id, tour2.id, m.id, groupe.montantCotisation, auj, i ? 'Money Fusion' : 'Espèces', {})
    })
  }
  return groupe
}
