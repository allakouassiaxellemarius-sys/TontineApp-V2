// Tontine Manager — Worker de synchronisation (100% Cloudflare, sans Firebase)
// Stockage : KV. Auth : JWT signé (HS256) délivré par le Worker.
//   - Google : l'app envoie l'idToken Google → vérification tokeninfo → JWT.
//   - Email  : register/login/reset → KV + PBKDF2 (Web Crypto) → JWT.
//
// Routes (après auth, sauf /auth2/* et /flutterwave/*) — alignées sur le
// client (src/lib/sync.js, src/lib/push.js) :
//   tontines/{code}                     GET / PUT / DELETE
//   users/{uid}/tontines                GET (liste) / DELETE users/{uid}/tontines/{code}
//   users/{uid}/groupes                 GET (liste) / PUT|DELETE users/{uid}/groupes/{code}
//   users/{uid}/sauvegardes             GET (liste) / PUT|DELETE users/{uid}/sauvegardes/{id}
//   users/{uid}/fcmToken                PUT / DELETE  -> fcm/{uid}
//   demandes/{code}                     POST (crée) / GET (liste) / DELETE demandes/{code}/{id}
//   messages_utilisateur/{code}         POST (crée + notifie FCM) / GET (liste) / DELETE .../{id}
//   paiements/{code}                    GET (liste) / DELETE paiements/{code}/{id}
//   paiements_invite/{code}             PUT (idempotent) / GET (liste) / DELETE .../{id}
//   transferts/{code}                   POST (crée) / GET (liste)
//   auditLogs/{code}                    GET (liste)
//   comptes/{numero}                    PUT|GET|DELETE  (mappage compte virtuel Flutterwave -> code)
// Public :
//   auth2/{google,register,login,reset} POST
//   flutterwave/webhook                 POST (signature verif-hash) -> écrit paiements/{code}

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type,Authorization,verif-hash',
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', ...CORS },
  })
}
function toHex(bytes) {
  let s = ''
  for (const b of bytes) s += b.toString(16).padStart(2, '0')
  return s
}

// ---------- D1 helpers (stockage clé/valeur sur D1) ----------
function likeEscape(s) {
  return s.replace(/[\\%_]/g, (c) => '\\' + c)
}
async function kvGet(env, key) {
  const r = await env.DB.prepare('SELECT value FROM kv WHERE key = ?').bind(key).first()
  if (!r) return null
  try { return JSON.parse(r.value) } catch { return null }
}
async function kvPut(env, key, value) {
  await env.DB.prepare(
    'INSERT INTO kv (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value'
  ).bind(key, JSON.stringify(value)).run()
}
async function kvDel(env, key) {
  await env.DB.prepare('DELETE FROM kv WHERE key = ?').bind(key).run()
}
async function kvList(env, prefix) {
  const pat = likeEscape(prefix) + '*'
  const { results } = await env.DB.prepare('SELECT key, value FROM kv WHERE key GLOB ?').bind(pat).all()
  const out = {}
  for (const row of (results || [])) {
    try {
      const v = JSON.parse(row.value)
      if (v !== null) out[row.key.slice(prefix.length)] = v
    } catch (_) { /* ignore */ }
  }
  return out
}

// Rate limiting léger (fenêtre glissante) sur les endpoints sensibles.
// Clés : "ratelimit/<axe>/<fenetre>". Compte les requêtes d'un axe (IP ou email)
// dans la même fenêtre de 60 s ; au-delà du seuil, la requête est refusée.
async function rateLimit(env, axe, { limite = 10, fenetreMs = 60 * 1000 } = {}) {
  const fenetre = Math.floor(Date.now() / fenetreMs) * fenetreMs
  const key = 'ratelimit/' + axe + '/' + fenetre
  const rec = await kvGet(env, key)
  const n = (rec && rec.n) || 0
  if (n >= limite) return false
  await kvPut(env, key, { n: n + 1 })
  return true
}
function clientIp(request) {
  return request.headers.get('CF-Connecting-IP') || request.headers.get('X-Forwarded-For') || 'inconnu'
}

// ---------- Crypto helpers ----------
function b64urlFromBytes(bytes) {
  let bin = ''
  for (const b of bytes) bin += String.fromCharCode(b)
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}
function bytesFromB64url(str) {
  str = str.replace(/-/g, '+').replace(/_/g, '/')
  while (str.length % 4) str += '='
  const bin = atob(str)
  const bytes = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
  return bytes
}
function b64ToBytes(str) {
  const bin = atob(str.replace(/-/g, '+').replace(/_/g, '/'))
  const bytes = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
  return bytes
}
function b64urlEncode(obj) {
  return b64urlFromBytes(new TextEncoder().encode(JSON.stringify(obj)))
}
function b64urlDecodeObj(str) {
  return JSON.parse(new TextDecoder().decode(bytesFromB64url(str)))
}
async function hmac(secret, data, hash = 'SHA-256') {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash },
    false,
    ['sign']
  )
  return new Uint8Array(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(data)))
}
function ctEq(a, b) {
  if (a.length !== b.length) return false
  let r = 0
  for (let i = 0; i < a.length; i++) r |= a[i] ^ b[i]
  return r === 0
}
function ctEqStr(a, b) {
  if (a.length !== b.length) return false
  let r = 0
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return r === 0
}

// ---------- JWT (HS256) ----------
async function jwtSign(payload, secret) {
  const header = { alg: 'HS256', typ: 'JWT' }
  const body = { ...payload, iat: Math.floor(Date.now() / 1000), exp: Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 30 }
  const h = b64urlEncode(header)
  const p = b64urlEncode(body)
  const sig = await hmac(secret, `${h}.${p}`)
  return `${h}.${p}.${b64urlFromBytes(sig)}`
}
async function jwtVerify(token, secret) {
  const parts = String(token).split('.')
  if (parts.length !== 3) return null
  const [h, p, s] = parts
  const expected = await hmac(secret, `${h}.${p}`)
  if (!ctEq(expected, bytesFromB64url(s))) return null
  let payload
  try { payload = b64urlDecodeObj(p) } catch { return null }
  if (payload.exp && payload.exp < Math.floor(Date.now() / 1000)) return null
  return payload
}

async function hashPassword(password, saltB64) {
  const salt = saltB64 ? bytesFromB64url(saltB64) : crypto.getRandomValues(new Uint8Array(16))
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(password),
    'PBKDF2',
    false,
    ['deriveBits']
  )
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt, iterations: 100000, hash: 'SHA-256' },
    key,
    256
  )
  return { salt: b64urlFromBytes(salt), hash: b64urlFromBytes(new Uint8Array(bits)) }
}
async function verifyPassword(password, salt, hash) {
  const d = await hashPassword(password, salt)
  return d.hash.length === hash.length && ctEqStr(d.hash, hash)
}

// ---------- Référence de paiement (miroir exact de src/lib/cotisation.js) ----------
// Référence déterministe du membre (narration du virement Flutterwave).
function referencePourMembre(code, uid) {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  const seed = 'tontine:' + String(code) + ':' + String(uid)
  let buf = seed
  let out = ''
  for (let i = 0; i < 12; i++) {
    let x = 0x811c9dc5 >>> 0
    for (let j = 0; j < buf.length; j++) {
      x ^= buf.charCodeAt(j)
      x = Math.imul(x, 0x01000193) >>> 0
    }
    out += alphabet[x % alphabet.length]
    buf = x.toString(36) + seed + String(i)
  }
  return 'REF-' + out
}

// Reconstruit l'index references/{REF} -> {code, membreId, uid} pour un groupe.
async function rebuildReferenceIndex(env, code, membres) {
  const list = Array.isArray(membres) ? membres : (membres && typeof membres === 'object' ? Object.values(membres) : [])
  const exist = await kvList(env, 'references/')
  for (const k of Object.keys(exist)) {
    if (exist[k] && exist[k].code === code) await kvDel(env, 'references/' + k)
  }
  for (const m of list) {
    if (m && m.uid) {
      const ref = referencePourMembre(code, m.uid)
      await kvPut(env, 'references/' + ref, { code, membreId: m.id != null ? Number(m.id) : null, uid: m.uid })
    }
  }
}

// ---------- FCM (livraison des notifications) ----------
// Priorité : clé serveur legacy (FCM_SERVER_KEY) sinon FCM v1 (FCM_SERVICE_ACCOUNT).
let fcmTokenCache = { token: null, exp: 0 }

async function signJwtRs256(header, payload, privateKeyPem) {
  const pem = privateKeyPem.replace(/-----[^-]+-----/g, '').replace(/\s+/g, '')
  const keyBytes = b64ToBytes(pem)
  const key = await crypto.subtle.importKey(
    'pkcs8',
    keyBytes,
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['sign']
  )
  const h = b64urlEncode(header)
  const p = b64urlEncode(payload)
  const sig = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', key, new TextEncoder().encode(`${h}.${p}`))
  return `${h}.${p}.${b64urlFromBytes(new Uint8Array(sig))}`
}

async function getFcmAccessToken(env) {
  const now = Math.floor(Date.now() / 1000)
  if (fcmTokenCache.token && fcmTokenCache.exp > now + 60) return fcmTokenCache.token
  let sa
  try { sa = typeof env.FCM_SERVICE_ACCOUNT === 'string' ? JSON.parse(env.FCM_SERVICE_ACCOUNT) : null } catch { sa = null }
  if (!sa || !sa.client_email || !sa.private_key) throw new Error('FCM_SERVICE_ACCOUNT manquant')
  const header = { alg: 'RS256', typ: 'JWT' }
  const claim = {
    iss: sa.client_email,
    scope: 'https://www.googleapis.com/auth/firebase.messaging',
    aud: 'https://oauth2.googleapis.com/token',
    iat: now,
    exp: now + 3600,
  }
  const jwt = await signJwtRs256(header, claim, sa.private_key)
  const r = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: 'grant_type=urn%3Aietf%3Aparams%3Aoauth%3Agrant-type%3Ajwt-bearer&assertion=' + encodeURIComponent(jwt),
  })
  const j = await r.json()
  if (!j.access_token) throw new Error('FCM token: ' + (j.error_description || j.error))
  fcmTokenCache = { token: j.access_token, exp: now + (j.expires_in || 3600) }
  return j.access_token
}

async function sendFcm(env, token, title, body, dataExtra) {
  if (!token) return
  const pay = Object.assign(
    { title: String(title || ''), body: String(body || '') },
    dataExtra || {}
  )
  // Legacy server key
  if (env.FCM_SERVER_KEY) {
    try {
      await fetch('https://fcm.googleapis.com/fcm/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'key=' + env.FCM_SERVER_KEY },
        body: JSON.stringify({
          to: token,
          notification: { title, body },
          data: pay,
        }),
      })
      return
    } catch (_) { /* fallback v1 */ }
  }
  // FCM v1
  try {
    let sa
    try { sa = typeof env.FCM_SERVICE_ACCOUNT === 'string' ? JSON.parse(env.FCM_SERVICE_ACCOUNT) : null } catch { sa = null }
    if (!sa || !sa.project_id) return
    const at = await getFcmAccessToken(env)
    await fetch(`https://fcm.googleapis.com/v1/projects/${sa.project_id}/messages:send`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + at },
      body: JSON.stringify({
        message: {
          token,
          notification: { title, body },
          data: pay,
        },
      }),
    })
  } catch (_) { /* best effort */ }
}

