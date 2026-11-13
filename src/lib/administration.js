// ══════════════════════════════════════════════════════════════
// Droits d'écriture.
// Deux niveaux, décidés côté serveur (cloudflare-worker) et reflétés
// ici pour retirer les boutons qui seraient refusés :
//   • l'administrateur de la plateforme supervise tous les groupes ;
//   • le responsable d'un groupe (propriétaire désigné à la création,
//     co-responsables qu'il a nommés) gère sa propre tontine.
// Un membre simple lit, discute et paie sa cotisation.
// Les données déjà en place ne sont jamais réécrites par ici.
// ══════════════════════════════════════════════════════════════

// L'uid est le `sub` du compte Google, tel que le worker le lit dans le jeton.
// La liste n'est pas une API : seule peutAdministrer() la consulte, pour qu'un
// appelant ne puisse pas comparer des uid et se croire administrateur.
const UIDS_ADMIN_PLATEFORME = ['108312798956922266281']

export function peutAdministrer(uid) {
  if (uid == null || uid === '') return false
  return UIDS_ADMIN_PLATEFORME.includes(String(uid))
}

// Propriétaire du groupe (ou administrateur de la plateforme). C'est le seul
// niveau qui supprime le groupe, son document cloud et règle l'invitation.
export function proprietaireDuGroupe(group, uid) {
  if (uid == null || uid === '') return false
  if (peutAdministrer(uid)) return true
  return !!(group && group.proprietaire != null && String(group.proprietaire) === String(uid))
}

// Responsable = propriétaire, co-responsable nommé, ou administrateur. Ce
// niveau écrit membres, planning et paiements. Le worker applique la même
// règle sur le snapshot stocké : ce test ne fait que masquer les boutons.
export function estResponsableDuGroupe(group, uid) {
  if (proprietaireDuGroupe(group, uid)) return true
  if (uid == null || uid === '') return false
  const co = group && group.coGerants && typeof group.coGerants === 'object' ? group.coGerants : {}
  return !!co[String(uid)]
}

export const MESSAGE_LECTURE_SEULE =
  'Seul le responsable de la tontine, ou un co-responsable qu’il a nommé, modifie le groupe, génère le planning et confirme les paiements.' +
  ' Ton compte continue de tout lire et de payer sa cotisation.'
