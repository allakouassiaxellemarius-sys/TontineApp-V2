// ═══════════════════════════════════════════════════════════════
// Tontine Manager — Functions Flutterwave (points d'entrée).
//
//  - flutterwave-webhook   : webhook public (signé verif-hash) — paiements
//  - flutterwave-compte    : (ré)création du compte virtuel (gestionnaire)
//  - flutterwave-compte-lire: lecture du compte à virer (membre du groupe)
//  - flutterwave-reference : référence unique du membre (pour la narration)
//  - flutterwave-reconcile : validation manuelle d'un paiement non reconnu
//  - flutterwave-transfer  : demande de retrait (gestionnaire)
//  - flutterwave-transfer-approve : 2e validation (double, si seuil dépassé)
//
// Les clés Flutterwave sont des SECRETS (Google Secret Manager), jamais
// exposées au client ni committées. Tout endpoint authentifié vérifie le
// JWT Firebase et l'appartenance/rôle dans le groupe côté serveur.
// ═══════════════════════════════════════════════════════════════
const functions = require('firebase-functions/v2')
const { onRequest } = require('firebase-functions/v2/https')
const { onValueCreated } = require('firebase-functions/v2/database')
const { onSchedule } = require('firebase-functions/v2/scheduler')
const { FLW_SECRET_KEY, FLW_PUBLIC_KEY, FLW_ENCRYPTION_KEY, FLW_WEBHOOK_SECRET, FLW_TRANSFER_SECRET, FLW_MODE } = require('./src/secrets')
const db = require('./src/db')
const flw = require('./src/flutterwave')
const accounts = require('./src/accounts')
const payments = require('./src/payments')
const transfers = require('./src/transfers')
const audit = require('./src/audit')
const { limiter } = require('./src/ratelimit')

const REGION = 'us-central1'
const SECRETS = [FLW_SECRET_KEY, FLW_PUBLIC_KEY, FLW_ENCRYPTION_KEY, FLW_WEBHOOK_SECRET, FLW_TRANSFER_SECRET, FLW_MODE]

function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  }
}
function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), { status, headers: { 'Content-Type': 'application/json', ...corsHeaders() } })
}
async function body(request) {
  try { return await request.json() } catch { return {} }
}

// Vérifie l'appelant et son rôle. Renvoie { uid, role } ou lève 401/403.
async function authentifier(request, code, rolesAutorises) {
  const { uid } = await db.verifierToken(request)
  const role = await db.roleDansGroupe(code, uid)
  if (!role) {
    const e = new Error('Accès refusé : vous n’appartenez pas à ce groupe.')
    e.code = 403
    throw e
  }
  if (rolesAutorises && !rolesAutorises.includes(role)) {
    const e = new Error('Accès refusé : rôle insuffisant.')
    e.code = 403
    throw e
  }
  return { uid, role }
}

// ── WEBHOOK (public, signé) ──
exports.flutterwaveWebhook = onRequest(
  { region: REGION, secrets: SECRETS, timeoutSeconds: 30 },
  async (request) => {
    if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders() })
    if (request.method !== 'POST') return json({ ok: false, erreur: 'POST requis' }, 405)
    return payments.gererWebhook(request)
  }
)

// ── (Ré)création du compte virtuel (Responsable/Trésorier) ──
exports.flutterwaveCompte = onRequest(
  { region: REGION, secrets: SECRETS, timeoutSeconds: 30 },
  async (request) => {
    if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders() })
    if (request.method !== 'POST') return json({ ok: false, erreur: 'POST requis' }, 405)
    const p = await body(request)
    const code = String(p.code || '')
    const { uid } = await authentifier(request, code, ['responsable', 'tresorier'])
    if (!(await limiter('compte:' + uid, { max: 10, fenetreMs: 60000 }))) return json({ ok: false, erreur: 'Trop de requêtes' }, 429)
    const compte = await accounts.creerComptePourGroupe(code)
    return json({ ok: true, compte })
  }
)

// ── Lecture du compte à virer (membre du groupe) ──
exports.flutterwaveCompteLire = onRequest(
  { region: REGION, secrets: SECRETS },
  async (request) => {
    if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders() })
    const p = request.method === 'POST' ? await body(request) : {}
    const code = String(p.code || new URL(request.url).searchParams.get('code') || '')
    await authentifier(request, code, null) // tout membre du groupe
    const compte = await accounts.getCompte(code)
    return json({ ok: true, compte: compte || null })
  }
)

// ── Référence unique du membre (pour la narration du virement) ──
exports.flutterwaveReference = onRequest(
  { region: REGION, secrets: SECRETS },
  async (request) => {
    if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders() })
    if (request.method !== 'POST') return json({ ok: false, erreur: 'POST requis' }, 405)
    const p = await body(request)
    const code = String(p.code || '')
    const { uid } = await authentifier(request, code, null)
    if (!(await limiter('ref:' + uid, { max: 30, fenetreMs: 60000 }))) return json({ ok: false, erreur: 'Trop de requêtes' }, 429)
    const ref = await accounts.getOuCreerReference(code, uid)
    return json({ ok: true, reference: ref })
  }
)

