// ═══════════════════════════════════════════════════════════════
// Tontine Manager — utilitaires Firebase (Cloudflare Worker)
// ---------------------------------------------------------------
// OAuth2 (JWT RS256 signé avec la clé privée du service account),
// puis accès Realtime Database et FCM en accès admin (contourne
// les règles de sécurité, comme un SDK serveur).
// ═══════════════════════════════════════════════════════════════

export const DB_URL = 'https://tontine-manager-f3965-default-rtdb.firebaseio.com'
export const FCM_URL = 'https://fcm.googleapis.com/v1/projects/tontine-manager-f3965/messages:send'
export const TOKEN_URL = 'https://oauth2.googleapis.com/token'
export const SCOPES =
  'https://www.googleapis.com/auth/userinfo.email https://www.googleapis.com/auth/firebase.database https://www.googleapis.com/auth/firebase.messaging'

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

export async function obtenirAccessToken(svc) {
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

export async function lireChemin(accessToken, chemin) {
  const res = await fetch(DB_URL + '/' + chemin + '.json', {
    headers: { Authorization: 'Bearer ' + accessToken },
  })
  if (!res.ok) throw new Error('RTDB HTTP ' + res.status)
  return res.json()
}

export async function ecrireChemin(accessToken, chemin, data) {
  const res = await fetch(DB_URL + '/' + chemin + '.json', {
    method: 'PUT',
    headers: { Authorization: 'Bearer ' + accessToken, 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  })
  if (!res.ok) throw new Error('RTDB HTTP ' + res.status)
  return res.json()
}

export async function supprimerChemin(accessToken, chemin) {
  const res = await fetch(DB_URL + '/' + chemin + '.json', {
    method: 'DELETE',
    headers: { Authorization: 'Bearer ' + accessToken },
  })
  if (!res.ok) throw new Error('RTDB HTTP ' + res.status)
  return res.json()
}
