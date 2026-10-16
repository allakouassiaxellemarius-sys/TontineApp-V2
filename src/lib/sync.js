// ═══════════════════════════════════════════════════════════════
// Synchronisation cloud — client du Worker tontine-sync
// ---------------------------------------------------------------
// Remplace Firebase Realtime Database. Les signatures sont conservées
// pour limiter les changements dans le reste de l'app. Le temps réel
// est obtenu par sondage (poll) côté client.
// ═══════════════════════════════════════════════════════════════
import { cloudRequest, poll } from './cloudApi'

const BASE = 'tontines'
const ADHESION = 'adhesion'
const DEMANDES = 'demandes'
const MESSAGES_UTILISATEUR = 'messages_utilisateur'
const USERS = 'users'
const PAIEMENTS = 'paiements'
const PAIEMENTS_INVITE = 'paiements_invite'

function mapEntrees(obj) {
  if (!obj) return []
  return Object.entries(obj).map(([code, data]) => ({ code, data }))
}

// Publie un snapshot du groupe (responsable → cloud).
export function publierGroupe(code, data, uid) {
  return cloudRequest('PUT', BASE + '/' + code, data)
}

// Supprime la donnée cloud.
export function supprimerDoc(code, uid) {
  return cloudRequest('DELETE', BASE + '/' + code)
}

// Lecture unique du snapshot complet — réservé aux membres et aux adhérents
// enregistrés côté serveur. Un simple porteur du code passe par adhererGroupe.
export async function chargerGroupe(code) {
  return (await cloudRequest('GET', BASE + '/' + code)) || null
}

// Fiche d'identité d'un groupe par son code d'invitation, consultable avant
// d'adhérer : ni membres, ni contacts, ni montant dû par quelqu'un.
export async function chargerFicheGroupe(code) {
  return (await cloudRequest('GET', ADHESION + '/' + encodeURIComponent(String(code)))) || null
}

// L'acte de rejoindre : le serveur enregistre l'uid comme adhérent (seule
// chose qui lui donne ensuite le droit de relire le snapshot), prévient le
// responsable par le canal des demandes et renvoie le snapshot complet.
// Réponse : snapshot + champ adhesion { dejaAdherent, demandeId }.
export async function adhererGroupe(code, inscription) {
  return (await cloudRequest('POST', ADHESION + '/' + encodeURIComponent(String(code)), inscription || {})) || null
}

// Abonnement temps réel (invité → cloud) ; renvoie la fonction de désabonnement.
export function abonnerGroupe(code, onData, onError) {
  return poll(BASE + '/' + code, (v) => onData(v || null), onError)
}

// Liste tous les groupes sauvegardés sous le compte users/{uid}/tontines.
export async function chargerSauvegardes(uid) {
  return mapEntrees(await cloudRequest('GET', USERS + '/' + uid + '/tontines'))
}

// ── Groupes liés au compte ──────────────────────────────────────
export function enregistrerGroupeCompte(uid, code, info) {
  return cloudRequest('PUT', USERS + '/' + uid + '/groupes/' + code, info)
}
export function retirerGroupeCompte(uid, code) {
  return cloudRequest('DELETE', USERS + '/' + uid + '/groupes/' + code)
}
export async function chargerGroupesCompte(uid) {
  const obj = await cloudRequest('GET', USERS + '/' + uid + '/groupes')
  if (!obj) return []
  return Object.entries(obj).map(([code, v]) => ({
    code,
    nom: (v && v.nom) || 'Groupe',
    role: (v && v.role) || 'membre',
    majLe: (v && v.majLe) || 0,
  }))
}

// ── Explorer (groupes publics) ─────────────────────────────────
export async function chargerGroupesPublics() {
  return (await cloudRequest('GET', 'explorer')) || []
}