// ── Validation manuelle d'un paiement non reconnu (gestionnaire) ──
exports.flutterwaveReconcile = onRequest(
  { region: REGION, secrets: SECRETS, timeoutSeconds: 30 },
  async (request) => {
    if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders() })
    if (request.method !== 'POST') return json({ ok: false, erreur: 'POST requis' }, 405)
    const p = await body(request)
    const code = String(p.code || '')
    const { uid } = await authentifier(request, code, ['responsable', 'tresorier'])
    const reconciliationId = String(p.reconciliationId || '')
    const membreId = Number(p.membreId)
    const tourId = Number(p.tourId)
    if (!reconciliationId || !membreId || !tourId) return json({ ok: false, erreur: 'Champs manquants' }, 400)
    const rec = await db.lire('reconciliation/' + encodeURIComponent(code) + '/' + encodeURIComponent(reconciliationId))
    if (!rec) return json({ ok: false, erreur: 'Paiement introuvable' }, 404)
    // Réécriture en paiement reconnu → intégration automatique côté app.
    await db.ecrire(
      'paiements/' + encodeURIComponent(code) + '/' + encodeURIComponent(reconciliationId),
      {
        statut: 'paye',
        montant: rec.montant,
        devise: rec.devise,
        operateur: 'Virement',
        numero: '',
        reference: rec.reference || '',
        narration: rec.narration,
        flwRef: rec.flwRef,
        txRef: rec.txRef,
        accountNumber: rec.accountNumber,
        membreId,
        tourId,
        reconnu: true,
        majLe: Date.now(),
      }
    )
    await db.supprimer('reconciliation/' + encodeURIComponent(code) + '/' + encodeURIComponent(reconciliationId))
    await audit.journaliser(code, {
      qui: uid, action: 'paiement_reconcile_manuel', statut: 'paye', montant: rec.montant, devise: rec.devise,
      details: { membreId, tourId, reconciliationId },
    })
    return json({ ok: true })
  }
)

// ── Demande de retrait (gestionnaire) ──
exports.flutterwaveTransfer = onRequest(
  { region: REGION, secrets: SECRETS, timeoutSeconds: 30 },
  async (request) => {
    if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders() })
    if (request.method !== 'POST') return json({ ok: false, erreur: 'POST requis' }, 405)
    const p = await body(request)
    const code = String(p.code || '')
    const { uid } = await authentifier(request, code, ['responsable', 'tresorier'])
    if (!(await limiter('retrait:' + uid, { max: 15, fenetreMs: 60000 }))) return json({ ok: false, erreur: 'Trop de requêtes' }, 429)
    const r = await transfers.creerRetrait({
      uid, code,
      montant: p.montant, currency: p.currency,
      bankCode: p.bankCode, accountNumber: p.accountNumber, fullname: p.fullname, narration: p.narration,
    })
    return json(r)
  }
)

// ── Approve de retrait (2e validation) ──
exports.flutterwaveTransferApprove = onRequest(
  { region: REGION, secrets: SECRETS, timeoutSeconds: 30 },
  async (request) => {
    if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders() })
    if (request.method !== 'POST') return json({ ok: false, erreur: 'POST requis' }, 405)
    const p = await body(request)
    const code = String(p.code || '')
    const { uid } = await authentifier(request, code, ['responsable', 'tresorier'])
    const r = await transfers.approuverRetrait({ uid, code, transferId: String(p.transferId || '') })
    return json(r)
  }
)

// ── Création AUTOMATIQUE du compte virtuel à la création d'un groupe ──
exports.onGroupeCree = onValueCreated(
  { region: REGION, secrets: SECRETS, ref: 'tontines/{code}/groupe', timeoutSeconds: 30 },
  async (event) => {
    const code = event.params.code
    try {
      await accounts.creerComptePourGroupe(code)
    } catch (e) {
      await audit.journaliser(code, { qui: 'system', action: 'compte_virtuel_echec', statut: 'erreur', details: { message: e && e.message } })
    }
  }
)

// ── Balayage des paiements non reconnus depuis > 24h (alerte) ──
exports.alertesReconciliation = onSchedule(
  { region: REGION, secrets: SECRETS, schedule: 'every 60 minutes' },
  async () => {
    const snap = await db.ref('reconciliation').once('value')
    const tout = snap.val() || {}
    const seuil = Date.now() - 24 * 3600 * 1000
    for (const code of Object.keys(tout)) {
      const items = tout[code] || {}
      for (const id of Object.keys(items)) {
        const it = items[id]
        if (it && it.statutReconciliation === 'en_attente' && it.recuLe && it.recuLe < seuil && !it.alerte24h) {
          await audit.journaliser(code, {
            qui: 'system', action: 'paiement_non_reconnu_24h', statut: 'anomalie',
            montant: it.montant, devise: it.devise, details: { reconciliationId: id },
          })
          await db.mettreAJour('reconciliation/' + encodeURIComponent(code) + '/' + encodeURIComponent(id), { alerte24h: true })
        }
      }
    }
  }
)
