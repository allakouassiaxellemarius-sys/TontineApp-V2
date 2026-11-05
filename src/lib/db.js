import { storage, nextId, todayStr, addDays, dateISO, nowIso, getVersion } from './storage.js'
import { getSettings } from './format.js'
import { calculerPenalite, penaliteEstimee } from './penalty.js'
import { estLectureSeule } from './lectureSeule.js'
import { syncDisponible } from './cloudApi'
import { publierPaiementInvite, supprimerPaiementInvite } from './sync.js'
import {
  bornerPositif,
  bornerPct,
  bornerPeriode,
  bornesTour,
  bornesCotisation,
  bornesPret,
} from './bornes'

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

// Identifiant de l'utilisateur connecté (session locale), ou null.
function currentUid() {
  try {
    const raw = localStorage.getItem('tontine_session')
    if (!raw) return null
    const s = JSON.parse(raw)
    return s && s.user && s.user.uid ? s.user.uid : null
  } catch {
    return null
  }
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
//
// Identité d'un message : `cle`, posée par l'appareil qui l'écrit. L'`id`
// numérique local ne peut pas servir de référence entre appareils : le miroir
// cloud régénère le sien à chaque publication et un `nextId` peut être réattribué
// après une suppression. Réponses, épingles et accusés de lecture visent donc
// toujours `cle` (à défaut `id`, pour les messages antérieurs à ce champ).
export const cleMessage = (m) => String((m && (m.cle || m.id)) || '')
function nouvelleCle() {
  return 'm' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 8)
}

// Champs structurés conservés d'un bout à l'autre de la chaîne.
function normaliserMessage(m, base) {
  return {
    ...base,
    texte: (m.texte || '').trim(),
    repondreA: m.repondreA ? String(m.repondreA) : null,
    media: m.media ? String(m.media) : null,
    epingle: !!m.epingle,
    modifieLe: m.modifieLe ? String(m.modifieLe) : null,
  }
}

export function envoyerMessage(groupeId, texte, auteur, uid, email, extras) {
  const g = getGroup(groupeId)
  if (!g || horsLigne()) return null
  const e = extras || {}
  const message = normaliserMessage({ texte, ...e }, {
    id: nextId(g.messages || []),
    cle: nouvelleCle(),
    auteur: (auteur || '').trim() || 'Membre',
    uid: uid || null,
    email: email || null,
    date: nowIso(),
  })
  if (!message.texte && !message.media) return null
  updateGroup(groupeId, { messages: [...(g.messages || []), message].slice(-200) })
  return message
}
export function supprimerMessage(groupeId, messageId) {
  const g = getGroup(groupeId)
  if (!g || horsLigne()) return
  const cible = String(messageId)
  updateGroup(groupeId, {
    messages: (g.messages || []).filter((m) => m.id !== Number(messageId) && cleMessage(m) !== cible),
  })
}

// Le responsable corrige un message déjà publié : le texte change, l'identité
// reste, et `modifieLe` signale la retouche à tout le monde.
export function modifierMessage(groupeId, cle, texte) {
  const g = getGroup(groupeId)
  const t = (texte || '').trim()
  if (!g || g.rejoint || horsLigne() || !t) return null
  let touche = false
  const messages = (g.messages || []).map((m) => {
    if (touche || cleMessage(m) !== String(cle)) return m
    touche = true
    return { ...m, texte: t, modifieLe: nowIso() }
  })
  if (!touche) return null
  updateGroup(groupeId, { messages })
  return messages.find((m) => cleMessage(m) === String(cle))
}

// Épingle : affiche le message en bandeau dans la discussion. Réserve du
// responsable, seul éditeur du snapshot partagé.
export function pinguerMessage(groupeId, cle, etat) {
  const g = getGroup(groupeId)
  if (!g || g.rejoint || horsLigne()) return null
  const cible = String(cle)
  const messages = (g.messages || []).map((m) => (cleMessage(m) === cible ? { ...m, epingle: !!etat } : m))
  if (!messages.some((m) => cleMessage(m) === cible)) return null
  updateGroup(groupeId, { messages })
  return true
}

// Invité : poste un message vers le responsable (canal messages_utilisateur).
// Le message est d'abord affiché localement (pendingMessages) jusqu'à ce que
// le responsable l'intègre à la discussion et le re-publie — le snapshot
// reçu fait alors disparaître l'entrée en attente.
export function envoyerMessageInvite(groupeId, texte, auteur, uid, email, extras) {
  const g = getGroup(groupeId)
  if (!g || !g.rejoint || horsLigne()) return null
  const e = extras || {}
  const t = (texte || '').trim()
  if (!t && !e.media) return null
  const message = normaliserMessage({ texte: t, ...e }, {
    id: 'inv-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8),
    cle: nouvelleCle(),
    auteur: (auteur || '').trim() || 'Membre',
    uid: uid || null,
    email: email || null,
    date: nowIso(),
    enAttente: true,
    statut: 'attente',
  })
  storage.save(K_GROUPS, getGroups().map((x) =>
    x.id === Number(groupeId)
      ? { ...x, pendingMessages: [...(x.pendingMessages || []), message].slice(-200) }
      : x
  ))
  return message
}

// File d'envoi : le message d'invité est écrit localement AVANT de partir, puis
// son sort est noté dessus. Sans ça, une coupure réseau faisait disparaître le
// message de l'écran sans jamais le renvoyer — l'expéditeur croyait l'avoir dit.
export function marquerEnvoiInvite(groupeId, cle, statut) {
  const groupes = getGroups()
  let trouve = false
  const maj = groupes.map((x) => {
    if (x.id !== Number(groupeId)) return x
    const pending = (x.pendingMessages || []).map((p) => {
      if (cleMessage(p) !== String(cle)) return p
      trouve = true
      return { ...p, statut: statut || null }
    })
    return { ...x, pendingMessages: pending }
  })
  if (!trouve) return false
  storage.save(K_GROUPS, maj)
  return true
}

// Messages d'invité jamais partis (ou partis et repris) : la reprise à
// re-jouer quand le réseau revient.
export function fileDEnvoi(groupeId) {
  const g = getGroup(groupeId)
  if (!g || !g.rejoint) return []
  return (g.pendingMessages || []).filter((p) => p.statut !== 'envoye')
}

// Responsable : intègre dans la discussion un message envoyé par un invité
// (via le canal messages_utilisateur). L'`cle` de l'invité est conservée pour
// que sa copie locale reconnaisse l'accusé de réception. Renvoie le message,
// 'deja' si déjà présent, ou null si impossible (lecture seule / hors ligne).
export function integrerMessage(groupeId, m) {
  const g = getGroup(groupeId)
  if (!g || g.rejoint || horsLigne() || !m || (!m.texte && !m.media)) return null
  const cle = m.cle || m.id || ('inv-' + Date.now())
  const id = m.id || cle
  if ((g.messages || []).some((x) => cleMessage(x) === String(cle))) return 'deja'
  const message = normaliserMessage(m, {
    id,
    cle: String(cle),
    auteur: (m.auteur || '').trim() || 'Membre',
    uid: m.uid || null,
    email: m.email || null,
    date: m.date || nowIso(),
  })
  updateGroup(groupeId, { messages: [...(g.messages || []), message].slice(-200) })
  return message
}

