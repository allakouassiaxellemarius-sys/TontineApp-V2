// ═══════════════════════════════════════════════════════════════
// Tontine Manager — notifier-message (Cloudflare Worker)
// ---------------------------------------------------------------
// POST JSON { code, messageId } :
//   1. Lit la tontine tontines/{code} (RTDB) en accès admin.
//   2. Retrouve le message et le groupe (nom, id).
//   3. Pour chaque membre (hors auteur) qui a un token FCM
//      (users/{uid}/fcmToken), envoie un push via l'API HTTP v1.
//
// Secrets requis : SERVICE_ACCOUNT (JSON de clé privée Firebase) et
// NOTIF_TOKEN (jeton partagé, envoyé par l'app via l'en-tête
// X-Notif-Token — cf. src/lib/notifierMessage.js).
// L'access token du service account donne les droits admin RTDB
// (contourne les règles) et l'autorisation FCM v1.
// ═══════════════════════════════════════════════════════════════

const DB_URL = 'https://tontine-manager-f3965-default-rtdb.firebaseio.com'
const FCM_URL = 'https://fcm.googleapis.com/v1/projects/tontine-manager-f3965/messages:send'
const TOKEN_URL = 'https://oauth2.googleapis.com/token'
const SCOPES =
  'https://www.googleapis.com/auth/userinfo.email https://www.googleapis.com/auth/firebase.database https://www.googleapis.com/auth/firebase.messaging'

function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, X-Notif-Token',
  }
}

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { 'Content-Type': 'application/json', ...corsHeaders() },
  })
}

// ── OAuth2 : JWT (RS256) signé avec la clé privée du service account ──
function pemToDer(pem) {
  const b64 = pem
    .replace(/-----BEGIN PRIVATE KEY-----/g, '')
    .replace(/-----END PRIVATE KEY-----/g, '')
    .replace(/\s+/g, '')
  const bin = atob(b64)
  const bytes = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
  return bytes.buffer
}

function en64u(buf) {
  let s = ''
  const bytes = new Uint8Array(buf)
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

async function creerJwt(svc) {
  const now = Math.floor(Date.now() / 1000)
  const b64u = (o) =>
    btoa(JSON.stringify(o)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
  const header = b64u({ alg: 'RS256', typ: 'JWT' })
  const claims = b64u({
    iss: svc.client_email,
    scope: SCOPES,
    aud: TOKEN_URL,
    iat: now,
    exp: now + 3600,
  })
  const signInput = header + '.' + claims
  const key = await crypto.subtle.importKey(
    'pkcs8',
    pemToDer(svc.private_key),
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['sign']
  )
  const sig = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', key, new TextEncoder().encode(signInput))
  return signInput + '.' + en64u(sig)
}

async function obtenirAccessToken(svc) {
  const jwt = await creerJwt(svc)
  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: jwt,
    }),
  })
  const data = await res.json()
  if (!res.ok || !data.access_token) {
    throw new Error(data.error_description || data.error || 'HTTP ' + res.status)
  }
  return data.access_token
}

// ── Lecture RTDB en accès admin (contourne les règles de sécurité) ──
async function lireChemin(accessToken, chemin) {
  const res = await fetch(DB_URL + '/' + chemin + '.json', {
    headers: { Authorization: 'Bearer ' + accessToken },
  })
  if (!res.ok) throw new Error('RTDB HTTP ' + res.status)
  return res.json()
}

// ── Envoi FCM (HTTP v1) ──
async function envoyerPush(accessToken, token, payload) {
  const res = await fetch(FCM_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: 'Bearer ' + accessToken,
    },
    body: JSON.stringify({
      message: {
        token,
        notification: { title: payload.title, body: payload.body },
        data: {
          type: 'message',
          code: payload.code,
          groupeId: payload.groupeId,
          messageId: payload.messageId,
        },
        android: { priority: 'high' },
      },
    }),
  })
  if (!res.ok) {
    const t = await res.text()
    console.log('FCM échec HTTP', res.status, t.slice(0, 200))
  }
  return res.ok
}

