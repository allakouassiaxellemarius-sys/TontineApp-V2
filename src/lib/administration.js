// ══════════════════════════════════════════════════════════════
// Régime « administrateur unique » (décision du 07/11/2026).
// Un seul compte administrateur de l'application, un seul compte
// destinataire des cotisations. Ce qui tranche est serveur :
// ADMIN_UIDS et COLLECTE_PLATEFORME dans
// cloudflare-worker/wrangler.toml. Ce fichier ne porte que le reflet
// client : retirer les boutons qui seraient refusés, et dire pourquoi.
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

export const MESSAGE_ADMIN_PLATEFORME =
  "Seul l'administrateur de l'application crée ou modifie une tontine, génère le planning et confirme les paiements." +
  ' Ton compte continue de tout lire et de payer sa cotisation.'