async function notifierMessage(env, record, code, dataExtra) {
  if (!record) return
  const titre = 'Tontine'
  const texte = record.texte || record.titre || 'Nouveau message'
  if (record.pour) {
    const t = await kvGet(env, 'fcm/' + record.pour)
    if (t && t.token) await sendFcm(env, t.token, titre, texte, dataExtra)
    return
  }
  // Diffusion au groupe
  const grp = await kvGet(env, 'tontines/' + code)
  const membres = grp && grp.membres
    ? (Array.isArray(grp.membres) ? grp.membres : Object.values(grp.membres))
    : []
  for (const m of membres) {
    if (!m || !m.uid) continue
    if (record.par && m.uid === record.par) continue
    const t = await kvGet(env, 'fcm/' + m.uid)
    if (t && t.token) await sendFcm(env, t.token, titre, texte, dataExtra)
  }
}

// ---------- Création d'un compte virtuel Flutterwave dédié (cotisation automatique) ----------
async function creerCompteVirtuelFlutterwave(env, code, body) {
  const sk = env.FLW_SECRET_KEY
  if (!sk) return null
  const name = (body && (body.name || body.nom)) || ('Tontine ' + code)
  const email = (body && body.email) || ('tontine+' + code + '@tontine-manager.app')
  const phone = (body && (body.phone || body.telephone)) || ''
  const txRef = 'va_' + String(code) + '_' + Date.now().toString(36)
  let customerEmail = email
  try {
    const cRes = await fetch('https://api.flutterwave.com/v3/customers', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + sk },
      body: JSON.stringify({ email, phone_number: phone, name, tx_ref: txRef }),
    })
    const cj = await cRes.json().catch(() => ({}))
    if (cj && cj.data && cj.data.email) customerEmail = cj.data.email
  } catch (_) { /* client déjà existant : on continue avec l'email fourni */ }
  const vaRes = await fetch('https://api.flutterwave.com/v3/virtual-account-numbers', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + sk },
    body: JSON.stringify({
      email: customerEmail,
      tx_ref: txRef,
      phonenumber: phone,
      firstname: String(name).split(' ')[0] || name,
      lastname: String(name).split(' ').slice(1).join(' ') || name,
      narration: 'Tontine ' + code,
    }),
  })
  const vj = await vaRes.json().catch(() => ({}))
  if (!vaRes.ok || !vj.data || !vj.data.account_number) return null
  const d = vj.data
  return {
    accountNumber: String(d.account_number),
    bankName: d.bank_name || '',
    accountName: d.account_name || name,
    flutterwaveRef: d.flw_ref || txRef,
  }
}

// ---------- Webhook Flutterwave (public, signé par verif-hash) ----------
async function handleFlutterwaveWebhook(env, request) {
  try {
    const raw = await request.text()
    const sig = request.headers.get('verif-hash') || ''
    // Flutterwave place le « secret hash » (configuré dans le dashboard →
    // Settings → Webhooks) dans l'en-tête `verif-hash`. On le compare en temps
    // constant ; il ne s'agit PAS d'un HMAC du corps.
    const secret = env.FLW_WEBHOOK_SECRET || ''
    if (!secret) return json({ error: 'Webhook Flutterwave non configuré' }, 401)
    if (!ctEqStr(secret, sig)) return json({ error: 'Signature invalide' }, 401)
    let evt
    try { evt = JSON.parse(raw) } catch { return json({ error: 'JSON invalide' }, 400) }
    const d = evt.data || {}
    if (d.status && !/success/i.test(d.status) && evt.event !== 'charge.completed') {
      return json({ ok: true, ignore: d.status })
    }
    const haystack = [d.tx_ref, d.narration, d.meta && JSON.stringify(d.meta), d.account_number].filter(Boolean).join(' ')
    const m = haystack.match(/REF-[A-Z2-9]{12}/)
    const ref = m && m[0]
    let target = null
    if (ref) target = await kvGet(env, 'references/' + ref)
    if (!target && d.account_number) target = await kvGet(env, 'comptesParNumero/' + String(d.account_number))
    const montant = Number(d.amount) || 0
    const devise = d.currency || 'XOF'
    if (!target || !target.code) {
      // Groupe introuvable : la transaction est archivée pour investigation
      // au lieu d'être ignorée en silence.
      await kvPut(env, 'paiements_inconnus/' + (d.flw_ref || d.tx_ref || String(Date.now())), {
        flwRef: d.flw_ref || null, txRef: d.tx_ref || null, montant, devise,
        accountNumber: d.account_number || null, narration: d.narration || null, le: Date.now(),
      })
      return json({ ok: true, ignore: 'aucun mappage' })
    }
    const flwRef = d.flw_ref || d.tx_ref || String(Date.now())
    if (await kvGet(env, 'traites/' + flwRef)) return json({ ok: true, doublon: true })
    await kvPut(env, 'traites/' + flwRef, { traite: true, le: Date.now() })
    const id = 'flw_' + flwRef
    const code = target.code
    // Membre : renseigné seulement si la transaction est passée par l'index
    // references/{ref} (REF-… en narration) ; un virement identifié par le
    // numéro de compte seul ne permet pas d'attribuer le membre.
    const membreId = target.membreId != null ? Number(target.membreId) : null
    // Tour actif : premier tour en_attente du snapshot publié (le plus proche).
    let tourId = null
    const snap = await kvGet(env, 'tontines/' + code)
    const tours = snap && Array.isArray(snap.tours) ? snap.tours : (snap && snap.tours ? Object.values(snap.tours) : [])
    const actifs = tours.filter((t) => t && t.statut === 'en_attente')
    if (actifs.length) {
      actifs.sort((a, b) => String(a.datePrevue || '').localeCompare(String(b.datePrevue || '')))
      tourId = Number(actifs[0].id) || null
    }
    const base = {
      id,
      montant,
      devise,
      le: Date.now(),
      source: 'flutterwave',
      flwRef,
      confirme: true,
      statut: 'paye',
      operateur: 'Virement',
      reference: ref || flwRef,
      membreId,
      tourId,
    }
    if (membreId != null && tourId != null) {
      await kvPut(env, 'paiements/' + code + '/' + id, base)
      await syncPaiementEnLigne(env, {
        code,
        transactionId: flwRef,
        tourId,
        membreId,
        montant,
        operateur: 'Virement',
        reference: id,
        statut: 'paye',
        le: Date.now(),
      })
    } else {
      // Non attribuable (pas de REF, membre inconnu ou pas de tour actif) :
      // mise en file de réconciliation au lieu d'un rejet silencieux.
      await kvPut(env, 'reconciliation/' + code + '/' + id, {
        ...base,
        statutReconciliation: 'en_attente',
        recuLe: Date.now(),
        accountNumber: d.account_number || null,
        narration: d.narration || null,
      })
    }
    return json({ ok: true, id, auto: membreId != null && tourId != null })
  } catch (e) {
    return json({ error: 'webhook: ' + (e && e.message), stack: e && e.stack }, 500)
  }
}

// ---------- E-mail (transactionnel, provider-agnostique, défaut Resend) ----------
// Dégrade proprement en mode "dev" (log console) si RESEND_API_KEY est absent.
async function sendEmail(env, { to, subject, html, text }) {
  const key = env.RESEND_API_KEY
  if (!key) {
    console.log('[email:dev] to=%s subject=%s', to, subject)
    return { sent: false, dev: true }
  }
  const r = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + key },
    body: JSON.stringify({
      from: env.EMAIL_FROM || 'onboarding@resend.dev',
      to: Array.isArray(to) ? to : [to],
      subject,
      html: html || text || '',
      text: text || '',
    }),
  })
  const j = await r.json().catch(() => ({}))
  if (!r.ok) throw new Error('Resend: ' + ((j.error && j.error.message) || r.status))
  return { sent: true, id: j.id }
}

async function authForgot(env, body) {
  const email = String((body && body.email) || '').toLowerCase().trim()
  // Toujours répondre ok pour ne pas révéler l'existence d'un compte.
  if (email && /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    const u = await kvGet(env, 'users/' + email)
    if (u) {
      const token = (typeof crypto.randomUUID === 'function')
        ? crypto.randomUUID()
        : 'r' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8)
      await kvPut(env, 'auth/reset/' + email, { email, token, exp: Date.now() + 3600 * 1000 })
      await syncPasswordReset(env, email, { email, token, exp: Date.now() + 3600 * 1000 })
      const link = (env.APP_URL || 'https://tontine-manager.pages.dev') +
        '/#/reset?email=' + encodeURIComponent(email) + '&token=' + token
      try {
        await sendEmail(env, {
          to: email,
          subject: 'Réinitialisation de votre mot de passe — Tontine Manager',
          html: `<p>Bonjour,</p><p>Pour réinitialiser votre mot de passe, ouvrez ce lien (valable 1 h) :</p><p><a href="${link}">${link}</a></p>`,
          text: 'Réinitialisez votre mot de passe : ' + link,
        })
      } catch (e) {
        console.log('[email:erreur] ' + (e && e.message))
      }
    }
  }
  return json({ ok: true })
}

// ---------- Auth endpoints (public) ----------
async function verifyGoogle(env, idToken) {
  if (!idToken) return null
  const r = await fetch(`https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(idToken)}`)
  if (!r.ok) {
    console.log('[google:tokeninfo-status] ' + r.status)
    return null
  }
  const c = await r.json()
  console.log('[google:aud] ' + (c.aud || '?') + ' | android=' + (env.GOOGLE_CLIENT_ID || '?') + ' | web=' + (env.GOOGLE_SERVER_CLIENT_ID || '?'))
  // Sur mobile (plugin capacitator-google-auth) le token est émis avec l'audience
  // du client WEB (serverClientId) ; sur le web/PWA avec celle du client Android.
  // On accepte donc les deux audiences pour valider la connexion Google.
  const audOK =
    c.aud === env.GOOGLE_CLIENT_ID ||
    (env.GOOGLE_SERVER_CLIENT_ID && c.aud === env.GOOGLE_SERVER_CLIENT_ID)
  if (!audOK) return null
  if (c.iss !== 'accounts.google.com' && c.iss !== 'https://accounts.google.com') return null
  return { uid: c.sub, email: c.email || '', name: c.name || c.email || '' }
}

async function issueSession(env, { uid, email, name }) {
  const user = await kvGet(env, 'users/' + String(email).toLowerCase())
  const ver = (user && user.tokenVer) || 0
  const token = await jwtSign({ sub: uid, email: email || '', name: name || '', v: ver }, env.JWT_SECRET)
  return { token, user: { uid, email: email || '', displayName: name || '' } }
}

