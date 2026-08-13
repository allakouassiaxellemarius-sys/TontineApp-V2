// ═══════════════════════════════════════════════════════════════
// Configuration Firebase — À REMPLIR par vous
// ---------------------------------------------------------------
// Console Firebase (https://console.firebase.google.com) →
//   1. Créez un projet (déjà fait : tontine-manager-f3965)
//   2. Console → Project settings → « Vos applications » → Web (`</>`)
//   3. Copiez la configuration du SDK (les 6 champs + databaseURL)
//   4. Collez-les ci-dessous.
//   5. Base de données : on utilise la REALTIME DATABASE
//      (Build → Realtime Database, déjà créée : tontine-manager-f3965-default-rtdb)
//   6. Règles Realtime Database (onglet « Règles ») : déployez le contenu
//      du fichier database.rules.json du projet (l'écriture est réservée au
//      responsable de chaque tontine ; l'ajout d'une demande ou d'un message
//      d'invité exige un utilisateur authentifié).
//      NB : le nœud "demandes" est utilisé pour enregistrer l'invité auprès du
//      responsable quand il rejoint un groupe (inscription automatique).
//
// NB : apiKey côté client n'est PAS un secret, c'est la config standard web.
// Tant que apiKey ou projectId ou databaseURL est vide, la synchro est
// désactivée et l'app fonctionne en mode 100 % local.
// ═══════════════════════════════════════════════════════════════
export const firebaseConfig = {
  apiKey: 'AIzaSyAGIQQRvuZES8_aNGWMC-uZOlKPvtXyh18',
  authDomain: 'tontine-manager-f3965.firebaseapp.com',
  databaseURL: 'https://tontine-manager-f3965-default-rtdb.firebaseio.com',
  projectId: 'tontine-manager-f3965',
  storageBucket: 'tontine-manager-f3965.firebasestorage.app',
  messagingSenderId: '793106571941',
  appId: '1:793106571941:web:9438f981b91bf568d7e34c',
}

export function firebaseConfigure() {
  return !!(firebaseConfig.apiKey && firebaseConfig.projectId && firebaseConfig.appId && firebaseConfig.databaseURL)
}

// URL de base des Cloud Functions (backend Flutterwave). À ajuster après
// déploiement : firebase functions:log / console → URL du trigger.
// Format : https://<region>-<projectId>.cloudflare... non, .cloudfunctions.net
export const functionsUrl = 'https://us-central1-tontine-manager-f3965.cloudfunctions.net'
