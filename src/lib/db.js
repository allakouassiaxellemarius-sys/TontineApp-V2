import { storage, nextId, todayStr, addDays, dateISO, nowIso } from './storage.js'
import { getSettings } from './format.js'
import { calculerPenalite, penaliteEstimee } from './penalty.js'
import { estLectureSeule } from './lectureSeule.js'

const K_GROUPS = 'groups'
const K_MEMBRES = 'membres'
const K_TOURS = 'tours'
const K_COTIS = 'cotisations'
const K_PRETS = 'prets'

// Hors ligne = lecture seule : toutes les modifications sont bloquées.
// Ne dépend que de la décision explicite de l'utilisateur (mode hors ligne
// accepté), jamais de navigator.onLine qui peut être faussement à false
// dans certaines WebViews Android malgré une connexion Internet active.
function horsLigne() {
  return estLectureSeule()
}

// ── Journal d'activité du groupe ──────────────────────────────
// Trace chaque action notable dans group.journal (gardé sur 120 entrées).
export function ajouterAuJournal(groupeId, action, libelle) {
  const groups = getGroups()
  const idx = groups.findIndex((g) => g.id === Number(groupeId))
  if (idx === -1) return
  const g = groups[idx]
  if (g.rejoint) return
  const entree = { id: nextId(g.journal || []), date: nowIso(), action, libelle }
  groups[idx] = { ...g, journal: [...(g.journal || []), entree].slice(-120) }
  storage.save(K_GROUPS, groups)
}

// ── Annonces de l'administrateur ──────────────────────────────
export function publierAnnonce(groupeId, texte, auteur) {
  const g = getGroup(groupeId)
  if (!g || g.rejoint || horsLigne()) return null
  const annonce = {
    id: nextId(g.annonces || []),
    texte: (texte || '').trim(),
    auteur: (auteur || '').trim() || 'Responsable',
    date: nowIso(),
  }
  if (!annonce.texte) return null
  updateGroup(groupeId, { annonces: [...(g.annonces || []), annonce].slice(-50) })
  ajouterAuJournal(groupeId, 'annonce', `Annonce publiée : « ${annonce.texte.slice(0, 60)}${annonce.texte.length > 60 ? '…' : ''} »`)
  return annonce
}
export function supprimerAnnonce(groupeId, annonceId) {
  const g = getGroup(groupeId)
  if (!g || g.rejoint || horsLigne()) return
  updateGroup(groupeId, { annonces: (g.annonces || []).filter((a) => a.id !== Number(annonceId)) })
}

// ── Discussion de groupe ─────────────────────────────────────
// Tous les membres peuvent écrire ; le responsable partage la discussion
// avec les invités via la synchronisation existante.
export function envoyerMessage(groupeId, texte, auteur, uid, email) {
  const g = getGroup(groupeId)
  if (!g || horsLigne()) return null
  const message = {
    id: nextId(g.messages || []),
    texte: (texte || '').trim(),
    auteur: (auteur || '').trim() || 'Membre',
    uid: uid || null,
    email: email || null,
    date: nowIso(),
  }
  if (!message.texte) return null
  updateGroup(groupeId, { messages: [...(g.messages || []), message].slice(-200) })
  return message
}
export function supprimerMessage(groupeId, messageId) {
  const g = getGroup(groupeId)
  if (!g || horsLigne()) return
  updateGroup(groupeId, { messages: (g.messages || []).filter((m) => m.id !== Number(messageId)) })
}

// Invité : poste un message vers le responsable (canal messages_utilisateur).
// Le message est d'abord affiché localement (pendingMessages) jusqu'à ce que
// le responsable l'intègre à la discussion et le re-publie — le snapshot
// reçu fait alors disparaître l'entrée en attente.
export function envoyerMessageInvite(groupeId, texte, auteur, uid, email) {
  const g = getGroup(groupeId)
  if (!g || !g.rejoint || horsLigne()) return null
  const t = (texte || '').trim()
  if (!t) return null
  const message = {
    id: 'inv-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8),
    texte: t,
    auteur: (auteur || '').trim() || 'Membre',
    uid: uid || null,
    email: email || null,
    date: nowIso(),
    enAttente: true,
  }
  storage.save(K_GROUPS, getGroups().map((x) =>
    x.id === Number(groupeId)
      ? { ...x, pendingMessages: [...(x.pendingMessages || []), message].slice(-200) }
      : x
  ))
  return message
}

// Responsable : intègre dans la discussion un message envoyé par un invité
// (via le canal messages_utilisateur). L'id de l'invité est conservé pour que
// sa copie locale reconnaisse l'accusé de réception. Renvoie le message,
// 'deja' si déjà présent, ou null si impossible (lecture seule / hors ligne).
export function integrerMessage(groupeId, m) {
  const g = getGroup(groupeId)
  if (!g || g.rejoint || horsLigne() || !m || !m.texte) return null
  const id = m.id || ('inv-' + Date.now())
  if ((g.messages || []).some((x) => String(x.id) === String(id))) return 'deja'
  const message = {
    id,
    texte: (m.texte || '').trim(),
    auteur: (m.auteur || '').trim() || 'Membre',
    uid: m.uid || null,
    email: m.email || null,
    date: m.date || nowIso(),
  }
  updateGroup(groupeId, { messages: [...(g.messages || []), message].slice(-200) })
  return message
}

