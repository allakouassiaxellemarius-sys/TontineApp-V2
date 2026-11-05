// ═══════════════════════════════════════════════════════════════
// PayTontine Simple IA — génération du lien de paiement (2 clics)
// ---------------------------------------------------------------
// L'app ne touche JAMAIS à l'argent : le membre paie DIRECTEMENT
// via le lien / deeplink Pi-Spi du responsable.
//   • Pi-Spi : le compte de collecte stocke une URL payable que
//     l'app ouvre dans le navigateur / l'app Pi-Spi.
// ═══════════════════════════════════════════════════════════════

const URL_RE = /^https?:\/\/\S+$/i

export function genererLiensPaiement({
  lienPiSpi,
  montant,
  nomResponsable,
  nomTontine,
  tourNumero,
}) {
  const m = Math.round(Number(montant) || 0)
  const url = (lienPiSpi || '').toString().trim()
  const dispo = URL_RE.test(url)

  const pispi = dispo ? { dispo: true, url } : { dispo: false }

  return {
    montant: m,
    nomResponsable: nomResponsable || '',
    nomTontine: nomTontine || '',
    tourNumero: tourNumero != null ? tourNumero : null,
    pispi,
    peutPayer: dispo,
  }
}

// Ouvre le lien de paiement Pi-Spi dans la WebView (Capacitor) via un
// nouvel onglet / le navigateur système.
export function ouvrirPaiement(type, lien) {
  try {
    if (type === 'pispi' && lien && lien.url) {
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

// Extrait d'un texte (ex : réponse de l'assistant) les liens payables
// Pi-Spi, pour les rendre cliquables dans l'interface.
// Renvoie { pispi: [{url}] } trouvés dans le texte.
export function extraireLiensPaiement(texte) {
  const pispi = []
  if (!texte) return { pispi }
  const re = /https?:\/\/[^\s)<>"']+/g
  let mm
  while ((mm = re.exec(texte)) !== null) {
    pispi.push({ url: mm[0] })
  }
  return { pispi }
}
