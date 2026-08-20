// Configuration Firebase (web) pour les notifications push FCM.
// À renseigner dans .env.local (variables VITE_FIREBASE_*).
// Ces valeurs sont publiques (côté client) : récupérez-les dans la
// console Firebase → Paramètres du projet → Vos applications (Web).
export const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY || '',
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || '',
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || '',
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || '',
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || '',
  appId: import.meta.env.VITE_FIREBASE_APP_ID || '',
}

// Clé VAPID Web (Firebase → Cloud Messaging → Paires de clés VAPID Web).
export const firebaseVapidKey = import.meta.env.VITE_FIREBASE_VAPID_KEY || ''