async function authGoogle(env, body) {
  const g = await verifyGoogle(env, body.idToken)
  if (!g) return json({ error: 'Token Google invalide' }, 401)
  const email = String(g.email || '').toLowerCase()
  const key = 'users/' + email
  const parGoogle = 'users_bygoogle/' + g.uid
  const existing = await kvGet(env, key)
  const linked = await kvGet(env, parGoogle)

  if (linked && linked.email && String(linked.email).toLowerCase() === email) {
    // Le compte Google est déjà lié à cet email : mise à jour des infos.
    await kvPut(env, key, { ...(existing || {}), uid: g.uid, email: g.email, displayName: g.name, google: true })
    await syncUser(env, key, { uid: g.uid, email: g.email, displayName: g.name, google: true })
    return json(await issueSession(env, g))
  }

  if (existing && existing.google) {
    // Compte email existant mais lié à un autre Google : création d'un nouveau lien sous cet email n'est pas possible,
    // mais on réconcilie avec le même uid puisqu'aucun mot de passe n'est protégé.
    await kvPut(env, key, { ...existing, uid: g.uid, displayName: g.name })
    await kvPut(env, parGoogle, { email })
    await syncUser(env, key, { ...existing, uid: g.uid, displayName: g.name })
    return json(await issueSession(env, g))
  }

  if (existing && !existing.google) {
    // Compte protégé par mot de passe : ne PAS écraser, sinon prise de contrôle.
    return json({ error: 'Vérifiez votre identité' }, 409)
  }

  // Nouveau compte Google.
  await kvPut(env, key, { uid: g.uid, email: g.email, displayName: g.name, google: true })
  await kvPut(env, parGoogle, { email })
  await syncUser(env, key, { uid: g.uid, email: g.email, displayName: g.name, google: true })
  return json(await issueSession(env, g))
}
async function authRegister(env, body) {
  const email = String(body.email || '').toLowerCase().trim()
  const password = String(body.password || '')
  if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return json({ error: 'Email invalide' }, 400)
  if (password.length < 6) return json({ error: 'Le mot de passe doit faire au moins 6 caractères' }, 400)
  const existing = await kvGet(env, 'users/' + email)
  if (existing) return json({ error: 'Cet email est déjà utilisé' }, 409)
  const { salt, hash } = await hashPassword(password)
  const uid = 'u' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8)
  await kvPut(env, 'users/' + email, {
    uid, email, displayName: String(body.displayName || email.split('@')[0]),
    salt, hash, google: false,
  })
  await syncUser(env, email, { uid, email, displayName: String(body.displayName || email.split('@')[0]), salt, hash, google: false })
  return json(await issueSession(env, { uid, email, name: body.displayName || email }))
}
async function authLogin(env, body) {
  const email = String(body.email || '').toLowerCase().trim()
  const password = String(body.password || '')
  const u = await kvGet(env, 'users/' + email)
  if (!u || !u.hash || !u.salt) return json({ error: 'Email ou mot de passe incorrect' }, 401)
  if (!(await verifyPassword(password, u.salt, u.hash))) return json({ error: 'Email ou mot de passe incorrect' }, 401)
  return json(await issueSession(env, { uid: u.uid, email: u.email, name: u.displayName }))
}
async function authReset(env, body) {
  const email = String(body.email || '').toLowerCase().trim()
  const token = String(body.token || '')
  const password = String(body.password || '')
  if (password.length < 6) return json({ error: 'Le mot de passe doit faire au moins 6 caractères' }, 400)
  const rec = await kvGet(env, 'auth/reset/' + email)
  if (!rec || !rec.token || rec.token.length !== token.length || !ctEqStr(rec.token, token)) return json({ error: 'Lien invalide' }, 400)
  if (!rec.exp || rec.exp < Date.now()) return json({ error: 'Lien expiré' }, 400)
  const u = await kvGet(env, 'users/' + email)
  if (!u) return json({ error: 'Aucun compte pour cet email' }, 404)
  const { salt, hash } = await hashPassword(password)
  const tokenVer = (u.tokenVer || 0) + 1
  await kvPut(env, 'users/' + email, { ...u, salt, hash, tokenVer })
  await syncUser(env, email, { ...u, salt, hash, tokenVer })
  await kvDel(env, 'auth/reset/' + email)
  await deletePasswordReset(env, email)
  return json(await issueSession(env, { uid: u.uid, email: u.email, name: u.displayName }))
}

async function requireAuth(request, env) {
  const h = request.headers.get('Authorization') || ''
  const m = h.match(/^Bearer\s+(.+)$/i)
  if (!m) return null
  const payload = await jwtVerify(m[1], env.JWT_SECRET)
  if (!payload) return null
  const user = await kvGet(env, 'users/' + String(payload.email || '').toLowerCase())
  if (user && (user.tokenVer || 0) !== (payload.v || 0)) return null
  return { uid: payload.sub, email: payload.email, name: payload.name }
}

function newId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8)
}

// ---------- Assistant "CarnetTontine IA" (LLM) ----------
function systemeAssistant(ctx, resume) {
  return `Tu es "CarnetTontine IA", le secrétaire et trésorier virtuel d'une tontine en Côte d'Ivoire.
MISSION PRINCIPALE: Suivre les cotisations. Donner les infos pour payer. Valider les preuves. Tenir le groupe informé. Tu ne touches JAMAIS à l'argent.

CONTEXTE:
- Paiement: Direct de membre vers responsable via Wave, Orange Money, MTN MoMo ou Cash
- Monnaie: FCFA
- Groupe: ${ctx.nom_tontine}
- Responsable: ${ctx.nom_responsable} — téléphone ${ctx.telephone_responsable}
- Lien Wave du responsable (slug): ${ctx.wave_slug || 'non configuré'}
- Montant de cotisation par membre: ${ctx.montant_cotisation} FCFA
- Date limite: ${ctx.date_echeance}
- Collecte actuelle: ${ctx.nb_payes}/${ctx.nb_total} (${ctx.montant_collecte} FCFA collectés sur ${ctx.montant_total} FCFA)
- Statut: ${ctx.statut}
- Bénéficiaire du tour en cours: ${ctx.nom_du_beneficiaire}
- Quand tu t'adresses à un membre, utilise le prénom/nom fourni dans son message (balise "Membre: ...").

ÉTAT DÉTAILLÉ (utilise-le pour répondre avec précision, n'invente rien):
${JSON.stringify(resume, null, 2)}

RÈGLES STRICTES:
1. CLARTÉ: Donne toujours Montant + Numéro + Nom du responsable + Date limite
2. PREUVE: Quand un membre dit "j'ai payé", demande OBLIGATOIREMENT une capture d'écran du transfert
3. VALIDATION: Seul le responsable peut valider un paiement avec "Oui j'ai reçu"
4. TRANSPARENCE: Affiche toujours le statut: "Collecte: ${ctx.nb_payes}/${ctx.nb_total}. Total: ${ctx.montant_collecte} FCFA"
5. TON: Simple, bienveillant, ferme. Utilise des emojis. Parle comme un ami. Ex: "On est ensemble"
6. INTERDIT: Demander codes secrets, gérer l'argent, prendre parti dans les conflits
7. LIENS DE PAIEMENT (2 clics): Quand un membre veut payer sa cotisation, donne TOUJOURS les liens cliquables :
   - Wave: si le slug est configuré (${ctx.wave_slug || 'NON'}), écris EXACTEMENT « https://wave.com/s/${ctx.wave_slug} » (une seule fois, sur sa propre ligne).
   - Orange Money: écris EXACTEMENT le code USSD « *144*4*6*${ctx.telephone_responsable}*${ctx.montant_cotisation}# » (sur sa propre ligne) pour que l'application puisse l'ouvrir.
   - Si le slug Wave n'est pas configuré, dis-le simplement et donne le numéro du responsable pour Orange Money / Wave manuel.

SCÉNARIOS:
- Demande de paiement: Affiche **À PAYER** (Montant / À envoyer à / Pour / Avant), puis Étapes 1-2-3 et une question.
- Membre "j'ai payé": "Reçu ✅ Envoie la capture de ton transfert Wave/OM ici. J'attends la confirmation de ${ctx.nom_responsable}."
- Responsable valide: "✅ {nom_membre} a payé ${ctx.montant_cotisation} FCFA. Collecte: ${ctx.nb_payes}/${ctx.nb_total}"
- Retard: "Coucou {nom_membre} 👋 Rappel: ${ctx.montant_cotisation} FCFA à envoyer à ${ctx.telephone_responsable} avant ${ctx.date_echeance}. Besoin d'aide ou de délai ?"
- Collecte terminée: "🎉 Collecte terminée! ${ctx.montant_total} FCFA collectés. Le tour revient à ${ctx.nom_du_beneficiaire} ce mois."

FORMAT DE SORTIE: Toujours 1. Info clé en gras 2. Étapes numérotées 3. 1 question à la fin pour relancer`
}

async function callLLM(env, messages) {
  const errs = []
  if (env.AI) {
    // Plusieurs modèles candidats (certains peuvent être dépréciés selon la date).
    const candidats = [
      env.LLM_MODEL,
      '@cf/meta/llama-3.3-70b-instruct-fp8-fast',
      '@cf/meta/llama-4-scout-17b-16e-instruct',
      '@cf/mistralai/mistral-small-3.1-24b-instruct',
      '@cf/google/gemma-3-12b-it',
      '@cf/meta/llama-3.1-8b-instruct',
    ].filter(Boolean)
    for (const model of candidats) {
      try {
        const out = await env.AI.run(model, { messages })
        const txt = out && (out.response || out.result)
        if (txt) return String(txt)
        errs.push(model + ': réponse vide')
      } catch (e) { errs.push(model + ': ' + (e && e.message)) }
    }
  } else {
    errs.push('binding AI absent')
  }
  if (env.LLM_API_URL && env.LLM_API_KEY) {
    try {
      const r = await fetch(env.LLM_API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + env.LLM_API_KEY },
        body: JSON.stringify({ model: env.LLM_MODEL || 'gpt-4o-mini', messages }),
      })
      const j = await r.json()
      if (j.choices && j.choices[0] && j.choices[0].message) return String(j.choices[0].message.content)
      errs.push('OpenAI: ' + (j.error && j.error.message || JSON.stringify(j).slice(0, 120)))
    } catch (e) { errs.push('OpenAI: ' + (e && e.message)) }
  } else {
    errs.push('pas de LLM_API_URL/KEY')
  }
  return "Désolé, l'assistant n'est pas configuré (LLM indisponible)."
}

// ---------- Assistant AGENTIQUE (outils + web + vision + stream) ----------
async function buildAssistantContext(env, code) {
  const snap = await buildSnapshotFromRelational(env, code) || await kvGet(env, 'tontines/' + code)
  if (!snap) return null
  const groupe = snap.groupe || snap
  const membres = Array.isArray(snap.membres) ? snap.membres : (snap.membres ? Object.values(snap.membres) : [])
  const tours = Array.isArray(snap.tours) ? snap.tours : (snap.tours ? Object.values(snap.tours) : [])
  const cotisations = Array.isArray(snap.cotisations) ? snap.cotisations : (snap.cotisations ? Object.values(snap.cotisations) : [])
  const paiements = await kvList(env, 'paiements/' + code + '/')

  const responsable = membres.find((m) => m && m.role === 'responsable') ||
    membres.find((m) => m && m.uid && groupe && m.uid === groupe.sauvegardeUid) ||
    membres[0] || null

  const montantCotisation = Number(groupe && groupe.montantCotisation) || 0
  const nbTotal = membres.length
  const payesSet = new Set()
  let montantCollecte = 0
  for (const c of cotisations) {
    if (c && Number(c.montant) > 0) { payesSet.add(Number(c.membreId)); montantCollecte += Number(c.montant) }
  }
  for (const idk of Object.keys(paiements)) {
    const p = paiements[idk]
    if (p && p.membreId != null) payesSet.add(Number(p.membreId))
  }
  const nbPayes = payesSet.size
  const montantTotal = montantCotisation ? montantCotisation * nbTotal : montantCollecte

  // Tour « actif » = premier tour en_attente (pas simplement le premier de la
  // liste, qui peut déjà être reçu). Tri par date prévue.
  const actifs = tours
    .filter((t) => t && t.statut === 'en_attente')
    .sort((a, b) => String(a.datePrevue || '').localeCompare(String(b.datePrevue || '')))
  const tourActif = actifs[0] || tours[0] || null
  const beneficiaire = tourActif && tourActif.membreId != null
    ? membres.find((m) => m && Number(m.id) === Number(tourActif.membreId))
    : null
  const dateEcheance = (tourActif && (tourActif.datePrevue || tourActif.dateEcheance || tourActif.echeance)) ||
    (groupe && (groupe.dateEcheance || groupe.echeance)) || 'à définir'

  const ctx = {
    nom_tontine: (groupe && groupe.nom) || 'La Tontine',
    nom_responsable: responsable ? (responsable.nom || 'le responsable') : 'le responsable',
    telephone_responsable: responsable ? (responsable.telephone || '—') : '—',
    montant_cotisation: montantCotisation,
    date_echeance: dateEcheance,
    nb_payes: nbPayes,
    nb_total: nbTotal,
    statut: nbPayes >= nbTotal && nbTotal > 0 ? 'terminée' : 'en cours',
    montant_collecte: montantCollecte,
    montant_total: montantTotal,
    nom_du_beneficiaire: beneficiaire ? (beneficiaire.nom || 'à définir') : 'à définir',
    wave_slug: (groupe && groupe.waveSlug) || '',
  }
  const resume = {
    tontine: ctx.nom_tontine,
    montantCotisation: ctx.montant_cotisation,
    dateEcheance: ctx.date_echeance,
    responsable: { nom: ctx.nom_responsable, telephone: ctx.telephone_responsable },
    collecte: { payes: ctx.nb_payes, total: ctx.nb_total, montantCollecte: ctx.montant_collecte, montantTotal: ctx.montant_total },
    membres: membres.map((m) => ({ nom: m && m.nom, role: m && m.role, aPaye: payesSet.has(Number(m && m.id)) })),
    retardataires: membres
      .filter((m) => m && tourActif && Number(m.id) !== Number(tourActif.membreId) && !payesSet.has(Number(m.id)))
      .map((m) => m && m.nom)
      .filter(Boolean),
    tourActif: tourActif ? { numero: tourActif.numero, beneficiaire: ctx.nom_du_beneficiaire, date: tourActif.datePrevue, montantPot: tourActif.montantPot } : null,
    prochainsTours: actifs.slice(1, 3).map((t) => ({
      numero: t.numero,
      beneficiaire: (membres.find((m) => m && Number(m.id) === Number(t.membreId)) || {}).nom || 'à définir',
      date: t.datePrevue,
    })),
    penalites: { pctParJour: Number(groupe && groupe.penalitePctParJour) || 0, periodeJours: Number(groupe && groupe.periodeJours) || 0 },
  }
  return { ctx, resume, membres, tours, cotisations, snap, groupe }
}

