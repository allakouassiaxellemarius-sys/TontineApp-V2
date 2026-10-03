// ═══════════════════════════════════════════════════════════════
// Notifications push (FCM) — côté client
// ---------------------------------------------------------------
// Enregistre l'appareil auprès de Firebase Cloud Messaging et stocke
// le token sous users/{uid}/fcmToken (worker Cloudflare tontine-sync).
//  • Mobile natif : SDK Capacitor (@capacitor/push-notifications)
//  • Web / PWA     : Firebase JS SDK (firebase.js) + service worker
// L'envoi des notifications est assuré par le worker.
// ═══════════════════════════════════════════════════════════════
import { Capacitor } from '@capacitor/core'
import { PushNotifications } from '@capacitor/push-notifications'
import { cloudRequest } from './cloudApi'
import { firebaseWebDisponible, obtenirTokenWeb, surMessagePremierPlan as surMessagePremierPlanWeb } from './firebase'

// Les notifications push sont disponibles sur mobile natif OU sur web (FCM configuré).
export function pushDisponible() {
  if (Capacitor.isNativePlatform()) return true
  return firebaseWebDisponible()
}

export async function statutPermission() {
  try {
    if (Capacitor.isNativePlatform()) {
      const p = await PushNotifications.checkPermissions()
      return (p && p.receive) || 'prompt'
    }
    if (typeof Notification !== 'undefined') return Notification.permission
  } catch { /* noop */ }
  return 'prompt'
}

// Demande l'autorisation, enregistre l'appareil et renvoie le token FCM.
// Renvoie { ok, token, raison }.
export async function activerNotifications(uid) {
  if (!uid) return { ok: false, raison: 'Connectez-vous d’abord.' }
  try {
    // 1) Mobile natif (Capacitor)
    if (Capacitor.isNativePlatform()) {
      const perm = await PushNotifications.requestPermissions()
      if (perm.receive !== 'granted') return { ok: false, raison: 'Autorisation de notification refusée.' }
      await PushNotifications.register()
      const token = await obtenirToken()
      if (!token) return { ok: false, raison: 'Enregistrement FCM échoué (vérifiez google-services.json).' }
      await cloudRequest('PUT', 'users/' + uid + '/fcmToken', {
        token,
        plateforme: Capacitor.getPlatform(),
        misAJour: Date.now(),
      })
      return { ok: true, token }
    }
    // 2) Web / PWA (Firebase JS SDK)
    if (firebaseWebDisponible()) {
      const token = await obtenirTokenWeb()
      if (!token) return { ok: false, raison: 'Autorisation de notification refusée ou FCM non configuré.' }
      await cloudRequest('PUT', 'users/' + uid + '/fcmToken', {
        token,
        plateforme: 'web',
        misAJour: Date.now(),
      })
      return { ok: true, token }
    }
    return { ok: false, raison: 'Notifications non disponibles sur cet appareil.' }
  } catch (e) {
    return { ok: false, raison: (e && e.message) || 'Erreur lors de l’activation des notifications.' }
  }
}

// Retire le token du compte (à la désactivation / déconnexion).
export async function desactiverNotifications(uid) {
  if (!uid) return
  try {
    await cloudRequest('DELETE', 'users/' + uid + '/fcmToken')
  } catch { /* noop */ }
}

function obtenirToken() {
  return new Promise((resolve) => {
    let resolu = false
    const fin = (t) => { if (!resolu) { resolu = true; resolve(t || null) } }
    let unreg = () => {}
    PushNotifications.addListener('registration', (t) => { fin(t && t.value); try { unreg() } catch { /* noop */ } })
      .then((r) => { unreg = r.remove })
      .catch(() => {})
    PushNotifications.addListener('registrationError', () => { fin(null); try { unreg() } catch { /* noop */ } }).catch(() => {})
    setTimeout(() => { fin(null); try { unreg() } catch { /* noop */ } }, 12000)
  })
}

// Abonnements événements (mobile natif).
export async function surNotificationRecue(cb) {
  if (!Capacitor.isNativePlatform()) return () => {}
  try {
    const r = await PushNotifications.addListener('pushNotificationReceived', (n) => cb(n))
    return r.remove
  } catch { return () => {} }
}

export async function surNotificationTapee(cb) {
  if (!Capacitor.isNativePlatform()) return () => {}
  try {
    const r = await PushNotifications.addListener('pushNotificationActionPerformed', (action) => cb(action))
    return r.remove
  } catch { return () => {} }
}

// Écoute des messages en premier plan (web + mobile). Renvoie toujours une
// Promise<désabonnement> : la version web de Firebase renvoie une fonction
// synchrone, et l'appelant (Shell) chaîne .then().
export function surNotificationPremierPlan(cb) {
  if (Capacitor.isNativePlatform()) {
    return surNotificationRecue((n) => cb({ titre: (n && n.title) || 'Tontine', corps: (n && n.body) || '' }))
  }
  return Promise.resolve(surMessagePremierPlanWeb(cb))
}
