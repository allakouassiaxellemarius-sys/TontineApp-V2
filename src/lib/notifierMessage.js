// ═══════════════════════════════════════════════════════════════
// Notification de nouveau message (sans Cloud Functions)
// ---------------------------------------------------------------
// Le responsable publie le snapshot de la tontine ; dès qu'un nouveau
// message apparaît, l'app appelle un Cloudflare Worker (gratuit) qui
// lit le groupe et envoie les push FCM aux membres. L'URL du worker est
// définie après le déploiement (voir cloudflare-worker/).
// ═══════════════════════════════════════════════════════════════

export const NOTIFIER_URL = 'https://tontine-notifier.tontine-manager.workers.dev'

// Jeton partagé avec le worker (secret NOTIF_TOKEN) : limite l'appel du
// worker aux seules instances de l'app. Il est présent dans le bundle,
// c'est une protection de premier niveau (pas une authentification forte).
export const NOTIFIER_TOKEN = '5aff35c88c68d465a9bdb6471b84ec46e702907f9a4bca47'

const CLE_DERNIER = 'tontine_dernier_message_notifie'

function derniersNotifies() {
  try {
    return JSON.parse(localStorage.getItem(CLE_DERNIER) || '{}') || {}
  } catch {
    return {}
  }
}

// Mémorise le dernier message notifié pour ce code et, si c'est bien un
// nouveau, déclenche le worker. Retourne true si le worker est appelé.
export function declencherNotifMessage(code, messageId) {
  if (!code || messageId == null) return false
  const cle = String(messageId)
  const map = derniersNotifies()
  if (map[code] === cle) return false
  map[code] = cle
  try {
    localStorage.setItem(CLE_DERNIER, JSON.stringify(map))
  } catch {}
  if (typeof fetch !== 'function') return true
  fetch(NOTIFIER_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Notif-Token': NOTIFIER_TOKEN },
    body: JSON.stringify({ code: String(code), messageId: String(messageId) }),
  }).catch(() => {})
  return true
}