// Le membre est-il l'auteur du message ? (exclu de la notification)
function estAuteur(membre, message) {
  if (!membre || !message) return false
  if (membre.uid && message.uid && String(membre.uid) === String(message.uid)) return true
  const email = (message.email || '').trim().toLowerCase()
  const nom = (message.auteur || '').trim().toLowerCase()
  if (email && (membre.email || '').trim().toLowerCase() === email) return true
  return !!nom && (membre.nom || '').trim().toLowerCase() === nom
}

// Déduplication : plusieurs appareils du groupe observent le snapshot et
// peuvent déclencher le worker pour le même message ; on ne notifie qu'une
// fois par (code, messageId) sur un court intervalle.
const RECEMMENT = new Map()
const FENETRE_DEDUPE = 60000

export default {
  async fetch(request, env) {
    if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders() })
    if (request.method !== 'POST') {
      return json({ ok: false, erreur: 'POST requis' }, 405)
    }
    if (!env.NOTIF_TOKEN || request.headers.get('X-Notif-Token') !== env.NOTIF_TOKEN) {
      return json({ ok: false, erreur: 'Non autorisé' }, 401)
    }
    let payload
    try {
      payload = await request.json()
    } catch {
      return json({ ok: false, erreur: 'JSON invalide' }, 400)
    }
    const code = String(payload.code || '').trim()
    const messageId = payload.messageId != null ? String(payload.messageId) : null
    if (!code) return json({ ok: false, erreur: 'code manquant' }, 400)

    const maintenant = Date.now()
    for (const [c, v] of RECEMMENT) {
      if (maintenant - v.at > FENETRE_DEDUPE * 5) RECEMMENT.delete(c)
    }
    const deja = RECEMMENT.get(code)
    if (messageId && deja && deja.messageId === messageId && maintenant - deja.at < FENETRE_DEDUPE) {
      return json({ ok: true, notifie: 0, deja: true })
    }
    RECEMMENT.set(code, { messageId, at: maintenant })

    const svc = env.SERVICE_ACCOUNT
    if (!svc) return json({ ok: false, erreur: 'SERVICE_ACCOUNT non configuré' }, 500)
    let svcAccount
    try {
      svcAccount = JSON.parse(svc)
    } catch {
      return json({ ok: false, erreur: 'SERVICE_ACCOUNT invalide' }, 500)
    }

    let token
    try {
      token = await obtenirAccessToken(svcAccount)
    } catch (e) {
      return json({ ok: false, erreur: 'OAuth : ' + e.message }, 502)
    }

    let groupe
    try {
      groupe = await lireChemin(token, 'tontines/' + encodeURIComponent(code))
    } catch (e) {
      return json({ ok: false, erreur: 'Lecture tontine : ' + e.message }, 502)
    }
    if (!groupe || !groupe.groupe || !groupe.groupe.nom) {
      return json({ ok: true, notifie: 0 })
    }

    const messages = Array.isArray(groupe.groupe.messages) ? groupe.groupe.messages : []
    let message = null
    if (messageId) message = messages.find((m) => m && String(m.id) === messageId) || null
    if (!message) message = messages[messages.length - 1] || null
    if (!message) return json({ ok: true, notifie: 0 })

    const auteur = (message.auteur || 'Membre').slice(0, 40)
    const texte = (message.texte || '').slice(0, 160)
    const title = 'Nouveau message — ' + (groupe.groupe.nom || 'Tontine')
    const body = auteur + ' : ' + texte

    const membres = Array.isArray(groupe.membres) ? groupe.membres : []
    let notifie = 0
    for (const membre of membres) {
      if (!membre || !membre.uid) continue
      if (estAuteur(membre, message)) continue
      let tokenMembre
      try {
        const fcm = await lireChemin(token, 'users/' + encodeURIComponent(membre.uid) + '/fcmToken')
        tokenMembre = fcm && fcm.token ? String(fcm.token) : null
      } catch {
        tokenMembre = null
      }
      if (!tokenMembre) continue
      try {
        const ok = await envoyerPush(token, tokenMembre, {
          title,
          body,
          code: code,
          groupeId: String(groupe.groupe.id || ''),
          messageId: String(message.id || ''),
        })
        if (ok) notifie++
      } catch (e) {
        console.log('Push échoué pour', membre.uid, e && e.message)
      }
    }
    return json({ ok: true, notifie })
  },
}
