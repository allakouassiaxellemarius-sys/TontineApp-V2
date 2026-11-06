// Tontine Manager — Worker de synchronisation (100% Cloudflare, sans Firebase)
// Stockage : KV. Auth : JWT signé (HS256) délivré par le Worker.
//   - Google : l'app envoie l'idToken Google → vérification tokeninfo → JWT.
//   - Email  : register/login/reset → KV + PBKDF2 (Web Crypto) → JWT.
//
// Routes (après auth, sauf /auth2/* et /whatsapp/*) — alignées sur le
// client (src/lib/sync.js, src/lib/push.js) :
//   tontines/{code}                     GET / PUT / DELETE
//   users/{uid}/tontines                GET (liste) / DELETE users/{uid}/tontines/{code}
//   users/{uid}/groupes                 GET (liste) / PUT|DELETE users/{uid}/groupes/{code}
//   users/{uid}/sauvegardes             GET (liste) / PUT|DELETE users/{uid}/sauvegardes/{id}
//   users/{uid}/fcmToken                PUT / DELETE  -> fcm/{uid}
//   demandes/{code}                     POST (crée) / GET (liste) / DELETE demandes/{code}/{id}
//   messages_utilisateur/{code}         POST (crée + notifie FCM) / GET (liste) / DELETE .../{id}
//   paiements/{code}                    GET / DELETE paiements/{code}/{id} — gestionnaires du groupe
//   paiements_invite/{code}             PUT (dépôt borné, tout compte) / GET / DELETE .../{id} — gestionnaires
//   transferts/{code}                   POST (crée) / GET (liste) — gestionnaires
//   auditLogs/{code}                    GET (liste) / POST — gestionnaires
//   compte                              DELETE (suppression définitive du compte, RGPD art. 17)
// Public :
//   auth2/{google,register,login,reset} POST
//   whatsapp/webhook                    GET (vérification) / POST (récit signé X-Hub-Signature-256)
//   privacy | confidentialite           GET (HTML, public) — politique de confidentialité
//   suppression                         GET (HTML, public) / POST (demande d'effacement)

import { html, privacyHtml, suppressionHtml } from './pages.js'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type,Authorization',
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
// Les préfixes sont interpolés dans un motif GLOB (et non LIKE) : `_` et `%`
// y sont des caractères ordinaires, et `\` n'échappe rien. Seuls * ? [ ] sont
// spéciaux, et ils s'échappent en les plaçant entre crochets.
function globEscape(s) {
  return s.replace(/[*?[\]]/g, (c) => '[' + c + ']')
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
  const pat = globEscape(prefix) + '*'
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
// Référence déterministe du membre (libellé à recopier dans l'envoi Pi-Spi).
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

// ---------- Rappels WhatsApp (WhatsApp Business Cloud API, Meta) ----------
// Le message part du serveur et non plus du téléphone (wa.me) : le numéro du
// membre est donc transmis à Meta. Trois garde-fous à ce changement d'échelle :
//   1. seul le responsable (ou un co-gérant) d'un groupe réellement publié peut
//      déclencher un envoi, avec un plafond horaire par compte ;
//   2. le client n'envoie QUE le numéro du tour — ni téléphone, ni montant, ni
//      texte. Tout est relu du groupe en base ;
//   3. le texte est un template Utilitaire approuvé par Meta, à variables
//      figées. La route ne peut donc pas servir de relais de message libre, ni
//      faire croire à un faux compte de collecte.
const WA_JOUR_MS = 24 * 60 * 60 * 1000
const WA_PAR_APPEL = 50
// Meta n'annonce pas les désabonnements : c'est à l'expéditeur de les porter.
const WA_STOP = /^(stop|stoppe|stopper|arret|arrêt|arreter|arrêter|quitte|quitter|desabonner|désabonner|desabonne|désabonne|desinscrire|désinscrire|unsubscribe|optout|opt-out|off)$/i
const WA_REPRISE = /^(start|reprendre|relance|relancer|retour|on|marche|abonner|abonne|abonné)$/i
const WA_STATUTS = { sent: 'envoye', delivered: 'remis', read: 'lu', failed: 'echec' }

function waActif(env) {
  return !!(env && env.WA_TOKEN && env.WA_PHONE_NUMBER_ID)
}

// Même normalisation que src/lib/remind.js côté client (un « 07 01 23 45 67 »
// ivoirien devient 2250701234567), puis exigence d'un indicatif pays : un
// numéro local incomplet est écarté et signalé au responsable plutôt
// qu'envoyé à l'abonné d'un autre pays.
function waNumero(tel) {
  let t = String(tel || '').replace(/[\s.\-()]/g, '')
  if (t.startsWith('+')) t = t.slice(1)
  else if (t.startsWith('00')) t = t.slice(2)
  else if (t.startsWith('0')) t = '225' + t
  if (!/^\d{10,15}$/.test(t)) return null
  return t
}

function waArgent(v, symbole, position) {
  const entier = Math.round(Number(v) || 0)
  const grp = String(entier).replace(/\B(?=(\d{3})+(?!\d))/g, ' ')
  const s = String(symbole || 'FCFA')
  return position === 'before' ? s + ' ' + grp : grp + ' ' + s
}

function waDate(v) {
  const d = v ? new Date(v) : null
  if (!d || isNaN(d.getTime())) return ''
  const p = (x) => String(x).padStart(2, '0')
  return p(d.getUTCDate()) + '/' + p(d.getUTCMonth() + 1) + '/' + d.getUTCFullYear()
}

async function waSnapshot(env, code) {
  return (await buildSnapshotFromRelational(env, code)) || (await kvGet(env, 'tontines/' + code)) || null
}

// Tour visé : celui que nomme le client, sinon le premier encore en attente.
function waTourCible(snap, numeroDemande) {
  const tours = asArr(snap && snap.tours).slice()
    .sort((a, b) => (Number(a.numero) || 0) - (Number(b.numero) || 0))
  if (!tours.length) return null
  const demande = numeroDemande == null ? '' : String(numeroDemande)
  if (demande !== '') return tours.find((t) => String(t.numero) === demande) || null
  return tours.find((t) => (t.statut || 'en_attente') === 'en_attente') || tours[0]
}

function waMembresRelancer(snap, tour) {
  const g = (snap && snap.groupe) || {}
  const membres = asArr(snap && snap.membres).filter((m) => m && !m.bloque)
  const receveurId = tour ? String(tour.membreId) : null
  const paye = new Set(
    asArr(snap && snap.cotisations)
      .filter((c) => c && String(c.tourId) === String(tour && tour.id) && c.statut === 'paye')
      .map((c) => String(c.membreId))
  )
  const receveurCotonise = g.leReceveurCotonise !== false
  return membres.filter((m) => {
    if (!receveurCotonise && receveurId && String(m.id) === receveurId) return false
    return !paye.has(String(m.id))
  })
}

function waParametresRappel(membre, snap, tour) {
  const g = (snap && snap.groupe) || {}
  const montant = waArgent(g.montantCotisation, g.deviseSymbole, g.devisePosition)
  const echeance = waDate(tour && tour.datePrevue)
  return [
    String((membre && membre.nom) || '').trim().slice(0, 60) || 'membre',
    echeance ? montant + ' avant le ' + echeance : montant,
    String(g.nom || 'notre tontine').trim().slice(0, 60),
  ]
}

async function waEnvoiTemplate(env, { a, params }) {
  const version = String(env.WA_GRAPH_VERSION || 'v25.0')
  const url = 'https://graph.facebook.com/' + encodeURIComponent(version) + '/' + encodeURIComponent(env.WA_PHONE_NUMBER_ID) + '/messages'
  const charge = {
    messaging_product: 'whatsapp',
    recipient_type: 'individual',
    to: a,
    type: 'template',
    template: {
      name: String(env.WA_TEMPLATE_RAPPEL || 'rappel_cotisation'),
      language: { code: String(env.WA_TEMPLATE_LANGUE || 'fr') },
      components: [{ type: 'body', parameters: params.map((t) => ({ type: 'text', text: String(t) })) }],
    },
  }
  let r
  try {
    r = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + env.WA_TOKEN },
      body: JSON.stringify(charge),
    })
  } catch (_) {
    return { ok: false, raison: 'Service WhatsApp injoignable' }
  }
  const j = await r.json().catch(() => ({}))
  if (!r.ok) {
    const e = (j && j.error) || {}
    return { ok: false, raison: String(e.message || ('HTTP ' + r.status)).slice(0, 200), code: e.code }
  }
  const id = j && j.messages && j.messages[0] && j.messages[0].id
  return { ok: !!id, id: id || null, raison: id ? null : 'Accusé de réception absent' }
}

async function waJournaliser(env, code, item) {
  const cle = 'wa/journal/' + code
  const rec = (await kvGet(env, cle)) || { items: [] }
  const items = Array.isArray(rec.items) ? rec.items : []
  items.push(item)
  await kvPut(env, cle, { items: items.slice(-100) })
}