// Contexte fourni par le client (mode local-first) quand le groupe n'est pas
// encore synchronisé sur le cloud. Produit le même { ctx, resume } que
// buildAssistantContext pour alimenter le système de prompt de l'assistant.
function buildContextFromClient(c, code) {
  if (!c || !c.groupe) return null
  const groupe = c.groupe || {}
  const membres = Array.isArray(c.membres) ? c.membres : []
  const tour = c.tour || null
  const paiements = Array.isArray(c.paiements) ? c.paiements : []
  const payesSet = new Set(paiements.filter((p) => p && p.membreId != null).map((p) => Number(p.membreId)))
  const nbTotal = membres.length
  const nbPayes = payesSet.size
  const montantCotisation = Number(groupe.montantCotisation) || 0
  const montantCollecte = paiements.reduce((a, p) => a + (Number(p.montant) || 0), 0)
  const montantTotal = montantCotisation ? montantCotisation * nbTotal : montantCollecte
  const benef = tour && tour.membreId != null ? membres.find((m) => m && Number(m.id) === Number(tour.membreId)) : null
  const responsable = membres.find((m) => m && m.role === 'responsable') || membres[0] || null
  const ctx = {
    nom_tontine: groupe.nom || 'La Tontine',
    nom_responsable: responsable ? (responsable.nom || 'le responsable') : 'le responsable',
    telephone_responsable: (groupe.telephoneResponsable) || (responsable && responsable.telephone) || '—',
    montant_cotisation: montantCotisation,
    date_echeance: (tour && (tour.datePrevue || tour.echeance)) || groupe.dateEcheance || 'à définir',
    nb_payes: nbPayes,
    nb_total: nbTotal,
    statut: nbPayes >= nbTotal && nbTotal > 0 ? 'terminée' : 'en cours',
    montant_collecte: montantCollecte,
    montant_total: montantTotal,
    nom_du_beneficiaire: benef ? (benef.nom || 'à définir') : 'à définir',
    wave_slug: groupe.waveSlug || '',
  }
  const resume = {
    tontine: ctx.nom_tontine,
    montantCotisation,
    dateEcheance: ctx.date_echeance,
    responsable: { nom: ctx.nom_responsable, telephone: ctx.telephone_responsable },
    collecte: { payes: nbPayes, total: nbTotal, montantCollecte, montantTotal },
    membres: membres.map((m) => ({ nom: m && m.nom, role: m && m.role, aPaye: payesSet.has(Number(m && m.id)) })),
    retardataires: membres
      .filter((m) => m && tour && Number(m.id) !== Number(tour.membreId) && !payesSet.has(Number(m.id)))
      .map((m) => m && m.nom)
      .filter(Boolean),
    tourActif: tour ? { beneficiaire: ctx.nom_du_beneficiaire, date: tour.datePrevue, montantPot: tour.montantPot } : null,
  }
  return { ctx, resume }
}

function buildMessages(system, historique, userContent) {
  return [
    { role: 'system', content: system },
    ...(Array.isArray(historique) ? historique : []).slice(-12).map((h) => ({ role: h.role === 'bot' ? 'assistant' : 'user', content: h.content })),
    { role: 'user', content: userContent },
  ]
}

function systemeAssistantAgent(ctx, resume, memoire) {
  const base = systemeAssistant(ctx, resume)
  return base + `

─── MODE AGENT (nouveau) ───
Tu peux MAINTENANT agir dans l'application, pas seulement répondre.
Si l'utilisateur demande une action concrète (ajouter un membre, enregistrer un paiement, créer une tontine, relancer, clôturer un tour, exporter un rapport), propose-la via un bloc JSON entre balises, à la FIN de ta réponse :

<<ACTIONS>>
[{"tool":"NOM_OUTIL","args":{ ... }}]
<</ACTIONS>>

OUTILS DISPONIBLES (exécutés sur le téléphone de l'utilisateur) :
- addMember : ajouter un membre. args: {"nom": string, "telephone": string optionnel}
- recordPayment : enregistrer le paiement d'un membre. args: {"membre": string (nom exact), "montant": number, "moyen": "wave"|"orange"|"mtn"|"cash" optionnel}
- createGroup : créer une tontine. args: {"nom": string, "montantCotisation": number, "membres": [{"nom":string,"telephone":string optionnel}] optionnel}
- sendReminder : envoyer un rappel. args: {"cible": "retardataires"|"tous", "message": string optionnel}
- distribuerPot : confirmer que le pot du tour actuel a bien été remis au bénéficiaire (clôture le tour et planifie le suivant). args: {}
- terminerTour : clôturer le tour en cours. args: {}
- exportReport : générer un rapport. args: {"format": "pdf"|"excel"}

RÈGLES :
- N'utilise les actions QUE si l'utilisateur le demande explicitement ou implicitement ("ajoute Awa", "marque que Koffi a payé", "fais un rapport", "relance les retardataires").
- Un seul bloc <<ACTIONS>> par réponse, tableau JSON valide.
- Pour les paiements, utilise un nom exact parmi : ${JSON.stringify((resume.membres || []).map((m) => m.nom).filter(Boolean))}.
- Si tu as besoin d'une info web (taux, démarches, définition), place une balise <<WEB>>ta requête<</WEB>> dans ta réponse ; le système fera la recherche et te redonnera le résultat avant ta réponse finale.
- Sinon réponds normalement (sans balise).

MÉMOIRE UTILISATEUR : ${memoire || 'aucune'}`
}

async function webSearch(query) {
  try {
    const url = 'https://html.duckduckgo.com/html/?q=' + encodeURIComponent(query)
    const r = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0 (compatible; TontineBot/1.0)' } })
    const html = await r.text()
    const snippets = []
    const re = /<a[^>]+class="result__a"[^>]*>([\s\S]*?)<\/a>[\s\S]*?<a[^>]+class="result__snippet"[^>]*>([\s\S]*?)<\/a>/g
    let m
    while ((m = re.exec(html)) && snippets.length < 5) {
      const titre = (m[1] || '').replace(/<[^>]+>/g, '')
      const snip = (m[2] || '').replace(/<[^>]+>/g, '')
      if (titre || snip) snippets.push(`• ${titre}: ${snip}`)
    }
    return snippets.length ? snippets.join('\n') : '(aucun résultat)'
  } catch (e) {
    return '(recherche web indisponible: ' + (e.message || 'erreur') + ')'
  }
}

async function callLLMStream(env, messages) {
  const candidats = [
    env.LLM_MODEL,
    '@cf/meta/llama-3.3-70b-instruct-fp8-fast',
    '@cf/meta/llama-4-scout-17b-16e-instruct',
    '@cf/mistralai/mistral-small-3.1-24b-instruct',
  ].filter(Boolean)
  for (const model of candidats) {
    try {
      const stream = await env.AI.run(model, { messages, stream: true })
      if (stream) return stream
    } catch (_) { /* modèle suivant */ }
  }
  return null
}

async function handleAssistantAgent(env, auth, body) {
  const code = String((body && body.code) || '').trim()
  if (!code) return json({ error: 'code requis' }, 400)
  let ctxData = await buildAssistantContext(env, code)
  if (!ctxData && body && body.contexte) ctxData = buildContextFromClient(body.contexte, code)
  if (!ctxData) return json({ error: 'Groupe introuvable' }, 404)
  const { ctx, resume } = ctxData
  const memoire = body.memoire ? String(body.memoire).slice(0, 2000) : ''
  const system = systemeAssistantAgent(ctx, resume, memoire)
  const historique = Array.isArray(body.historique) ? body.historique : []
  const userContent = (body.nomMembre ? `Membre: ${body.nomMembre}.\n` : '') + (body.message || '')

  let messages = buildMessages(system, historique, userContent)
  let actions = []
  let reponse = ''
  for (let i = 0; i < 5; i++) {
    const texte = await callLLM(env, messages)
    const webMatch = texte.match(/<<WEB>>([\s\S]*?)<\/WEB>>/i)
    if (webMatch) {
      const q = webMatch[1].trim()
      const search = await webSearch(q)
      messages.push({ role: 'assistant', content: texte })
      messages.push({ role: 'user', content: `Résultats de recherche web pour « ${q} » :\n${search}\nUtilise ces informations pour répondre à l'utilisateur de façon précise et cite la source si utile.` })
      continue
    }
    const actMatch = texte.match(/<<ACTIONS>>([\s\S]*?)<\/ACTIONS>>/i)
    if (actMatch) {
      try { actions = JSON.parse(actMatch[1].trim()) } catch { actions = [] }
      reponse = texte.replace(/<<ACTIONS>>[\s\S]*?<\/ACTIONS>>/i, '').trim()
      break
    }
    reponse = texte
    break
  }
  return json({ reponse, actions })
}

async function handleAssistantVision(env, auth, body) {
  const code = String((body && body.code) || '').trim()
  if (!code) return json({ error: 'code requis' }, 400)
  const image = (body.image || '').toString()
  if (!/^data:image\//.test(image)) return json({ error: 'image requise (data URL)' }, 400)
  const base64 = image.replace(/^data:image\/\w+;base64,/, '')
  let bytes
  try { bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0)) } catch { return json({ error: 'image invalide' }, 400) }
  const prompt = (body.message || 'Analyse ce reçu ou bordereau de paiement mobile money (Wave, Orange Money, MTN MoMo). Réponds UNIQUEMENT par un objet JSON: {"montant": number|null, "expediteur": string|null, "destinataire": string|null, "moyen": "wave"|"orange"|"mtn"|"autre"|null, "confiance": number, "resume": string}.')
  try {
    // Essai d'abord avec le modèle multimodal récent (llama-4-scout lit les
    // images via messages image_url), repli sur llava 1.5 si indisponible.
    let out = null
    try {
      out = await env.AI.run('@cf/meta/llama-4-scout-17b-16e-instruct', {
        messages: [{
          role: 'user',
          content: [
            { type: 'text', text: prompt },
            { type: 'image_url', image_url: { url: image } },
          ],
        }],
        max_tokens: 400,
      })
    } catch (_) { out = null }
    if (!out || !(out.response || out.result)) {
      out = await env.AI.run('@cf/llava-hf/llava-1.5-7b-hf', { image: bytes, prompt, max_tokens: 400 })
    }
    const txt = (out && (out.response || out.result)) || ''
    return json({ reponse: String(txt) })
  } catch (e) {
    return json({ error: 'vision indisponible: ' + (e.message || 'erreur') }, 500)
  }
}

