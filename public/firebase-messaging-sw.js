// Service worker FCM (web push).
// Reçoit la configuration Firebase via postMessage depuis l'application
// (src/lib/firebase.js), puis affiche les notifications reçues en arrière-plan.
importScripts('https://www.gstatic.com/firebasejs/12.0.0/firebase-app-compat.js')
importScripts('https://www.gstatic.com/firebasejs/12.0.0/firebase-messaging-compat.js')

let messaging = null

self.addEventListener('message', (event) => {
  const data = event.data || {}
  if (data.type === 'FIREBASE_CONFIG' && data.config) {
    if (!messaging) {
      firebase.initializeApp(data.config)
      messaging = firebase.messaging()
      messaging.onBackgroundMessage((payload) => {
        const n = (payload && payload.notification) || {}
        self.registration.showNotification(n.title || 'Tontine', {
          body: n.body || '',
          data: payload && payload.data ? payload.data : {},
          icon: '/logo-192.png',
        })
      })
    }
  }
})

// Empêche l'arrêt prématuré du SW avant initialisation (sécurité).
self.addEventListener('push', () => {})