// ── Groupes ──────────────────────────────────────────────────
export function getGroups() {
  return storage.load(K_GROUPS, [])
}
export function getGroup(id) {
  return getGroups().find((g) => g.id === Number(id)) || null
}
function estRejoint(groupeId) {
  const g = getGroup(groupeId)
  return !!(g && g.rejoint)
}
export function createGroup(data) {
  if (horsLigne()) return null
  const s = getSettings()
  const groups = getGroups()
  const group = {
    id: nextId(groups),
    nom: (data.nom || '').trim() || 'Ma tontine',
    deviseSymbole: data.deviseSymbole || s.deviseSymbole,
    devisePosition: data.devisePosition || s.devisePosition,
    montantCotisation: Number(data.montantCotisation) || 0,
    periodeJours: Number(data.periodeJours) || 7,
    leReceveurCotonise: data.leReceveurCotonise !== false,
    penalitePctParJour: Number(data.penalitePctParJour) || 0,
    penalitePlafond: Number(data.penalitePlafond) || 0,
    moyensPaiement: Array.isArray(data.moyensPaiement) && data.moyensPaiement.length ? data.moyensPaiement : ['Espèces'],
    membresMin: data.membresMin != null ? Number(data.membresMin) : 0,
    membresMax: data.membresMax != null ? Number(data.membresMax) : 0,
    statut: 'active',
    dateDebut: data.dateDebut || todayStr(),
    dateCreation: new Date().toISOString(),
    journal: [],
    annonces: [],
  }
  groups.push(group)
  storage.save(K_GROUPS, groups)
  ajouterAuJournal(group.id, 'creation', `La tontine « ${group.nom} » a été créée`)
  return group
}
export function updateGroup(id, patch) {
  if (horsLigne()) return null
  const groups = getGroups()
  const idx = groups.findIndex((g) => g.id === Number(id))
  if (idx === -1) return null
  if (groups[idx].rejoint) return null
  groups[idx] = { ...groups[idx], ...patch, id: groups[idx].id }
  storage.save(K_GROUPS, groups)
  return groups[idx]
}
export function deleteGroup(id) {
  const idn = Number(id)
  if (horsLigne()) return
  // Un groupe rejoint n'est qu'une copie locale en lecture seule : on peut la
  // retirer sans affecter le responsable ni le cloud (il reste joignable par code).
  storage.save(K_GROUPS, getGroups().filter((g) => g.id !== idn))
  storage.save(K_MEMBRES, getMembresRaw().filter((m) => m.groupeId !== idn))
  storage.save(K_TOURS, getToursRaw().filter((t) => t.groupeId !== idn))
  storage.save(K_COTIS, getCotisationsRaw().filter((c) => c.groupeId !== idn))
  storage.save(K_PRETS, getPretsRaw().filter((p) => p.groupeId !== idn))
}
export function terminerGroup(id, termine = true) {
  return updateGroup(id, { statut: termine ? 'terminee' : 'active' })
}

// ── Partage / Rejoindre un groupe ─────────────────────────────
function nouveauCodeUnique() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  let code = ''
  for (let i = 0; i < 6; i++) code += chars[Math.floor(Math.random() * chars.length)]
  return code
}
export function ensureCodeUnique(groupeId) {
  const g = getGroup(groupeId)
  if (!g) return null
  if (!g.codeUnique) {
    let code = nouveauCodeUnique()
    while (getGroups().some((x) => x.codeUnique === code)) code = nouveauCodeUnique()
    updateGroup(groupeId, { codeUnique: code })
    return code
  }
  return g.codeUnique
}
// Invité : crée la copie locale d'un groupe à partir d'un snapshot téléchargé
// depuis le cloud (format 2). Renvoie le groupe, ou null s'il est déjà présent.
export function rejoindreDepuisSnapshot(snapshot, opts = {}) {
  const src = (snapshot && snapshot.groupe) || {}
  const codeUnique = (src.codeUnique || '').trim().toUpperCase()
  if (!codeUnique) return null
  if (getGroups().some((x) => x.codeUnique && x.codeUnique === codeUnique)) return null

  const groupes = getGroups()
  const groupId = nextId(groupes)
  const groupe = {
    id: groupId,
    nom: (src.nom || '').trim() || 'Groupe rejoint',
    deviseSymbole: src.deviseSymbole || 'FCFA',
    devisePosition: src.devisePosition || 'after',
    montantCotisation: Number(src.montantCotisation) || 0,
    periodeJours: Number(src.periodeJours) || 7,
    leReceveurCotonise: src.leReceveurCotonise !== false,
    penalitePctParJour: Number(src.penalitePctParJour) || 0,
    penalitePlafond: Number(src.penalitePlafond) || 0,
    moyensPaiement: Array.isArray(src.moyensPaiement) && src.moyensPaiement.length ? src.moyensPaiement : ['Espèces'],
    membresMin: Number(src.membresMin || 0),
    membresMax: Number(src.membresMax || 0),
    statut: src.statut === 'terminee' ? 'terminee' : 'active',
    dateDebut: src.dateDebut || todayStr(),
    dateCreation: new Date().toISOString(),
    codeUnique,
    synchronise: true,
    proprietaire: src.proprietaire || null,
    rejoint: opts.rejoint !== false,
    rejointLe: opts.rejoint === false ? null : todayStr(),
    majLe: snapshot.majLe || Date.now(),
    journal: Array.isArray(src.journal) ? src.journal : [],
    annonces: Array.isArray(src.annonces) ? src.annonces : [],
    messages: Array.isArray(src.messages) ? src.messages : [],
  }
  groupes.push(groupe)

  const membreMap = {}
  let prochainMembre = nextId(getMembresRaw())
  const membres = (snapshot.membres || []).map((m) => {
    const id = prochainMembre++
    membreMap[Number(m.id)] = id
    return {
      id,
      groupeId: groupId,
      nom: (m.nom || '').trim(),
      telephone: (m.telephone || '').trim(),
      email: (m.email || '').trim(),
      uid: m.uid || null,
      role: m.role || 'membre',
      bloque: !!m.bloque,
      dateAdhesion: m.dateAdhesion || todayStr(),
      dateCreation: m.dateCreation || new Date().toISOString(),
    }
  })
  groupe.ordreTire = (Array.isArray(src.ordreTire) ? src.ordreTire : [])
    .map((id) => membreMap[Number(id)])
    .filter((id) => id != null)

  const tourMap = {}
  let prochainTour = nextId(getToursRaw())
  const tours = (snapshot.tours || []).map((t) => {
    const id = prochainTour++
    tourMap[Number(t.id)] = id
    return {
      id,
      groupeId: groupId,
      numero: Number(t.numero) || 0,
      membreId: t.membreId != null ? (membreMap[Number(t.membreId)] ?? null) : null,
      datePrevue: t.datePrevue || todayStr(),
      montantPot: Number(t.montantPot) || 0,
      statut: ['en_attente', 'recu', 'annule'].includes(t.statut) ? t.statut : 'en_attente',
      dateReception: t.dateReception || null,
    }
  })

  let prochainCotis = nextId(getCotisationsRaw())
  const cotisations = (snapshot.cotisations || []).map((c) => ({
    id: prochainCotis++,
    groupeId: groupId,
    tourId: c.tourId != null ? (tourMap[Number(c.tourId)] ?? null) : null,
    membreId: c.membreId != null ? (membreMap[Number(c.membreId)] ?? null) : null,
    montant: Number(c.montant) || 0,
    datePaiement: c.datePaiement || todayStr(),
    statut: c.statut === 'paye' ? 'paye' : 'en_attente',
    penalite: Number(c.penalite) || 0,
    moyenPaiement: c.moyenPaiement || '',
  }))

  let prochainPret = nextId(getPretsRaw())
  const prets = (snapshot.prets || []).map((p) => ({
    id: prochainPret++,
    groupeId: groupId,
    emprunteurId: p.emprunteurId != null ? (membreMap[Number(p.emprunteurId)] ?? null) : null,
    montant: Number(p.montant) || 0,
    tauxInteret: Number(p.tauxInteret) || 0,
    dateEcheance: p.dateEcheance || todayStr(),
    dateCreation: p.dateCreation || new Date().toISOString(),
    note: p.note || '',
    statut: p.statut === 'rembourse' ? 'rembourse' : 'en_cours',
    remboursements: Array.isArray(p.remboursements) ? p.remboursements : [],
  }))

  storage.save(K_MEMBRES, [...getMembresRaw(), ...membres])
  storage.save(K_TOURS, [...getToursRaw(), ...tours])
  storage.save(K_COTIS, [...getCotisationsRaw(), ...cotisations])
  storage.save(K_PRETS, [...getPretsRaw(), ...prets])
  storage.save(K_GROUPS, groupes)

  return groupe
}

