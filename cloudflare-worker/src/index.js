// ═══════════════════════════════════════════════════════════════
// Tontine Manager — notifier-message (Cloudflare Worker)
// ---------------------------------------------------------------
// Le paiement (comptes virtuels Flutterwave, webhooks, retraits) est
// désormais géré par les Firebase Cloud Functions (dossier functions/).
// Ce worker ne conserve que la notification FCM.
//
// Routes :
//   POST / (legacy) { code, messageId }
//       Notifie chaque membre (hors auteur) par FCM via API HTTP v1.
//
// Secrets requis : SERVICE_ACCOUNT (JSON clé privée Firebase),
// NOTIF_TOKEN (jeton partagé, en-tête X-Notif-Token).
// ═══════════════════════════════════════════════════════════════

import { obtenirAccessToken, lireChemin } from './firebaseUtil.js'

const FCM_URL = 'https://fcm.googleapis.com/v1/projects/tontine-manager-f3965/messages:send'

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

async function gererNotification(request, env) {
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
}

export default {
  async fetch(request, env) {
    if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders() })

    const url = new URL(request.url)
    if (url.pathname.startsWith('/payment/')) {
      return json({ ok: false, erreur: 'Paiement géré par Firebase Functions' }, 410)
    }

    if (request.method !== 'POST') {
      return json({ ok: false, erreur: 'POST requis' }, 405)
    }
    return gererNotification(request, env)
  },
}
