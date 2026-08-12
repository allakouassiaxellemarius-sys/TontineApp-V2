// ═══════════════════════════════════════════════════════════════
// Boîte de réception des notifications
// ---------------------------------------------------------------
// Historique local (localStorage) des notifications reçues sur
// l'appareil : push FCM, rappels locaux, test… Permet de consulter
// les messages même si on les a manqués dans la barre système.
// ═══════════════════════════════════════════════════════════════
import { getGroups } from './db'

const CLE = 'tontine_inbox'
const MAX = 100

export function lireInbox() {
  try {
    const raw = localStorage.getItem(CLE)
    const liste = raw ? JSON.parse(raw) : []
    return Array.isArray(liste) ? liste : []
  } catch {
    return []
  }
}

function ecrire(liste) {
  try {
    localStorage.setItem(CLE, JSON.stringify(liste.slice(0, MAX)))
  } catch {}
}

// Ajoute une notification. L'identifiant stable évite les doublons
// (ex. même push reçue au premier plan puis tapée).
export function ajouterNotification(n) {
  if (!n || !n.titre) return
  const id = n.id || Date.now().toString(36) + Math.random().toString(36).slice(2, 7)
  const cleId = `${n.type || 'notif'}:${id}`
  const liste = lireInbox()
  if (liste.some((x) => x.cleId === cleId)) return liste
  const notif = {
    cleId,
    id,
    type: n.type || 'notif',
    titre: n.titre,
    corps: n.corps || '',
    date: n.date || Date.now(),
    lu: false,
    code: n.code || null,
    groupeId: n.groupeId || null,
  }
  const next = [notif, ...liste]
  ecrire(next)
  return next
}

export function marquerLue(cleId) {
  ecrire(lireInbox().map((x) => (x.cleId === cleId ? { ...x, lu: true } : x)))
}

export function marquerToutesLues() {
  ecrire(lireInbox().map((x) => ({ ...x, lu: true })))
}

export function supprimerNotification(cleId) {
  ecrire(lireInbox().filter((x) => x.cleId !== cleId))
}

export function viderInbox() {
  ecrire([])
}

export function nbNonLues() {
  return lireInbox().filter((x) => !x.lu).length
}

// Cherche le groupe concerné par une notification (par code d'invitation
// ou par identifiant local) pour proposer une ouverture directe.
export function groupePourNotification(n) {
  if (!n) return null
  if (n.groupeId) {
    const g = getGroups().find((x) => String(x.id) === String(n.groupeId))
    if (g) return g
  }
  if (n.code) {
    return getGroups().find((g) => g.codeUnique && g.codeUnique === n.code) || null
  }
  return null
}

// Formate un titre/corps de notification système en entrée inbox.
export function depuisNotificationSysteme(n, type) {
  if (!n) return null
  const titre = (n && (n.title || n.titre)) || 'Notification'
  const corps = (n && (n.body || n.corps || n.texte)) || ''
  const data = (n && n.data) || {}
  return {
    type: (data && data.type) || type || 'notif',
    titre,
    corps,
    date: Date.now(),
    code: data.code || null,
    groupeId: data.groupeId != null ? String(data.groupeId) : null,
  }
}
