// ═══════════════════════════════════════════════════════════════
// PayTontine Simple IA — génération des liens de paiement (2 clics)
// ---------------------------------------------------------------
// L'app ne touche JAMAIS à l'argent : le membre paie DIRECTEMENT
// sur le compte Mobile Money du responsable.
//   • Wave        : lien de partage https://wave.com/s/{slug}
//   • Orange Money : code USSD *144*4*6*{tel}*{montant}# (Côte d'Ivoire)
// ═══════════════════════════════════════════════════════════════

export function genererLiensPaiement({
  montant,
  telResponsable,
  waveSlug,
  nomResponsable,
  nomTontine,
  tourNumero,
}) {
  const m = Math.round(Number(montant) || 0)
  const tel = (telResponsable || '').toString().replace(/[^\d]/g, '')
  const slug = (waveSlug || '').toString().trim().replace(/^https?:\/\/wave\.com\/s\//, '').replace(/\/+$/, '')

  const wave = slug
    ? { dispo: true, slug, url: 'https://wave.com/s/' + encodeURIComponent(slug) }
    : { dispo: false }

  const om = tel
    ? { dispo: true, tel, ussd: `*144*4*6*${tel}*${m}#` }
    : { dispo: false }

  return {
    montant: m,
    tel,
    slug,
    nomResponsable: nomResponsable || '',
    nomTontine: nomTontine || '',
    tourNumero: tourNumero != null ? tourNumero : null,
    wave,
    om,
    peutPayer: wave.dispo || om.dispo,
  }
}

// Ouvre le lien de paiement dans la WebView (Capacitor) :
//   • Wave  → ouvre l'URL dans un nouvel onglet / navigateur
//   • Orange → déclenche le composeur d'appel avec le code USSD
export function ouvrirPaiement(type, lien) {
  try {
    if (type === 'wave' && lien && lien.url) {
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
    if (type === 'om' && lien && lien.ussd) {
      const a = document.createElement('a')
      a.href = 'tel:' + lien.ussd
      a.style.display = 'none'
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      return true
    }
  } catch {
    /* echec silencieux : l'UI affiche déjà le code à copier */
  }
  return false
}

// Extrait d'un texte (ex : réponse de l'assistant) les liens payables,
// pour les rendre cliquables dans l'interface.
// Renvoie { waves: [{slug,url}], oms: [{ussd}] } trouvés dans le texte.
export function extraireLiensPaiement(texte) {
  const waves = []
  const oms = []
  if (!texte) return { waves, oms }
  const waveRe = /https?:\/\/wave\.com\/s\/([^\s)<>"']+)/g
  let wm
  while ((wm = waveRe.exec(texte)) !== null) {
    const slug = decodeURIComponent(wm[1])
    waves.push({ slug, url: 'https://wave.com/s/' + wm[1] })
  }
  const omRe = /(?:\*144\*[0-9*#]+\#)|(?:tel:\s*\*144\*[0-9*#]+\#)/g
  let om
  while ((om = omRe.exec(texte)) !== null) {
    oms.push({ ussd: om[0].replace(/^tel:\s*/, '') })
  }
  return { waves, oms }
}
