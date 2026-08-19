// ═══════════════════════════════════════════════════════════════
// Couche domaine unifiée des paiements de cotisation.
// ---------------------------------------------------------------
// Un seul modèle mental pour les deux rôles : chaque membre devant
// cotiser pour un tour a un « paiement » dans un des trois états :
//   - en_attente : rien n'a été payé ni signalé
//   - signale    : le membre a signalé un paiement, en attente de
//                  confirmation du responsable
//   - paye       : confirmé par le responsable (source de vérité)
// L'état est DÉRIVÉ de deux stocks existants (cotisations confirmées
// + signalements en attente) sans les dupliquer : on garde ainsi la
// synchro cloud (paiements / paiements_invite) en place, tout en
// offrant une API et une UI unifiées.
// ═══════════════════════════════════════════════════════════════
import {
  getMembres, getCotisationsByTour, getPaiementMembre, getPendingPaiements,
  payerCotisation, enleverPaiement, signalerPaiementMembre, confirmerPaiementMembre,
  annulerPaiementMembre, purgerSignauxMembre,
} from './db'

export const STATUT = {
  EN_ATTENTE: 'en_attente',
  SIGNALE: 'signale',
  PAYE: 'paye',
}

export const LIBELLE_STATUT = {
  en_attente: 'À payer',
  signale: 'Signalé',
  paye: 'Payé',
}

// Membres devant cotiser pour un tour (le bénéficiaire ne cotise pas,
// sauf si le groupe l'autorise via leReceveurCotonise).
function cotisantsTour(group, tour) {
  const membres = getMembres(group.id)
  return group.leReceveurCotonise
    ? membres
    : membres.filter((m) => m.id !== tour.membreId)
}

// Renvoie la liste unifiée des paiements d'un tour : un objet par
// membre devant cotiser, avec { membre, statut, paiement, signalement }.
export function getPaiementsTour(group, tour) {
  if (!tour) return []
  const signaux = getPendingPaiements(group.id)
  return cotisantsTour(group, tour).map((m) => {
    const paiement = getPaiementMembre(tour.id, m.id)
    let signalement = null
    if (!paiement) {
      signalement = signaux.find((s) => {
        const membreOk = s.membreId && Number(s.membreId) === Number(m.id)
        const nomOk = s.nom && m.nom && s.nom.trim().toLowerCase() === m.nom.trim().toLowerCase()
        if (!membreOk && !nomOk) return false
        return s.tourId ? Number(s.tourId) === Number(tour.id) : true
      }) || null
    }
    const statut = paiement ? STATUT.PAYE : signalement ? STATUT.SIGNALE : STATUT.EN_ATTENTE
    return { membre: m, statut, paiement, signalement }
  })
}

export function resumeTour(group, tour) {
  const lignes = getPaiementsTour(group, tour)
  const payes = lignes.filter((l) => l.statut === STATUT.PAYE)
  const signales = lignes.filter((l) => l.statut === STATUT.SIGNALE)
  const montantPaye = payes.reduce((s, l) => s + Number(l.paiement?.montant || 0), 0)
  return { total: lignes.length, payes: payes.length, signales: signales.length, montantPaye }
}

// ── Actions (côté responsable) ─────────────────────────────────
// Enregistre directement un paiement confirmé et purge tout signalement
// en attente du membre pour ce tour (évite les doublons).
export function enregistrerPaiement(group, tour, membre, montant, datePaiement, moyen, details) {
  payerCotisation(group.id, tour.id, membre.id, montant, datePaiement, moyen, details)
  purgerSignauxMembre(group.id, { membreId: membre.id, nom: membre.nom, tourId: tour.id })
}

// Confirme un signalement : renvoie true | 'deja' | false.
export function confirmerSignalement(group, signalementId) {
  return confirmerPaiementMembre(group.id, signalementId)
}

// Rejette (supprime) un signalement sans créer de paiement.
export function rejeterSignalement(group, signalementId) {
  annulerPaiementMembre(group.id, signalementId)
}

// Retire un paiement confirmé (le membre redevient « à payer »).
export function retirerPaiement(tour, membreId) {
  const p = getPaiementMembre(tour.id, membreId)
  if (p) enleverPaiement(p.id)
}

// ── Actions (côté membre) ──────────────────────────────────────
// Signale un paiement pour un tour donné (dédupliqué côté db).
export function signalerPaiement(group, tour, membre, { montant, operateur, reference, membreId }) {
  return signalerPaiementMembre(group.id, {
    nom: membre.nom,
    montant,
    operateur,
    reference,
    tourId: tour.id,
    tourNumero: tour.numero,
    membreId: membreId != null ? membreId : membre.id,
  })
}

// Le membre retire son propre signalement.
export function retirerSignalement(group, signalementId) {
  annulerPaiementMembre(group.id, signalementId)
}
