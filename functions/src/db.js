// ═══════════════════════════════════════════════════════════════
// Helpers Firebase Admin (Realtime Database) + authentification.
// Les secrets API Flutterwave ne sont JAMAIS exposés au client : tout
// passe par ces fonctions serveur. On vérifie systématiquement que
// l'utilisateur appelant appartient bien au groupe et a le rôle requis.
// ═══════════════════════════════════════════════════════════════
const admin = require('firebase-admin')
const functions = require('firebase-functions/v2')

if (!admin.apps.length) {
  admin.initializeApp()
}
const db = admin.database()

function ref(chemin) {
  return db.ref(chemin)
}

async function lire(chemin) {
  const snap = await ref(chemin).once('value')
  return snap.val()
}

async function ecrire(chemin, valeur) {
  await ref(chemin).set(valeur)
}

async function mettreAJour(chemin, patch) {
  await ref(chemin).update(patch)
}

async function supprimer(chemin) {
  await ref(chemin).remove()
}

async function pousser(chemin, valeur) {
  return ref(chemin).push(valeur)
}

// Rôle d'un utilisateur dans un groupe. Retourne null s'il n'appartient
// pas au groupe. 'responsable' = propriétaire, 'tresorier' = co-gérant,
// 'membre' = membre simple, 'lecteur' = invité lecture seule.
async function roleDansGroupe(code, uid) {
  if (!uid) return null
  const groupe = await lire('tontines/' + encodeURIComponent(String(code)) + '/groupe')
  if (!groupe) return null
  if (groupe.proprietaire === uid) return 'responsable'
  if (groupe.coGerants && groupe.coGerants[uid]) return 'tresorier'
  const membres = Array.isArray(groupe.membres) ? groupe.membres : []
  if (membres.some((m) => m && m.uid === uid)) return 'membre'
  return null
}

// Vérifie le JWT Firebase de l'appelant et renvoie { uid } ou lève une erreur.
async function verifierToken(request) {
  const auth = request.headers.get('authorization') || request.headers.get('Authorization') || ''
  const match = String(auth).match(/^Bearer\s+(.+)$/i)
  if (!match) {
    const e = new Error('Non autorisé : jeton manquant')
    e.code = 401
    throw e
  }
  try {
    const decoded = await admin.auth().verifyIdToken(match[1].trim())
    return { uid: decoded.uid }
  } catch (err) {
    const e = new Error('Non autorisé : jeton invalide')
    e.code = 401
    throw e
  }
}

// Récupère l'email d'un utilisateur (pour créer le compte virtuel Flutterwave).
async function emailUtilisateur(uid) {
  try {
    const u = await admin.auth().getUser(uid)
    if (u && u.email) return u.email
  } catch (_) {}
  const local = await lire('users/' + encodeURIComponent(String(uid)) + '/email')
  return local || null
}

module.exports = {
  admin,
  db,
  ref,
  lire,
  ecrire,
  mettreAJour,
  supprimer,
  pousser,
  roleDansGroupe,
  verifierToken,
  emailUtilisateur,
}
