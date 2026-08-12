import * as XLSX from 'xlsx'
import {
  getGroup, getBilan, getToursAvecMembre, getHistorique, getPrets, getGroups, getMembre,
  totalARembourser, rembourseTotal, resteAPayer, etatPret,
} from './db.js'
import { getSettings, formatMontant } from './format.js'
import { sauvegarderFichier } from './export.js'

// ── Vraies feuilles de calcul Excel (.xlsx) ─────────────────────
// Génère un classeur multi-feuilles via SheetJS (xlsx) et le partage /
// enregistre via sauvegarderFichier (natif : Filesystem + Share, web :
// téléchargement). Complète les exports CSV "simulés Excel" existants.

const STATUT_TOUR = { en_attente: 'En attente', recu: 'Reçu', annule: 'Annulé' }
const STATUT_PRET = { en_cours: 'En cours', en_retard: 'En retard', rembourse: 'Remboursé' }
const ROLE_MEMBRE = { tresorier: 'Trésorier', co_responsable: 'Co-responsable', 'co-responsable': 'Co-responsable' }

function aujourd() {
  return new Date().toISOString().slice(0, 10)
}

function nomFichier(base, groupe) {
  const nom = String(groupe?.nom || base)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40) || 'tontine'
  return `${nom}-${aujourd()}.xlsx`
}

// Nom de feuille Excel valide (<= 31 caractères, sans [ ] : * ? / \),
// unique dans le classeur.
function nomFeuille(nom, pris) {
  let base = String(nom || 'Tontine')
    .replace(/[\[\]:*?/\\]/g, ' ')
    .trim()
    .slice(0, 31) || 'Tontine'
  let n = base
  let i = 2
  while (pris.has(n)) {
    n = base.slice(0, 28) + '-' + i
    i++
  }
  pris.add(n)
  return n
}

function ajouterFeuille(wb, titre, aoa, pris) {
  const ws = XLSX.utils.aoa_to_sheet(aoa)
  ws['!cols'] = aoa[0].map((_, i) => ({ wch: Math.max(12, Math.min(28, ...aoa.slice(1).map((r) => String(r[i] ?? '').length + 2))) }))
  XLSX.utils.book_append_sheet(wb, ws, nomFeuille(titre, pris))
  return wb
}

// Feuille « Synthèse » : infos du groupe + tableau par membre.
function syntheseAoa(bilan, settings) {
  const { groupe, membres, totalCotis, totalPenalites, totalPenalitesEnCours, totalRecu, soldeGroupe, parMembre } = bilan
  const m = (n) => formatMontant(n, { deviseSymbole: groupe.deviseSymbole || settings.deviseSymbole, devisePosition: groupe.devisePosition || settings.devisePosition })
  const aoa = [
    ['Tontine Manager — Bilan du groupe'],
    [],
    ['Nom', groupe.nom],
    ["Code d'invitation", groupe.codeUnique || '—'],
    ['Statut', groupe.statut === 'terminee' ? 'Terminée' : 'Active'],
    ['Date de début', groupe.dateDebut || '—'],
    ['Période (jours)', groupe.periodeJours],
    ['Cotisation', m(groupe.montantCotisation)],
    ['Nombre de membres', membres.length],
    [],
    ['Total cotisé', m(totalCotis)],
    ['Total pénalités', m(totalPenalites)],
    ['Pénalités en cours', m(totalPenalitesEnCours || 0)],
    ['Total reçu', m(totalRecu)],
    ['Solde du groupe', m(soldeGroupe)],
    [],
    ['Par membre'],
    ['Membre', 'Téléphone', 'Rôle', 'Blocage', 'Cotisé', 'Pénalités', 'Pénalités en cours', 'Reçu', 'Solde', 'Cotisations', 'Retards'],
  ]
  for (const p of parMembre) {
    aoa.push([
      p.membre.nom,
      p.membre.telephone || '',
      ROLE_MEMBRE[p.membre.role] || 'Membre',
      p.membre.bloque ? 'Oui' : 'Non',
      p.cotise,
      p.penalites,
      p.penalitesEnCours || 0,
      p.recu,
      p.solde,
      p.nbCotisations,
      p.nbEnRetard,
    ])
  }
  return aoa
}

function toursAoa(groupeId) {
  const aoa = [['Tour', 'Bénéficiaire', 'Date prévue', 'Pot', 'Statut', 'Date de réception']]
  for (const t of getToursAvecMembre(groupeId)) {
    aoa.push([t.numero, t.membre?.nom || '—', t.datePrevue, t.montantPot, STATUT_TOUR[t.statut] || t.statut, t.dateReception || '—'])
  }
  return aoa
}

function paiementsAoa(groupeId) {
  const { cotisations, tours, membres } = getBilan(groupeId)
  const parTour = new Map(tours.map((t) => [t.id, t]))
  const parMembre = new Map(membres.map((m) => [m.id, m]))
  const aoa = [['Date', 'Tour', 'Membre', 'Montant', 'Pénalité', 'Moyen de paiement']]
  const tri = [...cotisations].sort((a, b) => String(a.datePaiement).localeCompare(String(b.datePaiement)))
  for (const c of tri) {
    aoa.push([
      c.datePaiement,
      `#${parTour.get(c.tourId)?.numero ?? c.tourId}`,
      parMembre.get(c.membreId)?.nom || '—',
      c.montant,
      c.penalite || 0,
      c.moyenPaiement || '',
    ])
  }
  return aoa
}

