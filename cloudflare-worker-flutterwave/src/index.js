// Équivalent Cloudflare Worker des Cloud Functions Flutterwave.
// Déployable gratuitement (plan gratuit Workers), sans plan Blaze Firebase.
// Remplace : flutterwaveWebhook, flutterwaveReconcile, flutterwaveVirtualAccount, flutterwaveReference.
// Le trigger onValueCreated (création auto du compte) est remplacé par un
// appel explicite à POST /flutterwaveVirtualAccount lors de la création du groupe.

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
      'Access-Control-Allow-Headers': 'Content-Type, Authorization, verif-hash',
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
function randHex(n = 8) {
  let s = ''
  const c = '0123456789abcdef'
  for (let i = 0; i < n; i++) s += c[Math.floor(Math.random() * 16)]
  return s
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
  if (!r.ok) throw new Error('RTDB ' + method + ' ' + path + ' -> ' + r.status)
  if (method === 'DELETE') return null
  const t = await r.text()
  return t ? JSON.parse(t) : null
}
const rtdbGet = (path, env) => rtdbReq('GET', path, env)
const rtdbSet = (path, v, env) => rtdbReq('PUT', path, env, v)
const rtdbRemove = (path, env) => rtdbReq('DELETE', path, env)

async function verifyIdToken(idToken, env) {
  if (!idToken) throw Object.assign(new Error('jeton manquant'), { code: 401 })
  const r = await fetch('https://oauth2.googleapis.com/tokeninfo?id_token=' + encodeURIComponent(idToken))
  const j = await r.json()
  if (j.error_description || !j.sub) throw Object.assign(new Error('jeton invalide'), { code: 401 })
  const aud = Array.isArray(j.aud) ? j.aud[0] : j.aud
  if (aud !== project(env)) throw Object.assign(new Error('jeton invalide (aud)'), { code: 401 })
  return { uid: j.user_id || j.sub }
}
async function roleDansGroupe(code, uid, env) {
  if (!uid) return null
  const g = await rtdbGet(p('tontines', code, 'groupe'), env)
  if (!g) return null
  if (g.proprietaire === uid) return 'responsable'
  if (g.coGerants && g.coGerants[uid]) return 'tresorier'
  if (Array.isArray(g.membres) && g.membres.some((m) => m && m.uid === uid)) return 'membre'
  return null
}
async function authentifier(request, code, roles, env) {
  const auth = request.headers.get('authorization') || ''
  const m = auth.match(/^Bearer\s+(.+)$/i)
  if (!m) throw Object.assign(new Error('Non autorisé'), { code: 401 })
  const { uid } = await verifyIdToken(m[1].trim(), env)
  const role = await roleDansGroupe(code, uid, env)
  if (roles && !roles.includes(role)) throw Object.assign(new Error('Interdit'), { code: 403 })
  return { uid, role }
}

async function emailUtilisateur(uid, env) {
  const local = await rtdbGet(p('users', uid, 'email'), env).catch(() => null)
  return local || null
}