// ── Groupes ──────────────────────────────────────────────────
export function getGroups() {
  const groups = storage.load(K_GROUPS, [])
  // Rétro-compatibilité : un groupe non invité (rejoint:false) créé avant
  // l'attribution de proprietaire n'a pas de champ proprietaire. On le
  // rattache à l'utilisateur courant pour qu'il soit reconnu comme gérant.
  let modifie = false
  for (const g of groups) {
    if (!g.rejoint) {
      const uid = currentUid()
      // Un groupe non invité est, par conception, celui de l'utilisateur
      // connecté sur cet appareil. On rattrape le proprietaire localement
      // (même si une synchro antérieure avait enregistré un autre uid).
      if (uid && g.proprietaire !== uid) {
        g.proprietaire = uid
        modifie = true
      }
    }
  }
  if (modifie) storage.save(K_GROUPS, groups)
  return groups
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
    montantCotisation: bornerPositif(data.montantCotisation),
    periodeJours: bornerPeriode(data.periodeJours),
    leReceveurCotonise: data.leReceveurCotonise !== false,
    responsableParticipe: data.responsableParticipe !== false,
    penalitePctParJour: bornerPct(data.penalitePctParJour),
    penalitePlafond: bornerPct(data.penalitePlafond),
    moyensPaiement: Array.isArray(data.moyensPaiement) && data.moyensPaiement.length ? data.moyensPaiement : ['Pi-Spi'],
    membresMin: bornerPositif(data.membresMin),
    membresMax: bornerPositif(data.membresMax),
    statut: 'active',
    dateDebut: data.dateDebut || todayStr(),
    dateCreation: new Date().toISOString(),
    journal: [],
    annonces: [],
    coGerants: {},
    archives: [],
    sauvegardeUid: data.sauvegardeUid || '',
    receptionMM: data.receptionMM || null,
    waveSlug: (data.waveSlug || '').trim() || null,
    proprietaire: data.proprietaire || currentUid() || null,
    majLe: Date.now(),
  }
  groups.push(group)
  if (!storage.save(K_GROUPS, groups)) return null
  ajouterAuJournal(group.id, 'creation', `La tontine « ${group.nom} » a été créée`)
  return group
}
export function updateGroup(id, patch) {
  if (horsLigne()) return null
  const groups = getGroups()
  const idx = groups.findIndex((g) => g.id === Number(id))
  if (idx === -1) return null
  if (groups[idx].rejoint) return null
  // majLe horodaté localement : sans lui, entitePlusRecente() compare du vide et
  // le cloud écrase systématiquement la dernière modification faite ici.
  groups[idx] = { ...groups[idx], ...patch, id: groups[idx].id, majLe: Date.now() }
  return storage.save(K_GROUPS, groups) ? groups[idx] : null
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
  if (g.codeUnique) return g.codeUnique
  let code = nouveauCodeUnique()
  while (getGroups().some((x) => x.codeUnique === code)) code = nouveauCodeUnique()
  const groups = getGroups()
  const idx = groups.findIndex((x) => x.id === Number(groupeId))
  if (idx !== -1) {
    groups[idx] = { ...groups[idx], codeUnique: code }
    storage.save(K_GROUPS, groups)
  }
  return code
}
// Invité : crée la copie locale d'un groupe à partir d'un snapshot téléchargé
// depuis le cloud (format 2), ou restaure une sauvegarde privée du compte.
// Renvoie le groupe, ou null s'il est déjà présent.
// opts : { rejoint, synchronise, sansCode } — rejoint=false pour restaurer ses
// propres groupes (édition locale), sansCode=true pour accepter une sauvegarde
// privée sans code d'invitation (unicité par sauvegardeUid).
export function rejoindreDepuisSnapshot(snapshot, opts = {}) {
  const src = (snapshot && snapshot.groupe) || {}
  const codeUnique = (src.codeUnique || '').trim().toUpperCase() || null
  const sauvegardeUid = src.sauvegardeUid || null
  const cleDedup = codeUnique || sauvegardeUid
  if (!cleDedup) return null
  if (
    getGroups().some(
      (x) =>
        (codeUnique && x.codeUnique === codeUnique) ||
        (sauvegardeUid && x.sauvegardeUid === sauvegardeUid)
    )
  ) {
    return null
  }

  const groupes = getGroups()
  const groupId = nextId(groupes)
  const groupe = {
    id: groupId,
    nom: (src.nom || '').trim() || 'Groupe rejoint',
    deviseSymbole: src.deviseSymbole || 'FCFA',
    devisePosition: src.devisePosition || 'after',
    montantCotisation: bornerPositif(src.montantCotisation),
    periodeJours: bornerPeriode(src.periodeJours),
    leReceveurCotonise: src.leReceveurCotonise !== false,
    penalitePctParJour: bornerPct(src.penalitePctParJour),
    penalitePlafond: bornerPct(src.penalitePlafond),
    moyensPaiement: Array.isArray(src.moyensPaiement) && src.moyensPaiement.length ? src.moyensPaiement : ['Pi-Spi'],
    membresMin: bornerPositif(src.membresMin),
    membresMax: bornerPositif(src.membresMax),
    statut: src.statut === 'terminee' ? 'terminee' : 'active',
    dateDebut: src.dateDebut || todayStr(),
    dateCreation: new Date().toISOString(),
    codeUnique,
    synchronise: opts.synchronise !== undefined ? opts.synchronise : true,
    proprietaire: src.proprietaire || null,
    sauvegardeUid,
    coGerants: (src.coGerants && typeof src.coGerants === 'object') ? { ...src.coGerants } : {},
    archives: Array.isArray(src.archives) ? src.archives : [],
    receptionMM: src.receptionMM || null,
    waveSlug: (src.waveSlug || '').trim() || null,
    rejoint: opts.rejoint !== false,
    rejointLe: opts.rejoint === false ? null : todayStr(),
    majLe: snapshot.majLe || Date.now(),
    journal: Array.isArray(src.journal) ? src.journal : [],
    rejetsPaiements: fusionRejets([], src.rejetsPaiements),
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
    return bornesTour({
      id,
      groupeId: groupId,
      numero: Number(t.numero) || 0,
      membreId: t.membreId != null ? (membreMap[Number(t.membreId)] ?? null) : null,
      datePrevue: t.datePrevue || todayStr(),
      montantPot: t.montantPot,
      statut: t.statut,
      dateReception: t.dateReception || null,
    })
  })

  let prochainCotis = nextId(getCotisationsRaw())
  const cotisations = (snapshot.cotisations || []).map((c) => bornesCotisation({
    id: prochainCotis++,
    groupeId: groupId,
    tourId: c.tourId != null ? (tourMap[Number(c.tourId)] ?? null) : null,
    membreId: c.membreId != null ? (membreMap[Number(c.membreId)] ?? null) : null,
    montant: c.montant,
    datePaiement: c.datePaiement || todayStr(),
    statut: c.statut,
    penalite: c.penalite,
    moyenPaiement: c.moyenPaiement || '',
  }))

  let prochainPret = nextId(getPretsRaw())
  const prets = (snapshot.prets || []).map((p) => bornesPret({
    id: prochainPret++,
    groupeId: groupId,
    emprunteurId: p.emprunteurId != null ? (membreMap[Number(p.emprunteurId)] ?? null) : null,
    montant: p.montant,
    tauxInteret: p.tauxInteret,
    dateEcheance: p.dateEcheance || todayStr(),
    dateCreation: p.dateCreation || new Date().toISOString(),
    note: p.note || '',
    statut: p.statut,
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
    majLe: Date.now(),
  }
    membres.push(membre)
    if (!storage.save(K_MEMBRES, membres)) return null
    ajouterAuJournal(groupeId, 'membre_ajoute', `${membre.nom} a rejoint la tontine`)
    // Le tour du nouveau membre est créé à la prochaine réception
    // (genererTourSuivant), pas immédiatement : générer ici figerait le pot
    // sur le nombre de membres du moment et fausserait le planning en cours.
    return membre
  }

  // Renvoie un membre existant équivalent (même téléphone, email ou nom), sinon null.
  // Permet d'éviter les doublons lors d'ajouts manuels ou d'import de contacts.
  export function doublonMembre(groupeId, candidat) {
    const tel = (candidat.telephone || '').replace(/[^\d]/g, '')
    const email = (candidat.email || '').trim().toLowerCase()
    const nom = (candidat.nom || '').trim().toLowerCase()
    if (!tel && !email && !nom) return null
    return (
      getMembres(groupeId).find((m) => {
        const mt = (m.telephone || '').replace(/[^\d]/g, '')
        const me = (m.email || '').trim().toLowerCase()
        const mn = (m.nom || '').trim().toLowerCase()
        if (tel && mt && tel === mt) return true
        if (email && me && email === me) return true
        if (nom && mn && nom === mn) return true
        return false
      }) || null
    )
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
  membres[idx] = { ...avant, ...patch, id: membres[idx].id, majLe: Date.now() }
  if (!storage.save(K_MEMBRES, membres)) return null
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
    if (patch.role === 'co-responsable' || avant.role === 'co-responsable') {
      deriveCoGerants(membres[idx].groupeId)
    }
  }
  return membres[idx]
}
// Retire un membre. Renvoie un verdict que l'appelant DOIT afficher :
//   { ok:true, toursAnnules }   — suppression effectuée
//   { ok:false, raison }        — 'recu' (argent déjà distribué à ce membre),
//                                 'bloque', 'hors_ligne', 'introuvable'
// Les tours non distribués sont annulés et conservés pour l'audit ; seules les
// cotisations du membre sont retirées, jamais celles des autres membres du tour.
export function deleteMembre(id) {
  const idn = Number(id)
  if (horsLigne()) return { ok: false, raison: 'hors_ligne' }
  const m = getMembre(idn)
  if (!m) return { ok: false, raison: 'introuvable' }
  if (estRejoint(m.groupeId)) return { ok: false, raison: 'bloque' }
  const siens = getToursRaw().filter((t) => t.membreId === idn)
  if (siens.some((t) => t.statut === 'recu')) return { ok: false, raison: 'recu' }
  const maj = Date.now()
  const ids = siens.map((t) => t.id)
  storage.save(K_MEMBRES, getMembresRaw().filter((x) => x.id !== idn))
  storage.save(K_TOURS, getToursRaw().map((t) =>
    ids.includes(t.id) ? { ...t, statut: 'annule', majLe: maj } : t
  ))
  storage.save(K_COTIS, getCotisationsRaw().filter((c) => c.membreId !== idn))
  retirerDeOrdreTire(m.groupeId, idn)
  ajouterAuJournal(
    m.groupeId,
    'membre_supprime',
    `${m.nom} a été retiré(e) de la tontine${ids.length ? ` — ${ids.length} tour(s) annulé(s)` : ''}`
  )
  if (m.role === 'co-responsable') deriveCoGerants(m.groupeId)
  return { ok: true, toursAnnules: ids.length }
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

// ── Co-gérants ───────────────────────────────────────────────
// Dérive groupe.coGerants (uid → { nom, email }) depuis les membres ayant
// role === 'co-responsable'. Persiste et renvoie l'objet coGerants (ou {}).
export function deriveCoGerants(groupeId) {
  const groupes = getGroups()
  const idx = groupes.findIndex((g) => g.id === Number(groupeId))
  if (idx === -1) return {}
  const membres = getMembres(groupeId)
  const coGerants = {}
  for (const m of membres) {
    if (m.role === 'co-responsable' && m.uid) {
      coGerants[m.uid] = { nom: m.nom || '', email: m.email || '' }
    }
  }
  groupes[idx] = { ...groupes[idx], coGerants }
  storage.save(K_GROUPS, groupes)
  return coGerants
}
// uid est-il propriétaire ou co-gérant du groupe ?
export function estResponsable(groupeId, uid) {
  if (!uid) return false
  const g = getGroup(groupeId)
  if (!g) return false
  if (g.proprietaire === uid) return true
  return !!(g.coGerants && g.coGerants[uid])
}
// uid est-il au moins membre (pour envoyer des messages / demandes) ?
export function estMembreDuGroupe(groupeId, uid) {
  return getMembres(groupeId).some((m) => m.uid && m.uid === uid)
}

// ── Sauvegarde privée du compte ──────────────────────────────
// Garantit que le groupe possède un sauvegardeUid stable (clé de sauvegarde
// privée users/{uid}/groupes/{sauvegardeUid}). Génère et persiste s'il manque.
export function assurerSauvegardeUid(groupeId) {
  const groupes = getGroups()
  const idx = groupes.findIndex((g) => g.id === Number(groupeId))
  if (idx === -1) return ''
  if (groupes[idx].sauvegardeUid) return groupes[idx].sauvegardeUid
  const uid = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`
  groupes[idx] = { ...groupes[idx], sauvegardeUid: uid }
  storage.save(K_GROUPS, groupes)
  return uid
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
    // Un tour non reçu suit le pot courant (un membre ajouté en cours de
    // cycle l'augmente) ; un tour reçu conserve son montant historique.
    const montantPot = t.statut === 'recu' ? Number(t.montantPot) || pot : pot
    return { ...t, membre, montantPot }
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
  const membres = getMembres(groupeId).filter(
    (m) => !m.bloque && (group.responsableParticipe !== false || m.role !== 'gerant')
  )
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
const STATUTS_TOUR = ['en_attente', 'recu', 'annule']

// Écriture basse des tours. statut 'recu' n'est accepté que via autoriserRecu
// (marquerTourRecu) : sans cette garde, un patch quelconque pourrait distribuer
// deux fois le même pot en contournant le contrôle anti-double distribution.
function ecrireTour(id, patch, autoriserRecu) {
  if (horsLigne()) return null
  const tours = getToursRaw()
  const idx = tours.findIndex((t) => t.id === Number(id))
  if (idx === -1) return null
  if (tours[idx].groupeId != null && estRejoint(tours[idx].groupeId)) return null
  const suivi = { ...patch, id: tours[idx].id, majLe: Date.now() }
  if (suivi.statut === 'recu' && !autoriserRecu) {
    delete suivi.statut
    if (Object.keys(patch).every((k) => k === 'statut')) return null
  }
  if (suivi.statut !== undefined && !STATUTS_TOUR.includes(suivi.statut)) return null
  tours[idx] = { ...tours[idx], ...suivi }
  return storage.save(K_TOURS, tours) ? tours[idx] : null
}
export function updateTour(id, patch) {
  return ecrireTour(id, patch, false)
}
export function marquerTourRecu(tourId, dateReception) {
  // Anti-fraud : empêche une double distribution (un même tour déjà reçu).
  const existant = getToursRaw().find((x) => x.id === Number(tourId))
  if (existant && existant.statut === 'recu') {
    console.warn(`[anti-fraud] tour #${existant.numero} déjà distribué`)
    return null
  }
  const t = ecrireTour(tourId, {
    statut: 'recu',
    dateReception: dateReception || todayStr(),
  }, true)
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
// Enregistre une cotisation (payée). moyenPaiement = 'Espèces', 'Orange Money'…
// details : { operateur, numero, reference } pour les paiements Mobile Money.
// Renvoie { ok:true, penalite, modifie } seulement si la ligne est réellement
// écrite ; { ok:false, raison } sinon ('bloque', 'montant', 'introuvable',
// 'ecriture'). Ne jamais annoncer un succès sur ok:false.
export function payerCotisation(groupeId, tourId, membreId, montant, datePaiement, moyenPaiement, details) {
  if (estRejoint(groupeId) || horsLigne()) return { ok: false, raison: 'bloque' }
  const nMontant = Number(montant)
  if (!Number.isFinite(nMontant) || nMontant <= 0) return { ok: false, raison: 'montant' }
  const groupe = getGroup(groupeId)
  const tour = getToursRaw().find(
    (t) => t.id === Number(tourId) && t.groupeId === Number(groupeId)
  )
  const membre = getMembre(Number(membreId))
  if (!groupe || !tour || !membre || membre.groupeId !== Number(groupeId)) {
    return { ok: false, raison: 'introuvable' }
  }
  const cotis = getCotisationsRaw()
  const existant = cotis.find(
    (c) => c.tourId === tour.id && c.membreId === membre.id
  )
  const penalite = calculerPenalite(groupe, tour, datePaiement)
  const moyen = (moyenPaiement || '').trim()
  const d = details || {}
  const modeOperateur = (d.operateur || '').trim()
  const modeNumero = (d.numero || '').trim()
  const modeReference = (d.reference || '').trim()
  const ligne = {
    montant: nMontant,
    datePaiement: datePaiement || todayStr(),
    statut: 'paye',
    penalite,
    moyenPaiement: moyen,
    modeOperateur,
    modeNumero,
    modeReference,
    majLe: Date.now(),
  }
  if (existant) {
    Object.assign(existant, ligne)
  } else {
    cotis.push({
      id: nextId(cotis),
      groupeId: Number(groupeId),
      tourId: tour.id,
      membreId: membre.id,
      ...ligne,
    })
  }
  if (!storage.save(K_COTIS, cotis)) return { ok: false, raison: 'ecriture' }
  const modeDetaille = modeOperateur ? ` via ${modeOperateur}${modeNumero ? ` (${modeNumero})` : ''}` : moyen ? ` via ${moyen}` : ''
  ajouterAuJournal(
    groupeId,
    existant ? 'paiement_modifie' : 'paiement',
    `${membre.nom || 'Un membre'} a ${existant ? 'modifié le paiement de sa' : 'payé sa'} cotisation (tour #${tour.numero})${modeDetaille}${modeReference ? ` — réf ${modeReference}` : ''}${penalite > 0 ? ` (+ ${penalite} de pénalité)` : ''}`
  )
  return { ok: true, penalite, modifie: !!existant }
}
export function enleverPaiement(cotisId) {
  const idn = Number(cotisId)
  if (horsLigne()) return { ok: false, raison: 'hors_ligne' }
  const c = getCotisationsRaw().find((x) => x.id === idn)
  if (!c) return { ok: false, raison: 'introuvable' }
  if (estRejoint(c.groupeId)) return { ok: false, raison: 'bloque' }
  if (!storage.save(K_COTIS, getCotisationsRaw().filter((x) => x.id !== idn))) {
    return { ok: false, raison: 'ecriture' }
  }
  const tour = getToursRaw().find((t) => t.id === c.tourId)
  ajouterAuJournal(c.groupeId, 'paiement_retire', `${getMembre(c.membreId)?.nom || 'Un membre'} a annulé sa cotisation (tour #${tour?.numero || '?'})`)
  return { ok: true }
}
export function getPaiementMembre(tourId, membreId) {
  return getCotisationsRaw().find(
    (c) => c.tourId === Number(tourId) && c.membreId === Number(membreId)
  ) || null
}

// Réconcilieur responsable : intègre un paiement en ligne confirmé
// (paiements/{code}/{transactionId}, statut 'paye', écrit par le worker —
// webhook Flutterwave ou ancien flux PayDunya) dans la tontine locale.
// Renvoie un verdict :
//   'ok'       — cotisation enregistrée ; le record peut être supprimé du cloud ;
//   'deja'     — le membre a déjà payé ce tour ; record obsolète, à supprimer ;
//   'attente'  — record à CONSERVER (statut pas prêt, hors ligne, lecture seule) ;
//   'invalide' — record incohérent, à CONSERVER pour audit (jamais supprimé).
export function integrerPaiement(groupeId, record) {
  if (!record || record.statut !== 'paye') return 'attente'
  if (estRejoint(groupeId) || horsLigne()) return 'attente'
  const tourId = Number(record.tourId)
  const membreId = Number(record.membreId)
  const montant = Number(record.montant) || 0
  const groupe = getGroup(groupeId)
  if (!groupe || !tourId || !membreId || montant <= 0) return 'invalide'
  if (getPaiementMembre(tourId, membreId)) return 'deja'
  const operateur = String(record.operateur || 'Mobile Money')
  const res = payerCotisation(groupeId, tourId, membreId, montant, todayStr(), operateur, {
    operateur,
    numero: String(record.numero || record.telephone || ''),
    reference: String(record.reference || ''),
  })
  if (res.ok) return 'ok'
  return res.raison === 'ecriture' ? 'attente' : 'invalide'
}

// ── Paiements signalés par les membres (membre → responsable) ──
// Canal paiements_invite/{code}/{id}. Le membre déclare avoir payé sa
// cotisation vers le numéro Mobile Money du responsable ; le responsable
// confirme (ou rejette) depuis son app. Les signalements sont gardés en
// local sous group.pendingPaiements et publiés vers le cloud.
export function getPendingPaiements(groupeId) {
  const g = getGroup(groupeId)
  return Array.isArray(g && g.pendingPaiements) ? g.pendingPaiements : []
}

// Signalements refusés par le responsable : archivés avec leur motif, jamais
// supprimés en silence. Cette liste ne nourrit aucun solde (un refus ne crée
// ni dette ni encaissement) mais doit survivre à la synchro pour que le membre
// lise la raison du refus.
export const MOTIF_REJET_MAX = 180
const REJETS_MAX = 50

export function getRejetsPaiements(groupeId) {
  const g = getGroup(groupeId)
  return Array.isArray(g && g.rejetsPaiements) ? g.rejetsPaiements : []
}

// Un rejet peut venir d'un autre appareil (snapshot) ou d'une saisie locale :
// mêmes bornes dans les deux cas, on ne fait confiance à aucune des valeurs.
function assainirRejet(r) {
  if (!r || typeof r !== 'object') return null
  const id = String(r.id == null ? '' : r.id).trim().slice(0, 60)
  const motif = String(r.motif == null ? '' : r.motif).replace(/\s+/g, ' ').trim().slice(0, MOTIF_REJET_MAX)
  if (!id || !motif) return null
  const nombre = (v) => (v != null && Number.isFinite(Number(v)) ? Number(v) : null)
  return {
    id,
    nom: String(r.nom == null ? '' : r.nom).trim().slice(0, 60),
    membreId: nombre(r.membreId),
    tourId: nombre(r.tourId),
    tourNumero: nombre(r.tourNumero),
    montant: Number(r.montant) > 0 ? Number(r.montant) : 0,
    motif,
    par: String(r.par == null ? '' : r.par).trim().slice(0, 60),
    le: String(r.le == null ? '' : r.le).trim().slice(0, 40),
    // Date du signalement refusé : c'est ce qui distingue le refus d'un
    // re-signalement republié sous le même identifiant.
    du: String(r.du == null ? '' : r.du).trim().slice(0, 40),
  }
}

// Fusion des refus entre deux appareils : par identifiant de signalement, le
// plus récent des deux gagne (un membre peut re-signaler puis être refusé de
// nouveau). Borné, comme tout ce qui traverse le cloud.
function fusionRejets(a, b) {
  const parId = new Map()
  for (const brut of [...(a || []), ...(b || [])]) {
    const net = assainirRejet(brut)
    if (!net) continue
    const deja = parId.get(net.id)
    if (!deja || String(net.le || '') >= String(deja.le || '')) parId.set(net.id, net)
  }
  return [...parId.values()].slice(-REJETS_MAX)
}

// Le membre signale avoir payé sa cotisation (pour un tour donné). Renvoie le
// signalement créé (ou mis à jour), ou null. Les champs tourId / tourNumero /
// membreId permettent au responsable de confirmer le bon tour sans ambiguïté.
function nouvelIdPaiement() {
  return 'pai-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8)
}

export function signalerPaiementMembre(groupeId, payload) {
  const g = getGroup(groupeId)
  if (!g || horsLigne()) return null
  const nom = (payload.nom || 'Membre').trim()
  const cleNom = nom.toLowerCase()
  const tourId = Number(payload.tourId) || null
  const membreId = Number(payload.membreId) || null
  const existants = getPendingPaiements(groupeId)
  // Montant déclaré depuis l'interface invitée : on le nettoie et on le plafonne
  // à la cotisation du groupe (un signalement ne peut pas créer d'argent).
  const du = Number(g.montantCotisation) || 0
  const brut = Number(payload.montant)
  const saisi = Number.isFinite(brut) && brut > 0 ? brut : 0
  const montantNettoye = du > 0 ? Math.min(saisi, du) : saisi
  // Déduplication : un même membre + même tour ne génère qu'un signalement.
  const doublon = existants.find((p) =>
    (membreId && p.membreId && Number(p.membreId) === membreId) ||
    (p.nom && cleNom && p.nom.trim().toLowerCase() === cleNom)
      ? (tourId ? Number(p.tourId) === tourId : true)
      : false
  )
  let paiement
  if (doublon) {
    // Un signalement déjà refusé repart avec un nouvel identifiant : c'est ce
    // qui le distingue du refus archivé (même id) et qui rouvre la ligne.
    const dejaRefuse = getRejetsPaiements(groupeId).some((r) => r.id === doublon.id)
    paiement = {
      ...doublon,
      id: dejaRefuse ? nouvelIdPaiement() : doublon.id,
      nom,
      montant: montantNettoye || Number(doublon.montant) || 0,
      operateur: (payload.operateur || doublon.operateur || '').trim(),
      numeroEmetteur: (payload.numeroEmetteur || doublon.numeroEmetteur || '').trim(),
      reference: (payload.reference || doublon.reference || '').trim(),
      tourId: tourId || doublon.tourId || null,
      tourNumero: payload.tourNumero || doublon.tourNumero || null,
      membreId: membreId || doublon.membreId || null,
      date: nowIso(),
      enAttente: true,
    }
    storage.save(K_GROUPS, getGroups().map((x) =>
      x.id === Number(groupeId)
        ? { ...x, pendingPaiements: existants.map((p) => (p.id === doublon.id ? paiement : p)) }
        : x
    ))
  } else {
    paiement = {
      id: nouvelIdPaiement(),
      nom,
      montant: montantNettoye,
      operateur: (payload.operateur || '').trim(),
      numeroEmetteur: (payload.numeroEmetteur || '').trim(),
      reference: (payload.reference || '').trim(),
      tourId,
      tourNumero: payload.tourNumero || null,
      membreId,
      date: nowIso(),
      enAttente: true,
    }
    storage.save(K_GROUPS, getGroups().map((x) =>
      x.id === Number(groupeId)
        ? { ...x, pendingPaiements: [...existants, paiement].slice(-100) }
        : x
    ))
  }
  if (syncDisponible() && g.codeUnique && g.synchronise) {
    publierPaiementInvite(g.codeUnique, paiement).catch(() => {})
  }
  return paiement
}

// Retire les signalements en attente d'un membre (par id ou nom), éventuellement
// limités à un tour. Évite les doublons après confirmation ou enregistrement
// direct par le responsable. Renvoie le nombre de signalements supprimés.
export function purgerSignauxMembre(groupeId, { membreId, nom, tourId } = {}) {
  const g = getGroup(groupeId)
  if (!g) return 0
  const cle = (nom || '').trim().toLowerCase()
  const avant = getPendingPaiements(groupeId)
  const apres = avant.filter((p) => {
    const membreOk = membreId && p.membreId && Number(p.membreId) === Number(membreId)
    const nomOk = cle && p.nom && p.nom.trim().toLowerCase() === cle
    if (!membreOk && !nomOk) return true
    if (tourId && p.tourId && Number(p.tourId) !== Number(tourId)) return true
    return false
  })
  if (apres.length === avant.length) return 0
  storage.save(K_GROUPS, getGroups().map((x) =>
    x.id === Number(groupeId) ? { ...x, pendingPaiements: apres } : x
  ))
  if (syncDisponible() && g.codeUnique && g.synchronise) {
    avant.filter((p) => !apres.includes(p)).forEach((p) =>
      supprimerPaiementInvite(g.codeUnique, p.id).catch(() => {})
    )
  }
  return avant.length - apres.length
}

// Le membre annule son propre signalement (erreur, ou paiement non fait).
export function annulerPaiementMembre(groupeId, paiementId) {
  const g = getGroup(groupeId)
  if (!g || horsLigne()) return false
  const avant = getPendingPaiements(groupeId)
  const apres = avant.filter((p) => p.id !== paiementId)
  if (apres.length === avant.length) return false
  const ecrit = storage.save(K_GROUPS, getGroups().map((x) =>
    x.id === Number(groupeId) ? { ...x, pendingPaiements: apres } : x
  ))
  if (!ecrit) return false
  if (syncDisponible() && g.codeUnique && g.synchronise) {
    supprimerPaiementInvite(g.codeUnique, paiementId).catch(() => {})
  }
  return true
}

// Responsable : refuse un signalement en en conservant le motif. Différence
// avec l'annulation (le membre reprend la main) : ici le signalement sort de
// la file de confirmation, l'archive `rejetsPaiements` garde la décision, et
// l'entrée de journal propage le motif aux membres. Refuser n'enregistre
// jamais un montant et ne rouvre aucune dette.
export function rejeterPaiementMembre(groupeId, paiementId, motif, qui) {
  const g = getGroup(groupeId)
  if (!g) return { ok: false, raison: 'introuvable' }
  if (g.rejoint) return { ok: false, raison: 'joint' }
  if (horsLigne()) return { ok: false, raison: 'hors_ligne' }
  const motifNet = String(motif == null ? '' : motif).replace(/\s+/g, ' ').trim()
  if (!motifNet) return { ok: false, raison: 'motif' }
  const avant = getPendingPaiements(groupeId)
  const signale = avant.find((p) => p.id === paiementId)
  if (!signale) return { ok: false, raison: 'introuvable' }
  const rejet = assainirRejet({
    id: signale.id,
    nom: signale.nom,
    membreId: signale.membreId,
    tourId: signale.tourId,
    tourNumero: signale.tourNumero,
    montant: signale.montant,
    motif: motifNet,
    par: qui,
    le: nowIso(),
    du: signale.date,
  })
  if (!rejet) return { ok: false, raison: 'motif' }
  const ecrit = storage.save(K_GROUPS, getGroups().map((x) =>
    x.id === Number(groupeId)
      ? {
          ...x,
          pendingPaiements: avant.filter((p) => p.id !== paiementId),
          rejetsPaiements: fusionRejets(getRejetsPaiements(groupeId), [rejet]),
        }
      : x
  ))
  if (!ecrit) return { ok: false, raison: 'ecriture' }
  ajouterAuJournal(groupeId, 'signalement_rejete',
    `Signalement de ${rejet.nom || 'un membre'}${rejet.tourNumero ? ' (tour #' + rejet.tourNumero + ')' : ''} refusé : ${rejet.motif}`)
  if (syncDisponible() && g.codeUnique && g.synchronise) {
    supprimerPaiementInvite(g.codeUnique, paiementId).catch(() => {})
  }
  return { ok: true, rejet }
}

// Responsable : intègre un signalement reçu du cloud dans sa liste locale.
// Renvoie true si ajouté (faux si déjà présent, groupe rejoint ou invalide).
export function integrerPaiementInvite(groupeId, p) {
  if (!p || !p.id) return false
  if (estRejoint(groupeId) || horsLigne()) return false
  const existants = getPendingPaiements(groupeId)
  if (existants.some((x) => x.id === p.id)) return false
  storage.save(K_GROUPS, getGroups().map((x) =>
    x.id === Number(groupeId)
      ? { ...x, pendingPaiements: [...existants, { ...p, enAttente: true }].slice(-100) }
      : x
  ))
  return true
}

// Responsable : confirme un paiement signalé. Résout le membre (par id d'abord,
// sinon par nom) et le tour (celui indiqué par le signalement, sinon le 1er tour
// en attente). Enregistre la cotisation puis purge tous les signalements du
// membre pour ce tour. Renvoie true si enregistrée, 'deja' si déjà payée, false sinon.
export function confirmerPaiementMembre(groupeId, paiementId) {
  if (estRejoint(groupeId) || horsLigne()) return false
  const g = getGroup(groupeId)
  if (!g) return false
  const p = getPendingPaiements(groupeId).find((x) => x.id === paiementId)
  if (!p) return false
  const membres = getMembres(groupeId)
  let membre = p.membreId ? membres.find((m) => m.id === Number(p.membreId)) : null
  if (!membre && p.nom) {
    membre = membres.find((m) => m.nom && p.nom && m.nom.trim().toLowerCase() === p.nom.trim().toLowerCase())
  }
  let tour = null
  if (p.tourId) tour = getToursRaw().find((t) => t.id === Number(p.tourId) && t.groupeId === Number(groupeId))
  // Pas de tour indiqué (ou tour d'un autre groupe) : le 1er tour en attente,
  // dans l'ordre des numéros — getToursRaw() n'est pas trié.
  if (!tour) tour = getTours(groupeId).find((t) => t.statut === 'en_attente') || null
  if (!membre || !tour) return false
  if (getPaiementMembre(tour.id, membre.id)) {
    purgerSignauxMembre(groupeId, { membreId: membre.id, nom: membre.nom, tourId: tour.id })
    return 'deja'
  }
  // Le montant du signalement vient du cloud : on ne l'accepte jamais au-delà
  // de la cotisation due pour ce tour (la pénalité est un champ séparé).
  const du = Number(g.montantCotisation) || 0
  if (du <= 0) return false
  const signale = Number(p.montant)
  const montant = Number.isFinite(signale) && signale > 0 ? Math.min(signale, du) : du
  const res = payerCotisation(
    groupeId,
    tour.id,
    membre.id,
    montant,
    todayStr(),
    p.operateur || 'Mobile Money',
    { operateur: p.operateur, numero: p.numeroEmetteur, reference: p.reference }
  )
  // En cas d'échec d'écriture on garde le signalement : le responsable peut
  // réessayer, au lieu de perdre la déclaration du membre.
  if (!res.ok) return false
  purgerSignauxMembre(groupeId, { membreId: membre.id, nom: membre.nom, tourId: tour.id })
  return true
}

// ── Bilan / Solde ────────────────────────────────────────────
// Calcul coûteux (O(membres × cotisations × tours)) appelé dans les tris et
// les boucles d'aperçu : mis en cache jusqu'à la prochaine écriture locale.
const cacheBilan = new Map()
let versionCache = -1

export function getBilan(groupeId) {
  const v = getVersion()
  if (v !== versionCache) {
    cacheBilan.clear()
    versionCache = v
  }
  if (cacheBilan.has(groupeId)) return cacheBilan.get(groupeId)
  const bilan = calculerBilan(groupeId)
  cacheBilan.set(groupeId, bilan)
  return bilan
}

function calculerBilan(groupeId) {
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
      const penalitesEnCours = enRetard.reduce((s, t) => s + (Number(t.penaliteAuto) || penaliteEstimee(groupe, t)), 0)
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

// Automatisation : applique la pénalité (selon le %/jour du groupe) aux tours en
// retard. Le montant est recalculé tant que le tour n'est pas reçu : figer la
// première valeur sous-estimerait la pénalité jour après jour.
export function appliquerPenalitesAuto(groupId) {
  if (estRejoint(groupId) || horsLigne()) return 0
  const group = getGroup(groupId)
  if (!group) return 0
  if (!group.penalitePctParJour || Number(group.penalitePctParJour) <= 0) return 0
  const auj = todayStr()
  let n = 0
  for (const t of getTours(groupId)) {
    if (t.statut !== 'en_attente') continue
    if (String(t.datePrevue) >= auj) continue
    const montant = Math.round(Number(calculerPenalite(group, t, auj)) || 0)
    if (montant <= 0) continue
    const deja = Math.round(Number(t.penaliteAuto) || 0)
    if (deja === montant) continue
    if (!updateTour(t.id, { penaliteAuto: montant })) continue
    if (!deja) {
      ajouterAuJournal(
        groupId,
        'penalite',
        `Pénalité auto de ${montant} FCFA appliquée au tour #${t.numero} (${getMembre(t.membreId)?.nom || 'membre'})`
      )
    }
    n++
  }
  return n
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
    const modeDetaille = c.modeOperateur
      ? ` via ${c.modeOperateur}${c.modeNumero ? ` (${c.modeNumero})` : ''}`
      : c.moyenPaiement ? ` via ${c.moyenPaiement}` : ''
    events.push({
      date: c.datePaiement,
      type: 'paiement',
      libelle: `${membreNom(c.membreId)} a payé sa cotisation (tour #${tour?.numero || '?'})${modeDetaille}${c.modeReference ? ` — réf ${c.modeReference}` : ''}`,
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
  const groupe = getGroup(groupeId)
  for (const e of (groupe?.journal || [])) {
    if (e.action === 'archive' || e.action === 'appel') {
      events.push({ date: e.date, type: e.action, libelle: e.libelle, montant: 0 })
    }
  }
  return events.sort((a, b) => (b.date || '').localeCompare(a.date || ''))
}

// ── Bilan annuel & clôture d'exercice ────────────────────────
// Bilan restreint à une année civile (filtré sur les dates de paiement et
// de réception). annee par défaut = année courante.
export function getBilanAnnee(groupeId, annee) {
  const an = annee ? Number(annee) : new Date().getFullYear()
  const bilan = getBilan(groupeId)
  const dansAnnee = (d) => {
    if (!d) return false
    const [a] = String(d).split('-')
    return Number(a) === an
  }
  const cotisations = bilan.cotisations.filter((c) => dansAnnee(c.datePaiement))
  const tours = bilan.tours.filter((t) => (t.statut === 'recu' ? dansAnnee(t.dateReception || t.datePrevue) : dansAnnee(t.datePrevue)))
  const totalCotis = cotisations.reduce((s, c) => s + Number(c.montant || 0), 0)
  const totalPenalites = cotisations.reduce((s, c) => s + Number(c.penalite || 0), 0)
  const totalRecu = tours
    .filter((t) => t.statut === 'recu')
    .reduce((s, t) => s + Number(t.montantPot || 0), 0)
  const parMembre = bilan.membres.map((m) => {
    const cotise = cotisations
      .filter((c) => c.membreId === m.id && c.statut === 'paye')
      .reduce((s, c) => s + Number(c.montant || 0), 0)
    const penalites = cotisations
      .filter((c) => c.membreId === m.id)
      .reduce((s, c) => s + Number(c.penalite || 0), 0)
    const recu = tours
      .filter((t) => t.membreId === m.id && t.statut === 'recu')
      .reduce((s, t) => s + Number(t.montantPot || 0), 0)
    return { membre: m, cotise, penalites, recu, solde: cotise - recu }
  })
  return {
    annee: an,
    membres: bilan.membres,
    tours,
    cotisations,
    totalCotis,
    totalPenalites,
    totalRecu,
    solde: totalCotis - totalRecu,
    parMembre,
  }
}

// Clôture l'exercice d'une année : fige le bilan annuel dans groupe.archives
// (remplace une archive existante de la même année). Réservé au responsable
// (groupe local, non rejoint, hors mode lecture seule).
export function archiverAnnee(groupeId, annee) {
  if (estRejoint(groupeId) || horsLigne()) return null
  const bilan = getBilanAnnee(groupeId, annee)
  const groupes = getGroups()
  const idx = groupes.findIndex((g) => g.id === Number(groupeId))
  if (idx === -1) return null
  const archive = {
    annee: bilan.annee,
    dateArchive: nowIso(),
    totalCotis: bilan.totalCotis,
    totalPenalites: bilan.totalPenalites,
    totalRecu: bilan.totalRecu,
    solde: bilan.solde,
    nbTours: bilan.tours.filter((t) => t.statut !== 'annule').length,
    nbPaiements: bilan.cotisations.filter((c) => c.statut === 'paye').length,
    parMembre: bilan.parMembre.map((p) => ({
      membreId: p.membre.id,
      nom: p.membre.nom,
      cotise: p.cotise,
      penalites: p.penalites,
      recu: p.recu,
      solde: p.solde,
    })),
  }
  const archives = Array.isArray(groupes[idx].archives)
    ? groupes[idx].archives.filter((a) => Number(a.annee) !== bilan.annee)
    : []
  archives.push(archive)
  archives.sort((a, b) => Number(a.annee) - Number(b.annee))
  groupes[idx] = { ...groupes[idx], archives }
  storage.save(K_GROUPS, groupes)
  ajouterAuJournal(groupeId, 'archive', `Clôture de l'exercice ${bilan.annee} (bilan figé, ${bilan.tours.filter((t) => t.statut !== 'annule').length} tours)`)
  return archive
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
    // Les motifs de refus décidés par le responsable descendent jusqu'au membre.
    rejetsPaiements: fusionRejets(g.rejetsPaiements, src.rejetsPaiements),
    annonces: Array.isArray(src.annonces) ? src.annonces : (g.annonces || []),
    messages: Array.isArray(src.messages) ? src.messages : (g.messages || []),
    // Les messages envoyés par l'invité restent en attente tant que le
    // responsable ne les a pas intégrés (accusé = présent dans le snapshot).
    // On compare la clé applicative, pas l'id : le miroir cloud régénère les ids.
    pendingMessages: (g.pendingMessages || []).filter(
      (p) => !(snapshot.groupe && snapshot.groupe.messages || []).some((x) => cleMessage(x) === cleMessage(p))
    ),
    ordreTire: (Array.isArray(src.ordreTire) ? src.ordreTire : g.ordreTire)
      .map((id) => Number(id))
      .filter((id) => (snapshot.membres || []).some((m) => Number(m.id) === id)),
    coGerants: (src.coGerants && typeof src.coGerants === 'object') ? { ...src.coGerants } : (g.coGerants || {}),
    archives: Array.isArray(src.archives) ? src.archives : (g.archives || []),
    receptionMM: src.receptionMM || g.receptionMM || null,
    waveSlug: (src.waveSlug || g.waveSlug || '').trim() || null,
    sauvegardeUid: src.sauvegardeUid || g.sauvegardeUid || '',
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

// ── Résolution de conflits (groupe personnel multi-appareils) ──
// Compare deux entités du même id : la plus récente l'emporte (majLe >),
// sinon la version cloud est privilégiée.
function entitePlusRecente(local, cloud) {
  if (local == null) return cloud
  if (cloud == null) return local
  const a = Number(local.majLe || 0)
  const b = Number(cloud.majLe || 0)
  return a > b ? local : cloud
}

// Adopte intégralement la version cloud du groupe personnel : remplace toutes
// les collections locales par celles du snapshot. L'id local est conservé.
export function adopterVersionCloud(groupeId, snapshot) {
  const g = getGroup(groupeId)
  if (!g || !snapshot) return false
  const src = snapshot.groupe || {}
  const groupes = getGroups().map((x) =>
    x.id === groupeId
      ? {
          ...x,
          nom: (src.nom || '').trim() || x.nom,
          deviseSymbole: src.deviseSymbole || x.deviseSymbole,
          devisePosition: src.devisePosition || x.devisePosition,
          montantCotisation: src.montantCotisation != null ? Number(src.montantCotisation) : x.montantCotisation,
          periodeJours: src.periodeJours != null ? Number(src.periodeJours) : x.periodeJours,
          leReceveurCotonise: src.leReceveurCotonise != null ? src.leReceveurCotonise : x.leReceveurCotonise,
          penalitePctParJour: src.penalitePctParJour != null ? Number(src.penalitePctParJour) : x.penalitePctParJour,
          penalitePlafond: src.penalitePlafond != null ? Number(src.penalitePlafond) : x.penalitePlafond,
          moyensPaiement: Array.isArray(src.moyensPaiement) && src.moyensPaiement.length ? src.moyensPaiement : x.moyensPaiement,
          membresMin: src.membresMin != null ? Number(src.membresMin) : x.membresMin,
          membresMax: src.membresMax != null ? Number(src.membresMax) : x.membresMax,
          statut: src.statut === 'terminee' ? 'terminee' : 'active',
          dateDebut: src.dateDebut || x.dateDebut,
          proprietaire: src.proprietaire || x.proprietaire,
          coGerants: (src.coGerants && typeof src.coGerants === 'object') ? { ...src.coGerants } : (x.coGerants || {}),
          archives: Array.isArray(src.archives) ? src.archives : (x.archives || []),
          receptionMM: src.receptionMM || x.receptionMM || null,
          sauvegardeUid: src.sauvegardeUid || x.sauvegardeUid || '',
          journal: Array.isArray(src.journal) ? src.journal : (x.journal || []),
          rejetsPaiements: fusionRejets(x.rejetsPaiements, src.rejetsPaiements),
          annonces: Array.isArray(src.annonces) ? src.annonces : (x.annonces || []),
          messages: Array.isArray(src.messages) ? src.messages : (x.messages || []),
          ordreTire: Array.isArray(src.ordreTire) ? src.ordreTire.map((id) => Number(id)) : (x.ordreTire || []),
          majLe: snapshot.majLe || Date.now(),
        }
      : x
  )
  storage.save(K_GROUPS, groupes)

  const fromSnapshot = (arr, mapFn) => (arr || []).map(mapFn)
  const remap = (id) => id

  const membres = fromSnapshot(snapshot.membres, (m) => ({
    id: Number(m.id),
    groupeId,
    nom: (m.nom || '').trim(),
    telephone: (m.telephone || '').trim(),
    email: m.email || '',
    uid: m.uid || null,
    role: m.role || 'membre',
    bloque: !!m.bloque,
    dateAdhesion: m.dateAdhesion || todayStr(),
    dateCreation: m.dateCreation || new Date().toISOString(),
    majLe: m.majLe || 0,
  }))
  storage.save(K_MEMBRES, [...getMembresRaw().filter((m) => m.groupeId !== groupeId), ...membres])

  const tours = fromSnapshot(snapshot.tours, (t) => ({
    id: Number(t.id),
    groupeId,
    numero: Number(t.numero) || 0,
    membreId: t.membreId != null ? remap(Number(t.membreId)) : null,
    datePrevue: t.datePrevue || todayStr(),
    montantPot: Number(t.montantPot) || 0,
    statut: ['en_attente', 'recu', 'annule'].includes(t.statut) ? t.statut : 'en_attente',
    dateReception: t.dateReception || null,
    majLe: t.majLe || 0,
  }))
  storage.save(K_TOURS, [...getToursRaw().filter((t) => t.groupeId !== groupeId), ...tours])

  const cotisations = fromSnapshot(snapshot.cotisations, (c) => ({
    id: Number(c.id),
    groupeId,
    tourId: Number(c.tourId),
    membreId: Number(c.membreId),
    montant: Number(c.montant) || 0,
    penalite: Number(c.penalite) || 0,
    statut: c.statut === 'paye' ? 'paye' : 'en_attente',
    moyenPaiement: c.moyenPaiement || '',
    modeOperateur: c.modeOperateur || '',
    modeNumero: c.modeNumero || '',
    modeReference: c.modeReference || '',
    datePaiement: c.datePaiement || todayStr(),
    majLe: c.majLe || 0,
  }))
  storage.save(K_COTIS, [...getCotisationsRaw().filter((c) => c.groupeId !== groupeId), ...cotisations])

  const prets = fromSnapshot(snapshot.prets, (p) => ({
    id: Number(p.id),
    groupeId,
    emprunteurId: p.emprunteurId != null ? remap(Number(p.emprunteurId)) : null,
    montant: Number(p.montant) || 0,
    tauxInteret: Number(p.tauxInteret) || 0,
    dateEcheance: p.dateEcheance || todayStr(),
    dateCreation: p.dateCreation || new Date().toISOString(),
    note: p.note || '',
    statut: p.statut === 'rembourse' ? 'rembourse' : 'en_cours',
    remboursements: Array.isArray(p.remboursements) ? p.remboursements : [],
    majLe: p.majLe || 0,
  }))
  storage.save(K_PRETS, [...getPretsRaw().filter((p) => p.groupeId !== groupeId), ...prets])
  return true
}

// Fusionne la version cloud dans le groupe personnel : conserve les entités
// locales absentes du cloud et, en cas de doublon, garde la plus récente
// (majLe). Ne supprime jamais une entité locale non présente dans le cloud.
export function fusionnerVersionCloud(groupeId, snapshot) {
  const g = getGroup(groupeId)
  if (!g || !snapshot) return false
  const src = snapshot.groupe || {}
  const groupes = getGroups().map((x) =>
    x.id === groupeId
      ? {
          ...x,
          nom: (src.nom || '').trim() || x.nom,
          deviseSymbole: src.deviseSymbole || x.deviseSymbole,
          devisePosition: src.devisePosition || x.devisePosition,
          montantCotisation: src.montantCotisation != null ? Number(src.montantCotisation) : x.montantCotisation,
          periodeJours: src.periodeJours != null ? Number(src.periodeJours) : x.periodeJours,
          leReceveurCotonise: src.leReceveurCotonise != null ? src.leReceveurCotonise : x.leReceveurCotonise,
          penalitePctParJour: src.penalitePctParJour != null ? Number(src.penalitePctParJour) : x.penalitePctParJour,
          penalitePlafond: src.penalitePlafond != null ? Number(src.penalitePlafond) : x.penalitePlafond,
          moyensPaiement: Array.isArray(src.moyensPaiement) && src.moyensPaiement.length ? src.moyensPaiement : x.moyensPaiement,
          membresMin: src.membresMin != null ? Number(src.membresMin) : x.membresMin,
          membresMax: src.membresMax != null ? Number(src.membresMax) : x.membresMax,
          statut: src.statut === 'terminee' ? 'terminee' : 'active',
          dateDebut: src.dateDebut || x.dateDebut,
          proprietaire: src.proprietaire || x.proprietaire,
          coGerants: { ...(x.coGerants || {}), ...(src.coGerants && typeof src.coGerants === 'object' ? src.coGerants : {}) },
          archives: [...(x.archives || []), ...(Array.isArray(src.archives) ? src.archives : [])],
          receptionMM: src.receptionMM || x.receptionMM || null,
          sauvegardeUid: src.sauvegardeUid || x.sauvegardeUid || '',
          journal: [...(x.journal || []), ...(Array.isArray(src.journal) ? src.journal : [])],
          rejetsPaiements: fusionRejets(x.rejetsPaiements, src.rejetsPaiements),
          annonces: [...(x.annonces || []), ...(Array.isArray(src.annonces) ? src.annonces : [])],
          messages: (() => {
            // Fusion par clé applicative (les ids sont régénérés par le cloud) ;
            // la version reçue complète la version locale, tri chronologique.
            const parCle = new Map()
            for (const m of x.messages || []) {
              const c = cleMessage(m)
              if (c) parCle.set(c, m)
            }
            for (const m of Array.isArray(src.messages) ? src.messages : []) {
              const c = cleMessage(m)
              if (c) parCle.set(c, { ...m, ...(parCle.get(c) && parCle.get(c).epingle ? { epingle: true } : {}) })
            }
            return [...parCle.values()].sort((a, b) => ((a.date < b.date ? -1 : 1))).slice(-200)
          })(),
          ordreTire: [...(x.ordreTire || []), ...(Array.isArray(src.ordreTire) ? src.ordreTire.map((id) => Number(id)) : [])],
          majLe: Math.max(Number(x.majLe || 0), Number(snapshot.majLe || 0)),
        }
      : x
  )
  storage.save(K_GROUPS, groupes)

  const fusion = (locales, cloud, mapFn) => {
    const localList = (locales() || []).filter((e) => e.groupeId !== groupeId)
    const locals = (locales() || []).filter((e) => e.groupeId === groupeId)
    const mapCloud = new Map()
    for (const e of (cloud || [])) mapCloud.set(Number(e.id), mapFn(e))
    for (const l of locals) {
      const c = mapCloud.get(Number(l.id))
      mapCloud.set(Number(l.id), entitePlusRecente(l, c))
    }
    return [...localList, ...mapCloud.values()]
  }

  storage.save(K_MEMBRES, fusion(getMembresRaw, snapshot.membres, (m) => ({
    id: Number(m.id),
    groupeId,
    nom: (m.nom || '').trim(),
    telephone: (m.telephone || '').trim(),
    email: m.email || '',
    uid: m.uid || null,
    role: m.role || 'membre',
    bloque: !!m.bloque,
    dateAdhesion: m.dateAdhesion || todayStr(),
    dateCreation: m.dateCreation || new Date().toISOString(),
    majLe: m.majLe || 0,
  })))

  storage.save(K_TOURS, fusion(getToursRaw, snapshot.tours, (t) => ({
    id: Number(t.id),
    groupeId,
    numero: Number(t.numero) || 0,
    membreId: t.membreId != null ? Number(t.membreId) : null,
    datePrevue: t.datePrevue || todayStr(),
    montantPot: Number(t.montantPot) || 0,
    statut: ['en_attente', 'recu', 'annule'].includes(t.statut) ? t.statut : 'en_attente',
    dateReception: t.dateReception || null,
    majLe: t.majLe || 0,
  })))

  storage.save(K_COTIS, fusion(getCotisationsRaw, snapshot.cotisations, (c) => ({
    id: Number(c.id),
    groupeId,
    tourId: Number(c.tourId),
    membreId: Number(c.membreId),
    montant: Number(c.montant) || 0,
    penalite: Number(c.penalite) || 0,
    statut: c.statut === 'paye' ? 'paye' : 'en_attente',
    moyenPaiement: c.moyenPaiement || '',
    modeOperateur: c.modeOperateur || '',
    modeNumero: c.modeNumero || '',
    modeReference: c.modeReference || '',
    datePaiement: c.datePaiement || todayStr(),
    majLe: c.majLe || 0,
  })))

  storage.save(K_PRETS, fusion(getPretsRaw, snapshot.prets, (p) => ({
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
    majLe: p.majLe || 0,
  })))
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
  if (horsLigne()) return { ok: false, raison: 'hors_ligne' }
  const s = getSettings()
  const liste = getEpargnes()
  const epargne = {
    id: nextId(liste),
    nom: (data.nom || '').trim() || 'Mon épargne',
    objectif: bornerPositif(data.objectif),
    deviseSymbole: data.deviseSymbole || s.deviseSymbole,
    devisePosition: data.devisePosition || s.devisePosition,
    icone: data.icone || 'piggy',
    echeance: data.echeance || '',
    rappel: !!data.rappel,
    verrouille: !!data.verrouille,
    modele: data.modele || '',
    dateCreation: nowIso(),
    majLe: Date.now(),
    versements: [],
  }
  liste.push(epargne)
  if (!storage.save(K_EPARGNES, liste)) return { ok: false, raison: 'ecriture' }
  return { ok: true, epargne }
}

export function updateEpargne(id, patch) {
  if (horsLigne()) return null
  const liste = getEpargnes()
  const idx = liste.findIndex((e) => e.id === Number(id))
  if (idx === -1) return null
  liste[idx] = { ...liste[idx], ...patch, id: liste[idx].id, majLe: Date.now() }
  return storage.save(K_EPARGNES, liste) ? liste[idx] : null
}

// Écritures d'argent : même contrat que les cotisations, un verdict
// { ok, raison }. L'appelant n'a jamais à deviner si le solde a bougé.
export function verserEpargne(id, montant, dateStr) {
  if (horsLigne()) return { ok: false, raison: 'hors_ligne' }
  const m = bornerPositif(montant)
  if (m <= 0) return { ok: false, raison: 'montant' }
  const liste = getEpargnes()
  const idx = liste.findIndex((e) => e.id === Number(id))
  if (idx === -1) return { ok: false, raison: 'introuvable' }
  const e = liste[idx]
  const mouvement = {
    id: nextId(e.versements || []),
    montant: m,
    date: dateStr || todayStr(),
    type: 'versement',
  }
  liste[idx] = { ...e, versements: [...(e.versements || []), mouvement], majLe: Date.now() }
  if (!storage.save(K_EPARGNES, liste)) return { ok: false, raison: 'ecriture' }
  return { ok: true, mouvement }
}

// Retrait réel : le solde ne peut jamais passer en négatif et une cagnotte
// verrouillée refuse tout retrait (le verrou protège l'objectif, pas seulement
// l'affichage du bouton).
export function retirerEpargne(id, montant, dateStr) {
  if (horsLigne()) return { ok: false, raison: 'hors_ligne' }
  const liste = getEpargnes()
  const idx = liste.findIndex((e) => e.id === Number(id))
  if (idx === -1) return { ok: false, raison: 'introuvable' }
  const e = liste[idx]
  if (e.verrouille) return { ok: false, raison: 'verrouille' }
  const m = bornerPositif(montant)
  if (m <= 0) return { ok: false, raison: 'montant' }
  if (m > totalEpargne(e)) return { ok: false, raison: 'solde_insuffisant' }
  const mouvement = {
    id: nextId(e.versements || []),
    montant: -m,
    date: dateStr || todayStr(),
    type: 'retrait',
  }
  liste[idx] = { ...e, versements: [...(e.versements || []), mouvement], majLe: Date.now() }
  if (!storage.save(K_EPARGNES, liste)) return { ok: false, raison: 'ecriture' }
  return { ok: true, mouvement }
}

// Suppression d'une écriture : c'est aussi un mouvement d'argent (le solde
// baisse d'autant), donc mêmes gardes que le retrait.
export function retirerVersement(id, versementId) {
  if (horsLigne()) return { ok: false, raison: 'hors_ligne' }
  const liste = getEpargnes()
  const idx = liste.findIndex((e) => e.id === Number(id))
  if (idx === -1) return { ok: false, raison: 'introuvable' }
  const e = liste[idx]
  if (e.verrouille) return { ok: false, raison: 'verrouille' }
  const v = (e.versements || []).find((x) => x.id === Number(versementId))
  if (!v) return { ok: false, raison: 'introuvable' }
  if (Number(v.montant) > 0 && totalEpargne(e) - Number(v.montant) < 0) {
    return { ok: false, raison: 'solde_insuffisant' }
  }
  liste[idx] = {
    ...e,
    versements: e.versements.filter((x) => x.id !== Number(versementId)),
    majLe: Date.now(),
  }
  if (!storage.save(K_EPARGNES, liste)) return { ok: false, raison: 'ecriture' }
  return { ok: true }
}

export function supprimerEpargne(id) {
  if (horsLigne()) return { ok: false, raison: 'hors_ligne' }
  const reste = getEpargnes().filter((e) => e.id !== Number(id))
  if (!storage.save(K_EPARGNES, reste)) return { ok: false, raison: 'ecriture' }
  return { ok: true }
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
    majLe: Date.now(),
  }
  prets.push(pret)
  if (!storage.save(K_PRETS, prets)) return null
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
  prets[idx] = { ...p, ...patch, id: p.id, majLe: Date.now() }
  if (!storage.save(K_PRETS, prets)) return null
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
  prets[idx] = { ...p, majLe: Date.now() }
  if (!storage.save(K_PRETS, prets)) return null
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