async function waModifierJournal(env, code, id, champs) {
  const cle = 'wa/journal/' + code
  const rec = await kvGet(env, cle)
  if (!rec || !Array.isArray(rec.items)) return
  const i = rec.items.findIndex((x) => x && x.id === id)
  if (i === -1) return
  rec.items[i] = { ...rec.items[i], ...champs }
  await kvPut(env, cle, rec)
}

// Aperçu : qui serait relancé pour le tour visé (le premier en attente par
// défaut, ou celui que nomme le client), et sur quel numéro.
async function waApercu(env, code, numeroDemande) {
  const configure = waActif(env)
  const snap = await waSnapshot(env, code)
  if (!snap) return { configure, groupe: null, tour: null, aRelancer: [] }
  const tour = waTourCible(snap, numeroDemande)
  const attente = tour ? waMembresRelancer(snap, tour) : []
  const optOuts = {}
  for (const m of attente) {
    const a = waNumero(m.telephone)
    const cle = a ? await kvGet(env, 'wa/optout/' + a) : null
    if (a && cle) optOuts[String(m.id)] = true
  }
  return {
    configure,
    groupe: String((snap.groupe && snap.groupe.nom) || ''),
    devise: waArgent(snap.groupe && snap.groupe.montantCotisation, snap.groupe && snap.groupe.deviseSymbole, snap.groupe && snap.groupe.devisePosition),
    tour: tour ? { numero: tour.numero, datePrevue: tour.datePrevue || null, statut: tour.statut || 'en_attente' } : null,
    aRelancer: attente.slice(0, WA_PAR_APPEL).map((m) => {
      const a = waNumero(m.telephone)
      return {
        membre: String(m.id),
        nom: String(m.nom || ''),
        joignable: !!a && !optOuts[String(m.id)],
        raison: !a ? 'Numéro incomplet (indicatif pays requis)' : optOuts[String(m.id)] ? 'A demandé à ne plus recevoir de messages' : null,
      }
    }),
  }
}

async function waEnvoiRappels(env, code, auth, body) {
  const configure = waActif(env)
  if (!configure) {
    return { configure: false, envoyes: [], ignores: [], raison: "L'envoi automatique n'est pas configuré côté serveur." }
  }
  const snap = await waSnapshot(env, code)
  if (!snap) return { configure, envoyes: [], ignores: [], raison: 'Groupe introuvable sur le serveur.' }
  const tour = waTourCible(snap, body && body.tourNumero)
  if (!tour) return { configure, envoyes: [], ignores: [], raison: 'Aucun tour en attente : générez d’abord le planning.' }
  const attente = waMembresRelancer(snap, tour)
  const envoyes = []
  const ignores = []
  for (const m of attente) {
    const ref = { membre: String(m.id), nom: String(m.nom || '') }
    if (envoyes.length >= WA_PAR_APPEL) {
      ignores.push({ ...ref, raison: 'Plafond de ' + WA_PAR_APPEL + ' envois par appel atteint' })
      continue
    }
    const a = waNumero(m.telephone)
    if (!a) { ignores.push({ ...ref, raison: 'Numéro incomplet (indicatif pays requis)' }); continue }
    if (await kvGet(env, 'wa/optout/' + a)) { ignores.push({ ...ref, raison: 'A demandé à ne plus recevoir de messages' }); continue }
    const cle = 'wa/envoi/' + code + '/' + tour.id + '/' + m.id
    const deja = await kvGet(env, cle)
    if (deja && Date.now() - (Number(deja.le) || 0) < WA_JOUR_MS) {
      ignores.push({ ...ref, raison: 'Déjà relancé il y a moins de 24 h' })
      continue
    }
    const r = await waEnvoiTemplate(env, { a, params: waParametresRappel(m, snap, tour) })
    if (!r.ok) { ignores.push({ ...ref, raison: r.raison || 'Envoi refusé' }); continue }
    await kvPut(env, cle, { le: Date.now(), id: r.id || null })
    if (r.id) await kvPut(env, 'wa/wamid/' + r.id, { code, membre: ref.membre })
    await waJournaliser(env, code, {
      id: r.id || null, membre: ref.membre, nom: ref.nom, tour: tour.numero,
      statut: 'envoye', le: Date.now(), erreur: null,
    })
    envoyes.push({ ...ref, id: r.id || null })
  }
  await kvPut(env, 'wa/dernier/' + code, { le: Date.now(), par: auth && auth.uid, envoyes: envoyes.length, ignores: ignores.length })
  return {
    configure,
    tour: tour.numero,
    envoyes,
    ignores,
    raison: envoyes.length ? null : (ignores[0] && ignores[0].raison) || 'Aucun membre à relancer : tout le monde est à jour.',
  }
}

// Poignée de main de vérification du webhook (GET, appelée par Meta).
function waVerifierWebhook(env, url) {
  const mode = url.searchParams.get('hub.mode')
  const jeton = url.searchParams.get('hub.verify_token') || ''
  const defi = url.searchParams.get('hub.challenge') || ''
  if (mode !== 'subscribe' || !env.WA_VERIFY_TOKEN || !ctEqStr(jeton, String(env.WA_VERIFY_TOKEN))) {
    return json({ error: 'Vérification refusée' }, 403)
  }
  return new Response(defi, { status: 200, headers: { 'Content-Type': 'text/plain' } })
}

async function waGererReponse(env, message) {
  const numero = String((message && message.from) || '').replace(/\D/g, '')
  if (!numero) return
  const texte = String(
    (message.text && message.text.body) ||
    (message.button && message.button.text) ||
    (message.interactive && message.interactive.button_reply && message.interactive.button_reply.title) ||
    ''
  ).trim()
  if (!texte) return
  if (WA_STOP.test(texte)) {
    await kvPut(env, 'wa/optout/' + numero, { le: Date.now(), motif: texte.slice(0, 40) })
    return
  }
  if (WA_REPRISE.test(texte)) await kvDel(env, 'wa/optout/' + numero)
}

async function waMarquerStatut(env, statut) {
  const id = statut && statut.id
  if (!id) return
  const origine = await kvGet(env, 'wa/wamid/' + id)
  if (!origine) return
  const err = asArr(statut.errors)[0]
  const journal = WA_STATUTS[statut.status] || String(statut.status || '')
  await waModifierJournal(env, origine.code, id, {
    statut: journal,
    erreur: err ? String(err.title || err.message || '').slice(0, 160) : null,
  })
  // 131047 = destinataire hors fenêtre et non inscrit : Meta refuse le
  // template. On le traite comme un désabonnement pour ne pas réessayer.
  if (statut.status === 'failed' && err && Number(err.code) === 131047) {
    const a = String(statut.recipient_id || '').replace(/\D/g, '')
    if (a) await kvPut(env, 'wa/optout/' + a, { le: Date.now(), motif: 'refus Meta ' + err.code })
  }
}

async function waTraiterRecit(env, charge) {
  if (!charge || charge.object !== 'whatsapp_business_account') return
  for (const entree of asArr(charge.entry)) {
    for (const changement of asArr(entree && entree.changes)) {
      if (!changement || changement.field !== 'messages') continue
      const valeur = changement.value || {}
      for (const statut of asArr(valeur.statuses)) await waMarquerStatut(env, statut)
      for (const message of asArr(valeur.messages)) await waGererReponse(env, message)
    }
  }
}