async function handleAssistantStream(env, auth, body) {
  const code = String((body && body.code) || '').trim()
  if (!code) return json({ error: 'code requis' }, 400)
  let ctxData = await buildAssistantContext(env, code)
  if (!ctxData && body && body.contexte) ctxData = buildContextFromClient(body.contexte, code)
  if (!ctxData) return json({ error: 'Groupe introuvable' }, 404)
  const { ctx, resume } = ctxData
  const memoire = body.memoire ? String(body.memoire).slice(0, 2000) : ''
  const system = systemeAssistantAgent(ctx, resume, memoire)
  const historique = Array.isArray(body.historique) ? body.historique : []
  const userContent = (body.nomMembre ? `Membre: ${body.nomMembre}.\n` : '') + (body.message || '')
  const messages = buildMessages(system, historique, userContent)
  const stream = await callLLMStream(env, messages)
  if (!stream) return json({ error: 'stream LLM indisponible' }, 500)
  const encoder = new TextEncoder()
  const readable = new ReadableStream({
    async start(controller) {
      try {
        for await (const chunk of stream) {
          const tok = typeof chunk === 'string' ? chunk : (chunk && chunk.response) ? chunk.response : (chunk && chunk.text) ? chunk.text : ''
          if (tok) controller.enqueue(encoder.encode('data: ' + JSON.stringify({ token: tok }) + '\n\n'))
        }
        controller.enqueue(encoder.encode('data: [DONE]\n\n'))
      } catch (e) {
        controller.enqueue(encoder.encode('data: ' + JSON.stringify({ error: String(e.message || e) }) + '\n\n'))
      } finally { controller.close() }
    },
  })
  return new Response(readable, {
    headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive', ...CORS },
  })
}

async function handleAssistant(env, auth, body) {
  const code = String((body && body.code) || '').trim()
  if (!code) return json({ error: 'code requis' }, 400)
  const snap = await buildSnapshotFromRelational(env, code) || await kvGet(env, 'tontines/' + code)
  if (!snap) return json({ error: 'Groupe introuvable' }, 404)
  const groupe = snap.groupe || snap
  const membres = Array.isArray(snap.membres) ? snap.membres : (snap.membres ? Object.values(snap.membres) : [])
  const tours = Array.isArray(snap.tours) ? snap.tours : (snap.tours ? Object.values(snap.tours) : [])
  const cotisations = Array.isArray(snap.cotisations) ? snap.cotisations : (snap.cotisations ? Object.values(snap.cotisations) : [])
  const paiements = await kvList(env, 'paiements/' + code + '/')

  const responsable = membres.find((m) => m && m.role === 'responsable') ||
    membres.find((m) => m && m.uid && groupe && m.uid === groupe.sauvegardeUid) ||
    membres[0] || null

  const montantCotisation = Number(groupe && groupe.montantCotisation) || 0
  const nbTotal = membres.length
  const payesSet = new Set()
  let montantCollecte = 0
  for (const c of cotisations) {
    if (c && Number(c.montant) > 0) { payesSet.add(Number(c.membreId)); montantCollecte += Number(c.montant) }
  }
  for (const idk of Object.keys(paiements)) {
    const p = paiements[idk]
    if (p && p.membreId != null) payesSet.add(Number(p.membreId))
  }
  const nbPayes = payesSet.size
  const montantTotal = montantCotisation ? montantCotisation * nbTotal : montantCollecte

  // Tour « actif » = premier tour en_attente (pas simplement le premier de la
  // liste, qui peut déjà être reçu). Tri par date prévue.
  const actifs = tours
    .filter((t) => t && t.statut === 'en_attente')
    .sort((a, b) => String(a.datePrevue || '').localeCompare(String(b.datePrevue || '')))
  const tourActif = actifs[0] || tours[0] || null
  const beneficiaire = tourActif && tourActif.membreId != null
    ? membres.find((m) => m && Number(m.id) === Number(tourActif.membreId))
    : null
  const dateEcheance = (tourActif && (tourActif.datePrevue || tourActif.dateEcheance || tourActif.echeance)) ||
    (groupe && (groupe.dateEcheance || groupe.echeance)) || 'à définir'

  const ctx = {
    nom_tontine: (groupe && groupe.nom) || 'La Tontine',
    nom_responsable: responsable ? (responsable.nom || 'le responsable') : 'le responsable',
    telephone_responsable: responsable ? (responsable.telephone || '—') : '—',
    montant_cotisation: montantCotisation,
    date_echeance: dateEcheance,
    nb_payes: nbPayes,
    nb_total: nbTotal,
    statut: nbPayes >= nbTotal && nbTotal > 0 ? 'terminée' : 'en cours',
    montant_collecte: montantCollecte,
    montant_total: montantTotal,
    nom_du_beneficiaire: beneficiaire ? (beneficiaire.nom || 'à définir') : 'à définir',
    wave_slug: (groupe && groupe.waveSlug) || '',
  }

  const resume = {
    tontine: ctx.nom_tontine,
    montantCotisation: ctx.montant_cotisation,
    dateEcheance: ctx.date_echeance,
    responsable: { nom: ctx.nom_responsable, telephone: ctx.telephone_responsable },
    collecte: { payes: ctx.nb_payes, total: ctx.nb_total, montantCollecte: ctx.montant_collecte, montantTotal: ctx.montant_total },
    membres: membres.map((m) => ({ nom: m && m.nom, role: m && m.role, aPaye: payesSet.has(Number(m && m.id)) })),
    retardataires: membres
      .filter((m) => m && tourActif && Number(m.id) !== Number(tourActif.membreId) && !payesSet.has(Number(m.id)))
      .map((m) => m && m.nom)
      .filter(Boolean),
    tourActif: tourActif ? { numero: tourActif.numero, beneficiaire: ctx.nom_du_beneficiaire, date: tourActif.datePrevue, montantPot: tourActif.montantPot } : null,
  }

  const system = systemeAssistant(ctx, resume)
  const historique = Array.isArray(body.historique) ? body.historique.slice(-12) : []
  const userContent = (body.nomMembre ? `Membre: ${body.nomMembre}.\n` : '') + (body.message || '')
  const messages = [
    { role: 'system', content: system },
    ...historique.map((h) => ({ role: h.role === 'bot' ? 'assistant' : 'user', content: h.content })),
    { role: 'user', content: userContent },
  ]
  const texte = await callLLM(env, messages)
  return json({ reponse: texte })
}

// ---------- Autorisation : qui peut gérer un groupe ? ----------
// Le propriétaire est le uid stocké dans le snapshot (kv) ou, à défaut,
// dans le miroir relationnel. Les co-gérants (role 'co-responsable') sont
// dérivés côté app et voyagent dans le snapshot (groupe.coGerants).
function ownerOfSnapshot(snap) {
  const g = snap && (snap.groupe || snap)
  if (!g) return null
  const o = g.proprietaire != null ? g.proprietaire : g.proprietaireUid
  return o != null ? String(o) : null
}
function coGerantsOfSnapshot(snap) {
  const g = snap && (snap.groupe || snap)
  const cg = g && g.coGerants
  return (cg && typeof cg === 'object') ? Object.keys(cg).map(String) : []
}
async function storedSnapshot(env, code) {
  return await kvGet(env, 'tontines/' + code)
}
// uid du propriétaire : snapshot kv, sinon colonne groupes.proprietaire_uid.
async function groupeOwnerUid(env, code) {
  const owner = ownerOfSnapshot(await storedSnapshot(env, code))
  if (owner) return owner
  try {
    const r = await env.DB.prepare('SELECT proprietaire_uid FROM groupes WHERE code_unique = ?').bind(code).first()
    if (r && r.proprietaire_uid != null) return String(r.proprietaire_uid)
  } catch (_) { /* miroir absent : on ignore */ }
  return null
}
// Décide si auth peut publier (suppression=false) ou supprimer (true) le
// groupe {code}. Renvoie { ok, owner } : owner est le uid propriétaire retenu
// (null = aucun connu ; lors d'une publication, l'éditeur adopte le groupe).
async function autorisationGroupe(env, code, auth, body, suppression = false) {
  const uid = auth && auth.uid != null ? String(auth.uid) : null
  if (!uid) return { ok: false, owner: null }
  const stored = await storedSnapshot(env, code)
  const owner = ownerOfSnapshot(stored) || (await groupeOwnerUid(env, code))
  if (owner) {
    if (uid === owner) return { ok: true, owner }
    // Co-gérants : peuvent publier, pas supprimer le groupe entier.
    if (!suppression) {
      if (coGerantsOfSnapshot(stored).includes(uid)) return { ok: true, owner }
      if (coGerantsOfSnapshot(body).includes(uid) && ownerOfSnapshot(body) === owner) return { ok: true, owner }
    }
    return { ok: false, owner }
  }
  // Aucun propriétaire connu (groupe historique).
  if (suppression) {
    // Rien stocké ni en miroir : rien à protéger (suppression idempotente).
    let enMiroir = false
    try {
      const r = await env.DB.prepare('SELECT id FROM groupes WHERE code_unique = ?').bind(code).first()
      enMiroir = !!r
    } catch (_) { /* miroir absent */ }
    return { ok: stored == null && !enMiroir, owner: null }
  }
  const bodyOwner = ownerOfSnapshot(body)
  if (bodyOwner) {
    return { ok: uid === bodyOwner, owner: bodyOwner }
  }
  return { ok: true, owner: null } // adoption par l'éditeur
}

