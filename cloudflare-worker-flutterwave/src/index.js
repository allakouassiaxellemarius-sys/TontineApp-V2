// Cloudflare Worker — récepteur du webhook Flutterwave (rôle unique).
// Vérifie la signature (en-tête verif-hash), déduplique via traites/<flwRef>
// et réconcilie automatiquement dans la Realtime Database
// (comptesParNumero, references, tours -> paiements / reconciliation).
// Le reste du flux (compte virtuel, référence, réconciliation manuelle,
// retraits) reste géré par les Firebase Cloud Functions.

const REF_RE = /REF-[A-Z2-9]{12}/
const REF_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
  })
}
function corsPreflight() {
  return new Response(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, verif-hash',
    },
  })
}
const project = (env) => env.FIREBASE_PROJECT || 'tontine-manager-f3965'
const p = (...segs) => segs.map((s) => encodeURIComponent(String(s))).join('/')

function b64url(bytes) {
  let s = ''
  for (const b of bytes) s += String.fromCharCode(b)
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}
function b64ToBytes(str) {
  const bin = atob(str)
  const out = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
  return out
}
function ctEq(a, b) {
  const ab = new TextEncoder().encode(a)
  const bb = new TextEncoder().encode(b)
  if (ab.length !== bb.length) return false
  let r = 0
  for (let i = 0; i < ab.length; i++) r |= ab[i] ^ bb[i]
  return r === 0
}

async function hmacSha256(key, data) {
  const ck = await crypto.subtle.importKey('raw', new TextEncoder().encode(key), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  const sig = await crypto.subtle.sign('HMAC', ck, new TextEncoder().encode(data))
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

async function importPrivateKey(pem) {
  const clean = pem.replace(/-----BEGIN PRIVATE KEY-----/, '').replace(/-----END PRIVATE KEY-----/, '').replace(/\s+/g, '')
  const der = b64ToBytes(clean)
  return crypto.subtle.importKey('pkcs8', der, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['sign'])
}
async function signJWT(payload, privateKeyPem) {
  const enc = (o) => b64url(new TextEncoder().encode(JSON.stringify(o)))
  const header = { alg: 'RS256', typ: 'JWT' }
  const data = enc(header) + '.' + enc(payload)
  const key = await importPrivateKey(privateKeyPem)
  const sig = await crypto.subtle.sign({ name: 'RSASSA-PKCS1-v1_5' }, key, new TextEncoder().encode(data))
  return data + '.' + b64url(new Uint8Array(sig))
}
async function getAccessToken(env) {
  if (!env.FIREBASE_SERVICE_ACCOUNT) return null
  const sa = JSON.parse(env.FIREBASE_SERVICE_ACCOUNT)
  const now = Math.floor(Date.now() / 1000)
  const jwt = await signJWT(
    { iss: sa.client_email, sub: sa.client_email, aud: sa.token_uri || 'https://oauth2.googleapis.com/token', iat: now, exp: now + 3600, scope: 'https://www.googleapis.com/auth/firebase.database' },
    sa.private_key,
  )
  const r = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: jwt }),
  })
  const j = await r.json()
  if (!j.access_token) throw new Error('OAuth RTDB: ' + JSON.stringify(j))
  return j.access_token
}

async function rtdbReq(method, path, env, body) {
  const token = await getAccessToken(env)
  const host = env.RTDB_HOST ? `http://${env.RTDB_HOST}` : `https://${project(env)}-default-rtdb.firebaseio.com`
  let url = `${host}/${path}.json`
  const q = []
  if (token) q.push('access_token=' + encodeURIComponent(token))
  else if (env.FIREBASE_DB_SECRET) q.push('auth=' + encodeURIComponent(env.FIREBASE_DB_SECRET))
  if (q.length) url += '?' + q.join('&')
  const opts = { method, headers: { 'Content-Type': 'application/json' } }
  if (body !== undefined) opts.body = JSON.stringify(body)
  const r = await fetch(url, opts)
  if (r.status === 404) return null
  if (!r.ok) throw new Error('RTDB ' + method + ' ' + path + ' -> ' + r.status)
  if (method === 'DELETE') return null
  const t = await r.text()
  return t ? JSON.parse(t) : null
}
const rtdbGet = (path, env) => rtdbReq('GET', path, env)
const rtdbSet = (path, v, env) => rtdbReq('PUT', path, env, v)
const rtdbRemove = (path, env) => rtdbReq('DELETE', path, env)