// ── Demandes d'inscription (invité → responsable) ──────────────
export async function envoyerDemande(code, data) {
  const res = await cloudRequest('POST', DEMANDES + '/' + code, data)
  return res && res.id
}
export function abonnerDemandes(code, onData, onError) {
  return poll(DEMANDES + '/' + code, (v) => onData(v || null), onError)
}
export function supprimerDemande(code, id) {
  return cloudRequest('DELETE', DEMANDES + '/' + code + '/' + id)
}

// ── Messages des invités (invité → responsable) ────────────────
export async function publierMessageInvite(code, message) {
  const { enAttente, ...data } = message
  const res = await cloudRequest('POST', MESSAGES_UTILISATEUR + '/' + code, data)
  return res && res.id
}
export function abonnerMessagesInvites(code, onData, onError) {
  return poll(MESSAGES_UTILISATEUR + '/' + code, (v) => onData(v || null), onError)
}
export function supprimerMessageInvite(code, id) {
  return cloudRequest('DELETE', MESSAGES_UTILISATEUR + '/' + code + '/' + id)
}

// ── Accusés de lecture de la discussion ───────────────────────
// Chaque participant publie son pointeur (le dernier message qu'il a vu) ;
// n'importe quel participant peut lire ceux du groupe.
export function publierLecture(code, pointeur) {
  return cloudRequest('PUT', 'lectures/' + code, pointeur)
}
export function chargerLectures(code) {
  return cloudRequest('GET', 'lectures/' + code)
}

// ── Photos de la discussion ───────────────────────────────────
// Une balise <img> ne peut pas porter l'en-tête d'auth : le worker renvoie donc
// du base64 en JSON et l'appareil fabrique son data: URL (vus par media.js).
export function televerserMedia(code, id, type, data) {
  return cloudRequest('PUT', 'media/' + code + '/' + id, { type, data })
}
export function chargerMedia(code, id) {
  return cloudRequest('GET', 'media/' + code + '/' + id)
}

// Push d'un nouveau message de discussion. Le worker vérifie que l'émetteur
// fait partie du groupe avant de diffuser : la preuve d'identité est le jeton
// de session, plus un secret embarqué dans l'APK.
export function notifierDiscussion(code, message) {
  return cloudRequest('POST', 'notifier/' + encodeURIComponent(String(code)), message)
}

// ── Paiements intégrés (écrits par le worker) ─────────────────
export function abonnerPaiements(code, onData, onError) {
  return poll(PAIEMENTS + '/' + code, (v) => onData(v || null), onError)
}
export function supprimerPaiement(code, transactionId) {
  return cloudRequest('DELETE', PAIEMENTS + '/' + code + '/' + transactionId)
}

// ── Paiements signalés par les membres (membre → responsable) ──
export function publierPaiementInvite(code, paiement) {
  if (!paiement || !paiement.id) return Promise.reject(new Error('id manquant'))
  return cloudRequest('PUT', PAIEMENTS_INVITE + '/' + code + '/' + paiement.id, paiement)
}
export function abonnerPaiementsInvites(code, onData, onError) {
  return poll(PAIEMENTS_INVITE + '/' + code, (v) => onData(v || null), onError)
}
export function supprimerPaiementInvite(code, id) {
  return cloudRequest('DELETE', PAIEMENTS_INVITE + '/' + code + '/' + id)
}

// ── Sauvegardes (compte) ──────────────────────────────────────
export function supprimerSauvegarde(uid, code) {
  return cloudRequest('DELETE', USERS + '/' + uid + '/tontines/' + code)
}
export function publierSauvegardePrivee(uid, sauvegardeUid, data) {
  return cloudRequest('PUT', USERS + '/' + uid + '/sauvegardes/' + sauvegardeUid, data)
}
export async function chargerSauvegardesPrivees(uid) {
  const obj = await cloudRequest('GET', USERS + '/' + uid + '/sauvegardes')
  if (!obj) return []
  return Object.entries(obj).map(([sauvegardeUid, data]) => ({ sauvegardeUid, data }))
}
export function supprimerSauvegardePrivee(uid, sauvegardeUid) {
  return cloudRequest('DELETE', USERS + '/' + uid + '/sauvegardes/' + sauvegardeUid)
}