async function waRecit(env, request, ctx) {
  const brut = await request.text()
  if (env.WA_APP_SECRET) {
    const entete = request.headers.get('X-Hub-Signature-256') || ''
    const recu = entete.startsWith('sha256=') ? entete.slice(7) : ''
    const attendu = toHex(await hmac(env.WA_APP_SECRET, brut))
    if (!recu || !ctEqStr(recu.toLowerCase(), attendu)) return json({ error: 'Signature invalide' }, 403)
  }
  let charge = null
  try { charge = JSON.parse(brut) } catch (_) { /* corps illisible : on accuse réception */ }
  const travail = charge ? waTraiterRecit(env, charge).catch(() => {}) : Promise.resolve()
  if (ctx && typeof ctx.waitUntil === 'function') ctx.waitUntil(travail)
  else await travail
  // Meta réessaie tant qu'il n'a pas de 200 : on accuse toujours réception.
  return json({ ok: true })
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
  const autorises = [env.GOOGLE_CLIENT_ID, env.GOOGLE_SERVER_CLIENT_ID, env.GOOGLE_ANDROID_CLIENT_IDS || '']
    .flatMap((v) => String(v).split(','))
    .map((v) => v.trim())
    .filter(Boolean)
  console.log('[google:aud] ' + (c.aud || '?') + ' | attendus=' + autorises.join(','))
  // Le plugin Capacitor utilise le client Android à la fois comme identité native
  // et comme audience du jeton ; chaque empreinte de signature (debug et release)
  // a son propre client, d'où la liste. Le PWA, lui, présente le client web.
  if (!autorises.includes(c.aud)) return null
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

// ---------- Suppression définitive du compte (RGPD art. 17) ----------
// Tables enfants clés par groupe_id ; demandes / paiements_en_ligne clés par code.
const GROUPES_ENFANTS_GROUPE_ID = [
  'pending_paiements', 'pending_messages', 'groupe_messages', 'groupe_annonces',
  'groupe_journal', 'groupe_ordre_tire', 'groupe_co_gerants', 'groupe_archives',
  'cotisations', 'tours', 'prets', 'membres',
]
const GROUPES_ENFANTS_CODE = ['demandes', 'paiements_en_ligne']

async function kvDeleteGlob(env, prefix) {
  await env.DB.prepare('DELETE FROM kv WHERE key GLOB ?').bind(globEscape(prefix) + '*').run()
}

async function supprimerCompte(env, request, auth) {
  const email = String(auth.email || '').toLowerCase()
  const ip = clientIp(request)
  const okEmail = await rateLimit(env, 'delacct_' + email, { limite: 5 })
  const okIp = await rateLimit(env, 'delacctip_' + ip, { limite: 10 })
  if (!okEmail || !okIp) return json({ error: 'Trop de tentatives, réessayez dans une minute' }, 429)

  const u = await kvGet(env, 'users/' + email)
  if (!u) return json({ error: 'Aucun compte' }, 404)
  const uid = String(u.uid != null ? u.uid : auth.uid)

  // Ré-authentification obligatoire avant toute destruction (OWASP M1/M4).
  const body = await request.json().catch(() => ({}))
  if (u.salt && u.hash) {
    const mdp = String((body && body.password) || '')
    if (!(await verifyPassword(mdp, u.salt, u.hash))) return json({ error: 'Mot de passe incorrect' }, 401)
  }
  if (body && body.confirmation !== true) return json({ error: 'Confirmation requise' }, 400)

  // 1. Groupes dont le compte est propriétaire (ids + codes).
  const rows = await qAll(env,
    'SELECT id, code_unique, sauvegarde_uid FROM groupes WHERE proprietaire_uid = ? OR sauvegarde_uid = ?',
    uid, uid)
  const ids = rows.map((r) => r.id)
  const codes = rows.map((r) => r.code_unique).filter(Boolean)

  // Les groupes publiés avant le miroir relationnel (ou dont l'upsert a échoué)
  // ne vivent que dans KV : sans ce rattrapage ils survivraient au compte.
  for (const [code, snap] of Object.entries(await kvList(env, 'tontines/'))) {
    const g = snap && snap.groupe
    if (!g) continue
    const prop = String(g.proprietaireUid || g.proprietaire || '')
    const sauv = String(g.sauvegardeUid || '')
    if ((prop && prop === uid) || (sauv && sauv === uid)) codes.push(code)
  }
  for (const code of Object.keys(await kvList(env, 'users/' + uid + '/tontines/'))) codes.push(code)
  const codesPossedes = [...new Set(codes.filter(Boolean))]

  // 2. Miroir KV : snapshots, données par groupe, jetons et liens.
  await kvDeleteGlob(env, 'users/' + uid + '/')
  await kvDel(env, 'fcm/' + uid)
  await kvDel(env, 'users/' + email)
  await kvDel(env, 'auth/reset/' + email)
  for (const code of codesPossedes) {
    await kvDel(env, 'tontines/' + code)
    for (const prefix of ['demandes', 'messages_utilisateur', 'paiements', 'paiements_invite', 'transferts', 'auditLogs', 'reconciliation', 'comptesVA', 'lectures']) {
      await kvDeleteGlob(env, prefix + '/' + code + '/')
    }
    await kvDel(env, 'comptesVA/' + code)
    await viderMediaGroupe(env, code)
  }
  // Pointeur de lecture que le compte a laissé dans les groupes d'autrui.
  for (const suffix of Object.keys(await kvList(env, 'lectures/'))) {
    if (suffix.endsWith('/' + uid)) await kvDel(env, 'lectures/' + suffix)
  }
  // Adhésion enregistrée dans les groupes d'autrui : c'est elle qui donne le
  // droit de relire le snapshot, elle ne doit pas survivre au compte.
  for (const suffix of Object.keys(await kvList(env, 'adherents/'))) {
    if (suffix.endsWith('/' + uid)) await kvDel(env, 'adherents/' + suffix)
  }
  // Index de référence et comptes virtuels pointant sur ces groupes.
  for (const [prefix, test] of [['references/', (v) => v.uid === uid || codesPossedes.includes(v.code)],
                                ['comptesParNumero/', (v) => codesPossedes.includes(v.code)]]) {
    const list = await kvList(env, prefix)
    for (const [k, v] of Object.entries(list)) {
      if (v && test(v)) await kvDel(env, prefix + k)
    }
  }
  for (const [k, v] of Object.entries(await kvList(env, 'users_bygoogle/'))) {
    if (v && String(v.email || '').toLowerCase() === email) await kvDel(env, 'users_bygoogle/' + k)
  }

  // 3. Relationnel : suppression en cascade explicite (les FK D1 ne sont pas
  //    garanties actives), puis anonymisation des traces dans les groupes d'autrui.
  //    Les ids des groupes découverts par KV s'ajoutent à ceux de la requête.
  const idsPossedes = new Set(ids)
  for (const code of codesPossedes) {
    for (const r of await qAll(env, 'SELECT id FROM groupes WHERE code_unique = ?', code)) idsPossedes.add(r.id)
  }
  const stmts = []
  for (const table of GROUPES_ENFANTS_GROUPE_ID) {
    for (const id of idsPossedes) stmts.push(env.DB.prepare(`DELETE FROM ${table} WHERE groupe_id = ?`).bind(id))
  }
  for (const table of GROUPES_ENFANTS_CODE) {
    for (const code of codesPossedes) stmts.push(env.DB.prepare(`DELETE FROM ${table} WHERE code = ?`).bind(code))
  }
  for (const id of idsPossedes) stmts.push(env.DB.prepare('DELETE FROM groupes WHERE id = ?').bind(id))
  stmts.push(env.DB.prepare('UPDATE membres SET uid = NULL WHERE uid = ?').bind(uid))
  stmts.push(env.DB.prepare('DELETE FROM groupe_co_gerants WHERE uid = ?').bind(uid))
  stmts.push(env.DB.prepare('DELETE FROM demandes WHERE uid = ?').bind(uid))
  stmts.push(env.DB.prepare('DELETE FROM groupe_messages WHERE uid = ? OR email = ?').bind(uid, email))
  stmts.push(env.DB.prepare('DELETE FROM pending_messages WHERE uid = ? OR email = ?').bind(uid, email))
  stmts.push(env.DB.prepare('DELETE FROM password_resets WHERE email = ?').bind(email))
  stmts.push(env.DB.prepare('DELETE FROM users WHERE email = ?').bind(email))
  if (stmts.length) await env.DB.batch(stmts)

  return json({ ok: true, supprimes: { groupes: codesPossedes.length } })
}

async function requireAuth(request, env) {
  const h = request.headers.get('Authorization') || ''
  const m = h.match(/^Bearer\s+(.+)$/i)
  if (!m) return null
  const payload = await jwtVerify(m[1], env.JWT_SECRET)
  if (!payload) return null
  const user = await kvGet(env, 'users/' + String(payload.email || '').toLowerCase())
  // Le jeton ne vaut que si le compte existe encore : sans ce contrôle, le
  // bearer émis avant une suppression de compte (RGPD, DELETE /compte) restait
  // valide jusqu'à son expiration.
  if (!user) return null
  if ((user.tokenVer || 0) !== (payload.v || 0)) return null
  return { uid: payload.sub, email: payload.email, name: payload.name }
}

function newId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8)
}

