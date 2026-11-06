// ═══════════════════════════════════════════════════════════════
// Cloud API — client du Worker de synchronisation (tontine-sync)
// ---------------------------------------------------------------
// Remplace l'accès à Firebase Realtime Database. Auth : le jeton
// Firebase de l'utilisateur (vérifié côté Worker via Google tokeninfo).
// ═══════════════════════════════════════════════════════════════

export const SYNC_BASE =
  (import.meta.env && import.meta.env.VITE_SYNC_BASE) ||
  'https://tontine-sync.tontine-manager.workers.dev'

// Utilisateur courant (défini par AuthContext à la connexion).
let _user = null
export function setSyncUser(user) {
  _user = user
}
export function getSyncUid() {
  return _user ? _user.uid : null
}
// La synchronisation cloud est disponible dès qu'un utilisateur est connecté
// (le Worker Cloudflare est toujours joignable, mais l'auth est requise).
export function syncDisponible() {
  return !!_user
}

// ─── Auth (Worker /auth2/*) ──────────────────────────────────────
export async function authGoogle(idToken) {
  return cloudRequestRaw('POST', 'auth2/google', { idToken })
}
export async function authRegister(email, password, displayName) {
  return cloudRequestRaw('POST', 'auth2/register', { email, password, displayName })
}
export async function authLogin(email, password) {
  return cloudRequestRaw('POST', 'auth2/login', { email, password })
}
export async function authForgot(email) {
  return cloudRequestRaw('POST', 'auth2/forgot', { email })
}
export async function authReset(email, password, token) {
  return cloudRequestRaw('POST', 'auth2/reset', { email, password, token })
}

// Suppression définitive du compte et de toutes ses données côté cloud
// (RGPD art. 17). Le Worker exige le mot de passe courant quand le compte
// en a un. Message d'erreur renvoyé tel quel par le serveur.
export async function supprimerCompte(motDePasse) {
  if (!_user) throw new Error('Non connecté')
  const token = await _user.getIdToken()
  const res = await fetch(SYNC_BASE + '/compte', {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
    body: JSON.stringify({ password: motDePasse || '', confirmation: true }),
  })
  const j = await res.json().catch(() => null)
  if (!res.ok) throw new Error((j && j.error) || 'Suppression impossible')
  return j
}

// Requête SANS auth (endpoints publics d'auth). Lève une erreur lisible.
async function cloudRequestRaw(method, path, body) {
  const opts = { method, headers: { 'Content-Type': 'application/json' } }
  if (body !== undefined) opts.body = JSON.stringify(body)
  const res = await fetch(SYNC_BASE + '/' + path.replace(/^\/+/, ''), opts)
  if (!res.ok) {
    let msg = 'Erreur de connexion'
    try {
      const j = await res.json()
      if (j && j.error) msg = j.error
    } catch {}
    throw new Error(msg)
  }
  const text = await res.text()
  return text ? JSON.parse(text) : null
}

// Renvoie les en-têtes d'auth (jeton Firebase). null si pas connecté.
export async function authHeaders() {
  if (!_user) return null
  try {
    const token = await _user.getIdToken()
    return { Authorization: 'Bearer ' + token }
  } catch {
    return null
  }
}

export async function cloudRequest(method, path, body) {
  const headers = await authHeaders()
  if (!headers) throw new Error('Non connecté')
  const opts = { method, headers: { 'Content-Type': 'application/json', ...headers } }
  if (body !== undefined) opts.body = JSON.stringify(body)
  const res = await fetch(SYNC_BASE + '/' + path.replace(/^\/+/, ''), opts)
  if (res.status === 401) throw new Error('auth')
  if (res.status === 403) throw new Error('forbidden')
  if (res.status === 404) return null
  if (!res.ok) throw new Error('HTTP ' + res.status)
  const text = await res.text()
  return text ? JSON.parse(text) : null
}

// Démarre un sondage (temps réel simulé) sur GET path.
// onData(reponse|null) ; renvoie une fonction de désabonnement.
export function poll(path, onData, onError, intervalMs = 6000) {
  let actif = true
  let timer = null
  const tick = async () => {
    if (!actif) return
    try {
      const v = await cloudRequest('GET', path)
      if (actif) onData(v)
    } catch (e) {
      if (actif && onError) onError(e)
    }
  }
  tick()
  timer = setInterval(tick, intervalMs)
  return () => {
    actif = false
    if (timer) clearInterval(timer)
  }
}