// ── Membres ──────────────────────────────────────────────────
function getMembresRaw() {
  return storage.load(K_MEMBRES, [])
}
export function getMembres(groupeId) {
  return getMembresRaw()
    .filter((m) => m.groupeId === Number(groupeId))
    .sort((a, b) => a.id - b.id)
}
export function getMembre(id) {
  return getMembresRaw().find((m) => m.id === Number(id)) || null
}
export function addMembre(groupeId, data) {
  if (estRejoint(groupeId) || horsLigne()) return null
  const membres = getMembresRaw()
  const groupe = getGroup(groupeId)
  const max = groupe && Number(groupe.membresMax || 0)
  if (max > 0 && getMembres(groupeId).length >= max) return null
  const membre = {
    id: nextId(membres),
    groupeId: Number(groupeId),
    nom: (data.nom || '').trim(),
    telephone: (data.telephone || '').trim(),
    email: (data.email || '').trim(),
    uid: data.uid || null,
    role: data.role || 'membre',
    bloque: !!data.bloque,
    dateAdhesion: data.dateAdhesion || todayStr(),
    dateCreation: new Date().toISOString(),
  }
  membres.push(membre)
  storage.save(K_MEMBRES, membres)
  ajouterAuJournal(groupeId, 'membre_ajoute', `${membre.nom} a rejoint la tontine`)
  return membre
}
// Inscription d'un invité qui rejoint : l'ajoute comme membre (déduplication
// par uid si présent, sinon par email/téléphone). Renvoie le membre créé ou
// null si le groupe est en lecture seule / hors ligne / déjà membre.
export function accepterInscription(groupeId, data) {
  if (estRejoint(groupeId) || horsLigne()) return null
  const uid = data.uid || null
  const tel = (data.telephone || '').trim().replace(/[^\d]/g, '')
  const email = (data.email || '').trim().toLowerCase()
  const deja = getMembres(groupeId).some((m) =>
    (uid && m.uid && m.uid === uid) ||
    (email && m.email && m.email.toLowerCase() === email) ||
    (tel && m.telephone && m.telephone.replace(/[^\d]/g, '') === tel)
  )
  if (deja) return null
  return addMembre(groupeId, data)
}
export function updateMembre(id, patch) {
  if (horsLigne()) return null
  const membres = getMembresRaw()
  const idx = membres.findIndex((m) => m.id === Number(id))
  if (idx === -1) return null
  if (membres[idx].groupeId != null && estRejoint(membres[idx].groupeId)) return null
  const avant = membres[idx]
  membres[idx] = { ...avant, ...patch, id: membres[idx].id }
  storage.save(K_MEMBRES, membres)
  if (membres[idx].bloque) retirerDeOrdreTire(membres[idx].groupeId, membres[idx].id)
  if (!avant.bloque && membres[idx].bloque) {
    ajouterAuJournal(membres[idx].groupeId, 'membre_bloque', `${membres[idx].nom} a été bloqué`)
  } else if (avant.bloque && !membres[idx].bloque) {
    ajouterAuJournal(membres[idx].groupeId, 'membre_debloque', `${membres[idx].nom} a été débloqué`)
  } else if (patch.role && patch.role !== avant.role) {
    const libelleRole = { tresorier: 'trésorier(ère)', 'co-responsable': 'co-responsable' }[patch.role] || 'membre'
    const libelleAvant = { tresorier: 'trésorier(ère)', 'co-responsable': 'co-responsable' }[avant.role] || 'membre'
    ajouterAuJournal(
      membres[idx].groupeId,
      'role',
      patch.role === 'membre'
        ? `${membres[idx].nom} repasse ${libelleAvant === 'membre' ? 'au rang de membre' : 'membre'}`
        : `${membres[idx].nom} est nommé(e) ${libelleRole}`
    )
  }
  return membres[idx]
}
export function deleteMembre(id) {
  const idn = Number(id)
  if (horsLigne()) return
  const m = getMembre(idn)
  if (m && estRejoint(m.groupeId)) return
  storage.save(K_MEMBRES, getMembresRaw().filter((m) => m.id !== idn))
  const tours = getToursRaw().filter((t) => t.membreId === idn)
  const tourIds = tours.map((t) => t.id)
  storage.save(K_TOURS, getToursRaw().filter((t) => t.membreId !== idn))
  storage.save(K_COTIS, getCotisationsRaw().filter((c) => !tourIds.includes(c.tourId)))
  if (m) {
    retirerDeOrdreTire(m.groupeId, idn)
    ajouterAuJournal(m.groupeId, 'membre_supprime', `${m.nom} a été retiré(e) de la tontine`)
  }
}
// Purge un membre de l'ordre de passage tiré au sort (membre supprimé ou bloqué).
function retirerDeOrdreTire(groupeId, membreId) {
  const groupes = getGroups()
  const idx = groupes.findIndex((g) => g.id === Number(groupeId))
  if (idx === -1) return
  const g = groupes[idx]
  if (!Array.isArray(g.ordreTire)) return
  const ordreTire = g.ordreTire.filter((x) => Number(x) !== Number(membreId))
  groupes[idx] = { ...g, ordreTire }
  storage.save(K_GROUPS, groupes)
}
export function toggleBloque(id) {
  const m = getMembre(id)
  if (m) return updateMembre(id, { bloque: !m.bloque })
  return null
}

