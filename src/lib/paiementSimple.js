// ═══════════════════════════════════════════════════════════════
// Compte de collecte Pi-Spi — lecture et validation
// ---------------------------------------------------------------
// L'app ne touche JAMAIS à l'argent. Le responsable publie son ALIAS
// Pi-Spi (l'identifiant que ses membres recopient dans l'app Pi-Spi) ;
// le membre envoie sur cet alias, puis signale « J'ai payé ».
// Une URL payable saisie avant ce changement reste acceptée : elle
// devient le bouton « Ouvrir Pi-Spi ».
// ═══════════════════════════════════════════════════════════════

const URL_RE = /^https?:\/\/\S+$/i

// Un alias Pi-Spi est un identifiant en 36 caractères, en groupes
// 8-4-4-4-12 (ex : 34589dd2-a93b-4372-b515-d163772b10dd). Rien d'autre
// n'est accepté : un nom saisi à la main n'existe pas côté Pi-Spi, donc
// le publier chez tous les membres serait un paiement perdu.
const ALIAS_RE = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/

// Renvoie { url, alias } ou null si la valeur n'est ni un alias ni une URL.
export function normaliserCompteCollecte(valeur) {
  const v = (valeur == null ? '' : String(valeur)).trim()
  if (!v) return null
  if (URL_RE.test(v)) return { url: v, alias: null }
  if (ALIAS_RE.test(v)) return { url: null, alias: v }
  return null
}

export function genererLiensPaiement({
  lienPiSpi,
  montant,
  nomResponsable,
  nomTontine,
  tourNumero,
}) {
  const m = Math.round(Number(montant) || 0)
  const compte = normaliserCompteCollecte(lienPiSpi)
  const dispo = Boolean(compte)

  const pispi = compte
    ? { dispo: true, url: compte.url, alias: compte.alias }
    : { dispo: false }

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
