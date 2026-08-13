// ═══════════════════════════════════════════════════════════════
// Webhook Flutterwave — réception et réconciliation des paiements
// entrants sur les comptes virtuels.
//
// Sécurité :
//  1. Vérification OBLIGATOIRE de l'en-tête `verif-hash` (Secret Manager)
//     AVANT tout traitement ; rejet + journalisation si invalide.
//  2. Idempotence : un même `flw_ref` n'est jamais crédité deux fois
//     (on le marque dans `traites/` dès le 1er passage).
//  3. HTTPS uniquement (imposé par le déploiement Cloud Functions).
//
// Réconciliation :
//  - narration contient la référence unique du membre (REF-XXXX) → on
//    résout membreId + tour actif → écriture dans paiements/{code}/{txId}
//    (intégration automatique côté app).
//  - sinon → écriture dans reconciliation/{code}/{txId} (validation
//    manuelle par le trésorier).
// ═══════════════════════════════════════════════════════════════
const { lire, ecrire, pousser } = require('./db')
const flw = require('./flutterwave')
const accounts = require('./accounts')
const audit = require('./audit')

const REF_RE = /REF-[A-Z2-9]{12}/

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

function codeDepuisCompte(accountNumber) {
  if (!accountNumber) return null
  return lire('comptesParNumero/' + encodeURIComponent(String(accountNumber)))
}

// Tour actif (en_attente) du groupe, pour y imputer la cotisation.
async function tourActif(code) {
  const tours = await lire('tontines/' + encodeURIComponent(String(code)) + '/tours')
  if (!tours) return null
  const liste = Array.isArray(tours) ? tours : Object.values(tours)
  const actifs = liste.filter((t) => t && (t.statut === 'en_attente' || t.statut === 'actif'))
  if (!actifs.length) return null
  actifs.sort((a, b) => (Number(a.datePrevue) || 0) - (Number(b.datePrevue) || 0))
  return actifs[0]
}

async function traiterPaiement(payload) {
  const data = (payload && payload.data) || {}
  const event = String(payload && payload.event || '')

  // Seuls les paiements réussis sur compte/virement nous intéressent.
  const statut = String(data.status || data.status_code || '').toLowerCase()
  const estPaiement = event === 'charge.completed' || event === 'charge.complete' || event === 'transfer'
  if (!estPaiement) return { ignore: true }
  if (statut !== 'successful' && statut !== 'settled' && statut !== 'completed' && statut !== 'success') {
    return { ignore: true }
  }

  const flwRef = String(data.flw_ref || data.id || data.reference || '')
  const txRef = String(data.tx_ref || '')
  const montant = Number(data.amount || data.charged_amount || 0)
  const devise = String(data.currency || 'NGN')
  const accountNumber = String(data.account_number || (data.customer && data.customer.account_number) || '')
  const narration = String(data.narration || data.narration_text || '')

  // 2. Idempotence
  if (await flw.dejaTraite(flwRef)) {
    return { dejaTraite: true, flwRef }
  }
  await flw.marquerTraite(flwRef, { montant, devise, accountNumber })

  // 1. Localiser le groupe via le compte virtuel crédité.
  const code = await codeDepuisCompte(accountNumber)
  if (!code) {
    await audit.journaliser('__global__', {
      qui: 'system', action: 'paiement_compte_inconnu', statut: 'anomalie',
      montant, devise, details: { accountNumber, flwRef },
    })
    return { erreur: 'compte inconnu', flwRef }
  }

  // Résolution de la référence membre saisie dans la narration.
  const match = narration.match(REF_RE)
  const reference = match ? match[0] : null
  const membreId = reference ? await accounts.resoudreReference(code, reference) : null
  const tour = await tourActif(code)

  const base = {
    statut: 'paye',
    montant,
    devise,
    operateur: 'Virement',
    numero: '',
    reference: reference || '',
    narration,
    flwRef,
    txRef,
    accountNumber,
    majLe: Date.now(),
  }

  if (membreId && tour) {
    // Réconciliation automatique → intégration côté app via paiements/{code}.
    await ecrire(
      'paiements/' + encodeURIComponent(String(code)) + '/' + encodeURIComponent(flwRef),
      { ...base, membreId: Number(membreId), tourId: Number(tour.id), reconnu: true }
    )
    await audit.journaliser(code, {
      qui: 'system', action: 'paiement_recu_auto', statut: 'paye', montant, devise,
      details: { membreId: Number(membreId), tourId: Number(tour.id), reference, flwRef },
    })
    return { ok: true, code, membreId, tourId: tour.id, auto: true }
  }

  // Non reconnu automatiquement → validation manuelle (trésorier).
  await pousser(
    'reconciliation/' + encodeURIComponent(String(code)),
    { ...base, membreId: membreId ? Number(membreId) : null, tourId: tour ? Number(tour.id) : null, statutReconciliation: 'en_attente', recuLe: Date.now() }
  )
  await audit.journaliser(code, {
    qui: 'system', action: 'paiement_non_reconnu', statut: 'anomalie', montant, devise,
    details: { reference, narration, flwRef, membreId: membreId ? Number(membreId) : null },
  })
  return { ok: true, code, auto: false, nonReconnu: true }
}

// Point d'entrée HTTP du webhook (public, authentifié par verif-hash).
async function gererWebhook(request) {
  if (!flw.estConfigure()) {
    return json({ ok: false, erreur: 'Flutterwave non configuré' }, 400)
  }
  // 1. Vérification de la signature AVANT tout traitement.
  if (!flw.verifierWebhook(request)) {
    await audit.journaliser('__global__', {
      qui: 'inconnu', action: 'webhook_signature_invalide', statut: 'rejet',
      details: { ip: request.headers.get('x-forwarded-for') || '', verifHash: request.headers.get('verif-hash') || '' },
    })
    return json({ ok: false, erreur: 'Signature invalide' }, 401)
  }

  let payload
  try {
    payload = await request.json()
  } catch {
    return json({ ok: false, erreur: 'JSON invalide' }, 400)
  }

  try {
    const r = await traiterPaiement(payload)
    if (r.ignore) return json({ ok: true, ignore: true })
    if (r.dejaTraite) return json({ ok: true, dejaTraite: true })
    if (r.erreur) return json({ ok: false, erreur: r.erreur }, 404)
    return json({ ok: true, ...r })
  } catch (e) {
    await audit.journaliser('__global__', {
      qui: 'system', action: 'webhook_erreur', statut: 'erreur', details: { message: e && e.message },
    })
    return json({ ok: false, erreur: e && e.message || 'Erreur' }, 500)
  }
}

module.exports = { gererWebhook, traiterPaiement }
