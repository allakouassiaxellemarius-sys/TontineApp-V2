import { initializeApp, getApps, getApp } from 'firebase/app'
import { getDatabase, ref, set, remove, get, onValue, push } from 'firebase/database'
import { firebaseConfig, firebaseConfigure } from './firebaseConfig'

const BASE = 'tontines'
const DEMANDES = 'demandes'
const MESSAGES_UTILISATEUR = 'messages_utilisateur'
const USERS = 'users'

let app = null
let db = null

function ensure() {
  if (!firebaseConfigure()) return null
  if (!app) app = getApps().length ? getApp() : initializeApp(firebaseConfig)
  if (!db) db = getDatabase(app)
  return db
}

// Publie un snapshot du groupe (responsable → cloud). La clé est le code court.
// Si un uid est fourni, une copie de sauvegarde est aussi écrite sous users/{uid}.
export function publierGroupe(code, data, uid) {
  const f = ensure()
  if (!f) return Promise.reject(new Error('Firebase non configuré'))
  const p = set(ref(f, BASE + '/' + code), data)
  if (uid) {
    p.then(() => set(ref(f, USERS + '/' + uid + '/tontines/' + code), data)).catch(() => {})
  }
  return p
}

// Supprime la donnée cloud (à la désactivation). Si un uid est fourni,
// la copie de sauvegarde sous users/{uid} est aussi supprimée.
export function supprimerDoc(code, uid) {
  const f = ensure()
  if (!f) return Promise.resolve()
  const p = remove(ref(f, BASE + '/' + code))
  if (uid) {
    p.then(() => remove(ref(f, USERS + '/' + uid + '/tontines/' + code))).catch(() => {})
  }
  return p
}

// Lecture unique (invité → cloud) pour rejoindre un groupe par code court.
export async function chargerGroupe(code) {
  const f = ensure()
  if (!f) return null
  const snap = await get(ref(f, BASE + '/' + code))
  return snap.exists() ? snap.val() : null
}

// Abonnement temps réel (invité → cloud). Renvoie la fonction de désabonnement.
export function abonnerGroupe(code, onData, onError) {
  const f = ensure()
  if (!f) return () => {}
  return onValue(
    ref(f, BASE + '/' + code),
    (snap) => { const v = snap.val(); if (v) onData(v) },
    (err) => { onError && onError(err) }
  )
}

// Liste tous les groupes sauvegardés sous le compte users/{uid}/tontines.
export async function chargerSauvegardes(uid) {
  const f = ensure()
  if (!f) return []
  if (!uid) return []
  const snap = await get(ref(f, USERS + '/' + uid + '/tontines'))
  if (!snap.exists()) return []
  const val = snap.val()
  return Object.entries(val).map(([code, data]) => ({ code, data }))
}

// ── Groupes liés au compte Google ──────────────────────────────
// Le registre users/{uid}/groupes/{code} mémorise les groupes qu'un
// utilisateur a rejoints. Connecté à son compte sur un autre appareil,
// il les retrouve et les rejoint en un geste, sans code d'invitation.

// Mémorise un groupe sous le compte (appelé après une jointure réussie).
export function enregistrerGroupeCompte(uid, code, info) {
  const f = ensure()
  if (!f || !uid || !code) return Promise.resolve()
  return set(ref(f, USERS + '/' + uid + '/groupes/' + code), {
    nom: (info && info.nom) || 'Groupe',
    role: (info && info.role) || 'membre',
    majLe: Date.now(),
  })
}

// Retire un groupe du registre du compte.
export function retirerGroupeCompte(uid, code) {
  const f = ensure()
  if (!f || !uid || !code) return Promise.resolve()
  return remove(ref(f, USERS + '/' + uid + '/groupes/' + code))
}

// Liste les groupes mémorisés sous le compte (code, nom, rôle).
export async function chargerGroupesCompte(uid) {
  const f = ensure()
  if (!f || !uid) return []
  const snap = await get(ref(f, USERS + '/' + uid + '/groupes'))
  if (!snap.exists()) return []
  return Object.entries(snap.val()).map(([code, v]) => ({
    code,
    nom: (v && v.nom) || 'Groupe',
    role: (v && v.role) || 'membre',
    majLe: (v && v.majLe) || 0,
  }))
}

// ── Demandes d'inscription (invité → responsable) ──────────────
// Stockées sous demandes/{code}/{id} (hors de tontines/{code} pour ne pas
// être écrasées par la publication du snapshot complet du responsable).

// L'invité s'enregistre auprès du responsable en rejoignant un groupe.
export function envoyerDemande(code, data) {
  const f = ensure()
  if (!f) return Promise.reject(new Error('Firebase non configuré'))
  return push(ref(f, DEMANDES + '/' + code), data)
}

// Le responsable s'abonne aux inscriptions des invités (temps réel).
export function abonnerDemandes(code, onData, onError) {
  const f = ensure()
  if (!f) return () => {}
  return onValue(
    ref(f, DEMANDES + '/' + code),
    (snap) => {
      if (snap.exists()) onData(snap.val())
      else onData(null)
    },
    (err) => { onError && onError(err) }
  )
}

// Le responsable supprime une demande traitée.
export function supprimerDemande(code, id) {
  const f = ensure()
  if (!f) return Promise.resolve()
  return remove(ref(f, DEMANDES + '/' + code + '/' + id))
}

// ── Messages des invités (invité → responsable) ────────────────
// Stockés sous messages_utilisateur/{code}/{id} (hors de tontines/{code} pour
// ne pas être écrasés par la publication du snapshot complet du responsable).
// L'invité écrit son message ici ; le responsable les intègre dans la
// discussion puis les re-publie à tous via le snapshot habituel.

// L'invité poste un message vers le canal du groupe (id déjà généré côté local).
export function publierMessageInvite(code, message) {
  const f = ensure()
  if (!f || !code || !message) return Promise.reject(new Error('Firebase non configuré'))
  const { enAttente, ...data } = message
  return push(ref(f, MESSAGES_UTILISATEUR + '/' + code), data)
}

// Le responsable s'abonne aux messages des invités (temps réel).
export function abonnerMessagesInvites(code, onData, onError) {
  const f = ensure()
  if (!f) return () => {}
  return onValue(
    ref(f, MESSAGES_UTILISATEUR + '/' + code),
    (snap) => {
      if (snap.exists()) onData(snap.val())
      else onData(null)
    },
    (err) => { onError && onError(err) }
  )
}

// Le responsable supprime un message d'invité intégré dans la discussion.
export function supprimerMessageInvite(code, id) {
  const f = ensure()
  if (!f) return Promise.resolve()
  return remove(ref(f, MESSAGES_UTILISATEUR + '/' + code + '/' + id))
}

// Supprime la sauvegarde d'un groupe donné sous users/{uid}/tontines.
export function supprimerSauvegarde(uid, code) {
  const f = ensure()
  if (!f) return Promise.resolve()
  return remove(ref(f, USERS + '/' + uid + '/tontines/' + code))
}
