// ═══════════════════════════════════════════════════════════════
// Notifications push (FCM) — côté client
// ---------------------------------------------------------------
// Enregistre l'appareil auprès de Firebase Cloud Messaging et stocke
// le token sous users/{uid}/fcmToken. L'envoi des messages est assuré
// par une Cloud Function planifiée (dossier functions/).
// ═══════════════════════════════════════════════════════════════
import { Capacitor } from '@capacitor/core'
import { PushNotifications } from '@capacitor/push-notifications'
import { initializeApp, getApps, getApp } from 'firebase/app'
import { getDatabase, ref, set, remove } from 'firebase/database'
import { firebaseConfig, firebaseConfigure } from './firebaseConfig'

let app = null
let db = null

function ensure() {
  if (!firebaseConfigure()) return null
  if (!app) app = getApps().length ? getApp() : initializeApp(firebaseConfig)
  if (!db) db = getDatabase(app)
  return db
}

// Les notifications push ne sont disponibles que sur mobile.
export function pushDisponible() {
  return Capacitor.isNativePlatform() && firebaseConfigure()
}

export async function statutPermission() {
  try {
    const p = await PushNotifications.checkPermissions()
    return (p && p.receive) || 'prompt'
  } catch {
    return 'prompt'
  }
}

// Demande l'autorisation, enregistre l'appareil et renvoie le token FCM.
// Ne fait rien sur web. Renvoie { ok, token, raison }.
export async function activerNotifications(uid) {
  if (!pushDisponible()) return { ok: false, raison: 'Notifications disponibles uniquement sur mobile.' }
  if (!uid) return { ok: false, raison: 'Connectez-vous d\u2019abord avec votre compte Google.' }
  try {
    const perm = await PushNotifications.requestPermissions()
    if (perm.receive !== 'granted') {
      return { ok: false, raison: 'Autorisation de notification refusée.' }
    }
    await PushNotifications.register()
    const token = await obtenirToken()
    if (!token) return { ok: false, raison: 'Enregistrement FCM échoué (vérifiez google-services.json).' }
    const f = ensure()
    if (!f) return { ok: false, raison: 'Firebase non configuré.' }
    await set(ref(f, 'users/' + uid + '/fcmToken'), {
      token,
      plateforme: Capacitor.getPlatform(),
      misAJour: Date.now(),
    })
    return { ok: true, token }
  } catch (e) {
    return { ok: false, raison: (e && e.message) || 'Erreur lors de l\u2019activation des notifications.' }
  }
}

// Retire le token du compte (à la désactivation / déconnexion).
export async function desactiverNotifications(uid) {
  if (!uid) return
  const f = ensure()
  if (!f) return
  try {
    await remove(ref(f, 'users/' + uid + '/fcmToken'))
  } catch {}
}

function obtenirToken() {
  return new Promise((resolve) => {
    let resolu = false
    const fin = (t) => { if (!resolu) { resolu = true; resolve(t || null) } }
    let unreg = () => {}
    PushNotifications.addListener('registration', (t) => { fin(t && t.value); try { unreg() } catch {} })
      .then((r) => { unreg = r.remove })
      .catch(() => {})
    PushNotifications.addListener('registrationError', () => { fin(null); try { unreg() } catch {} }).catch(() => {})
    setTimeout(() => { fin(null); try { unreg() } catch {} }, 12000)
  })
}

// Abonnements événements. Renvoie des fonctions de désabonnement.
export async function surNotificationRecue(cb) {
  if (!pushDisponible()) return () => {}
  try {
    const r = await PushNotifications.addListener('pushNotificationReceived', (n) => cb(n))
    return r.remove
  } catch {
    return () => {}
  }
}

export async function surNotificationTapee(cb) {
  if (!pushDisponible()) return () => {}
  try {
    const r = await PushNotifications.addListener('pushNotificationActionPerformed', (action) => cb(action))
    return r.remove
  } catch {
    return () => {}
  }
}