// ---------- Dispatch des routes de données (authentifié) ----------
async function handleData(p, method, request, env, auth) {
  const body = method === 'GET' || method === 'DELETE' ? null : await request.json().catch(() => ({}))
  // explorer — liste des groupes publics (découverte + demande d'adhésion).
  // N'expose que des infos d'affichage + le code d'invitation, jamais de données
  // financières ni d'identifiants. Exclut les groupes dont l'utilisateur est
  // déjà propriétaire ou membre.
  if (p[0] === 'explorer' && p.length === 1 && method === 'GET') {
    const publicGroups = await qAll(env, `
      SELECT g.code_unique AS code_unique, g.nom AS nom, g.description AS description,
             g.montant_cotisation AS montantCotisation, g.devise_symbole AS deviseSymbole,
             g.devise_position AS devisePosition, g.periode_jours AS periodeJours,
             g.membres_min AS membresMin, g.membres_max AS membresMax,
             (SELECT COUNT(*) FROM membres m WHERE m.groupe_id = g.id) AS nbMembres,
             g.date_creation AS dateCreation
      FROM groupes g
      WHERE g.public = 1 AND g.statut = 'active' AND g.code_unique IS NOT NULL
        AND g.proprietaire_uid IS NOT ?
        AND g.id NOT IN (SELECT m.groupe_id FROM membres m WHERE m.uid = ?)
      ORDER BY g.date_creation DESC
      LIMIT 200
    `, auth.uid, auth.uid)
    return json(publicGroups)
  }
  if (p[0] === 'assistant') {
    if (method === 'POST' && p[1] === 'agent') return handleAssistantAgent(env, auth, body)
    if (method === 'POST' && p[1] === 'vision') return handleAssistantVision(env, auth, body)
    if (method === 'POST' && p[1] === 'stream') return handleAssistantStream(env, auth, body)
    if (method === 'POST') return handleAssistant(env, auth, body)
  }

  // tontines/{code} — GET ouvert (rejoindre par code), écritures au
  // propriétaire / co-gérants uniquement.
  if (p[0] === 'tontines' && p[1]) {
    const key = 'tontines/' + p[1]
    if (method === 'GET') {
      const rel = await buildSnapshotFromRelational(env, p[1])
      if (rel) return json(rel)
      return json(await kvGet(env, key) || null)
    }
    if (method === 'PUT' || method === 'POST') {
      const verdict = await autorisationGroupe(env, p[1], auth, body)
      if (!verdict.ok) return json({ error: 'Interdit' }, 403)
      // Consolidation : le snapshot stocké porte toujours le uid propriétaire.
      if (body && typeof body === 'object' && body.groupe && typeof body.groupe === 'object' && body.groupe.proprietaire == null) {
        try { body.groupe.proprietaire = verdict.owner || String(auth.uid) } catch (_) { /* body gelé */ }
      }
      await kvPut(env, key, body)
      if (body && body.membres) await rebuildReferenceIndex(env, p[1], body.membres)
      await syncGroupSnapshot(env, body)
      return json({ ok: true })
    }
    if (method === 'DELETE') {
      const verdict = await autorisationGroupe(env, p[1], auth, null, true)
      if (!verdict.ok) return json({ error: 'Interdit' }, 403)
      await kvDel(env, key); await deleteGroupRelational(env, { code: p[1] }); return json({ ok: true })
    }
  }

  // notifier/{code} — push direct d'un message de discussion sans stockage (responsable).
  if (p[0] === 'notifier' && p[1] && method === 'POST') {
    const record = { ...(body || {}), par: auth.uid }
    await notifierMessage(env, record, p[1], { type: 'message', code: p[1] })
    return json({ ok: true })
  }

  // users/{uid}/... — un compte ne peut accéder qu'à son propre espace (anti-IDOR).
  if (p[0] === 'users') {
    if (!p[1] || String(p[1]) !== String(auth.uid)) return json({ error: 'Interdit' }, 403)
  }

  // users/{uid}/tontines  (+ DELETE users/{uid}/tontines/{code})
  if (p[0] === 'users' && p[1] && p[2] === 'tontines') {
    if (p[3]) {
      if (method === 'DELETE') { await kvDel(env, 'users/' + p[1] + '/tontines/' + p[3]); await deleteGroupRelational(env, { code: p[3] }); return json({ ok: true }) }
      return json({ error: 'Méthode non autorisée' }, 405)
    }
    if (method === 'GET') {
      const rel = await listSnapshotsForUser(env, p[1])
      if (Object.keys(rel).length) return json(rel)
      return json(await kvList(env, 'users/' + p[1] + '/tontines/'))
    }
  }

  // users/{uid}/groupes  (+ PUT|DELETE users/{uid}/groupes/{code})
  if (p[0] === 'users' && p[1] && p[2] === 'groupes') {
    if (p[3]) {
      const key = 'users/' + p[1] + '/groupes/' + p[3]
      if (method === 'PUT' || method === 'POST') { await kvPut(env, key, body); if (body && body.groupe) await syncGroupSnapshot(env, body); return json({ ok: true }) }
      if (method === 'DELETE') { await kvDel(env, key); await deleteGroupRelational(env, { code: p[3] }); return json({ ok: true }) }
      return json({ error: 'Méthode non autorisée' }, 405)
    }
    if (method === 'GET') {
      const rel = await listSnapshotsForUser(env, p[1])
      if (Object.keys(rel).length) return json(rel)
      return json(await kvList(env, 'users/' + p[1] + '/groupes/'))
    }
  }

  // users/{uid}/sauvegardes  (+ PUT|DELETE users/{uid}/sauvegardes/{id})
  if (p[0] === 'users' && p[1] && p[2] === 'sauvegardes') {
    if (p[3]) {
      const key = 'users/' + p[1] + '/sauvegardes/' + p[3]
      if (method === 'PUT' || method === 'POST') { await kvPut(env, key, body); if (body) await syncGroupSnapshot(env, body); return json({ ok: true }) }
      if (method === 'DELETE') { await kvDel(env, key); await deleteGroupRelational(env, { sauvegardeUid: p[3] }); return json({ ok: true }) }
      return json({ error: 'Méthode non autorisée' }, 405)
    }
    if (method === 'GET') return json(await kvList(env, 'users/' + p[1] + '/sauvegardes/'))
  }

  // users/{uid}/fcmToken  -> fcm/{uid}
  if (p[0] === 'users' && p[1] && p[2] === 'fcmToken') {
    const key = 'fcm/' + p[1]
    if (method === 'PUT' || method === 'POST') { await kvPut(env, key, { token: (body && body.token) || null, le: Date.now() }); return json({ ok: true }) }
    if (method === 'DELETE') { await kvDel(env, key); return json({ ok: true }) }
  }

  // comptes/{numero}  (mappage compte virtuel Flutterwave -> code)
  if (p[0] === 'comptes' && p[1]) {
    const key = 'comptesParNumero/' + p[1]
    const codeCible = body && body.code != null ? String(body.code) : null
    if ((method === 'PUT' || method === 'POST' || method === 'DELETE')) {
      const verdict = codeCible ? await autorisationGroupe(env, codeCible, auth, null) : { ok: false }
      if (!verdict.ok) return json({ error: 'Interdit' }, 403)
    }
    if (method === 'PUT' || method === 'POST') { await kvPut(env, key, body); if (body) await syncGroupSnapshot(env, body); return json({ ok: true }) }
    if (method === 'GET') return json(await kvGet(env, key) || null)
    if (method === 'DELETE') { await kvDel(env, key); return json({ ok: true }) }
  }

  // comptesVA/{code}  (compte virtuel Flutterwave DÉDIÉ au groupe -> cotisation automatique)
  if (p[0] === 'comptesVA' && p[1]) {
    if (method !== 'GET' && !(await autorisationGroupe(env, p[1], auth, null)).ok) return json({ error: 'Interdit' }, 403)
    if (method === 'GET') return json(await kvGet(env, 'comptesVA/' + p[1]) || null)
    if (method === 'POST' || method === 'PUT') {
      const code = p[1]
      const va = await creerCompteVirtuelFlutterwave(env, code, body)
      if (!va) return json({ error: 'Création du compte virtuel Flutterwave impossible (clé API manquante ou compte non éligible)' }, 502)
      await kvPut(env, 'comptesParNumero/' + String(va.accountNumber), { code })
      await kvPut(env, 'comptesVA/' + code, {
        code, accountNumber: va.accountNumber, bankName: va.bankName,
        accountName: va.accountName, flutterwave: true, creeLe: Date.now(),
      })
      return json({ ok: true, compte: va })
    }
    if (method === 'DELETE') { await kvDel(env, 'comptesVA/' + p[1]); return json({ ok: true }) }
  }

  // demandes/{code}
  if (p[0] === 'demandes' && p[1]) {
    const prefix = 'demandes/' + p[1]
    if (method === 'GET') return json(await kvList(env, prefix + '/'))
    if (method === 'POST') {
      const id = (body && body.id) || newId()
      const record = { ...(body || {}), id }
      await kvPut(env, prefix + '/' + id, record)
      await syncDemande(env, p[1], record)
      return json({ id, ok: true })
    }
    if (method === 'DELETE' && p[2]) {
      const item = await kvGet(env, prefix + '/' + p[2])
      if (item && (item.par === auth.uid || item.pour === auth.uid)) {
        await kvDel(env, prefix + '/' + p[2]); await deleteDemande(env, p[2]); return json({ ok: true })
      }
      return json({ error: 'Interdit' }, 403)
    }
  }

  // messages_utilisateur/{code}
  if (p[0] === 'messages_utilisateur' && p[1]) {
    const prefix = 'messages_utilisateur/' + p[1]
    if (method === 'GET') return json(await kvList(env, prefix + '/'))
    if (method === 'POST') {
      const id = (body && body.id) || newId()
      const record = { ...(body || {}), id, par: auth.uid, le: (body && body.le) || Date.now() }
      await kvPut(env, prefix + '/' + id, record)
      await notifierMessage(env, record, p[1], { type: 'message', code: p[1] })
      return json({ id, ok: true })
    }
    if (method === 'DELETE' && p[2]) {
      const item = await kvGet(env, prefix + '/' + p[2])
      if (item && (item.par === auth.uid || item.pour === auth.uid)) {
        await kvDel(env, prefix + '/' + p[2]); return json({ ok: true })
      }
      return json({ error: 'Interdit' }, 403)
    }
  }

  // paiements/{code}
  if (p[0] === 'paiements' && p[1]) {
    const prefix = 'paiements/' + p[1]
    if (method === 'GET') return json(await kvList(env, prefix + '/'))
    if (method === 'DELETE' && p[2]) {
      if (!(await autorisationGroupe(env, p[1], auth, null)).ok) return json({ error: 'Interdit' }, 403)
      await kvDel(env, prefix + '/' + p[2]); await deletePaiementEnLigne(env, p[1], p[2]); return json({ ok: true })
    }
  }

  // paiements_invite/{code}
  if (p[0] === 'paiements_invite' && p[1]) {
    const prefix = 'paiements_invite/' + p[1]
    if (method === 'GET') return json(await kvList(env, prefix + '/'))
    if (method === 'PUT' || method === 'POST') {
      const id = (body && body.id) || newId()
      await kvPut(env, prefix + '/' + id, { ...(body || {}), id })
      return json({ id, ok: true })
    }
    if (method === 'DELETE' && p[2]) { await kvDel(env, prefix + '/' + p[2]); return json({ ok: true }) }
  }

  // transferts/{code}
  if (p[0] === 'transferts' && p[1]) {
    const prefix = 'transferts/' + p[1]
    if (method === 'GET') return json(await kvList(env, prefix + '/'))
    if (method === 'POST') {
      const id = (body && body.id) || newId()
      await kvPut(env, prefix + '/' + id, { ...(body || {}), id })
      return json({ id, ok: true })
    }
  }

  // auditLogs/{code}
  if (p[0] === 'auditLogs' && p[1]) {
    const prefix = 'auditLogs/' + p[1]
    if (method === 'GET') return json(await kvList(env, prefix + '/'))
    if (method === 'POST') {
      const id = (body && body.id) || newId()
      await kvPut(env, prefix + '/' + id, { ...(body || {}), id })
      return json({ id, ok: true })
    }
  }

  return json({ error: 'Route introuvable' }, 404)
}

// ---------- Synchronisation kv -> tables relationnelles (miroir) ----------
// Le worker reste l'écriture de référence dans la table kv. Ces fonctions
// maintiennent les tables relationnelles (peuplées par migrations/0003)
// comme miroir à jour. Les ids applicatifs (membres/tours/...) sont préservés
// (INSERT avec id explicite). La suppression des enfants se fait par
// DELETE explicite puis ré-insertion (les FK sont ON DELETE CASCADE, mais on
// reste explicite pour rester déterministe).
//
// Stratégie par groupe : upsert groupes (par code_unique / sauvegarde_uid),
// puis DELETE de tous les enfants du groupe, puis ré-insertion depuis le
// snapshot. Comme on ré-insère avec les ids applicatifs explicites, le
// remappage des FK reste trivial et les suppressions dans le snapshot sont
// propagees (les enfants absents sont purement supprimés).

function n(v, d = 0) { return v == null ? d : Number(v) }
function nN(v) { return v == null ? null : Number(v) }
function s(v, d = '') { return v == null ? d : String(v) }
function sN(v) { return v == null ? null : String(v) }
function b(v) { return (v === 1 || v === true) ? 1 : 0 }       // défaut 0
function b1(v) { return (v === 0 || v === false) ? 0 : 1 }     // défaut 1
function asArr(x) { return Array.isArray(x) ? x : (x && typeof x === 'object') ? Object.values(x) : [] }

