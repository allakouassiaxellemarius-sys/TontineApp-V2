// Initialisation Firebase (web) pour les notifications push FCM.
// La config provient de ./firebaseConfig (VITE_FIREBASE_*). Le service worker
// (public/firebase-messaging-sw.js) reçoit la config via postMessage depuis ici.
import { initializeApp } from 'firebase/app'
import { getMessaging, getToken, onMessage } from 'firebase/messaging'
import { firebaseConfig, firebaseVapidKey } from './firebaseConfig'

export function firebaseWebDisponible() {
  return Boolean(
    firebaseConfig.apiKey &&
    firebaseConfig.projectId &&
    firebaseVapidKey &&
    typeof navigator !== 'undefined' &&
    'serviceWorker' in navigator &&
    'Notification' in window
  )
}

let messagingPromise = null

async function getMessagingInstance() {
  if (!firebaseWebDisponible()) return null
  if (messagingPromise) return messagingPromise
  messagingPromise = (async () => {
    const app = initializeApp(firebaseConfig)
    const messaging = getMessaging(app)
    const postConfig = (reg) => {
      const c = reg && (reg.active || reg.waiting)
      if (c) c.postMessage({ type: 'FIREBASE_CONFIG', config: { ...firebaseConfig, vapidKey: firebaseVapidKey } })
    }
    try {
      const reg = await navigator.serviceWorker.register('/firebase-messaging-sw.js')
      postConfig(reg)
      reg.addEventListener('updatefound', () => {
        const sw = reg.installing
        if (sw) sw.addEventListener('statechange', () => { if (sw.state === 'activated') postConfig(reg) })
      })
      navigator.serviceWorker.ready.then((r) => postConfig(r)).catch(() => {})
    } catch { /* le SW est optionnel pour le premier plan */ }
    return messaging
  })()
  return messagingPromise
}

// Demande l'autorisation et renvoie le token FCM web (null si refusé/indisponible).
export async function obtenirTokenWeb() {
  if (!firebaseWebDisponible()) return null
  try {
    const permission = await Notification.requestPermission()
    if (permission !== 'granted') return null
    const messaging = await getMessagingInstance()
    if (!messaging) return null
    const token = await getToken(messaging, { vapidKey: firebaseVapidKey })
    return token || null
  } catch {
    return null
  }
}

// Écoute les messages reçus en premier plan (app ouverte). Renvoie un désabonnement.
export function surMessagePremierPlan(cb) {
  if (!firebaseWebDisponible()) return () => {}
  let unsub = () => {}
  getMessagingInstance().then((m) => {
    if (!m) return
    unsub = onMessage(m, (payload) => {
      const n = (payload && payload.notification) || {}
      cb({ titre: n.title || 'Tontine', corps: n.body || '', data: payload && payload.data })
    })
  }).catch(() => {})
  return () => { try { unsub() } catch { /* noop */ } }
}
