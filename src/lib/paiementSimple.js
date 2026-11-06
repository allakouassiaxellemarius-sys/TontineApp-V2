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

// api.saspay.me est la gateway : y envoyer un membre ne paie rien.
const HOTE_INTERDITE = 'api.saspay.me'

// Renvoie { url } si la valeur est un lien de paiement SasPay, sinon null.
export function normaliserCompteCollecte(valeur) {
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
  if (u.protocol !== 'https:' || !sousSasPay || h === HOTE_INTERDITE) return null
  if (u.username || u.password) return null
  return { url: u.href }
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

// Ouvre le lien de paiement dans le navigateur système (Capacitor) ou un
// nouvel onglet (web).
export function ouvrirPaiement(type, lien) {
  try {
    if (type === 'saspay' && lien && lien.url && normaliserCompteCollecte(lien.url)) {
      const a = document.createElement('a')
      a.href = lien.url
      a.target = '_blank'
      a.rel = 'noopener noreferrer'
      a.style.display = 'none'
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      return true
    }
  } catch {
    /* echec silencieux : l'UI affiche déjà le lien à copier */
  }
  return false
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
