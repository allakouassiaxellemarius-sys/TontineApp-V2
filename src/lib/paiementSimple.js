// ═══════════════════════════════════════════════════════════════
// Compte de collecte SasPay — lecture et validation
// ---------------------------------------------------------------
// L'app ne touche JAMAIS à l'argent et ne détient AUCUNE clé API : le
// responsable publie le lien de paiement SasPay de SON compte marchand,
// le membre l'ouvre et paie en mobile money sur la page SasPay, puis
// signale « J'ai payé ».
// Le lien est affiché chez tous les membres et peut être ouvert par
// l'app : il doit donc être https et hébergé par SasPay lui-même.
// ═══════════════════════════════════════════════════════════════

// Sous-domaines SasPay qui ne sont PAS des pages de paiement : la gateway
// (api.), le back-office (app./dashboard.) et la doc. Les accepter comme
// compte de collecte enverrait tous les membres sur une page où l'on ne
// paie rien — et le back-office est la page de connexion du responsable.
const HOTES_NON_PAIEMENT = ['api.saspay.me', 'app.saspay.me', 'dashboard.saspay.me', 'docs.saspay.me']

// Entrée du back-office SasPay (inscription puis connexion), vérifiée vivante
// le 2026-11-06 : c'est là que le responsable crée son compte, puis son lien
// de paiement. URL codée en dur : aucune valeur saisie par un utilisateur ne
// passe par cette ouverture.
export const LIEN_COMPTE_SASPAY = 'https://app.saspay.me/auth'

// https sur une page hébergée par SasPay lui-même, sans identifiants dans
// l'URL. C'est la condition pour OUVRIR un lien depuis l'app.
function estPageSasPay(valeur) {
  const v = (valeur == null ? '' : String(valeur)).trim()
  if (!v) return null
  let u
  try {
    u = new URL(v)
  } catch {
    return null
  }
  const h = u.hostname.toLowerCase()
  const sousSasPay = h === 'saspay.me' || h.endsWith('.saspay.me')
  if (u.protocol !== 'https:' || !sousSasPay) return null
  if (u.username || u.password) return null
  return { url: u.href, hote: h }
}

// Renvoie { url } si la valeur est un lien de paiement SasPay, sinon null.
export function normaliserCompteCollecte(valeur) {
  const page = estPageSasPay(valeur)
  if (!page || HOTES_NON_PAIEMENT.includes(page.hote)) return null
  return { url: page.url }
}

export function genererLiensPaiement({
  lienSasPay,
  montant,
  nomResponsable,
  nomTontine,
  tourNumero,
}) {
  const m = Math.round(Number(montant) || 0)
  const compte = normaliserCompteCollecte(lienSasPay)

  const saspay = compte ? { dispo: true, url: compte.url } : { dispo: false }

  return {
    montant: m,
    nomResponsable: nomResponsable || '',
    nomTontine: nomTontine || '',
    tourNumero: tourNumero != null ? tourNumero : null,
    saspay,
    peutPayer: Boolean(compte),
  }
}

// Ouvre une URL dans le navigateur système (Capacitor) ou un nouvel onglet
// (web). N'accepte que du SasPay : le lien de paiement passe par la même
// porte que le compte de collecte, la page de création de compte est une
// constante du code.
function ouvrirHoteSasPay(url) {
  if (!estPageSasPay(url)) return false
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
  if (type !== 'saspay' || !lien || !lien.url) return false
  // Le lien vient d'un autre appareil : on réapplique la porte complète,
  // pas seulement l'hôte.
  if (!normaliserCompteCollecte(lien.url)) return false
  return ouvrirHoteSasPay(lien.url)
}

// Ouvre la page d'inscription/connexion SasPay du responsable.
export function ouvrirCreationCompteSasPay() {
  return ouvrirHoteSasPay(LIEN_COMPTE_SASPAY)
}

// Extrait d'un texte (ex : réponse de l'assistant) les liens de paiement
// SasPay, pour les rendre cliquables. Tout autre lien reste du texte :
// un bouton « Payer » sous un URL quelconque serait un hameçonnage.
export function extraireLiensPaiement(texte) {
  const saspay = []
  if (!texte) return { saspay }
  const re = /https:\/\/[^\s)<>"']+/g
  let mm
  while ((mm = re.exec(texte)) !== null) {
    const compte = normaliserCompteCollecte(mm[0])
    if (compte) saspay.push(compte)
  }
  return { saspay }
}
