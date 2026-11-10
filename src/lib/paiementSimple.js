// ═══════════════════════════════════════════════════════════════
// Compte de collecte Money Fusion — lecture et validation
// ---------------------------------------------------------------
// L'app ne touche JAMAIS à l'argent et ne détient AUCUNE clé API : le
// responsable publie le lien de paiement Money Fusion de SON compte marchand,
// le membre l'ouvre et paie en mobile money sur la page Money Fusion, puis
// signale « J'ai payé ».
// Le lien est affiché chez tous les membres et peut être ouvert par l'app :
// il doit donc être https et être la page de paiement Money Fusion elle-même.
// ═══════════════════════════════════════════════════════════════

// Deux formes de page de paiement Money Fusion, toutes deux lues dans la
// documentation du fournisseur le 2026-11-09 :
//  - le lien d'un compte marchand : https://payin.moneyfusion.net/payment/<référence>[/<Marchand>]
//  - le lien rendu par l'API quand un paiement est créé :
//    https://www.pay.moneyfusion.net/pay/<jeton>
// Tout le reste du domaine ne paie rien : pay.moneyfusion.net n'est une page de
// paiement QUE sous /pay/ — /paiementNotif/<jeton> est l'API de statut (GET), pas
// une page où l'on règle quoi que ce soit. api./docs. sont la gateway et la doc,
// moneyfusion.net la vitrine, /dashboard et /login le back-office — la page de
// connexion du responsable. Accepter l'un d'eux comme compte de collecte
// enverrait tous les membres sur une page où l'on ne paie rien.
const HOTES_PAIEMENT = {
  'payin.moneyfusion.net': 'payment',
  'www.pay.moneyfusion.net': 'pay',
  'pay.moneyfusion.net': 'pay',
}

// <premier segment> + au moins un jeton : un simple https://…/ ne sont pas un
// compte de collecte. Le segment est testé sans casse, comme la porte du serveur
// — sinon un lien accepté côté serveur serait refusé ici et le membre perdrait
// son bouton « Payer ».
function estCheminPaiement(hote, chemin) {
  const attendu = HOTES_PAIEMENT[hote]
  if (!attendu) return false
  const parts = String(chemin || '').split('/').filter(Boolean)
  return String(parts[0] || '').toLowerCase() === attendu && parts.length >= 2
}

// Entrée d'inscription Money Fusion, vérifiée vivante le 2026-11-09
// (/signup renvoie 404). URL codée en dur : aucune valeur saisie par un
// utilisateur ne passe par cette ouverture.
export const LIEN_COMPTE_MONEYFUSION = 'https://moneyfusion.net/register'

// https sur Money Fusion, sans identifiants ni port dans l'URL. C'est la
// condition pour OUVRIR une page depuis l'app ; le stockage exige en plus
// d'être la page de paiement.
function lirePage(valeur) {
  const v = (valeur == null ? '' : String(valeur)).trim()
  if (!v) return null
  let u
  try {
    u = new URL(v)
  } catch {
    return null
  }
  const h = u.hostname.toLowerCase()
  const sousMoneyFusion = h === 'moneyfusion.net' || h.endsWith('.moneyfusion.net')
  if (u.protocol !== 'https:' || !sousMoneyFusion) return null
  if (u.username || u.password || u.port) return null
  return { url: u.href, hote: h, chemin: u.pathname }
}

// Renvoie { url } si la valeur est un lien de paiement Money Fusion, sinon null.
export function normaliserCompteCollecte(valeur) {
  const page = lirePage(valeur)
  if (!page || !estCheminPaiement(page.hote, page.chemin)) return null
  return { url: page.url }
}

// Le compte de collecte d'un groupe peut arriver d'un autre appareil (le
// snapshot du responsable). Il n'est jamais copié tel quel dans la base
// locale d'un membre : la même porte que la saisie s'applique, sinon un blob
// ancien ou falsifié afficherait un bouton « Payer » vers une autre page.
// Renvoie l'objet stockable, ou null = « rien d'enregistré » côté membre.
export function normaliserCollecteDistante(col) {
  if (!col || typeof col !== 'object') return null
  const compte = normaliserCompteCollecte(col.compte)
  if (!compte) return null
  return {
    type: 'moneyfusion',
    nom: String(col.nom || '').slice(0, 60),
    compte: compte.url,
    titulaire: String(col.titulaire || '').slice(0, 60),
  }
}

export function genererLiensPaiement({
  lienMoneyFusion,
  montant,
  nomResponsable,
  nomTontine,
  tourNumero,
}) {
  const m = Math.round(Number(montant) || 0)
  const compte = normaliserCompteCollecte(lienMoneyFusion)

  const moneyfusion = compte ? { dispo: true, url: compte.url } : { dispo: false }

  return {
    montant: m,
    nomResponsable: nomResponsable || '',
    nomTontine: nomTontine || '',
    tourNumero: tourNumero != null ? tourNumero : null,
    moneyfusion,
    peutPayer: Boolean(compte),
  }
}

// Ouvre une page dans le navigateur système (Capacitor) ou un nouvel onglet
// (web), après la porte `valide`. Deux appelants, deux portes : le lien de
// paiement vient d'un autre appareil et passe par la porte de stockage ; la
// page d'inscription est une constante du code et n'a que https à prouver.
function ouvrirPage(url, valide) {
  if (!valide(url)) return false
  try {
    const a = document.createElement('a')
    a.href = url
    a.target = '_blank'
    a.rel = 'noopener noreferrer'
    a.style.display = 'none'
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    return true
  } catch {
    /* echec silencieux : l'UI affiche déjà le lien à copier */
  }
  return false
}

export function ouvrirPaiement(type, lien) {
  if (type !== 'moneyfusion' || !lien || !lien.url) return false
  return ouvrirPage(lien.url, normaliserCompteCollecte)
}

// Ouvre la page d'inscription Money Fusion du responsable.
export function ouvrirCreationCompteMoneyFusion() {
  return ouvrirPage(LIEN_COMPTE_MONEYFUSION, lirePage)
}

// Extrait d'un texte (ex : réponse de l'assistant) les liens de paiement
// Money Fusion, pour les rendre cliquables. Tout autre lien reste du texte :
// un bouton « Payer » sous un URL quelconque serait un hameçonnage.
export function extraireLiensPaiement(texte) {
  const moneyfusion = []
  if (!texte) return { moneyfusion }
  const re = /https:\/\/[^\s)<>"']+/g
  let mm
  while ((mm = re.exec(texte)) !== null) {
    const compte = normaliserCompteCollecte(mm[0])
    if (compte) moneyfusion.push(compte)
  }
  return { moneyfusion }
}