// ── Tours ────────────────────────────────────────────────────
function getToursRaw() {
  return storage.load(K_TOURS, [])
}
export function getTours(groupeId) {
  return getToursRaw()
    .filter((t) => t.groupeId === Number(groupeId))
    .sort((a, b) => a.numero - b.numero)
}
export function getToursAvecMembre(groupeId) {
  const membres = getMembres(groupeId)
  const group = getGroup(groupeId)
  return getTours(groupeId).map((t) => {
    const membre = membres.find((m) => m.id === t.membreId) || null
    const pot = calculerPot(group, membres)
    return { ...t, membre, montantPot: t.montantPot || pot }
  })
}
export function calculerPot(group, membres) {
  if (!group) return 0
  const actifs = membres.filter((m) => !m.bloque)
  const n = group.leReceveurCotonise ? actifs.length : Math.max(actifs.length - 1, 0)
  return n * Number(group.montantCotisation || 0)
}
export function membreSansTour(membres, tours) {
  const tourMembreIds = new Set(tours.map((t) => t.membreId))
  return membres.filter((m) => !tourMembreIds.has(m.id))
}
export function generateTours(groupeId) {
  const group = getGroup(groupeId)
  if (!group) return []
  if (group.rejoint) return getTours(groupeId)
  if (horsLigne()) return getTours(groupeId)
  const membres = getMembres(groupeId).filter((m) => !m.bloque)
  const tours = getToursRaw()
  const existants = tours.filter((t) => t.groupeId === Number(groupeId))
  const aCreer = membreSansTour(membres, existants)
  if (!aCreer.length) return existants
  let numero = existants.length ? Math.max(...existants.map((t) => t.numero)) : 0
  let date = group.dateDebut
  if (existants.length) {
    const maxDate = existants.reduce((mx, t) => (t.datePrevue > mx ? t.datePrevue : mx), '')
    date = addDays(maxDate, Number(group.periodeJours || 0))
  }
  const pot = calculerPot(group, membres)
  for (const m of aCreer) {
    numero += 1
    tours.push({
      id: nextId(tours),
      groupeId: Number(groupeId),
      numero,
      membreId: m.id,
      datePrevue: date,
      montantPot: pot,
      statut: 'en_attente',
      dateReception: null,
    })
    date = addDays(date, Number(group.periodeJours || 0))
  }
  storage.save(K_TOURS, tours)
  ajouterAuJournal(
    groupeId,
    'planning',
    aCreer.length > 1
      ? `Planning généré : ${aCreer.length} nouveaux tours planifiés`
      : `Planning généré : 1 nouveau tour planifié`
  )
  return tours.filter((t) => t.groupeId === Number(groupeId)).sort((a, b) => a.numero - b.numero)
}
export function updateTour(id, patch) {
  if (horsLigne()) return null
  const tours = getToursRaw()
  const idx = tours.findIndex((t) => t.id === Number(id))
  if (idx === -1) return null
  if (tours[idx].groupeId != null && estRejoint(tours[idx].groupeId)) return null
  tours[idx] = { ...tours[idx], ...patch, id: tours[idx].id }
  storage.save(K_TOURS, tours)
  return tours[idx]
}
export function marquerTourRecu(tourId, dateReception) {
  const t = updateTour(tourId, {
    statut: 'recu',
    dateReception: dateReception || todayStr(),
  })
  // Automatisation : dès qu'un pot est reçu, le tour suivant (échéance +
  // période) est créé automatiquement pour le membre sans tour qui passe.
  if (t) {
    const membre = getMembre(t.membreId)
    ajouterAuJournal(t.groupeId, 'reception', `${membre?.nom || 'Un membre'} a reçu le pot du tour #${t.numero}`)
    genererTourSuivant(t.groupeId)
  }
  return t
}
export function annulerTour(tourId) {
  return updateTour(tourId, { statut: 'annule' })
}
export function supprimerTour(tourId) {
  const idn = Number(tourId)
  if (horsLigne()) return
  const t = getToursRaw().find((x) => x.id === idn)
  if (t && estRejoint(t.groupeId)) return
  storage.save(K_TOURS, getToursRaw().filter((t) => t.id !== idn))
  storage.save(K_COTIS, getCotisationsRaw().filter((c) => c.tourId !== idn))
}
// Membres qui doivent cotiser à un tour mais ne l'ont pas encore payé.
export function membresImpays(groupeId, tourId) {
  const groupe = getGroup(groupeId)
  const tour = getToursRaw().find((t) => t.id === Number(tourId))
  if (!groupe || !tour) return []
  const actifs = getMembres(groupeId).filter((m) => !m.bloque)
  const cotisants = groupe.leReceveurCotonise
    ? actifs
    : actifs.filter((m) => m.id !== Number(tour.membreId))
  return cotisants.filter((m) => !getPaiementMembre(tourId, m.id))
}
// Automatisation : crée le tour suivant pour le membre sans tour qui passe
// (ordre tiré d'abord, sinon le premier). Échéance = dernière + période.
export function genererTourSuivant(groupeId) {
  const group = getGroup(groupeId)
  if (!group || group.rejoint || horsLigne()) return null
  const membres = getMembres(groupeId).filter((m) => !m.bloque)
  const tours = getToursRaw()
  const existants = tours.filter((t) => t.groupeId === Number(groupeId))
  const sansTour = membreSansTour(membres, existants)
  if (!sansTour.length) return null
  const ordre = (Array.isArray(group.ordreTire) ? group.ordreTire : []).map(Number)
  const prochain = sansTour.find((m) => ordre.includes(m.id)) || sansTour[0]
  const numero = existants.length ? Math.max(...existants.map((t) => t.numero)) + 1 : 1
  const maxDate = existants.reduce((mx, t) => (t.datePrevue > mx ? t.datePrevue : mx), '')
  const date = existants.length ? addDays(maxDate, Number(group.periodeJours || 0)) : group.dateDebut
  const pot = calculerPot(group, membres)
  const tour = {
    id: nextId(tours),
    groupeId: Number(groupeId),
    numero,
    membreId: prochain.id,
    datePrevue: date,
    montantPot: pot,
    statut: 'en_attente',
    dateReception: null,
  }
  tours.push(tour)
  storage.save(K_TOURS, tours)
  return tour
}
export function getTourProchain(groupeId) {
  return getTours(groupeId).find((t) => t.statut === 'en_attente') || null
}

