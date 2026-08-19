// Paiement Wave pour les cotisations (zéro-KYC, sans secret côté client).
//
// Deux chemins, choisis automatiquement :
//  1. CHECKOUT signé (recommandé) : si `group.waveCheckoutUrl` pointe vers un
//     petit backend (ex : Cloudflare Worker) qui appelle
//     POST https://api.wave.com/v1/checkout/sessions avec la CLÉ API Wave
//     (jamais exposée au client). Le backend renvoie `wave_launch_url` et on
//     peut y glisser la référence membre dans `client_reference` (metadata).
//     Contrat attendu : POST { amount, currency, client_reference }
//                       -> { wave_launch_url }
//  2. DEEP-LINK (repli, sans backend) : on ouvre l'app Wave vers le numéro du
//     responsable. Le montant n'est pas toujours pré-rempli par l'OS ; la
//     référence courte est affichée à l'écran pour être recopiée dans le
//     libellé Wave. Le signalement "J'ai payé" est déclenché automatiquement
//     au retour dans l'app (voir PayerMaCotisation).
import { getReference } from './cotisation'

const WAVE_PACKAGE = 'com.wave.personal'
const WAVE_STORE = 'https://play.google.com/store/apps/details?id=com.wave.personal'

// Ouvre l'app Wave (ou le store si non installée) vers le compte du responsable.
function ouvrirWave(numeroResponsable) {
  const intent = `intent://#Intent;package=${WAVE_PACKAGE};scheme=https;S.browser_fallback_url=${encodeURIComponent(WAVE_STORE)};end`
  const a = document.createElement('a')
  a.href = intent
  a.style.display = 'none'
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
}

// Demande un `wave_launch_url` à un backend Checkout (la clé API reste côté serveur).
async function demanderLienCheckout(backendUrl, { montant, devise, reference }) {
  const res = await fetch(backendUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      amount: String(Math.round(Number(montant))),
      currency: devise || 'XOF',
      client_reference: reference,
    }),
  })
  if (!res.ok) {
    let msg = 'Échec de création du lien Wave'
    try { const d = await res.json(); msg = d.error || msg } catch {}
    throw new Error(msg)
  }
  const data = await res.json()
  if (!data.wave_launch_url) throw new Error('Réponse Wave invalide')
  return data.wave_launch_url
}

// Construit et ouvre le lien de paiement Wave. Retourne 'checkout' ou 'deep-link'.
export async function payerAvecWave({ backendUrl, numeroResponsable, montant, devise, reference }) {
  if (backendUrl) {
    const url = await demanderLienCheckout(backendUrl, { montant, devise, reference })
    window.location.href = url
    return 'checkout'
  }
  ouvrirWave(numeroResponsable)
  return 'deep-link'
}

export { getReference }
