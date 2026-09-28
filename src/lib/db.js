import { storage, nextId, todayStr, addDays, dateISO, nowIso } from './storage.js'
import { getSettings } from './format.js'
import { calculerPenalite, penaliteEstimee } from './penalty.js'
import { estLectureSeule } from './lectureSeule.js'
import { syncDisponible } from './cloudApi'
import { publierPaiementInvite, supprimerPaiementInvite } from './sync.js'

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
    montantCotisation: Number(data.montantCotisation) || 0,
    periodeJours: Number(data.periodeJours) || 7,
    leReceveurCotonise: data.leReceveurCotonise !== false,
    responsableParticipe: data.responsableParticipe !== false,
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
    coGerants: {},
    archives: [],
    sauvegardeUid: data.sauvegardeUid || '',
    receptionMM: data.receptionMM || null,
    waveSlug: (data.waveSlug || '').trim() || null,
    proprietaire: data.proprietaire || currentUid() || null,
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
    if (patch.role === 'co-responsable' || avant.role === 'co-responsable') {
      deriveCoGerants(membres[idx].groupeId)
    }
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
    if (m.role === 'co-responsable') deriveCoGerants(m.groupeId)
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
  // Anti-fraud : empêche une double distribution (un même tour déjà reçu).
  const existant = getToursRaw().find((x) => x.id === Number(tourId))
  if (existant && existant.statut === 'recu') {
    console.warn(`[anti-fraud] tour #${existant.numero} déjà distribué`)
    return existant
  }
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
// Enregistre une cotisation (payée). moyenPaiement = 'Espèces', 'Orange Money'…
// details : { operateur, numero, reference } pour les paiements Mobile Money.
// Renvoie la pénalité appliquée (0 si aucune).
export function payerCotisation(groupeId, tourId, membreId, montant, datePaiement, moyenPaiement, details) {
  if (estRejoint(groupeId) || horsLigne()) return 0
  const groupe = getGroup(groupeId)
  const tour = getToursRaw().find((t) => t.id === Number(tourId))
  const cotis = getCotisationsRaw()
  const existant = cotis.find(
    (c) => c.tourId === Number(tourId) && c.membreId === Number(membreId)
  )
  const penalite = groupe && tour ? calculerPenalite(groupe, tour, datePaiement) : 0
  const moyen = (moyenPaiement || '').trim()
  const d = details || {}
  const modeOperateur = (d.operateur || '').trim()
  const modeNumero = (d.numero || '').trim()
  const modeReference = (d.reference || '').trim()
  if (existant) {
    Object.assign(existant, {
      montant: Number(montant) || 0,
      datePaiement: datePaiement || todayStr(),
      statut: 'paye',
      penalite,
      moyenPaiement: moyen,
      modeOperateur,
      modeNumero,
      modeReference,
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
      modeOperateur,
      modeNumero,
      modeReference,
    })
  }
  storage.save(K_COTIS, cotis)
  const modeDetaille = modeOperateur ? ` via ${modeOperateur}${modeNumero ? ` (${modeNumero})` : ''}` : moyen ? ` via ${moyen}` : ''
  ajouterAuJournal(
    groupeId,
    'paiement',
    `${getMembre(Number(membreId))?.nom || 'Un membre'} a payé sa cotisation (tour #${tour?.numero || '?'})${modeDetaille}${modeReference ? ` — réf ${modeReference}` : ''}${penalite > 0 ? ` (+ ${penalite} de pénalité)` : ''}`
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
  payerCotisation(groupeId, tourId, membreId, montant, todayStr(), operateur, {
    operateur,
    numero: String(record.numero || record.telephone || ''),
    reference: String(record.reference || ''),
  })
  return 'ok'
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

// Le membre signale avoir payé sa cotisation (pour un tour donné). Renvoie le
// signalement créé (ou mis à jour), ou null. Les champs tourId / tourNumero /
// membreId permettent au responsable de confirmer le bon tour sans ambiguïté.
export function signalerPaiementMembre(groupeId, payload) {
  const g = getGroup(groupeId)
  if (!g || horsLigne()) return null
  const nom = (payload.nom || 'Membre').trim()
  const cleNom = nom.toLowerCase()
  const tourId = Number(payload.tourId) || null
  const membreId = Number(payload.membreId) || null
  const existants = getPendingPaiements(groupeId)
  // Déduplication : un même membre + même tour ne génère qu'un signalement.
  const doublon = existants.find((p) =>
    (membreId && p.membreId && Number(p.membreId) === membreId) ||
    (p.nom && cleNom && p.nom.trim().toLowerCase() === cleNom)
      ? (tourId ? Number(p.tourId) === tourId : true)
      : false
  )
  let paiement
  if (doublon) {
    paiement = {
      ...doublon,
      nom,
      montant: Number(payload.montant) || doublon.montant || 0,
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
      id: 'pai-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8),
      nom,
      montant: Number(payload.montant) || 0,
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
  if (!g || horsLigne()) return
  storage.save(K_GROUPS, getGroups().map((x) =>
    x.id === Number(groupeId)
      ? { ...x, pendingPaiements: getPendingPaiements(groupeId).filter((p) => p.id !== paiementId) }
      : x
  ))
  if (syncDisponible() && g.codeUnique && g.synchronise) {
    supprimerPaiementInvite(g.codeUnique, paiementId).catch(() => {})
  }
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
  if (!tour) tour = getToursRaw().find((t) => t.groupeId === Number(groupeId) && t.statut === 'en_attente')
  if (!membre || !tour) return false
  if (getPaiementMembre(tour.id, membre.id)) {
    purgerSignauxMembre(groupeId, { membreId: membre.id, nom: membre.nom, tourId: tour.id })
    return 'deja'
  }
  payerCotisation(
    groupeId,
    tour.id,
    membre.id,
    p.montant || g.montantCotisation,
    todayStr(),
    p.operateur || 'Mobile Money',
    { operateur: p.operateur, numero: p.numeroEmetteur, reference: p.reference }
  )
  purgerSignauxMembre(groupeId, { membreId: membre.id, nom: membre.nom, tourId: tour.id })
  return true
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

  // Automatisation : applique une pénalité (selon le %/jour du groupe) sur
  // chaque tour en retard non encore pénalisé, et la persiste en base
  // (tour.penaliteAuto) pour qu'elle soit visible et comptée sans double calcul.
  export function appliquerPenalitesAuto(groupId) {
    if (estRejoint(groupId) || horsLigne()) return 0
    const group = getGroup(groupId)
    if (!group) return 0
    if (!group.penalitePctParJour || Number(group.penalitePctParJour) <= 0) return 0
    const auj = todayStr()
    let n = 0
    for (const t of getTours(groupId)) {
      if (t.statut !== 'en_attente') continue
      if (t.penaliteAuto) continue
      if (String(t.datePrevue) >= auj) continue
      const montant = Math.round(Number(calculerPenalite(group, t, auj)) || 0)
      if (montant <= 0) continue
      updateTour(t.id, { penaliteAuto: montant })
      ajouterAuJournal(groupId, 'penalite', `Pénalité auto de ${montant} FCFA appliquée au tour #${t.numero} (${t.membre?.nom || 'membre'})`)
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
          annonces: [...(x.annonces || []), ...(Array.isArray(src.annonces) ? src.annonces : [])],
          messages: [...(x.messages || []), ...(Array.isArray(src.messages) ? src.messages : [])],
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
  if (horsLigne()) return null
  const s = getSettings()
  const liste = getEpargnes()
  const epargne = {
    id: nextId(liste),
    nom: (data.nom || '').trim() || 'Mon épargne',
    objectif: Number(data.objectif) || 0,
    deviseSymbole: data.deviseSymbole || s.deviseSymbole,
    devisePosition: data.devisePosition || s.devisePosition,
    icone: data.icone || 'piggy',
    echeance: data.echeance || '',
    rappel: !!data.rappel,
    verrouille: !!data.verrouille,
    modele: data.modele || '',
    dateCreation: nowIso(),
    versements: [],
  }
  liste.push(epargne)
  storage.save(K_EPARGNES, liste)
  return epargne
}

export function updateEpargne(id, patch) {
  if (horsLigne()) return null
  const liste = getEpargnes()
  const idx = liste.findIndex((e) => e.id === Number(id))
  if (idx === -1) return null
  liste[idx] = { ...liste[idx], ...patch, id: liste[idx].id }
  storage.save(K_EPARGNES, liste)
  return liste[idx]
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