// ── Cotisations (paiements) ──────────────────────────────────
function getCotisationsRaw() {
  return storage.load(K_COTIS, [])
}
export function getCotisations(groupeId) {
  return getCotisationsRaw().filter((c) => c.groupeId === Number(groupeId))
}
export function getCotisationsByTour(tourId) {
  return getCotisationsRaw().filter((c) => c.tourId === Number(tourId))
}
export function payerCotisation(groupeId, tourId, membreId, montant, datePaiement, moyenPaiement) {
  if (estRejoint(groupeId) || horsLigne()) return 0
  const groupe = getGroup(groupeId)
  const tour = getToursRaw().find((t) => t.id === Number(tourId))
  const cotis = getCotisationsRaw()
  const existant = cotis.find(
    (c) => c.tourId === Number(tourId) && c.membreId === Number(membreId)
  )
  const penalite = groupe && tour ? calculerPenalite(groupe, tour, datePaiement) : 0
  const moyen = (moyenPaiement || '').trim()
  if (existant) {
    Object.assign(existant, {
      montant: Number(montant) || 0,
      datePaiement: datePaiement || todayStr(),
      statut: 'paye',
      penalite,
      moyenPaiement: moyen,
    })
  } else {
    cotis.push({
      id: nextId(cotis),
      groupeId: Number(groupeId),
      tourId: Number(tourId),
      membreId: Number(membreId),
      montant: Number(montant) || 0,
      datePaiement: datePaiement || todayStr(),
      statut: 'paye',
      penalite,
      moyenPaiement: moyen,
    })
  }
  storage.save(K_COTIS, cotis)
  ajouterAuJournal(
    groupeId,
    'paiement',
    `${getMembre(Number(membreId))?.nom || 'Un membre'} a payé sa cotisation (tour #${tour?.numero || '?'})${penalite > 0 ? ` (+ ${penalite} de pénalité)` : ''}`
  )
  return penalite
}
export function enleverPaiement(cotisId) {
  const idn = Number(cotisId)
  if (horsLigne()) return
  const c = getCotisationsRaw().find((x) => x.id === idn)
  if (c && estRejoint(c.groupeId)) return
  storage.save(K_COTIS, getCotisationsRaw().filter((c) => c.id !== idn))
  if (c) {
    const tour = getToursRaw().find((t) => t.id === c.tourId)
    ajouterAuJournal(c.groupeId, 'paiement_retire', `${getMembre(c.membreId)?.nom || 'Un membre'} a annulé sa cotisation (tour #${tour?.numero || '?'})`)
  }
}
export function getPaiementMembre(tourId, membreId) {
  return getCotisationsRaw().find(
    (c) => c.tourId === Number(tourId) && c.membreId === Number(membreId)
  ) || null
}

