// ═══════════════════════════════════════════════════════════════
// Client Flutterwave (côté serveur uniquement).
// Toutes les clés proviennent des secrets ; aucune n'est exposée au client.
// Host unique (api.flutterwave.com) : le basculement sandbox/live se fait
// par les clés (sk_test_ vs sk_live_) configurées dans Secret Manager.
// ═══════════════════════════════════════════════════════════════
const crypto = require('crypto')
const { FLW_SECRET_KEY, FLW_PUBLIC_KEY, FLW_ENCRYPTION_KEY, FLW_WEBHOOK_SECRET, FLW_TRANSFER_SECRET, FLW_MODE } = require('./secrets')
const { lire, ecrire } = require('./db')

const BASE = 'https://api.flutterwave.com'

function secretKey() {
  return FLW_SECRET_KEY.value()
}
function webhookSecret() {
  return FLW_WEBHOOK_SECRET.value() || ''
}
function mode() {
  return String(FLW_MODE.value() || 'sandbox').toLowerCase()
}
function estConfigure() {
  return !!secretKey()
}

async function api(path, body, method = 'POST') {
  const res = await fetch(BASE + path, {
    method,
    headers: {
      'Content-Type': 'application/json',
      Authorization: 'Bearer ' + secretKey(),
    },
    body: body ? JSON.stringify(body) : undefined,
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok || data.status !== 'success') {
    const msg = (data && (data.message || data.error)) || ('HTTP ' + res.status)
    throw new Error('Flutterwave ' + path + ' : ' + msg)
  }
  return data
}

// ── Création d'un compte virtuel PERMANENT par groupe ──
// Retourne { accountNumber, accountName, bankName, bankCode, orderRef }.
async function creerCompteVirtuel({ email, narration, txRef }) {
  const data = await api('/v3/virtual-account-numbers', {
    email: String(email),
    is_permanent: true,
    tx_ref: String(txRef),
    narration: String(narration).slice(0, 60),
  })
  const d = data.data || {}
  return {
    accountNumber: d.account_number || '',
    accountName: d.account_name || '',
    bankName: d.bank_name || '',
    bankCode: d.bank_code || '',
    orderRef: d.order_ref || '',
    // Flutterwave émet les comptes virtuels dans sa devise native
    // (NGN en général). On la conserve pour l'affichage et les retraits.
    currency: d.currency || 'NGN',
  }
}

// ── Vérification de la signature du webhook ──
// Flutterwave renvoie l'en-tête `verif-hash` égal au « Webhook Secret Hash »
// configuré dans le dashboard. On compare en temps constant pour éviter
// les attaques par temporisation.
function verifierWebhook(request) {
  const recu = String(request.headers.get('verif-hash') || '').trim()
  const attendu = String(webhookSecret()).trim()
  if (!attendu) return false
  if (recu.length !== attendu.length) return false
  return crypto.timingSafeEqual(Buffer.from(recu), Buffer.from(attendu))
}

// ── Idempotence : un même flw_ref ne doit jamais être crédité deux fois ──
async function dejaTraite(flwRef) {
  if (!flwRef) return false
  const v = await lire('traites/' + encodeURIComponent(String(flwRef)))
  return !!v
}
async function marquerTraite(flwRef, info) {
  if (!flwRef) return
  await ecrire('traites/' + encodeURIComponent(String(flwRef)), {
    quand: Date.now(),
    ...(info || {}),
  })
}

// ── Retrait / transfert vers un compte bancaire (Responsable/Trésorier) ──
// Renvoie { id, flwRef, status }.
async function creerTransfert({ bankCode, accountNumber, fullname, amount, currency, narration, txRef }) {
  const body = {
    account_bank: String(bankCode),
    account_number: String(accountNumber),
    amount: Number(amount),
    currency: String(currency || 'NGN'),
    fullname: String(fullname).slice(0, 100),
    tx_ref: String(txRef),
    narration: String(narration || 'Retrait tontine').slice(0, 80),
    debit_currency: String(currency || 'NGN'),
    seckey: FLW_TRANSFER_SECRET.value() || secretKey(),
  }
  const data = await api('/v3/transfers', body)
  const d = data.data || {}
  return {
    id: d.id || null,
    flwRef: d.reference || d.account_number || txRef,
    status: d.status || 'pending',
  }
}

function nouveauTxRef(prefix) {
  return (prefix || 'TM') + '-' + Date.now().toString(36).toUpperCase() + '-' + crypto.randomBytes(4).toString('hex').toUpperCase()
}

module.exports = {
  estConfigure,
  mode,
  api,
  creerCompteVirtuel,
  verifierWebhook,
  dejaTraite,
  marquerTraite,
  creerTransfert,
  nouveauTxRef,
  webhookSecret,
  secretKey,
}