function historiqueAoa(groupeId) {
  const aoa = [['Date', 'Type', 'Description', 'Montant', 'Pénalité', 'Moyen de paiement']]
  for (const h of getHistorique(groupeId)) {
    aoa.push([h.date, h.type === 'paiement' ? 'Paiement' : h.type === 'reception' ? 'Réception' : h.type, h.libelle, h.montant, h.penalite || 0, h.moyenPaiement || ''])
  }
  return aoa
}

function pretsAoa(groupeId) {
  const aoa = [['Emprunteur', 'Montant', 'Intérêt (%)', 'Total à rembourser', 'Remboursé', 'Reste', 'Échéance', 'État', 'Note']]
  const auj = aujourd()
  for (const p of getPrets(groupeId)) {
    const nom = getMembre(p.emprunteurId)?.nom || '—'
    aoa.push([
      nom,
      p.montant,
      p.tauxInteret || 0,
      totalARembourser(p),
      rembourseTotal(p),
      resteAPayer(p),
      p.dateEcheance || '—',
      STATUT_PRET[etatPret(p, auj)] || p.statut,
      p.note || '',
    ])
  }
  return aoa
}

// Construit le classeur complet d'un groupe : Synthèse, Membres, Tours,
// Paiements, Historique, Prêts. Exposé pour testabilité.
export function construireClasseurGroupe(groupeId) {
  const groupe = getGroup(groupeId)
  if (!groupe) throw new Error('Groupe introuvable.')
  const settings = getSettings()
  const wb = XLSX.utils.book_new()
  const pris = new Set()
  ajouterFeuille(wb, 'Synthèse', syntheseAoa(getBilan(groupeId), settings), pris)
  ajouterFeuille(wb, 'Membres', [['Membre', 'Téléphone', 'Email', 'Rôle', 'Blocage', 'Date adhésion']].concat(
    getBilan(groupeId).membres.map((m) => [m.nom, m.telephone || '', m.email || '', ROLE_MEMBRE[m.role] || 'Membre', m.bloque ? 'Oui' : 'Non', m.dateAdhesion || ''])
  ), pris)
  ajouterFeuille(wb, 'Tours', toursAoa(groupeId), pris)
  ajouterFeuille(wb, 'Paiements', paiementsAoa(groupeId), pris)
  ajouterFeuille(wb, 'Historique', historiqueAoa(groupeId), pris)
  ajouterFeuille(wb, 'Prêts', pretsAoa(groupeId), pris)
  return wb
}

// Classeur complet d'un groupe, partagé/enregistré en fichier .xlsx.
export function exporterGroupeExcel(groupeId) {
  const groupe = getGroup(groupeId)
  if (!groupe) throw new Error('Groupe introuvable.')
  const wb = construireClasseurGroupe(groupeId)
  const buffer = XLSX.write(wb, { bookType: 'xlsx', type: 'array' })
  return sauvegarderFichier(
    new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }),
    nomFichier('tontine', groupe)
  )
}

// Classeur global : feuille récapitulative + une feuille par groupe
// (synthèse, membres, tours et prêts). Exposé pour testabilité.
export function construireClasseurGlobal() {
  const groups = getGroups()
  if (!groups.length) throw new Error('Aucune tontine à exporter.')
  const settings = getSettings()
  const wb = XLSX.utils.book_new()
  const pris = new Set()

  const recapitulatif = [['Nom', 'Statut', 'Membres', 'Total cotisé', 'Pénalités', 'Reçu', 'Solde', 'Prêts en cours', 'Montant prêts en cours']]
  for (const g of groups) {
    const bilan = getBilan(g.id)
    const prets = getPrets(g.id).filter((p) => etatPret(p, aujourd()) !== 'rembourse')
    recapitulatif.push([
      g.nom,
      g.statut === 'terminee' ? 'Terminée' : 'Active',
      bilan.membres.length,
      bilan.totalCotis,
      bilan.totalPenalites,
      bilan.totalRecu,
      bilan.soldeGroupe,
      prets.length,
      prets.reduce((s, p) => s + resteAPayer(p), 0),
    ])
  }
  ajouterFeuille(wb, 'Toutes les tontines', recapitulatif, pris)

  for (const g of groups) {
    const bilan = getBilan(g.id)
    const aoa = syntheseAoa(bilan, settings)
    aoa.push([], ['Tours'])
    aoa.push(...toursAoa(g.id))
    aoa.push([], ['Prêts'])
    aoa.push(...pretsAoa(g.id))
    ajouterFeuille(wb, g.nom, aoa, pris)
  }

  return wb
}

// Classeur global, partagé/enregistré en fichier .xlsx.
export function exporterToutesTontinesExcel() {
  const wb = construireClasseurGlobal()
  const buffer = XLSX.write(wb, { bookType: 'xlsx', type: 'array' })
  return sauvegarderFichier(
    new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }),
    `toutes-les-tontines-${aujourd()}.xlsx`
  )
}
