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
  getMembres, getTours, getCotisationsByTour, getPaiementMembre, getPendingPaiements,
  payerCotisation, enleverPaiement, signalerPaiementMembre, confirmerPaiementMembre,
  annulerPaiementMembre, purgerSignauxMembre,
} from './db'

export const STATUT = {
  EN_ATTENTE: 'en_attente',
  SIGNALE: 'signale',
  PAYE: 'paye',
}

// Motifs d'échec des écritures (db.js) → message à afficher. Un refus doit
// toujours être annoncé : rien n'est enregistré en silence.
export const MESSAGE_ECHEC = {
  bloque: 'Groupe suivi depuis le responsable : modification impossible ici.',
  montant: 'Montant invalide (doit être supérieur à 0).',
  introuvable: 'Tour ou membre introuvable dans ce groupe.',
  ecriture: 'Sauvegarde impossible : stockage plein ou inaccessible.',
  hors_ligne: 'Hors ligne : aucune modification enregistrée.',
  recu: 'Tour déjà distribué : la suppression fausserait le bilan.',
  joint: 'Groupe rejoint : le responsable gère ces paiements.',
  verrouille: 'Cagnotte verrouillée : déverrouille-la avant de retirer.',
  solde_insuffisant: 'Solde insuffisant : le retrait dépasserait ce qui est épargné.',
}

export function messageEchec(raison) {
  return MESSAGE_ECHEC[raison] || "Opération impossible, rien n'a été enregistré."
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
  // Signalement sans tour précisé : il ne peut pas se revendiquer de tous les
  // tours, sinon « Signalé » s'affiche partout et le responsable confirme le
  // mauvais tour. On ne l'accroche qu'au 1er tour encore en attente du groupe ;
  // getTours() n'est appelé que si un signalement sans tour existe vraiment.
  const aTourInconnu = signaux.some((s) => !s.tourId)
  const premierEnAttente = () =>
    tour.statut === 'en_attente' && aTourInconnu
      ? getTours(group.id).find((t) => t.statut === 'en_attente')
      : null
  return cotisantsTour(group, tour).map((m) => {
    const paiement = getPaiementMembre(tour.id, m.id)
    let signalement = null
    if (!paiement) {
      signalement = signaux.find((s) => {
        const membreOk = s.membreId && Number(s.membreId) === Number(m.id)
        const nomOk = s.nom && m.nom && s.nom.trim().toLowerCase() === m.nom.trim().toLowerCase()
        if (!membreOk && !nomOk) return false
        return s.tourId ? Number(s.tourId) === Number(tour.id) : premierEnAttente()?.id === tour.id
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
// Renvoie { ok, message?, penalite?, modifie? } — l'appelant doit annoncer
// l'échec quand ok est faux, jamais un succès inconditionnel.
export function enregistrerPaiement(group, tour, membre, montant, datePaiement, moyen, details) {
  const res = payerCotisation(group.id, tour?.id, membre?.id, montant, datePaiement, moyen, details)
  if (!res.ok) return { ok: false, raison: res.raison, message: messageEchec(res.raison) }
  purgerSignauxMembre(group.id, { membreId: membre.id, nom: membre.nom, tourId: tour.id })
  return res
}

// Confirme un signalement : renvoie true | 'deja' | false.
export function confirmerSignalement(group, signalementId) {
  return confirmerPaiementMembre(group.id, signalementId)
}

// Rejette (supprime) un signalement sans créer de paiement.
export function rejeterSignalement(group, signalementId) {
  return annulerPaiementMembre(group.id, signalementId)
}

// Retire un paiement confirmé (le membre redevient « à payer »).
export function retirerPaiement(tour, membreId) {
  const p = getPaiementMembre(tour?.id, membreId)
  if (!p) return { ok: false, raison: 'introuvable', message: messageEchec('introuvable') }
  const res = enleverPaiement(p.id)
  return res.ok ? res : { ...res, message: messageEchec(res.raison) }
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
  return annulerPaiementMembre(group.id, signalementId)
}
