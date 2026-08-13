// ═══════════════════════════════════════════════════════════════
// Rate limiting léger (anti-abus) basé sur RTDB. Fenêtre glissante par
// clé (ip ou uid). Rejette au-delà du quota. Non bloquant pour le
// webhook Flutterwave (qui peut légitimement réessayer) mais protège
// les endpoints authentifiés (création de compte, retrait, réconciliation).
// ═══════════════════════════════════════════════════════════════
const { lire, ecrire } = require('./db')

async function limiter(cle, { max = 20, fenetreMs = 60000 } = {}) {
  const chemin = 'rateLimit/' + encodeURIComponent(String(cle))
  const maintenant = Date.now()
  let entreess = await lire(chemin)
  let entries = Array.isArray(entreess) ? entreess : entreess ? Object.values(entreess) : []
  entries = entries.filter((t) => maintenant - t < fenetreMs)
  if (entries.length >= max) {
    await ecrire(chemin, entries)
    return false
  }
  entries.push(maintenant)
  // On ne garde que la fenêtre pour limiter la taille.
  entries = entries.filter((t) => maintenant - t < fenetreMs)
  await ecrire(chemin, entries)
  return true
}

module.exports = { limiter }