// ── Bilan / Solde ────────────────────────────────────────────
export function getBilan(groupeId) {
  const membres = getMembres(groupeId)
  const tours = getTours(groupeId)
  const cotis = getCotisations(groupeId)
  const groupe = getGroup(groupeId)

  const totalCotis = cotis.reduce((s, c) => s + Number(c.montant || 0), 0)
  const totalPenalites = cotis.reduce((s, c) => s + Number(c.penalite || 0), 0)
  const totalRecu = tours
    .filter((t) => t.statut === 'recu')
    .reduce((s, t) => s + Number(t.montantPot || 0), 0)
  const soldeGroupe = totalCotis - totalRecu

  const auj = todayStr()
  const toursEnRetard = tours.filter(
    (t) => t.statut === 'en_attente' && t.datePrevue && String(t.datePrevue) < auj
  )

  const parMembre = membres.map((m) => {
    const cotise = cotis
      .filter((c) => c.membreId === m.id && c.statut === 'paye')
      .reduce((s, c) => s + Number(c.montant || 0), 0)
    const penalites = cotis
      .filter((c) => c.membreId === m.id)
      .reduce((s, c) => s + Number(c.penalite || 0), 0)
    const recu = tours
      .filter((t) => t.membreId === m.id && t.statut === 'recu')
      .reduce((s, t) => s + Number(t.montantPot || 0), 0)
    // Pénalités qui s'accumulent tant que le membre ne règle pas un tour en retard.
    const enRetard = toursEnRetard.filter((t) => {
      const doitCotiser = groupe.leReceveurCotonise ? true : t.membreId !== m.id
      return doitCotiser && !cotis.some((c) => c.tourId === t.id && c.membreId === m.id && c.statut === 'paye')
    })
    const penalitesEnCours = enRetard.reduce((s, t) => s + penaliteEstimee(groupe, t), 0)
    return {
      membre: m,
      cotise,
      penalites,
      penalitesEnCours,
      recu,
      solde: cotise - recu,
      nbCotisations: cotis.filter((c) => c.membreId === m.id && c.statut === 'paye').length,
      nbEnRetard: enRetard.length,
    }
  })

  return {
    groupe,
    membres,
    tours,
    cotisations: cotis,
    totalCotis,
    totalPenalites,
    totalPenalitesEnCours: parMembre.reduce((s, p) => s + p.penalitesEnCours, 0),
    totalRecu,
    soldeGroupe,
    parMembre,
  }
}

// ── Détail de participation d'un membre ──────────────────────
export function getParticipationMembre(groupeId, membreId) {
  const groupe = getGroup(groupeId)
  const membre = getMembre(membreId)
  if (!groupe || !membre) return null
  const bilan = getBilan(groupeId)
  const info = bilan.parMembre.find((p) => p.membre.id === membre.id)
  const cotisations = bilan.cotisations
    .filter((c) => c.membreId === membre.id && c.statut === 'paye')
    .map((c) => ({ ...c, tour: bilan.tours.find((t) => t.id === c.tourId) }))
    .sort((a, b) => (a.datePaiement < b.datePaiement ? -1 : 1))
  const potsRecus = bilan.tours.filter((t) => t.membreId === membre.id && t.statut === 'recu')
  const toursTotal = bilan.tours.filter((t) => t.statut !== 'annule').length
  const taux = toursTotal ? Math.round(((info?.nbCotisations || 0) / toursTotal) * 100) : 0
  return {
    membre,
    groupe,
    cotisations,
    potsRecus,
    nbCotisations: info?.nbCotisations || 0,
    montantCotise: info?.cotise || 0,
    penalites: info?.penalites || 0,
    penalitesEnCours: info?.penalitesEnCours || 0,
    montantRecu: info?.recu || 0,
    nbEnRetard: info?.nbEnRetard || 0,
    tauxParticipation: Math.min(taux, 100),
  }
}

// ── Historique des événements ────────────────────────────────
export function getHistorique(groupeId) {
  const bilan = getBilan(groupeId)
  const events = []
  const membreNom = (id) => bilan.membres.find((m) => m.id === id)?.nom || '—'
  for (const c of bilan.cotisations) {
    const tour = bilan.tours.find((t) => t.id === c.tourId)
    events.push({
      date: c.datePaiement,
      type: 'paiement',
      libelle: `${membreNom(c.membreId)} a payé sa cotisation (tour #${tour?.numero || '?'})`,
      montant: c.montant,
      penalite: c.penalite,
      moyenPaiement: c.moyenPaiement || '',
    })
  }
  for (const t of bilan.tours) {
    if (t.statut === 'recu') {
      events.push({
        date: t.dateReception || t.datePrevue,
        type: 'reception',
        libelle: `${membreNom(t.membreId)} a reçu le pot du tour #${t.numero}`,
        montant: t.montantPot,
      })
    }
  }
  return events.sort((a, b) => (b.date || '').localeCompare(a.date || ''))
}