// ---------- Assistant "CarnetTontine IA" (LLM) ----------
// L'analyse financière arrive déjà calculée par l'application (src/lib/
// analyseTontine.js) : les petits modèles sont mauvais en arithmetic et
// inventent des chiffres. On ne lui transmet que le strict utile, borné, pour
// que le prompt ne grossisse pas sans limite côté serveur.
function sanifierAnalyse(a) {
  if (!a || typeof a !== 'object') return null
  // Les chevronnants sont retirés : le digest vient du client, et <<ACTIONS>> /
  // <<WEB>> sont les balises que la boucle agentique interprète dans la réponse.
  const txt = (v, n) => String(v == null ? '' : v).replace(/[<>]/g, '').slice(0, n)
  const nums = (o, clefs) => {
    const out = {}
    for (const k of clefs) {
      const v = Number(o && o[k])
      if (Number.isFinite(v)) out[k] = v
    }
    return out
  }
  try {
    const score = Number(a.sante && a.sante.score)
    const brief = txt(a.brief, 2400)
    // Un digest qui ne ressemble pas à celui de l'application (pas de score, brief
    // trop court) est ignoré : mieux vaut aucune analyse qu'une fausse analyse
    // présentée au modèle comme autoritaire.
    if (!Number.isFinite(score) || brief.length < 40) return null
    const out = {
      dateAnalyse: txt(a.dateAnalyse, 10),
      devise: txt(a.devise, 8) || 'FCFA',
      brief,
      sante: { score: Math.max(0, Math.min(100, Math.round(score))), niveau: txt(a.sante && a.sante.niveau, 16) },
      collecte: nums(a.collecte, ['attendu', 'collecte', 'manque', 'tauxCollectePct', 'cotisation']),
      penalites: nums(a.penalites, ['dejaEncaissees', 'quiCourent', 'coutParJour', 'siRegleAujourdhui', 'siRegleDans7Jours', 'siRegleDans30Jours', 'ecrituresEnRetard']),
      tresorerie: nums(a.tresorerie, ['entrees30Jours', 'sorties30Jours', 'net30Jours', 'soldeGroupe']),
      recommandations: (Array.isArray(a.recommandations) ? a.recommandations : []).slice(0, 10).map((r) => txt(r, 400)).filter(Boolean),
      anomalies: (Array.isArray(a.anomalies) ? a.anomalies : []).slice(0, 10).map((x) => ({ gravite: txt(x && x.gravite, 10), detail: txt(x && x.detail, 400) })).filter((x) => x.detail),
    }
    return out
  } catch { return null }
}

function blocAnalyseFinanciere(a) {
  if (!a) {
    return `

COMPTE RENDU FINANCIER: aucun n'est transmis avec ce message. N'invente aucun montant: réponds uniquement avec les chiffres de l'ÉTAT DÉTAILLÉ ci-dessus, et signale que le bilan complet (pénalités, trésorerie, régularité, score) est calculé quand la question est posée depuis l'écran de la tontine.`
  }
  const anomalies = a.anomalies.length
    ? a.anomalies.map((x) => `[${x.gravite}] ${x.detail}`).join(' | ')
    : 'aucune anomalie détectée'
  const recommandations = a.recommandations.map((r) => '• ' + r).join('\n')
  return `

COMPTE RENDU FINANCIER CALCULÉ PAR L'APPLICATION le ${a.dateAnalyse}, à partir des données de ce téléphone (chiffres exacts pour ce dossier — ne les contredis jamais, ne les recalcule pas):
${a.brief}

Note de santé: ${a.sante.score}/100 (${a.sante.niveau}).
Contrôles comptables: ${anomalies}
Recommandations du trésorier à commenter:
${recommandations}`
}

// L'alias se recopie mot à mot dans les réponses : sans valeur, on l'écrit en
// toutes lettres pour que le modèle ne cherche pas à le remplacer par un lien.
function aliasOuTexte(ctx) {
  return ctx && ctx.alias_pispi ? ctx.alias_pispi : 'non configuré'
}