async function syncGroupSnapshot(env, snapshot) {
 try {
  const g = snapshot && (snapshot.groupe || snapshot)
  if (!g) return
  const code = g.codeUnique != null ? String(g.codeUnique) : null
  const sauvegardeUid = g.sauvegardeUid != null ? String(g.sauvegardeUid) : null
  if (!code && !sauvegardeUid) return

  // 1) groues row (upsert par code_unique / sauvegarde_uid)
  let groupeId = null
  if (code) { const r = await env.DB.prepare('SELECT id FROM groupes WHERE code_unique = ?').bind(code).first(); if (r) groupeId = r.id }
  if (groupeId == null && sauvegardeUid) {
    const r = await env.DB.prepare('SELECT id FROM groupes WHERE code_unique IS NULL AND sauvegarde_uid = ?').bind(sauvegardeUid).first()
    if (r) groupeId = r.id
  }
  const grpVals = [
    code, sauvegardeUid,
    g.proprietaire != null ? g.proprietaire : (g.proprietaireUid != null ? g.proprietaireUid : null),
    g.nom != null ? g.nom : 'Ma tontine',
    g.deviseSymbole != null ? g.deviseSymbole : 'FCFA',
    g.devisePosition != null ? g.devisePosition : 'after',
    n(g.montantCotisation), n(g.periodeJours, 7),
    b1(g.leReceveurCotonise), n(g.penalitePctParJour), n(g.penalitePlafond),
    g.moyensPaiement != null ? JSON.stringify(g.moyensPaiement) : '["Espèces"]',
    n(g.membresMin), n(g.membresMax),
    g.statut === 'terminee' ? 'terminee' : 'active',
    g.dateDebut != null ? g.dateDebut : null,
    g.dateCreation != null ? g.dateCreation : null,
    g.receptionMM != null ? JSON.stringify(g.receptionMM) : null,
    b1(g.public), g.description != null ? String(g.description) : null,
    g.waveSlug != null ? String(g.waveSlug) : null,
  ]
  if (groupeId == null) {
    const cols = 'code_unique, sauvegarde_uid, proprietaire_uid, nom, devise_symbole, devise_position, montant_cotisation, periode_jours, le_receveur_cotonise, penalite_pct_par_jour, penalite_plafond, moyens_paiement, membres_min, membres_max, statut, date_debut, date_creation, reception_mm, public, description, wave_slug'
    const r = await env.DB.prepare(`INSERT INTO groupes (${cols}) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).bind(...grpVals).run()
    groupeId = r.meta && r.meta.last_row_id
  } else {
    await env.DB.prepare(`UPDATE groupes SET sauvegarde_uid=?, proprietaire_uid=?, nom=?, devise_symbole=?, devise_position=?, montant_cotisation=?, periode_jours=?, le_receveur_cotonise=?, penalite_pct_par_jour=?, penalite_plafond=?, moyens_paiement=?, membres_min=?, membres_max=?, statut=?, date_debut=?, date_creation=?, reception_mm=?, public=?, description=?, wave_slug=? WHERE id=?`).bind(...grpVals.slice(1), groupeId).run()
  }
  if (groupeId == null) return

  // 2) suppression des enfants du groupe (cascade gérée, mais explicite = déterministe)
  await env.DB.batch([
    env.DB.prepare('DELETE FROM membres WHERE groupe_id=?').bind(groupeId),
    env.DB.prepare('DELETE FROM tours WHERE groupe_id=?').bind(groupeId),
    env.DB.prepare('DELETE FROM cotisations WHERE groupe_id=?').bind(groupeId),
    env.DB.prepare('DELETE FROM prets WHERE groupe_id=?').bind(groupeId),
    env.DB.prepare('DELETE FROM groupe_messages WHERE groupe_id=?').bind(groupeId),
    env.DB.prepare('DELETE FROM groupe_annonces WHERE groupe_id=?').bind(groupeId),
    env.DB.prepare('DELETE FROM groupe_journal WHERE groupe_id=?').bind(groupeId),
    env.DB.prepare('DELETE FROM groupe_ordre_tire WHERE groupe_id=?').bind(groupeId),
    env.DB.prepare('DELETE FROM groupe_co_gerants WHERE groupe_id=?').bind(groupeId),
    env.DB.prepare('DELETE FROM groupe_archives WHERE groupe_id=?').bind(groupeId),
    env.DB.prepare('DELETE FROM pending_paiements WHERE groupe_id=?').bind(groupeId),
    env.DB.prepare('DELETE FROM pending_messages WHERE groupe_id=?').bind(groupeId),
  ])

  // 3) ré-insertion depuis le snapshot
  const membres = asArr(snapshot.membres)
  const tours = asArr(snapshot.tours)
  const cotisations = asArr(snapshot.cotisations)
  const prets = asArr(snapshot.prets)
  const messages = asArr(g.messages)
  const annonces = asArr(g.annonces)
  const journal = asArr(g.journal)
  const ordre = asArr(g.ordreTire)
  const coGerants = (g.coGerants && typeof g.coGerants === 'object') ? Object.entries(g.coGerants) : []
  const archives = asArr(g.archives)
  const pendP = asArr(g.pendingPaiements)
  const pendM = asArr(g.pendingMessages)

  const stmts = []
  for (const m of membres) {
    stmts.push(env.DB.prepare('INSERT INTO membres (id, groupe_id, nom, telephone, email, uid, role, bloque, date_adhesion, date_creation) VALUES (?,?,?,?,?,?,?,?,?,?)')
      .bind(n(m.id), groupeId, s(m.nom), s(m.telephone), s(m.email), sN(m.uid), s(m.role) || 'membre', b(m.bloque), sN(m.dateAdhesion), sN(m.dateCreation)))
  }
  for (const t of tours) {
    stmts.push(env.DB.prepare('INSERT INTO tours (id, groupe_id, numero, membre_id, date_prevue, montant_pot, statut, date_reception) VALUES (?,?,?,?,?,?,?,?)')
      .bind(n(t.id), groupeId, n(t.numero), nN(t.membreId), sN(t.datePrevue), n(t.montantPot), s(t.statut) || 'en_attente', sN(t.dateReception)))
  }
  for (const c of cotisations) {
    stmts.push(env.DB.prepare('INSERT INTO cotisations (id, groupe_id, tour_id, membre_id, montant, date_paiement, statut, penalite, moyen_paiement, mode_operateur, mode_numero, mode_reference) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)')
      .bind(n(c.id), groupeId, nN(c.tourId), nN(c.membreId), n(c.montant), sN(c.datePaiement), s(c.statut) || 'en_attente', n(c.penalite), s(c.moyenPaiement), sN(c.modeOperateur), sN(c.modeNumero), sN(c.modeReference)))
  }
  for (const p of prets) {
    stmts.push(env.DB.prepare('INSERT INTO prets (id, groupe_id, emprunteur_id, montant, taux_interet, date_echeance, date_creation, note, statut, remboursements) VALUES (?,?,?,?,?,?,?,?,?,?)')
      .bind(n(p.id), groupeId, nN(p.emprunteurId), n(p.montant), n(p.tauxInteret), sN(p.dateEcheance), sN(p.dateCreation), s(p.note), s(p.statut) || 'en_cours', p.remboursements != null ? JSON.stringify(p.remboursements) : '[]'))
  }
  for (const mg of messages) {
    if (!mg || mg.texte == null) continue
    stmts.push(env.DB.prepare('INSERT INTO groupe_messages (groupe_id, auteur, uid, email, texte, date, en_attente) VALUES (?,?,?,?,?,?,?)')
      .bind(groupeId, s(mg.auteur), sN(mg.uid), sN(mg.email), String(mg.texte), sN(mg.date), b(mg.enAttente)))
  }
  for (const a of annonces) {
    if (!a || a.texte == null) continue
    stmts.push(env.DB.prepare('INSERT INTO groupe_annonces (groupe_id, auteur, texte, date) VALUES (?,?,?,?)')
      .bind(groupeId, s(a.auteur), String(a.texte), sN(a.date)))
  }
  for (const j of journal) {
    stmts.push(env.DB.prepare('INSERT INTO groupe_journal (groupe_id, action, libelle, date) VALUES (?,?,?,?)')
      .bind(groupeId, sN(j.action), sN(j.libelle), sN(j.date)))
  }
  let pos = 0
  for (const o of ordre) { pos++; stmts.push(env.DB.prepare('INSERT INTO groupe_ordre_tire (groupe_id, position, membre_id) VALUES (?,?,?)').bind(groupeId, pos, nN(o))) }
  for (const [uid, cg] of coGerants) {
    stmts.push(env.DB.prepare('INSERT INTO groupe_co_gerants (groupe_id, uid, nom, email) VALUES (?,?,?,?)')
      .bind(groupeId, String(uid), s(cg && cg.nom), s(cg && cg.email)))
  }
  for (const ar of archives) {
    stmts.push(env.DB.prepare('INSERT INTO groupe_archives (groupe_id, annee, date_archive, total_cotis, total_penalites, total_recu, solde, nb_tours, nb_paiements, par_membre) VALUES (?,?,?,?,?,?,?,?,?,?)')
      .bind(groupeId, n(ar.annee), sN(ar.dateArchive), n(ar.totalCotis), n(ar.totalPenalites), n(ar.totalRecu), n(ar.solde), n(ar.nbTours), n(ar.nbPaiements), ar.parMembre != null ? JSON.stringify(ar.parMembre) : '[]'))
  }
  for (const pp of pendP) {
    if (!pp || pp.id == null) continue
    stmts.push(env.DB.prepare('INSERT INTO pending_paiements (id, groupe_id, nom, montant, operateur, numero_emetteur, reference, tour_id, tour_numero, membre_id, date, en_attente) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)')
      .bind(String(pp.id), groupeId, s(pp.nom), n(pp.montant), sN(pp.operateur), sN(pp.numeroEmetteur), sN(pp.reference), nN(pp.tourId), nN(pp.tourNumero), nN(pp.membreId), sN(pp.date), b1(pp.enAttente)))
  }
  for (const pm of pendM) {
    if (!pm || pm.id == null) continue
    stmts.push(env.DB.prepare('INSERT INTO pending_messages (id, groupe_id, texte, auteur, uid, email, date, en_attente) VALUES (?,?,?,?,?,?,?,?)')
      .bind(String(pm.id), groupeId, String(pm.texte), s(pm.auteur), sN(pm.uid), sN(pm.email), sN(pm.date), b1(pm.enAttente)))
  }
  if (stmts.length) await env.DB.batch(stmts)
 } catch (e) { console.error('[sync:group]', e && e.message) }
}

async function deleteGroupRelational(env, { code, sauvegardeUid }) {
 try {
  if (code) await env.DB.prepare('DELETE FROM groupes WHERE code_unique = ?').bind(code).run()
  else if (sauvegardeUid) await env.DB.prepare('DELETE FROM groupes WHERE code_unique IS NULL AND sauvegarde_uid = ?').bind(sauvegardeUid).run()
 } catch (e) { console.error('[sync:deleteGroup]', e && e.message) }
}

// --- Miroir des tables auxiliaires (comptes, demandes, paiements en ligne, users) ---

async function syncUser(env, email, user) {
 try {
  if (!email) return
  const uid = user && user.uid != null ? String(user.uid) : null
  const disp = user && (user.displayName != null ? user.displayName : (user.name != null ? user.name : ''))
  const provider = (user && user.google) ? 'google' : 'email'
  const salt = user && user.salt != null ? String(user.salt) : null
  const hash = user && user.hash != null ? String(user.hash) : null
  const exist = await env.DB.prepare('SELECT id FROM users WHERE email = ?').bind(email).first()
  if (exist) {
    await env.DB.prepare('UPDATE users SET uid=?, display_name=?, auth_provider=?, password_salt=?, password_hash=? WHERE email=?').bind(uid, s(disp), provider, salt, hash, email).run()
  } else {
    await env.DB.prepare('INSERT INTO users (email, uid, display_name, auth_provider, password_salt, password_hash) VALUES (?,?,?,?,?,?)').bind(email, uid, s(disp), provider, salt, hash).run()
  }
 } catch (e) { console.error('[sync:user]', e && e.message) }
}

async function syncPasswordReset(env, email, rec) {
 try {
  if (!email || !rec || rec.token == null) return
  await env.DB.prepare('DELETE FROM password_resets WHERE email = ?').bind(email).run()
  await env.DB.prepare('INSERT INTO password_resets (email, token, expires_at) VALUES (?,?,?)').bind(email, String(rec.token), n(rec.exp)).run()
 } catch (e) { console.error('[sync:reset]', e && e.message) }
}
async function deletePasswordReset(env, email) {
 try {
  if (!email) return
  await env.DB.prepare('DELETE FROM password_resets WHERE email = ?').bind(email).run()
 } catch (e) { console.error('[sync:deleteReset]', e && e.message) }
}

async function syncDemande(env, code, record) {
 try {
  if (!record || record.id == null || !code) return
  await env.DB.prepare(`INSERT INTO demandes (id, code, nom, telephone, email, uid, maj_le) VALUES (?,?,?,?,?,?,?)
    ON CONFLICT(id) DO UPDATE SET code=excluded.code, nom=excluded.nom, telephone=excluded.telephone, email=excluded.email, uid=excluded.uid, maj_le=excluded.maj_le`)
    .bind(String(record.id), code, s(record.nom), sN(record.telephone), sN(record.email), record.uid != null ? String(record.uid) : null, nN(record.majLe)).run()
 } catch (e) { console.error('[sync:demande]', e && e.message) }
}
async function deleteDemande(env, id) {
 try {
  if (id == null) return
  await env.DB.prepare('DELETE FROM demandes WHERE id = ?').bind(String(id)).run()
 } catch (e) { console.error('[sync:deleteDemande]', e && e.message) }
}

async function syncPaiementEnLigne(env, rec) {
 try {
  if (!rec || !rec.code || rec.transactionId == null) return
  const date = rec.le != null ? new Date(Number(rec.le)).toISOString() : null
  await env.DB.prepare(`INSERT INTO paiements_en_ligne (code, transaction_id, tour_id, membre_id, montant, operateur, numero, reference, statut, date) VALUES (?,?,?,?,?,?,?,?,?,?)
    ON CONFLICT(transaction_id) DO UPDATE SET code=excluded.code, tour_id=excluded.tour_id, membre_id=excluded.membre_id, montant=excluded.montant, operateur=excluded.operateur, numero=excluded.numero, reference=excluded.reference, statut=excluded.statut, date=excluded.date`)
    .bind(rec.code, String(rec.transactionId), nN(rec.tourId), nN(rec.membreId), n(rec.montant), sN(rec.operateur), sN(rec.numero), sN(rec.reference), s(rec.statut) || 'paye', date).run()
 } catch (e) { console.error('[sync:paiementEnLigne]', e && e.message) }
}
async function deletePaiementEnLigne(env, code, id) {
 try {
  if (!code || id == null) return
  await env.DB.prepare('DELETE FROM paiements_en_ligne WHERE code = ? AND reference = ?').bind(code, String(id)).run()
 } catch (e) { console.error('[sync:deletePaiementEnLigne]', e && e.message) }
}

// ---------- Lecture miroir : reconstruction du snapshot depuis les tables relationnelles ----------
// Renvoie un objet snapshot équivalent à celui stocké dans kv (clés camelCase),
// pour servir les lectures depuis le miroir relationnel. Utilisé avec repli sur
// kv (fallback) afin de basculer les lectures progressivement sans casser l'app.
async function qAll(env, sql, ...params) {
  const { results } = await env.DB.prepare(sql).bind(...params).all()
  return results || []
}

async function buildSnapshotFromRelational(env, codeOrSauv) {
  if (!codeOrSauv) return null
  let g = await env.DB.prepare('SELECT * FROM groupes WHERE code_unique = ?').bind(codeOrSauv).first()
  if (!g) g = await env.DB.prepare('SELECT * FROM groupes WHERE code_unique IS NULL AND sauvegarde_uid = ?').bind(codeOrSauv).first()
  if (!g) return null
  const gid = g.id

  const membres = (await qAll(env, 'SELECT * FROM membres WHERE groupe_id = ? ORDER BY id', gid)).map((m) => ({
    id: m.id, groupeId: m.groupe_id, nom: m.nom, telephone: m.telephone, email: m.email,
    uid: m.uid, role: m.role, bloque: !!m.bloque, dateAdhesion: m.date_adhesion, dateCreation: m.date_creation,
  }))
  const tours = (await qAll(env, 'SELECT * FROM tours WHERE groupe_id = ? ORDER BY numero', gid)).map((t) => ({
    id: t.id, groupeId: t.groupe_id, numero: t.numero, membreId: t.membre_id, datePrevue: t.date_prevue,
    montantPot: t.montant_pot, statut: t.statut, dateReception: t.date_reception,
  }))
  const cotisations = (await qAll(env, 'SELECT * FROM cotisations WHERE groupe_id = ? ORDER BY id', gid)).map((c) => ({
    id: c.id, groupeId: c.groupe_id, tourId: c.tour_id, membreId: c.membre_id, montant: c.montant,
    datePaiement: c.date_paiement, statut: c.statut, penalite: c.penalite, moyenPaiement: c.moyen_paiement,
    modeOperateur: c.mode_operateur, modeNumero: c.mode_numero, modeReference: c.mode_reference,
  }))
  const prets = (await qAll(env, 'SELECT * FROM prets WHERE groupe_id = ? ORDER BY id', gid)).map((p) => ({
    id: p.id, groupeId: p.groupe_id, emprunteurId: p.emprunteur_id, montant: p.montant, tauxInteret: p.taux_interet,
    dateEcheance: p.date_echeance, dateCreation: p.date_creation, note: p.note, statut: p.statut,
    remboursements: p.remboursements ? JSON.parse(p.remboursements) : [],
  }))
  const messages = (await qAll(env, 'SELECT * FROM groupe_messages WHERE groupe_id = ? ORDER BY id', gid)).map((m) => ({
    id: m.id, auteur: m.auteur, uid: m.uid, email: m.email, texte: m.texte, date: m.date, enAttente: !!m.en_attente,
  }))
  const annonces = (await qAll(env, 'SELECT * FROM groupe_annonces WHERE groupe_id = ? ORDER BY id', gid)).map((a) => ({
    id: a.id, auteur: a.auteur, texte: a.texte, date: a.date,
  }))
  const journal = (await qAll(env, 'SELECT * FROM groupe_journal WHERE groupe_id = ? ORDER BY id', gid)).map((j) => ({
    id: j.id, action: j.action, libelle: j.libelle, date: j.date,
  }))
  const ordre = (await qAll(env, 'SELECT membre_id FROM groupe_ordre_tire WHERE groupe_id = ? ORDER BY position', gid)).map((o) => o.membre_id)
  const coGerants = {}
  for (const c of (await qAll(env, 'SELECT uid, nom, email FROM groupe_co_gerants WHERE groupe_id = ?', gid))) {
    coGerants[c.uid] = { nom: c.nom, email: c.email }
  }
  const archives = (await qAll(env, 'SELECT * FROM groupe_archives WHERE groupe_id = ? ORDER BY annee', gid)).map((a) => ({
    id: a.id, annee: a.annee, dateArchive: a.date_archive, totalCotis: a.total_cotis, totalPenalites: a.total_penalites,
    totalRecu: a.total_recu, solde: a.solde, nbTours: a.nb_tours, nbPaiements: a.nb_paiements,
    parMembre: a.par_membre ? JSON.parse(a.par_membre) : [],
  }))

  const groupe = {
    codeUnique: g.code_unique, sauvegardeUid: g.sauvegarde_uid, proprietaire: g.proprietaire_uid,
    nom: g.nom, deviseSymbole: g.devise_symbole, devisePosition: g.devise_position,
    montantCotisation: g.montant_cotisation, periodeJours: g.periode_jours,
    leReceveurCotonise: !!g.le_receveur_cotonise, penalitePctParJour: g.penalite_pct_par_jour,
    penalitePlafond: g.penalite_plafond, moyensPaiement: g.moyens_paiement ? JSON.parse(g.moyens_paiement) : ['Espèces'],
    membresMin: g.membres_min, membresMax: g.membres_max, statut: g.statut,
    dateDebut: g.date_debut, dateCreation: g.date_creation,
    receptionMM: g.reception_mm ? JSON.parse(g.reception_mm) : null,
    public: !!g.public, description: g.description || '',
    waveSlug: g.wave_slug || null,
    messages, annonces, journal, ordreTire: ordre, coGerants, archives,
  }

  return { format: 2, majLe: Date.now(), base: 0, groupe, membres, tours, cotisations, prets }
}

// Liste les snapshots (tontines + groupes) d'un utilisateur : groupes dont il est
// proprietaire OU membre (uid). Renvoie { [code|sauvegardeUid]: snapshot } comme kvList.
async function listSnapshotsForUser(env, uid) {
  const groups = await qAll(env, `
    SELECT DISTINCT g.code_unique AS code_unique, g.sauvegarde_uid AS sauvegarde_uid
    FROM groupes g
    LEFT JOIN membres m ON m.groupe_id = g.id
    WHERE g.proprietaire_uid = ? OR m.uid = ?
  `, uid, uid)
  const out = {}
  for (const grp of groups) {
    const key = grp.code_unique || grp.sauvegarde_uid
    if (!key) continue
    const snap = await buildSnapshotFromRelational(env, key)
    if (snap) out[key] = snap
  }
  return out
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url)
    const path = url.pathname.replace(/^\/+/, '').replace(/\/+$/, '')
    const method = request.method
    const p = path ? path.split('/').map((s) => decodeURIComponent(s)) : []

    if (method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS })

    if (p.length === 0) return json({ ok: true, service: 'tontine-sync' })

    try {
      // --- Webhook Flutterwave (public, signé par verif-hash) ---
      if (p[0] === 'flutterwave' && (p[1] === 'webhook' || p[1] === 'flutterwaveWebhook') && method === 'POST') {
        return handleFlutterwaveWebhook(env, request)
      }

      // --- Auth public (/auth2/*) ---
      if (p[0] === 'auth2' && p[1] && method === 'POST') {
        const body = await request.json().catch(() => ({}))
        const ip = clientIp(request)
        const email = String(body.email || '').toLowerCase().trim()
        if (['login', 'register', 'forgot', 'reset', 'google'].includes(p[1])) {
          const seuil = p[1] === 'login' ? 10 : 5
          const okIp = await rateLimit(env, 'ip_' + ip, { limite: 30 })
          const okEmail = email ? await rateLimit(env, 'email_' + email, { limite: seuil }) : true
          if (!okIp || !okEmail) return json({ error: 'Trop de tentatives, réessayez dans une minute' }, 429)
        }
        if (p[1] === 'google') return authGoogle(env, body)
        if (p[1] === 'register') return authRegister(env, body)
        if (p[1] === 'login') return authLogin(env, body)
        if (p[1] === 'reset') return authReset(env, body)
        if (p[1] === 'forgot') return authForgot(env, body)
        return json({ error: 'Action inconnue' }, 404)
      }

      // --- Toutes les autres routes nécessitent un JWT ---
      const auth = await requireAuth(request, env)
      if (!auth) return json({ error: 'Non autorisé' }, 401)

      return handleData(p, method, request, env, auth)
    } catch (e) {
      return json({ error: e.message || 'Erreur serveur' }, 500)
    }
  },
}