// ── Synchro en ligne (invité, lecture seule) ──────────────────
// Applique un snapshot reçu du responsable sur le groupe invité local.
// Les invités restent en lecture seule : seul le cloud modifie ces données.
export function appliquerSynchro(groupeId, snapshot) {
  const g = getGroup(groupeId)
  if (!g || !g.rejoint || !snapshot) return false
  const src = snapshot.groupe || {}
  const groupe = {
    ...g,
    nom: (src.nom || '').trim() || g.nom,
    deviseSymbole: src.deviseSymbole || g.deviseSymbole,
    devisePosition: src.devisePosition || g.devisePosition,
    montantCotisation: src.montantCotisation != null ? Number(src.montantCotisation) : g.montantCotisation,
    periodeJours: src.periodeJours != null ? Number(src.periodeJours) : g.periodeJours,
    leReceveurCotonise: src.leReceveurCotonise != null ? src.leReceveurCotonise : g.leReceveurCotonise,
    penalitePctParJour: src.penalitePctParJour != null ? Number(src.penalitePctParJour) : g.penalitePctParJour,
    penalitePlafond: src.penalitePlafond != null ? Number(src.penalitePlafond) : g.penalitePlafond,
    moyensPaiement: Array.isArray(src.moyensPaiement) && src.moyensPaiement.length ? src.moyensPaiement : g.moyensPaiement,
    membresMin: src.membresMin != null ? Number(src.membresMin) : g.membresMin,
    membresMax: src.membresMax != null ? Number(src.membresMax) : g.membresMax,
    statut: src.statut === 'terminee' ? 'terminee' : 'active',
    dateDebut: src.dateDebut || g.dateDebut,
    journal: Array.isArray(src.journal) ? src.journal : (g.journal || []),
    annonces: Array.isArray(src.annonces) ? src.annonces : (g.annonces || []),
    messages: Array.isArray(src.messages) ? src.messages : (g.messages || []),
    // Les messages envoyés par l'invité restent en attente tant que le
    // responsable ne les a pas intégrés (accusé = présent dans le snapshot).
    pendingMessages: (g.pendingMessages || []).filter(
      (p) => !(snapshot.groupe && snapshot.groupe.messages || []).some((x) => String(x.id) === String(p.id))
    ),
    ordreTire: (Array.isArray(src.ordreTire) ? src.ordreTire : g.ordreTire)
      .map((id) => Number(id))
      .filter((id) => (snapshot.membres || []).some((m) => Number(m.id) === id)),
    majLe: snapshot.majLe || Date.now(),
  }
  const groupes = getGroups().map((x) => (x.id === groupeId ? groupe : x))
  storage.save(K_GROUPS, groupes)

  const membres = (snapshot.membres || []).map((m) => ({
    id: Number(m.id),
    groupeId,
    nom: (m.nom || '').trim(),
    telephone: (m.telephone || '').trim(),
    uid: m.uid || null,
    role: m.role || 'membre',
    bloque: !!m.bloque,
    dateAdhesion: m.dateAdhesion || todayStr(),
    dateCreation: m.dateCreation || new Date().toISOString(),
  }))
  storage.save(K_MEMBRES, [
    ...getMembresRaw().filter((m) => m.groupeId !== groupeId),
    ...membres,
  ])

  const tours = (snapshot.tours || []).map((t) => ({
    id: Number(t.id),
    groupeId,
    numero: Number(t.numero) || 0,
    membreId: t.membreId != null ? Number(t.membreId) : null,
    datePrevue: t.datePrevue || todayStr(),
    montantPot: Number(t.montantPot) || 0,
    statut: ['en_attente', 'recu', 'annule'].includes(t.statut) ? t.statut : 'en_attente',
    dateReception: t.dateReception || null,
  }))
  storage.save(K_TOURS, [
    ...getToursRaw().filter((t) => t.groupeId !== groupeId),
    ...tours,
  ])

  const cotisations = (snapshot.cotisations || []).map((c) => ({
    id: Number(c.id),
    groupeId,
    tourId: Number(c.tourId),
    membreId: Number(c.membreId),
    montant: Number(c.montant) || 0,
    penalite: Number(c.penalite) || 0,
    statut: c.statut === 'paye' ? 'paye' : 'en_attente',
    moyenPaiement: c.moyenPaiement || '',
    datePaiement: c.datePaiement || todayStr(),
  }))
  storage.save(K_COTIS, [
    ...getCotisationsRaw().filter((c) => c.groupeId !== groupeId),
    ...cotisations,
  ])

  const prets = (snapshot.prets || []).map((p) => ({
    id: Number(p.id),
    groupeId,
    emprunteurId: p.emprunteurId != null ? Number(p.emprunteurId) : null,
    montant: Number(p.montant) || 0,
    tauxInteret: Number(p.tauxInteret) || 0,
    dateEcheance: p.dateEcheance || todayStr(),
    dateCreation: p.dateCreation || new Date().toISOString(),
    note: p.note || '',
    statut: p.statut === 'rembourse' ? 'rembourse' : 'en_cours',
    remboursements: Array.isArray(p.remboursements) ? p.remboursements : [],
  }))
  storage.save(K_PRETS, [
    ...getPretsRaw().filter((p) => p.groupeId !== groupeId),
    ...prets,
  ])
  return true
}

// ═══════════════════════════════════════════════════════════════
// Épargne personnelle (sans groupe)
// ═══════════════════════════════════════════════════════════════
const K_EPARGNES = 'epargnes'

