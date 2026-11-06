// ═══════════════════════════════════════════════════════════════
// Compte de collecte Pi-Spi — lecture et validation
// ---------------------------------------------------------------
// L'app ne touche JAMAIS à l'argent. Le responsable publie son ALIAS
// Pi-Spi (la poignée courte que ses membres connaissent dans l'app
// Pi-Spi) ; le membre envoie sur cet alias, puis signale « J'ai payé ».
// Une URL payable saisie avant ce changement reste acceptée : elle
// devient le bouton « Ouvrir Pi-Spi ».
// ═══════════════════════════════════════════════════════════════

const URL_RE = /^https?:\/\/\S+$/i

// 3 à 32 caractères, sans espace ni ponctuation d'URL. Le plafond de 32
// écarte les identifiants techniques (un UUID en fait 36) qu'on retrouve
// dans les comptes enregistrés avant ce changement.
const ALIAS_RE = /^[A-Za-z0-9][A-Za-z0-9._@+\-]{2,31}$/

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