async function flwApi(path, body, env) {
  const r = await fetch('https://api.flutterwave.com' + path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + (env.FLW_SECRET_KEY || '') },
    body: JSON.stringify(body),
  })
  const data = await r.json().catch(() => ({}))
  if (!r.ok || data.status !== 'success') throw new Error('Flutterwave ' + path + ' : ' + (data.message || data.error || 'HTTP ' + r.status))
  return data
}
async function flwCreerCompteVirtuel({ email, narration, txRef }, env) {
  const data = await flwApi('/v3/virtual-account-numbers', { email: String(email), is_permanent: true, tx_ref: String(txRef), narration: String(narration).slice(0, 60) }, env)
  const d = data.data || {}
  return { accountNumber: d.account_number || '', accountName: d.account_name || '', bankName: d.bank_name || '', bankCode: d.bank_code || '', orderRef: d.order_ref || '', currency: d.currency || 'NGN' }
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
async function flwDejaTraite(flwRef, env) {
  if (!flwRef) return false
  return !!(await rtdbGet(p('traites', flwRef), env))
}
async function flwMarquerTraite(flwRef, info, env) {
  if (!flwRef) return
  await rtdbSet(p('traites', flwRef), { quand: Date.now(), ...(info || {}) }, env)
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
  await flwMarquerTraite(flwRef, { montant, devise, accountNumber }, env)

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

  if (membreId && tour) {
    await rtdbSet(p('paiements', code, flwRef), { ...base, membreId: Number(membreId), tourId: Number(tour.id), reconnu: true }, env)
    return { ok: true, code, membreId, tourId: tour.id, auto: true }
  }
  await rtdbSet(p('reconciliation', code, flwRef), { ...base, membreId: membreId ? Number(membreId) : null, tourId: tour ? Number(tour.id) : null, statutReconciliation: 'en_attente', recuLe: Date.now() }, env)
  return { ok: true, code, auto: false, nonReconnu: true }
}

function nouveauRef() {
  let s = ''
  for (let i = 0; i < 12; i++) s += REF_CHARS[Math.floor(Math.random() * REF_CHARS.length)]
  return 'REF-' + s
}
async function getOuCreerReference(code, uid, env) {
  const existant = await rtdbGet(p('refsMembre', code, uid), env)
  if (existant) return existant
  const g = await rtdbGet(p('tontines', code, 'groupe'), env)
  const membres = g && Array.isArray(g.membres) ? g.membres : []
  const m = membres.find((x) => x && x.uid === uid)
  const membreId = m ? Number(m.id) : null
  let ref = nouveauRef()
  let essais = 0
  while (await rtdbGet(p('references', code, ref), env)) {
    ref = nouveauRef()
    if (++essais > 5) break
  }
  const entree = { uid, membreId, creeLe: Date.now() }
  await rtdbSet(p('references', code, ref), entree, env)
  await rtdbSet(p('refsMembre', code, uid), ref, env)
  return ref
}

async function handleWebhook(request, env) {
  const raw = await request.text()
  const recu = (request.headers.get('verif-hash') || '').trim()
  const attendu = await hmacSha256(env.FLW_WEBHOOK_SECRET || '', raw)
  if (!env.FLW_WEBHOOK_SECRET || !ctEq(recu, attendu)) return json({ ok: false, erreur: 'Signature invalide' }, 401)
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

async function handleReconcile(request, env) {
  let body
  try {
    body = await request.json()
  } catch {
    return json({ ok: false, erreur: 'JSON invalide' }, 400)
  }
  const code = String(body.code || '')
  await authentifier(request, code, ['responsable', 'tresorier'], env)
  const reconciliationId = String(body.reconciliationId || '')
  const membreId = Number(body.membreId)
  const tourId = Number(body.tourId)
  if (!reconciliationId || !membreId || !tourId) return json({ ok: false, erreur: 'Champs manquants' }, 400)
  const rec = await rtdbGet(p('reconciliation', code, reconciliationId), env)
  if (!rec) return json({ ok: false, erreur: 'Paiement introuvable' }, 404)
  await rtdbSet(p('paiements', code, reconciliationId), {
    statut: 'paye', montant: rec.montant, devise: rec.devise, operateur: 'Virement', numero: '',
    reference: rec.reference || '', narration: rec.narration, flwRef: rec.flwRef, txRef: rec.txRef,
    accountNumber: rec.accountNumber, membreId, tourId, reconnu: true, majLe: Date.now(),
  }, env)
  await rtdbRemove(p('reconciliation', code, reconciliationId), env)
  return json({ ok: true })
}

async function handleVirtualAccount(request, env) {
  let body
  try {
    body = await request.json()
  } catch {
    return json({ ok: false, erreur: 'JSON invalide' }, 400)
  }
  const code = String(body.code || '')
  const { uid } = await authentifier(request, code, ['responsable', 'tresorier'], env)
  const g = await rtdbGet(p('tontines', code, 'groupe'), env)
  if (!g) return json({ ok: false, erreur: 'Groupe introuvable' }, 404)
  const configured = !!env.FLW_SECRET_KEY
  let record
  if (!configured) {
    record = { accountNumber: '0000000000', accountName: (g.nom || 'Tontine').slice(0, 30), bankName: 'BANQUE DEMO (sandbox)', bankCode: 'demo', orderRef: 'demo-' + code, provider: 'flutterwave', devise: 'NGN', demo: true, creeLe: Date.now() }
    await rtdbSet(p('comptesVirtuels', code), record, env)
    await rtdbSet(p('comptesParNumero', '0000000000'), String(code), env)
    return json({ ok: true, demo: true, compte: record })
  }
  const email = (await emailUtilisateur(uid, env)) || 'tontine-' + String(code).toLowerCase() + '@tontine.app'
  const txRef = 'VA-' + Date.now().toString(36).toUpperCase() + '-' + randHex()
  const cpt = await flwCreerCompteVirtuel({ email, narration: 'Tontine ' + (g.nom || code), txRef }, env)
  record = { ...cpt, provider: 'flutterwave', txRef, email, devise: cpt.currency || 'NGN', creeLe: Date.now() }
  await rtdbSet(p('comptesVirtuels', code), record, env)
  if (cpt.accountNumber) await rtdbSet(p('comptesParNumero', cpt.accountNumber), String(code), env)
  return json({ ok: true, compte: record })
}

async function handleReference(request, env) {
  let body
  try {
    body = await request.json()
  } catch {
    return json({ ok: false, erreur: 'JSON invalide' }, 400)
  }
  const code = String(body.code || '')
  const { uid } = await authentifier(request, code, null, env)
  const ref = await getOuCreerReference(code, uid, env)
  return json({ ok: true, reference: ref })
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url)
    const path = url.pathname
    try {
      if (request.method === 'OPTIONS') return corsPreflight()
      if (path === '/healthz') return json({ ok: true })
      if (path === '/flutterwaveWebhook' && request.method === 'POST') return await handleWebhook(request, env)
      if (path === '/flutterwaveReconcile' && request.method === 'POST') return await handleReconcile(request, env)
      if (path === '/flutterwaveVirtualAccount' && request.method === 'POST') return await handleVirtualAccount(request, env)
      if (path === '/flutterwaveReference' && request.method === 'POST') return await handleReference(request, env)
      return json({ ok: false, erreur: 'Route inconnue' }, 404)
    } catch (e) {
      const status = e && e.code ? Number(e.code) : 500
      return json({ ok: false, erreur: String((e && e.message) || e) }, status)
    }
  },
}