export function getEpargnes() {
  return (storage.load(K_EPARGNES, []) || []).sort((a, b) => b.id - a.id)
}
export function getEpargne(id) {
  return getEpargnes().find((e) => e.id === Number(id)) || null
}
export function creerEpargne(data) {
  if (horsLigne()) return null
  const s = getSettings()
  const liste = getEpargnes()
  const epargne = {
    id: nextId(liste),
    nom: (data.nom || '').trim() || 'Mon épargne',
    objectif: Number(data.objectif) || 0,
    deviseSymbole: data.deviseSymbole || s.deviseSymbole,
    devisePosition: data.devisePosition || s.devisePosition,
    dateCreation: nowIso(),
    versements: [],
  }
  liste.push(epargne)
  storage.save(K_EPARGNES, liste)
  return epargne
}
export function verserEpargne(id, montant, dateStr) {
  if (horsLigne()) return null
  const liste = getEpargnes()
  const idx = liste.findIndex((e) => e.id === Number(id))
  if (idx === -1) return null
  const e = liste[idx]
  const m = Number(montant) || 0
  if (m <= 0) return null
  const versement = {
    id: nextId(e.versements || []),
    montant: m,
    date: dateStr || todayStr(),
  }
  e.versements = [...(e.versements || []), versement]
  liste[idx] = e
  storage.save(K_EPARGNES, liste)
  return versement
}
export function retirerVersement(id, versementId) {
  if (horsLigne()) return
  const liste = getEpargnes()
  const idx = liste.findIndex((e) => e.id === Number(id))
  if (idx === -1) return
  const e = liste[idx]
  e.versements = (e.versements || []).filter((v) => v.id !== Number(versementId))
  liste[idx] = e
  storage.save(K_EPARGNES, liste)
}
export function supprimerEpargne(id) {
  if (horsLigne()) return
  storage.save(K_EPARGNES, getEpargnes().filter((e) => e.id !== Number(id)))
}
export function totalEpargne(e) {
  return (e?.versements || []).reduce((s, v) => s + Number(v.montant || 0), 0)
}

// ═══════════════════════════════════════════════════════════════
// Prêts entre membres (au sein d'un groupe)
// ═══════════════════════════════════════════════════════════════
function getPretsRaw() {
  return storage.load(K_PRETS, [])
}
export function getPrets(groupeId) {
  return getPretsRaw()
    .filter((p) => p.groupeId === Number(groupeId))
    .sort((a, b) => a.id - b.id)
}
export function getPret(id) {
  return getPretsRaw().find((p) => p.id === Number(id)) || null
}
// Montant total à rembourser (capital + intérêts simples éventuels).
export function totalARembourser(p) {
  const montant = Number(p?.montant || 0)
  const taux = Number(p?.tauxInteret || 0)
  return taux > 0 ? montant + (montant * taux) / 100 : montant
}
export function rembourseTotal(p) {
  return (p?.remboursements || []).reduce((s, r) => s + Number(r.montant || 0), 0)
}
export function resteAPayer(p) {
  return Math.max(totalARembourser(p) - rembourseTotal(p), 0)
}
// Statut affiché : 'en_cours' | 'en_retard' | 'rembourse'.
export function etatPret(p, aujourd) {
  if (!p) return null
  if (p.statut === 'rembourse' || resteAPayer(p) <= 0) return 'rembourse'
  const echeance = p.dateEcheance || ''
  if (echeance && echeance < (aujourd || todayStr())) return 'en_retard'
  return 'en_cours'
}
export function createPret(groupeId, data) {
  if (estRejoint(groupeId) || horsLigne()) return null
  const prets = getPretsRaw()
  const montant = Number(data.montant) || 0
  if (montant <= 0) return null
  const pret = {
    id: nextId(prets),
    groupeId: Number(groupeId),
    emprunteurId: data.emprunteurId != null ? Number(data.emprunteurId) : null,
    montant,
    tauxInteret: Number(data.tauxInteret) || 0,
    dateEcheance: data.dateEcheance || todayStr(),
    dateCreation: nowIso(),
    note: (data.note || '').trim(),
    statut: 'en_cours',
    remboursements: [],
  }
  prets.push(pret)
  storage.save(K_PRETS, prets)
  ajouterAuJournal(groupeId, 'pret', `${getMembre(pret.emprunteurId)?.nom || 'Un membre'} a reçu un prêt de ${montant}`)
  return pret
}
export function updatePret(id, patch) {
  if (horsLigne()) return null
  const prets = getPretsRaw()
  const idx = prets.findIndex((p) => p.id === Number(id))
  if (idx === -1) return null
  const p = prets[idx]
  if (p.groupeId != null && estRejoint(p.groupeId)) return null
  prets[idx] = { ...p, ...patch, id: p.id }
  storage.save(K_PRETS, prets)
  return prets[idx]
}
export function rembourserPret(id, montant, dateStr) {
  if (horsLigne()) return null
  const prets = getPretsRaw()
  const idx = prets.findIndex((p) => p.id === Number(id))
  if (idx === -1) return null
  const p = prets[idx]
  if (p.groupeId != null && estRejoint(p.groupeId)) return null
  const m = Number(montant) || 0
  if (m <= 0) return null
  const versement = { id: nextId(p.remboursements || []), montant: m, date: dateStr || todayStr() }
  p.remboursements = [...(p.remboursements || []), versement]
  if (resteAPayer(p) <= 0) p.statut = 'rembourse'
  prets[idx] = p
  storage.save(K_PRETS, prets)
  ajouterAuJournal(
    p.groupeId,
    'pret_rembourse',
    `${getMembre(p.emprunteurId)?.nom || 'Un membre'} a remboursé ${m} sur son prêt`
  )
  return versement
}
export function retirerRemboursement(id, remboursementId) {
  if (horsLigne()) return
  const prets = getPretsRaw()
  const idx = prets.findIndex((p) => p.id === Number(id))
  if (idx === -1) return
  const p = prets[idx]
  if (p.groupeId != null && estRejoint(p.groupeId)) return
  p.remboursements = (p.remboursements || []).filter((r) => r.id !== Number(remboursementId))
  if (p.statut === 'rembourse' && resteAPayer(p) > 0) p.statut = 'en_cours'
  prets[idx] = p
  storage.save(K_PRETS, prets)
}
export function supprimerPret(id) {
  const idn = Number(id)
  if (horsLigne()) return
  const p = getPretsRaw().find((x) => x.id === idn)
  if (p && p.groupeId != null && estRejoint(p.groupeId)) return
  storage.save(K_PRETS, getPretsRaw().filter((x) => x.id !== idn))
}