async function flwDejaTraite(flwRef, env) {
  if (!flwRef) return false
  return !!(await rtdbGet(p('traites', flwRef), env))
}
async function flwMarquerTraite(flwRef, info, env) {
  if (!flwRef) return
  await rtdbSet(p('traites', flwRef), { quand: Date.now(), ...(info || {}) }, env)
}

async function codeDepuisCompte(accountNumber, env) {
  if (!accountNumber) return null
  return rtdbGet(p('comptesParNumero', accountNumber), env)
}
async function resoudreReference(code, ref, env) {
  if (!ref) return null
  const r = await rtdbGet(p('references', code, String(ref).trim().toUpperCase()), env)
  return r ? r.membreId : null
}
async function tourActif(code, env) {
  const tours = await rtdbGet(p('tontines', code, 'tours'), env)
  if (!tours) return null
  const liste = Array.isArray(tours) ? tours : Object.values(tours)
  const actifs = liste.filter((t) => t && (t.statut === 'en_attente' || t.statut === 'actif'))
  if (!actifs.length) return null
  actifs.sort((a, b) => (Number(a.datePrevue) || 0) - (Number(b.datePrevue) || 0))
  return actifs[0]
}

async function traiterPaiement(payload, env) {
  const data = (payload && payload.data) || {}
  const event = String((payload && payload.event) || '')
  const statut = String(data.status || data.status_code || '').toLowerCase()
  const estPaiement = event === 'charge.completed' || event === 'charge.complete' || event === 'transfer'
  if (!estPaiement) return { ignore: true }
  if (!['successful', 'settled', 'completed', 'success'].includes(statut)) return { ignore: true }

  const flwRef = String(data.flw_ref || data.id || data.reference || '')
  const montant = Number(data.amount || data.charged_amount || 0)
  const devise = String(data.currency || 'NGN')
  const accountNumber = String(data.account_number || (data.customer && data.customer.account_number) || '')
  const narration = String(data.narration || data.narration_text || '')

  if (await flwDejaTraite(flwRef, env)) return { dejaTraite: true, flwRef }

  const code = await codeDepuisCompte(accountNumber, env)
  if (!code) return { erreur: 'compte inconnu', flwRef }

  const match = narration.match(REF_RE)
  const reference = match ? match[0] : null
  const membreId = reference ? await resoudreReference(code, reference, env) : null
  const tour = await tourActif(code, env)

  const base = {
    statut: 'paye', montant, devise, operateur: 'Virement', numero: '',
    reference: reference || '', narration, flwRef, txRef: String(data.tx_ref || ''), accountNumber, majLe: Date.now(),
  }

  let result
  if (membreId && tour) {
    await rtdbSet(p('paiements', code, flwRef), { ...base, membreId: Number(membreId), tourId: Number(tour.id), reconnu: true }, env)
    result = { ok: true, code, membreId, tourId: tour.id, auto: true }
  } else {
    await rtdbSet(p('reconciliation', code, flwRef), { ...base, membreId: membreId ? Number(membreId) : null, tourId: tour ? Number(tour.id) : null, statutReconciliation: 'en_attente', recuLe: Date.now() }, env)
    result = { ok: true, code, auto: false, nonReconnu: true }
  }
  await flwMarquerTraite(flwRef, { montant, devise, accountNumber }, env)
  return result
}

async function handleWebhook(request, env) {
  const raw = await request.text()
  const recu = (request.headers.get('verif-hash') || '').trim()
  const attendu = (env.FLW_WEBHOOK_SECRET || '').trim()
  if (!attendu || !ctEq(recu, attendu)) return json({ ok: false, erreur: 'Signature invalide' }, 401)
  let payload
  try {
    payload = JSON.parse(raw)
  } catch {
    return json({ ok: false, erreur: 'JSON invalide' }, 400)
  }
  const r = await traiterPaiement(payload, env)
  if (r.ignore) return json({ ok: true, ignore: true })
  if (r.dejaTraite) return json({ ok: true, dejaTraite: true })
  if (r.erreur) return json({ ok: false, erreur: r.erreur }, 404)
  return json({ ok: true, ...r })
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url)
    const path = url.pathname
    try {
      if (request.method === 'OPTIONS') return corsPreflight()
      if (path === '/healthz') return json({ ok: true })
      if (path === '/flutterwaveWebhook' && request.method === 'POST') return await handleWebhook(request, env)
      return json({ ok: false, erreur: 'Route inconnue' }, 404)
    } catch (e) {
      const status = e && e.code ? Number(e.code) : 500
      return json({ ok: false, erreur: String((e && e.message) || e) }, status)
    }
  },
}
