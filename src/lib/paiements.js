// ═══════════════════════════════════════════════════════════════
// Couche domaine unifiée des paiements de cotisation.
// ---------------------------------------------------------------
// Un seul modèle mental pour les deux rôles : chaque membre devant
// cotiser pour un tour a un « paiement » dans un des quatre états :
//   - en_attente : rien n'a été payé ni signalé
//   - signale    : le membre a signalé un paiement, en attente de
//                  confirmation du responsable
//   - rejete     : le responsable a refusé le signalement, motif à l'appui
//   - paye       : confirmé par le responsable (source de vérité)
// L'état est DÉRIVÉ de trois stocks existants (cotisations confirmées,
// signalements en attente, refus archivés) sans les dupliquer : on garde ainsi
// la synchro cloud (paiements / paiements_invite) en place, tout en offrant une
// API et une UI unifiées.
// ═══════════════════════════════════════════════════════════════
import {
  getMembres, getTours, getCotisationsByTour, getPaiementMembre, getPendingPaiements,
  payerCotisation, enleverPaiement, signalerPaiementMembre, confirmerPaiementMembre,
  annulerPaiementMembre, purgerSignauxMembre, getRejetsPaiements, rejeterPaiementMembre,
} from './db'

export const STATUT = {
  EN_ATTENTE: 'en_attente',
  SIGNALE: 'signale',
  REJETE: 'rejete',
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
  motif: 'Motif obligatoire : précise pourquoi le signalement est refusé.',
  verrouille: 'Cagnotte verrouillée : déverrouille-la avant de retirer.',
  solde_insuffisant: 'Solde insuffisant : le retrait dépasserait ce qui est épargné.',
}

export function messageEchec(raison) {
  return MESSAGE_ECHEC[raison] || "Opération impossible, rien n'a été enregistré."
}

export const LIBELLE_STATUT = {
  en_attente: 'À payer',
  signale: 'Signalé',
  rejete: 'Refusé',
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

// Rattache un enregistrement du membre (signalement en attente ou refus archivé)
// à la ligne d'un tour. Un enregistrement sans tour précisé ne peut pas se
// revendiquer de tous les tours, sinon le statut s'affiche partout : on ne
// l'accroche qu'au 1er tour encore en attente du groupe.
function rattacheA(enreg, membre, tour, premierEnAttenteId) {
  const membreOk = enreg.membreId && Number(enreg.membreId) === Number(membre.id)
  const nomOk = enreg.nom && membre.nom
    && String(enreg.nom).trim().toLowerCase() === String(membre.nom).trim().toLowerCase()
  if (!membreOk && !nomOk) return false
  return enreg.tourId ? Number(enreg.tourId) === Number(tour.id) : premierEnAttenteId === tour.id
}

// Un refus porte l'id du signalement qu'il éteint. Le membre qui re-signale
// après un refus repart avec un nouvel id (db.js) ; s'il le publie sous le même
// id (appareil jamais synchronisé avec l'archive), la date du signalement refusé
// — consignée dans `du` — les départage. On compare une égalité de date, jamais
// un ordre : deux appareils n'ont pas la même horloge.
// Sans signalement en cours, le refus archivé reste rattaché au membre et au
// tour : c'est le cas du responsable, dont la file a vidé la ligne.
function rejetDe(rejets, membre, tour, premierEnAttenteId, signalement) {
  if (signalement) {
    const parId = rejets.find((r) => r.id === signalement.id)
    if (!parId) return null
    return parId.du && String(parId.du) !== String(signalement.date) ? null : parId
  }
  return rejets.find((r) => rattacheA(r, membre, tour, premierEnAttenteId)) || null
}

// Renvoie la liste unifiée des paiements d'un tour : un objet par
// membre devant cotiser, avec { membre, statut, paiement, signalement, rejet }.
export function getPaiementsTour(group, tour) {
  if (!tour) return []
  const signaux = getPendingPaiements(group.id)
  const rejets = getRejetsPaiements(group.id)
  const aTourInconnu = signaux.some((s) => !s.tourId) || rejets.some((r) => !r.tourId)
  const premierEnAttenteId =
    tour.statut === 'en_attente' && aTourInconnu
      ? getTours(group.id).find((t) => t.statut === 'en_attente')?.id ?? null
      : null
  return cotisantsTour(group, tour).map((m) => {
    const paiement = getPaiementMembre(tour.id, m.id)
    let signalement = null
    let rejet = null
    if (!paiement) {
      signalement = signaux.find((s) => rattacheA(s, m, tour, premierEnAttenteId)) || null
      if (rejets.length) rejet = rejetDe(rejets, m, tour, premierEnAttenteId, signalement)
    }
    const statut = paiement
      ? STATUT.PAYE
      : rejet ? STATUT.REJETE : signalement ? STATUT.SIGNALE : STATUT.EN_ATTENTE
    return { membre: m, statut, paiement, signalement, rejet }
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

// Refuse un signalement au lieu de le supprimer : le motif est obligatoire et
// la décision est archivée (db.js) pour que le membre la lise. Renvoie
// { ok, raison?, message? } — l'appelant doit annoncer l'échec, jamais un
// succès inconditionnel.
export function rejeterSignalement(group, signalementId, motif, qui) {
  const res = rejeterPaiementMembre(group.id, signalementId, motif, qui)
  return res.ok ? res : { ...res, message: messageEchec(res.raison) }
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