function systemeAssistant(ctx, resume, analyse) {
  return `Tu es "CarnetTontine IA", le secrétaire, le trésorier et l'analyste financier d'une tontine en Côte d'Ivoire.
CASQUETTES: (1) secrétaire de groupe qui suit les cotisations ; (2) comptable — engagements vs encaissements, lettrage des paiements, pénalités de retard, équilibre du pot ; (3) analyste de données — régularité, ponctualité, flux de trésorerie à 30 jours, score de santé ; (4) conseiller financier — ce qu'un trésorier doit décider maintenant.
MISSION PRINCIPALE: Suivre les cotisations. Donner les infos pour payer. Valider les preuves. Tenir le groupe informé. Éclairer les décisions avec les chiffres du dossier. Tu ne touches JAMAIS à l'argent.
${blocAnalyseFinanciere(analyse)}

CONTEXTE:
- Paiement: direct de membre vers responsable, via l'alias Pi-Spi du responsable. L'application ne collecte jamais l'argent.
- Monnaie: FCFA
- Groupe: ${ctx.nom_tontine}
- Responsable: ${ctx.nom_responsable} — téléphone ${ctx.telephone_responsable}
- Alias Pi-Spi du responsable: ${aliasOuTexte(ctx)}
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
7. PAIEMENT: Quand un membre veut payer sa cotisation, donne les informations exactes recopiées du dossier, dans cet ordre :
   - Montant : ${ctx.montant_cotisation} FCFA.
   - Alias Pi-Spi du responsable : ${aliasOuTexte(ctx)} — le membre saisit cet alias dans l'application Pi-Spi pour envoyer à ${ctx.nom_responsable}.
   - Référence du membre à mettre en libellé, quand le dossier la fournit.
   N'invente JAMAIS un lien, un slug, un numéro qui n'est pas dans le dossier ni un code USSD. Si l'alias est « non configuré », dis-le en une phrase et renvoie le membre au responsable, qui le renseigne dans l'onglet Argent, section Trésorerie.
8. CHIFFRES: Tu ne fais AUCUNE opération mathématique. Chaque montant, pourcentage, nombre de jours ou score que tu écris doit être recopié mot à mot depuis le COMPTE RENDU FINANCIER ou l'ÉTAT DÉTAILLÉ. Si une donnée manque, dis « je n'ai pas ce chiffre dans le dossier » — jamais une estimation.
9. ANALYSE: Quand on t'interroge sur la santé du groupe, les retards ou la trésorerie, structure ta réponse comme un conseil de trésorier: (a) constat chiffré, (b) cause et risque, (c) action précise à faire aujourd'hui avec qui, (d) ce que ça coûte si on attend (utilise la projection des pénalités déjà calculée). Reste concret et court.
10. HONNÊTETÉ: Ne rassure pas artificiellement. Si le score est « fragile » ou « critique », ou si plus d'argent est sorti que rentré, dis-le clairement et explique le chiffre, puis propose la correction.
11. LANGAGE: « COMPTE RENDU FINANCIER », « ÉTAT DÉTAILLÉ » et les noms de sections de ce prompt sont INTERNES. Ne dis jamais à l'utilisateur de « vérifier le compte rendu financier » : cite directement le chiffre et son motif, avec les mots d'un trésorier qui parle à son groupe.

SCÉNARIOS:
- Demande de paiement: Affiche **À PAYER** (Montant / À envoyer à / Pour / Avant), puis Étapes 1-2-3 et une question.
- Membre "j'ai payé": "Reçu ✅ Envoie la capture de ton envoi Pi-Spi ici. J'attends la confirmation de ${ctx.nom_responsable}."
- Responsable valide: "✅ {nom_membre} a payé ${ctx.montant_cotisation} FCFA. Collecte: ${ctx.nb_payes}/${ctx.nb_total}"
- Retard: "Coucou {nom_membre} 👋 Rappel: ${ctx.montant_cotisation} FCFA à envoyer à ${ctx.telephone_responsable} avant ${ctx.date_echeance}. Besoin d'aide ou de délai ?"
- Collecte terminée: "🎉 Collecte terminée! ${ctx.montant_total} FCFA collectés. Le tour revient à ${ctx.nom_du_beneficiaire} ce mois."
- "Fais le bilan" / "Comment va la tontine ?": reprends le COMPTE RENDU FINANCIER en 4 lignes max (collecte %, retards, pénalités qui courent, score), puis 1 à 3 actions classées par ordre d'urgence.
- "Qui est le plus à risque ?": compare la régularité et les jours de retard déjà calculés, nomme le membre et le montant concerné, propose une solution (rappel, échéancier, pénalité) — sans jamais juger la personne.
- Question de gestion (taux de pénalité, montant de cotisation, rythme des tours): donne une fourchette raisonnée à partir des montants du dossier et explique le compromis, en rappelant que la décision appartient au groupe.

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
    alias_pispi: (groupe && groupe.collecte && groupe.collecte.compte) || '',
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
    alias_pispi: (groupe.collecte && groupe.collecte.compte) || '',
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

function systemeAssistantAgent(ctx, resume, memoire, analyse) {
  const base = systemeAssistant(ctx, resume, analyse)
  return base + `

─── MODE AGENT (nouveau) ───
Tu peux MAINTENANT agir dans l'application, pas seulement répondre.
Si l'utilisateur demande une action concrète (ajouter un membre, enregistrer un paiement, créer une tontine, relancer, clôturer un tour, exporter un rapport), propose-la via un bloc JSON entre balises, à la FIN de ta réponse :

<<ACTIONS>>
[{"tool":"NOM_OUTIL","args":{ ... }}]
<</ACTIONS>>

OUTILS DISPONIBLES (exécutés sur le téléphone de l'utilisateur) :
- addMember : ajouter un membre. args: {"nom": string, "telephone": string optionnel}
- recordPayment : enregistrer le paiement d'un membre. args: {"membre": string (nom exact), "montant": number, "moyen": "pispi"|"cash" optionnel}
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
  const analyse = sanifierAnalyse(body && body.contexte && body.contexte.analyse)
  const system = systemeAssistantAgent(ctx, resume, memoire, analyse)
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
  const prompt = (body.message || 'Analyse ce reçu ou bordereau de paiement mobile money (Pi-Spi, Wave, Orange Money, MTN MoMo). Réponds UNIQUEMENT par un objet JSON: {"montant": number|null, "expediteur": string|null, "destinataire": string|null, "moyen": "pispi"|"wave"|"orange"|"mtn"|"autre"|null, "confiance": number, "resume": string}.')
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
  const analyse = sanifierAnalyse(body && body.contexte && body.contexte.analyse)
  const system = systemeAssistantAgent(ctx, resume, memoire, analyse)
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
    alias_pispi: (groupe && groupe.collecte && groupe.collecte.compte) || '',
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

  const system = systemeAssistant(ctx, resume, sanifierAnalyse(body && body.contexte && body.contexte.analyse))
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

// Les motifs de refus d'un signalement ne vivent que dans le blob KV : le miroir
// relationnel n'a pas de colonne pour eux et ne reconstruit donc pas. Sans cette
// greffe sur le snapshot relationnel, le membre ne lirait jamais le motif de son
// refus et la ligne repasserait silencieusement en « à payer ».
async function avecRefusPaiements(env, code, snap) {
  if (!snap || !snap.groupe) return snap
  try {
    const brut = await kvGet(env, 'tontines/' + code)
    const rejets = asArr(brut && brut.groupe && brut.groupe.rejetsPaiements)
    if (rejets.length) snap.groupe.rejetsPaiements = rejets.slice(-50)
  } catch (_) { /* le blob d'origine est déjà la valeur de repli */ }
  return snap
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

// Canaux « poubelle » d'un groupe : demandes/{code} et
// messages_utilisateur/{code}. Seul le responsable (ou ses co-gérants) les lit
// pour les absorber, puis doit pouvoir les supprimer ; l'invité, lui, ne fait
// que poster dessus. Sans ce garde, n'importe quel compte connecté connaissant
// le code d'invitation lisait les noms, téléphones, e-mails et messages des
// autres, et le responsable ne pouvait jamais vider le canal (403) : il se
// re-téléchargeait entier à chaque sonde.
async function autorisationCanal(env, code, auth) {
  return (await autorisationGroupe(env, code, auth, null)).ok
}

// Ressource partagée de la discussion (photos, accusés de lecture) : ouverte à
// tout participant — responsable, co-gérant, membre déclaré — mais à lui seul.
// autorisationCanal ne suffit pas : il réserve les canaux au responsable, alors
// qu'un membre doit pouvoir voir les images qu'on lui envoie.
async function participantDeGroupe(env, code, auth) {
  const uid = auth && auth.uid != null ? String(auth.uid) : null
  if (!uid) return false
  if ((await autorisationGroupe(env, code, auth, null)).ok) return true
  const stored = await storedSnapshot(env, code)
  const g = stored && (stored.groupe || stored)
  for (const m of [...asArr(stored && stored.membres), ...asArr(g && g.membres)]) {
    if (m && String(m.uid || '') === uid) return true
  }
  return await estMembreEnMiroir(env, code, uid)
}

// ---------- Niveau de droit effectif sur un groupe ----------
// autorisationGroupe répond par oui/non et adopte un code qu'il ne connaît pas
// (« adoption par l'éditeur », plus haut) : c'est voulu pour publier, dangereux
// pour lire. Les canaux monétaires (paiements, transferts, journal d'audit) sont
// ci-dessous réservés au gestionnaire, et un code jamais publié ne donne aucun
// droit. Le groupe historique sans propriétaire reste adoptable par son premier
// éditeur, mais seulement tant qu'aucun argent n'y a encore transité.
async function estMembreEnMiroir(env, code, uid) {
  try {
    const r = await env.DB.prepare('SELECT 1 AS x FROM membres m JOIN groupes gr ON m.groupe_id = gr.id WHERE gr.code_unique = ? AND m.uid = ?')
      .bind(code, uid).first()
    return !!r
  } catch (_) { return false }
}
async function estCoGerantEnMiroir(env, code, uid) {
  try {
    const r = await env.DB.prepare('SELECT 1 AS x FROM groupe_co_gerants cg JOIN groupes gr ON cg.groupe_id = gr.id WHERE gr.code_unique = ? AND cg.uid = ?')
      .bind(code, uid).first()
    return !!r
  } catch (_) { return false }
}
// Le miroir `groupes` est une preuve d'existence, pas le propriétaire : quand le
// blob kv a disparu (groupe publié avant l'an 2 du format), les co-gérants et
// les membres ne vivent plus que là.
async function groupeEnMiroir(env, code) {
  try {
    return !!(await env.DB.prepare('SELECT id FROM groupes WHERE code_unique = ?').bind(code).first())
  } catch (_) { return false }
}

// Trace laissée par de l'argent : cotisation enregistrée, prêt, tour distribué,
// ou paiement déjà déposé sur un canal. En cas de doute (requête qui échoue),
// on répond vrai : refuser est préférable à adopter un compte portant de l'argent.
async function groupeAVuDeLArgent(env, code, stored) {
  try {
    if (asArr(stored && stored.cotisations).length) return true
    if (asArr(stored && stored.prets).length) return true
    if (asArr(stored && stored.tours).some((t) => t && t.statut === 'recu')) return true
    if (Object.keys(await kvList(env, 'paiements/' + code + '/')).length) return true
    if (Object.keys(await kvList(env, 'paiements_invite/' + code + '/')).length) return true
    return false
  } catch (_) { return true }
}

// 'proprietaire' | 'co_gerant' | 'membre' | null. Ne jamais élargir un droit ici :
// l'appelant décide, selon sa route, du niveau minimum accepté.
async function droitGroupe(env, code, auth) {
  const uid = auth && auth.uid != null ? String(auth.uid) : null
  if (!uid) return null
  const stored = await storedSnapshot(env, code)
  if (stored == null && !(await groupeEnMiroir(env, code))) return null
  const owner = ownerOfSnapshot(stored) || (await groupeOwnerUid(env, code))
  if (!owner) return await groupeAVuDeLArgent(env, code, stored) ? null : 'proprietaire'
  if (uid === owner) return 'proprietaire'
  if (coGerantsOfSnapshot(stored).includes(uid)) return 'co_gerant'
  if (stored == null && await estCoGerantEnMiroir(env, code, uid)) return 'co_gerant'
  const g = stored && (stored.groupe || stored)
  for (const m of [...asArr(stored && stored.membres), ...asArr(g && g.membres)]) {
    if (m && String(m.uid || '') === uid) return 'membre'
  }
  return await estMembreEnMiroir(env, code, uid) ? 'membre' : null
}

// Gestions = le responsable ou un co-gérant. Un membre simple ne voit jamais le
// canal d'apport des paiements : il n'y a rien à lui y montrer, il signale le
// sien par paiements_invite.
function estGerant(niveau) { return niveau === 'proprietaire' || niveau === 'co_gerant' }

// Le dépôt d'un signalement reste ouvert à tout compte authentifié : celui qui
// paie par Mobile Money depuis l'écran invité n'est pas encore dans les membres
// du snapshot. Ce qui le borne : le groupe doit exister, le jeton doit être
// valide, le débit est limité, et l'auteur uid est apposé par le serveur.
async function groupeExiste(env, code) {
  if (await storedSnapshot(env, code) != null) return true
  return await groupeEnMiroir(env, code)
}

// ---------- Droit de lecture du snapshot d'un groupe ----------
// Le snapshot porte les noms, téléphones et e-mails des membres, les tours,
// les cotisations, les prêts et le journal : il ne peut pas être servi à un
// simple porteur de code. Rejoindre devient donc un acte enregistré côté
// serveur (POST /adhesion), et non un téléchargement invisible.
async function estAdherent(env, code, uid) {
  if (uid == null) return false
  return !!(await kvGet(env, 'adherents/' + code + '/' + String(uid)))
}

// Lien pose par l'app avant ce correctif (« restaurer mes groupes »). Sans lui,
// tout membre ayant rejoint sous l'ancien régime perdrait l'accès au déploiement.
// La clé users/{uid}/groupes/{code} n'est inscriptible que par ce même uid
// (anti-IDOR plus bas) : la forger ne donne accès qu'à un code déjà connu,
// ce que le flux d'invitation accorde de toute façon.
async function estLieAuCompte(env, code, uid) {
  if (uid == null) return false
  return !!(await kvGet(env, 'users/' + String(uid) + '/groupes/' + code))
}

async function peutLireSnapshot(env, code, auth) {
  if (!(await groupeExiste(env, code))) return false
  if (await droitGroupe(env, code, auth)) return true
  const uid = auth && auth.uid != null ? String(auth.uid) : null
  if (!uid) return false
  return (await estAdherent(env, code, uid)) || (await estLieAuCompte(env, code, uid))
}

// Ce que l'écran « rejoindre » affiche avant l'acte : l'identité du groupe et
// ses règles. Jamais un membre, un contact ou un montant dû par quelqu'un.
async function ficheGroupe(env, code) {
  const stored = await storedSnapshot(env, code)
  const g = (stored && stored.groupe) || stored
  if (!g || !g.nom) {
    const r = await env.DB.prepare('SELECT * FROM groupes WHERE code_unique = ?').bind(code).first().catch(() => null)
    if (!r) return null
    return {
      code, nom: r.nom, description: r.description || null,
      montantCotisation: r.montant_cotisation, deviseSymbole: r.devise_symbole,
      devisePosition: r.devise_position, periodeJours: r.periode_jours,
      membresMin: r.membres_min, membresMax: r.membres_max, nbMembres: null,
    }
  }
  const membres = asArr(stored && stored.membres).length || asArr(g.membres).length
  return {
    code, nom: g.nom, description: g.description || null,
    montantCotisation: g.montantCotisation, deviseSymbole: g.deviseSymbole,
    devisePosition: g.devisePosition, periodeJours: g.periodeJours,
    membresMin: g.membresMin, membresMax: g.membresMax,
    nbMembres: membres || null, dateCreation: g.dateCreation || null,
  }
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
  // compte — suppression définitive du compte et de toutes ses données.
  if (p[0] === 'compte' && p.length === 1 && method === 'DELETE') {
    return supprimerCompte(env, request, auth)
  }
  if (p[0] === 'assistant') {
    if (method === 'POST' && p[1] === 'agent') return handleAssistantAgent(env, auth, body)
    if (method === 'POST' && p[1] === 'vision') return handleAssistantVision(env, auth, body)
    if (method === 'POST' && p[1] === 'stream') return handleAssistantStream(env, auth, body)
    if (method === 'POST') return handleAssistant(env, auth, body)
  }

  // tontines/{code} — GET réservé aux membres et aux adhérents enregistrés ;
  // écritures au propriétaire / co-gérants uniquement. La fiche de découverte
  // d'un code passé en invitation vit sur GET /adhesion/{code}.
  if (p[0] === 'tontines' && p[1]) {
    const key = 'tontines/' + p[1]
    if (method === 'GET') {
      if (!(await peutLireSnapshot(env, p[1], auth))) return json({ error: 'Interdit' }, 403)
      const rel = await buildSnapshotFromRelational(env, p[1])
      if (rel) return json(await avecRefusPaiements(env, p[1], rel))
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

  // adhesion/{code} — le « rejoindre par code » rendu visible par le serveur.
  // GET = fiche d'identité du groupe (aucun membre, aucun contact, aucun
  // montant individuel). POST = enregistre l'adhérent, prévient le responsable
  // par le canal des demandes, et rend le snapshot complet une fois.
  if (p[0] === 'adhesion' && p[1]) {
    const code = p[1]
    if (method === 'GET') {
      if (!(await rateLimit(env, 'adhesion/' + auth.uid, { limite: 12 }))) return json({ error: 'Trop de recherches de groupe' }, 429)
      const fiche = await ficheGroupe(env, code)
      if (!fiche) return json({ error: 'Groupe introuvable' }, 404)
      return json(fiche)
    }
    if (method === 'POST') {
      if (!(await groupeExiste(env, code))) return json({ error: 'Groupe introuvable' }, 404)
      if (!(await rateLimit(env, 'adhesion-post/' + auth.uid, { limite: 6 }))) return json({ error: 'Trop d’adhésions en une minute' }, 429)
      const uid = String(auth.uid)
      const dejaAdherent = (await estAdherent(env, code, uid))
        || (await estLieAuCompte(env, code, uid))
        || !!(await droitGroupe(env, code, auth))
      let demandeId = null
      if (!dejaAdherent) {
        const nom = String((body && body.nom) || auth.name || '').slice(0, 120)
        const telephone = String((body && body.telephone) || '').slice(0, 40)
        const email = String((body && body.email) || auth.email || '').slice(0, 160)
        await kvPut(env, 'adherents/' + code + '/' + uid, { uid, nom, le: new Date().toISOString() })
        const fiche = await ficheGroupe(env, code)
        await kvPut(env, 'users/' + uid + '/groupes/' + code, { nom: (fiche && fiche.nom) || code, role: 'membre', majLe: Date.now() })
        demandeId = newId()
        const demande = { id: demandeId, nom, telephone, email, uid, majLe: Date.now() }
        await kvPut(env, 'demandes/' + code + '/' + demandeId, demande)
        await syncDemande(env, code, demande)
      }
      const rel = await buildSnapshotFromRelational(env, code)
      const snap = rel || (await kvGet(env, 'tontines/' + code))
      // adhesion sert au client à dire si le responsable a bien été prévenu ;
      // ce champ n'est jamais réécrit vers le cloud.
      if (!snap) return json({ adhesion: { dejaAdherent, demandeId } })
      const out = await avecRefusPaiements(env, code, snap)
      out.adhesion = { dejaAdherent, demandeId }
      return json(out)
    }
  }

  // notifier/{code} — push direct d'un message de discussion sans stockage.
  // Réservé aux participants d'un groupe réellement publié : contrairement aux
  // canaux de la discussion, pas d'adoption implicite d'un code inconnu. Sinon
  // n'importe quel compte pourrait diffuser un faux « versez sur ce numéro » à
  // un groupe dont il connaît juste le code à six lettres.
  if (p[0] === 'notifier' && p[1] && method === 'POST') {
    if (!(await storedSnapshot(env, p[1]))) return json({ error: 'Groupe introuvable' }, 404)
    if (!(await participantDeGroupe(env, p[1], auth))) return json({ error: 'Interdit' }, 403)
    if (!(await rateLimit(env, 'notifier/' + auth.uid, { limite: 30 }))) return json({ error: 'Trop de notifications' }, 429)
    const record = { ...(body || {}), par: auth.uid }
    await notifierMessage(env, record, p[1], { type: 'message', code: p[1] })
    return json({ ok: true })
  }

  // whatsapp/{code} — rappels de cotisation envoyés par le serveur via la
  // Cloud API de Meta (template Utilitaire approuvé). Comme notifier/, la
  // route exige un groupe réellement publié — sinon autorisationGroupe rend
  // « ok » sur un code inconnu (adoption) et n'importe quel compte pourrait
  // faire envoyer des messages à des inconnus depuis notre numéro.
  if (p[0] === 'whatsapp' && p[1]) {
    if (!(await storedSnapshot(env, p[1]))) return json({ error: 'Groupe introuvable' }, 404)
    if (method === 'GET' && p[2] === 'statut') {
      if (!(await participantDeGroupe(env, p[1], auth))) return json({ error: 'Interdit' }, 403)
      return json(await waApercu(env, p[1], new URL(request.url).searchParams.get('tour')))
    }
    if (method === 'GET' && !p[2]) {
      const verdict = await autorisationGroupe(env, p[1], auth, null)
      if (!verdict.ok) return json({ error: 'Interdit' }, 403)
      const journal = (await kvGet(env, 'wa/journal/' + p[1])) || { items: [] }
      const dernier = await kvGet(env, 'wa/dernier/' + p[1])
      return json({ configure: waActif(env), items: asArr(journal.items).slice(-100), dernier: dernier || null })
    }
    if (method === 'POST' && !p[2]) {
      const verdict = await autorisationGroupe(env, p[1], auth, body)
      if (!verdict.ok) return json({ error: 'Interdit' }, 403)
      if (!(await rateLimit(env, 'wa/' + auth.uid, { limite: 6, fenetreMs: 3600 * 1000 }))) {
        return json({ error: 'Trop d’envois WhatsApp en une heure' }, 429)
      }
      return json(await waEnvoiRappels(env, p[1], auth, body || {}))
    }
    return json({ error: 'Méthode non autorisée' }, 405)
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

  // demandes/{code}
  if (p[0] === 'demandes' && p[1]) {
    const prefix = 'demandes/' + p[1]
    if (method === 'GET') {
      if (!(await autorisationCanal(env, p[1], auth))) return json({ error: 'Interdit' }, 403)
      return json(await kvList(env, prefix + '/'))
    }
    if (method === 'POST') {
      const id = (body && body.id) || newId()
      const record = { ...(body || {}), id }
      await kvPut(env, prefix + '/' + id, record)
      await syncDemande(env, p[1], record)
      return json({ id, ok: true })
    }
    if (method === 'DELETE' && p[2]) {
      const item = await kvGet(env, prefix + '/' + p[2])
      const parInterest = !!(item && (item.par === auth.uid || item.pour === auth.uid))
      if (item && (parInterest || (await autorisationCanal(env, p[1], auth)))) {
        await kvDel(env, prefix + '/' + p[2]); await deleteDemande(env, p[2]); return json({ ok: true })
      }
      return json({ error: 'Interdit' }, 403)
    }
  }

  // messages_utilisateur/{code}
  if (p[0] === 'messages_utilisateur' && p[1]) {
    const prefix = 'messages_utilisateur/' + p[1]
    if (method === 'GET') {
      if (!(await autorisationCanal(env, p[1], auth))) return json({ error: 'Interdit' }, 403)
      return json(await kvList(env, prefix + '/'))
    }
    if (method === 'POST') {
      const id = (body && body.id) || newId()
      const record = { ...(body || {}), id, par: auth.uid, le: (body && body.le) || Date.now() }
      await kvPut(env, prefix + '/' + id, record)
      await notifierMessage(env, record, p[1], { type: 'message', code: p[1] })
      return json({ id, ok: true })
    }
    if (method === 'DELETE' && p[2]) {
      const item = await kvGet(env, prefix + '/' + p[2])
      const parInterest = !!(item && (item.par === auth.uid || item.pour === auth.uid))
      if (item && (parInterest || (await autorisationCanal(env, p[1], auth)))) {
        await kvDel(env, prefix + '/' + p[2]); return json({ ok: true })
      }
      return json({ error: 'Interdit' }, 403)
    }
  }

  // lectures/{code} — accusés de lecture de la discussion. Chaque participant
  // publie son pointeur et lit ceux du groupe. `derniereDate` est la date du
  // dernier message lu telle que SON EXPÉDITEUR l'a horodaté : comparer deux
  // horloges d'appareils différents faux d'une minute fausserait tout le
  // « vu par », comparer la date du message lui-même ne dépend d'aucune horloge.
  if (p[0] === 'lectures' && p[1]) {
    const prefix = 'lectures/' + p[1]
    if (method === 'GET') {
      if (!(await participantDeGroupe(env, p[1], auth))) return json({ error: 'Interdit' }, 403)
      return json(await kvList(env, prefix + '/'))
    }
    if (method === 'PUT') {
      if (!(await participantDeGroupe(env, p[1], auth))) return json({ error: 'Interdit' }, 403)
      const luLe = sN(body && body.luLe)
      const derniereDate = sN(body && body.derniereDate)
      if (!luLe || !derniereDate) return json({ error: 'luLe et derniereDate requis' }, 400)
      await kvPut(env, prefix + '/' + auth.uid, {
        uid: String(auth.uid), nom: s(body && body.nom).slice(0, 60), luLe,
        derniereCle: sN(body && body.derniereCle), derniereDate,
      })
      return json({ ok: true })
    }
  }

  // media/{code}/{id} — photos de la discussion, hors du blob du groupe : une
  // image en base64 dans le snapshot republierait des centaines de kilo-octets
  // à chaque message et à chaque appareil. Réponse en JSON (base64) et non en
  // octets bruts : une balise <img> ne peut pas porter l'en-tête d'auth, donc
  // de toute façon c'est le client qui demande et fabrique son data: URL.
  if (p[0] === 'media' && p[1] && p[2]) {
    if (!(await participantDeGroupe(env, p[1], auth))) return json({ error: 'Interdit' }, 403)
    const code = String(p[1]).slice(0, 16)
    const id = String(p[2]).replace(/[^A-Za-z0-9_-]/g, '').slice(0, 40)
    if (!id) return json({ error: 'Identifiant invalide' }, 400)
    if (method === 'PUT') {
      if (!(await rateLimit(env, 'media/' + auth.uid, { limite: 30 }))) return json({ error: 'Trop de téléversements' }, 429)
      const type = String((body && body.type) || '')
      if (!/^image\/(jpeg|png|webp)$/i.test(type)) return json({ error: "Type d'image non accepté" }, 415)
      const b64 = String((body && body.data) || '').replace(/^data:[^,]*,/, '')
      if (!b64) return json({ error: 'Image vide' }, 400)
      if (b64.length > 560 * 1024) return json({ error: 'Image trop lourde (400 Ko max)' }, 413)
      await env.DB.prepare('INSERT OR REPLACE INTO media (code, id, type, data, par, le) VALUES (?,?,?,?,?,?)')
        .bind(code, id, type, b64, String(auth.uid), new Date().toISOString()).run()
      return json({ ok: true, media: '/media/' + code + '/' + id })
    }
    if (method === 'GET') {
      const row = await env.DB.prepare('SELECT type, data FROM media WHERE code = ? AND id = ?').bind(code, id).first()
      if (!row) return json({ error: 'Introuvable' }, 404)
      return json({ ok: true, type: row.type, data: row.data })
    }
    if (method === 'DELETE') {
      // Le bloc entier exige déjà participantDeGroupe ; restaure ici l'auteur de
      // la photo (colonne `par`, apposée à l'écriture) ou un gestionnaire.
      const row = await env.DB.prepare('SELECT par FROM media WHERE code = ? AND id = ?').bind(code, id).first()
      if (!row) return json({ ok: true })
      const niveau = await droitGroupe(env, code, auth)
      if (String(row.par || '') !== String(auth.uid) && !estGerant(niveau)) return json({ error: 'Interdit' }, 403)
      await env.DB.prepare('DELETE FROM media WHERE code = ? AND id = ?').bind(code, id).run()
      return json({ ok: true })
    }
  }

  // paiements/{code} — registre des paiements en ligne confirmés par un apporteur
  // externe. Le client ne le consomme plus depuis la refonte Pi-Spi ; la lecture et
  // la purge restent ouvertes pour vider les enregistrements hérités et pour les
  // versions installées qui pollent encore ce canal. Un JWT valide suffisait pour
  // lire les transactions de n'importe quel groupe.
  if (p[0] === 'paiements' && p[1]) {
    if (!(await groupeExiste(env, p[1]))) return json({ error: 'Interdit' }, 403)
    const prefix = 'paiements/' + p[1]
    if (method === 'GET' || method === 'DELETE') {
      if (!estGerant(await droitGroupe(env, p[1], auth))) return json({ error: 'Interdit' }, 403)
    }
    if (method === 'GET') return json(await kvList(env, prefix + '/'))
    if (method === 'DELETE' && p[2]) {
      await kvDel(env, prefix + '/' + p[2]); await deletePaiementEnLigne(env, p[1], p[2]); return json({ ok: true })
    }
  }

  // paiements_invite/{code} — le membre déclare avoir payé, le responsable absorbe.
  // Lecture et purge réservées aux gestionnaires ; le dépôt reste ouvert aux non
  // membres (écran invité) mais sur groupe existant, plafonné, et signé de l'auteur.
  if (p[0] === 'paiements_invite' && p[1]) {
    const prefix = 'paiements_invite/' + p[1]
    if (method === 'GET' || method === 'DELETE') {
      if (!estGerant(await droitGroupe(env, p[1], auth))) return json({ error: 'Interdit' }, 403)
    }
    if (method === 'GET') return json(await kvList(env, prefix + '/'))
    if (method === 'PUT' || method === 'POST') {
      if (!(await groupeExiste(env, p[1]))) return json({ error: 'Interdit' }, 403)
      if (!(await rateLimit(env, 'paiements_invite/' + auth.uid, { limite: 30 }))) return json({ error: 'Trop de signalements' }, 429)
      const id = (body && body.id) || newId()
      await kvPut(env, prefix + '/' + id, { ...(body || {}), id, par: String(auth.uid), le: new Date().toISOString() })
      return json({ id, ok: true })
    }
    if (method === 'DELETE' && p[2]) { await kvDel(env, prefix + '/' + p[2]); return json({ ok: true }) }
  }

  // transferts/{code} — sorties d'argent manuelles du carnet de trésorerie.
  if (p[0] === 'transferts' && p[1]) {
    if (!estGerant(await droitGroupe(env, p[1], auth))) return json({ error: 'Interdit' }, 403)
    const prefix = 'transferts/' + p[1]
    if (method === 'GET') return json(await kvList(env, prefix + '/'))
    if (method === 'POST') {
      const id = (body && body.id) || newId()
      await kvPut(env, prefix + '/' + id, { ...(body || {}), id, par: String(auth.uid) })
      return json({ id, ok: true })
    }
  }

  // auditLogs/{code} — journal de transparence : lu par l'onglet Trésorerie,
  // donc par les gestionnaires seuls. Rien d'autre du client n'y écrit.
  if (p[0] === 'auditLogs' && p[1]) {
    if (!estGerant(await droitGroupe(env, p[1], auth))) return json({ error: 'Interdit' }, 403)
    const prefix = 'auditLogs/' + p[1]
    if (method === 'GET') return json(await kvList(env, prefix + '/'))
    if (method === 'POST') {
      const id = (body && body.id) || newId()
      await kvPut(env, prefix + '/' + id, { ...(body || {}), id, par: String(auth.uid) })
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

// Le compte de collecte vient d'un autre appareil et s'affiche chez tous les
// membres : on ne stocke que ce que l'app sait rendre — un ALIAS Pi-Spi
// (poignée courte, mêmes bornes que src/lib/paiementSimple.js) ou une URL
// http(s). Tout le reste (UUID hérité, phrase, script) est rejeté plutôt que
// diffusé au groupe.
const URL_COLLECTE = /^https?:\/\/\S+$/i
const ALIAS_COLLECTE = /^[A-Za-z0-9][A-Za-z0-9._@+\-]{2,31}$/
function jsonCollecte(c) {
  if (!c || typeof c !== 'object') return null
  const compte = String(c.compte == null ? '' : c.compte).trim().slice(0, 400)
  if (!URL_COLLECTE.test(compte) && !ALIAS_COLLECTE.test(compte)) return null
  return JSON.stringify({
    type: 'pispi',
    nom: String(c.nom == null ? '' : c.nom).slice(0, 120),
    compte,
    titulaire: String(c.titulaire == null ? '' : c.titulaire).slice(0, 120),
  })
}

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
    g.moyensPaiement != null ? JSON.stringify(g.moyensPaiement) : '["Pi-Spi"]',
    n(g.membresMin), n(g.membresMax),
    g.statut === 'terminee' ? 'terminee' : 'active',
    g.dateDebut != null ? g.dateDebut : null,
    g.dateCreation != null ? g.dateCreation : null,
    g.receptionMM != null ? JSON.stringify(g.receptionMM) : null,
    b1(g.public), g.description != null ? String(g.description) : null,
    g.waveSlug != null ? String(g.waveSlug) : null,
    jsonCollecte(g.collecte),
  ]
  if (groupeId == null) {
    const cols = 'code_unique, sauvegarde_uid, proprietaire_uid, nom, devise_symbole, devise_position, montant_cotisation, periode_jours, le_receveur_cotonise, penalite_pct_par_jour, penalite_plafond, moyens_paiement, membres_min, membres_max, statut, date_debut, date_creation, reception_mm, public, description, wave_slug, collecte'
    const r = await env.DB.prepare(`INSERT INTO groupes (${cols}) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).bind(...grpVals).run()
    groupeId = r.meta && r.meta.last_row_id
  } else {
    await env.DB.prepare(`UPDATE groupes SET sauvegarde_uid=?, proprietaire_uid=?, nom=?, devise_symbole=?, devise_position=?, montant_cotisation=?, periode_jours=?, le_receveur_cotonise=?, penalite_pct_par_jour=?, penalite_plafond=?, moyens_paiement=?, membres_min=?, membres_max=?, statut=?, date_debut=?, date_creation=?, reception_mm=?, public=?, description=?, wave_slug=?, collecte=? WHERE id=?`).bind(...grpVals.slice(1), groupeId).run()
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
  // L'index unique (groupe_id, cle) et la clé primaire de pending_messages sont
  // une menace pour tout le miroir : un doublon dans le blob (deux appareils
  // qui publient le même message) fait échouer le batch entier, et comme les
  // enfants ont déjà été supprimés juste au-dessus le groupe se retrouve vide
  // à la lecture. On évince les doublons ici plutôt que de laisser D1 le faire.
  const clesVues = new Set()
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
    // Un message peut n'être qu'une photo : `texte` est NOT NULL en base, on le
    // force à chaîne vide plutôt que de jeter le message (et l'image) sinon.
    if (!mg || (mg.texte == null && mg.media == null)) continue
    const cle = sN(mg.cle)
    if (cle) {
      if (clesVues.has(cle)) continue
      clesVues.add(cle)
    }
    stmts.push(env.DB.prepare('INSERT INTO groupe_messages (groupe_id, auteur, uid, email, texte, date, en_attente, cle, repondre_a, media, epingle, modifie_le) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)')
      .bind(groupeId, s(mg.auteur), sN(mg.uid), sN(mg.email), String(mg.texte || ''), sN(mg.date), b(mg.enAttente),
        cle, sN(mg.repondreA), sN(mg.media), b(mg.epingle), sN(mg.modifieLe)))
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
    stmts.push(env.DB.prepare('INSERT INTO pending_messages (id, groupe_id, texte, auteur, uid, email, date, en_attente, repondre_a, media, modifie_le) VALUES (?,?,?,?,?,?,?,?,?,?,?)')
      .bind(String(pm.id), groupeId, String(pm.texte || ''), s(pm.auteur), sN(pm.uid), sN(pm.email), sN(pm.date), b1(pm.enAttente),
        sN(pm.repondreA), sN(pm.media), sN(pm.modifieLe)))
  }
  if (stmts.length) await env.DB.batch(stmts)
 } catch (e) { console.error('[sync:group]', e && e.message) }
}

async function deleteGroupRelational(env, { code, sauvegardeUid }) {
 try {
  if (code) await env.DB.prepare('DELETE FROM groupes WHERE code_unique = ?').bind(code).run()
  else if (sauvegardeUid) await env.DB.prepare('DELETE FROM groupes WHERE code_unique IS NULL AND sauvegarde_uid = ?').bind(sauvegardeUid).run()
  if (code) {
    await kvDeleteGlob(env, 'lectures/' + code + '/')
    await viderMediaGroupe(env, code)
  }
 } catch (e) { console.error('[sync:deleteGroup]', e && e.message) }
}

// Les photos sont hors du blob du groupe : rien ne les emporte donc quand le
// groupe disparaît, sauf à le demander explicitement.
async function viderMediaGroupe(env, code) {
  if (!code) return
  try {
    await env.DB.prepare('DELETE FROM media WHERE code = ?').bind(code).run()
  } catch (e) { console.error('[sync:media]', e && e.message) }
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
    id: m.id, cle: m.cle || null, auteur: m.auteur, uid: m.uid, email: m.email, texte: m.texte, date: m.date,
    enAttente: !!m.en_attente, repondreA: m.repondre_a || null, media: m.media || null,
    epingle: !!m.epingle, modifieLe: m.modifie_le || null,
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
    penalitePlafond: g.penalite_plafond, moyensPaiement: g.moyens_paiement ? JSON.parse(g.moyens_paiement) : ['Pi-Spi'],
    membresMin: g.membres_min, membresMax: g.membres_max, statut: g.statut,
    dateDebut: g.date_debut, dateCreation: g.date_creation,
    receptionMM: g.reception_mm ? JSON.parse(g.reception_mm) : null,
    collecte: g.collecte ? JSON.parse(g.collecte) : null,
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

// Demande d'effacement RGPD déposée depuis la page publique /suppression.
// Le compte rendu complet (kv « rgpd/suppressions/* ») est consultable par
// l'éditeur via wrangler ; aucune donnée de tontine n'est lue ici.
async function handleDemandeSuppression(env, request) {
  if (!(await rateLimit(env, 'ip_' + clientIp(request), { limite: 5 }))) {
    return json({ error: 'Trop de demandes depuis cette adresse, réessayez dans une minute' }, 429)
  }
  let email = '', uid = '', message = ''
  const ctype = request.headers.get('Content-Type') || ''
  if (ctype.includes('application/json')) {
    const body = await request.json().catch(() => ({}))
    email = String(body.email || '')
    uid = String(body.uid || '')
    message = String(body.message || '')
  } else {
    const form = await request.formData().catch(() => null)
    if (form) {
      email = String(form.get('email') || '')
      uid = String(form.get('uid') || '')
      message = String(form.get('message') || '')
    }
  }
  email = email.toLowerCase().trim().slice(0, 200)
  uid = uid.trim().slice(0, 120)
  message = message.trim().slice(0, 2000)
  if (!email && !uid) return json({ error: 'Indiquez au moins l email du compte' }, 400)
  const cle = 'rgpd/suppressions/' + (email || 'uid_' + uid)
  const existant = await kvGet(env, cle)
  const demande = {
    email,
    uid,
    message,
    recu_le: new Date().toISOString(),
    nb_envois: ((existant && existant.nb_envois) || 0) + 1,
  }
  await kvPut(env, cle, demande)
  return json({ ok: true })
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

      // --- Webhook WhatsApp Cloud API (public, signé par X-Hub-Signature-256) ---
      if (p[0] === 'whatsapp' && p[1] === 'webhook') {
        if (method === 'GET') return waVerifierWebhook(env, url)
        if (method === 'POST') return waRecit(env, request, ctx)
        return json({ error: 'Méthode non autorisée' }, 405)
      }

      // --- Pages publiques de conformité (HTML, sans jeton) ---
      if (method === 'GET' && (p[0] === 'privacy' || p[0] === 'confidentialite')) {
        return html(privacyHtml())
      }
      if (p[0] === 'suppression') {
        if (method === 'GET') return html(suppressionHtml())
        if (method === 'POST') return handleDemandeSuppression(env, request)
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
