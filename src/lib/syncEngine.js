import { getGroup, getGroups, getMembres, getTours, getCotisations, getPrets, updateGroup, ensureCodeUnique, rejoindreDepuisSnapshot, deleteGroup, accepterInscription, assurerSauvegardeUid } from './db'
import {
  publierGroupe as publierCloud,
  supprimerDoc,
  chargerGroupe,
  chargerFicheGroupe,
  adhererGroupe,
  chargerSauvegardes,
  supprimerSauvegarde,
  supprimerDemande,
  enregistrerGroupeCompte,
  chargerGroupesCompte,
  publierSauvegardePrivee as publierPrivee,
  chargerSauvegardesPrivees,
  supprimerSauvegardePrivee,
  notifierDiscussion,
} from './sync'
import { syncDisponible } from './cloudApi'
import { storage } from './storage'
import { estResponsableDuGroupe, proprietaireDuGroupe } from './administration'

// ── Méta-synchronisation ──────────────────────────────────────
// K_SYNCMETA mémorise, par groupe, le majLe du dernier snapshot publié
// (base) et l'empreinte de son contenu. Stocké hors de la clé 'groups' pour
// ne pas redéclencher la publication à chaque mise à jour de ces métadonnées.
const K_SYNCMETA = 'syncmeta'
let syncmeta = {}
try { syncmeta = storage.load(K_SYNCMETA, {}) || {} } catch {}

function sauverSyncmeta() {
  storage.save(K_SYNCMETA, syncmeta)
}
function empreinte(data) {
  const stable = JSON.stringify(data, (k, v) => (k === 'base' || k === 'majLe' || k === 'empreinte' ? undefined : v))
  let h = 5381
  for (let i = 0; i < stable.length; i++) h = ((h << 5) + h + stable.charCodeAt(i)) >>> 0
  return String(h)
}

// Bilan de synchro local d'un groupe : { majLe, base, empreinte }.
export function etatSynchro(groupeId) {
  return syncmeta[groupeId] || { majLe: 0, base: 0, empreinte: '' }
}

export function construireSnapshot(g, uid) {
  const groupe = getGroup(g.id)
  if (!groupe) return null
  const etat = etatSynchro(g.id)
  return {
    format: 2,
    majLe: Date.now(),
    base: etat.majLe || 0,
    // Le propriétaire du groupe ne change pas quand un co-responsable publie :
    // c'est le seul champ que le worker utilise pour trancher les droits.
    groupe: { ...groupe, proprietaire: groupe.proprietaire || uid || null },
    membres: getMembres(g.id),
    tours: getTours(g.id),
    cotisations: getCotisations(g.id),
    prets: getPrets(g.id),
  }
}

// Responsable : publie le groupe vers le cloud (appelé à chaque changement).
// La clé cloud est le code court d'invitation. Si uid est fourni, une copie
// de sauvegarde est aussi écrite sous users/{uid}/tontines/{code}.
// L'empreinte évite de republier un contenu identique à chaque rafraîchissement
// du contexte ; les métadonnées (majLe/base) ne sont mémorisées qu'en cas de
// succès, pour détecter les conflits multi-appareils et relancer en cas d'échec.
export function publierSnapshot(g, uid) {
  if (!syncDisponible() || g.rejoint || !g.synchronise || !g.codeUnique) return false
  // Seul un responsable écrit le document partagé du groupe : le worker
  // refuserait (403) la publication d'un simple membre, qui n'a rien à y
  // publier. Ses copies privées, elles, restent dues (sauvegarderCompte).
  if (!estResponsableDuGroupe(g, uid)) return false
  const data = construireSnapshot(g, uid)
  if (!data) return false
  const maj = data.majLe
  const empreinteCourante = empreinte(data)
  const etat = etatSynchro(g.id)
  if (etat.empreinte === empreinteCourante) return true
  publierCloud(g.codeUnique, data, uid || null)
    .then(() => {
      syncmeta[g.id] = { majLe: maj, base: etat.majLe || 0, empreinte: empreinteCourante }
      sauverSyncmeta()
    })
    .catch(() => {})
  notifierNouveauMessage(g.codeUnique, data)
  return true
}

// Relance la synchronisation d'un groupe (après résolution d'un conflit :
// la version locale adoptée/fusionnée est re-publiée avec une nouvelle base).
export function reinitialiserSynchro(groupeId) {
  delete syncmeta[groupeId]
  sauverSyncmeta()
}

// Détecte un conflit multi-appareils sur un groupe personnel :
// le cloud contient une version plus récente (majLe >) publiée par un autre
// appareil, et l'appareil local possède des modifications non publiées
// (empreinte locale ≠ dernière empreinte publiée avec succès).
// Renvoie le snapshot cloud en conflit, ou null s'il n'y en a pas.
export function detecterConflit(groupeId, snapshotCloud, uid) {
  const g = getGroup(groupeId)
  if (!g || g.rejoint || !snapshotCloud || !snapshotCloud.groupe) return null
  const etat = etatSynchro(groupeId)
  if (!etat.empreinte) return null
  if (Number(snapshotCloud.majLe || 0) <= Number(etat.majLe || 0)) return null
  const local = construireSnapshot(g, uid || null)
  if (!local) return null
  if (empreinte(local) === etat.empreinte) return null
  return snapshotCloud
}

// Dès qu'un nouveau message arrive dans le snapshot publié, le worker pousse la
// notification aux membres (le dernier message de la liste est le nouveau :
// envoyerMessage les ajoute à la fin). La clef du dernier message notifié est
// mémorisée pour ne pas re-notifier à chaque publication du snapshot.
const K_DERNIER_NOTIF = 'dernier_message_notifie'

function notifierNouveauMessage(code, data) {
  const messages = (data.groupe && data.groupe.messages) || []
  if (!messages.length) return
  const dernier = messages[messages.length - 1]
  const cle = String(dernier.cle || dernier.id || '')
  if (!cle) return
  const vus = storage.load(K_DERNIER_NOTIF, {}) || {}
  if (vus[code] === cle) return
  vus[code] = cle
  storage.save(K_DERNIER_NOTIF, vus)
  notifierDiscussion(code, { texte: dernier.texte || 'Nouveau message', auteur: dernier.auteur }).catch(() => {})
}

// Responsable : active la synchro (s'assure d'un code court, publie immédiatement).
export function activerSynchro(groupeId, uid) {
  if (!syncDisponible()) {
    return { ok: false, raison: 'Synchronisation indisponible' }
  }
  const g = getGroup(groupeId)
  if (!g) return { ok: false, raison: 'Groupe introuvable.' }
  if (g.rejoint) return { ok: false, raison: 'Seul le responsable peut activer la synchro.' }
  if (!estResponsableDuGroupe(g, uid)) return { ok: false, raison: 'Seul le responsable de la tontine peut activer la synchronisation.' }
  const code = ensureCodeUnique(groupeId)
  updateGroup(groupeId, { synchronise: true })
  const ng = getGroup(groupeId)
  const data = construireSnapshot(ng, uid)
  if (data) publierCloud(code, data, uid || null).catch(() => {})
  return { ok: true, code }
}

// Responsable : désactive la synchro (supprime le document cloud).
export function desactiverSynchro(groupeId, uid) {
  const g = getGroup(groupeId)
  const code = g && g.codeUnique
  updateGroup(groupeId, { synchronise: false })
  // Supprimer le document cloud efface le groupe pour tous ses membres :
  // réservé au propriétaire (et à l'administrateur). Un co-responsable ou un
  // membre coupe sa synchro locale, sans rien détruire chez les autres.
  if (code && proprietaireDuGroupe(g, uid)) supprimerDoc(code, uid || null).catch(() => {})
  return { ok: true }
}

// Invité : rejoint un groupe en tapant le code court. Le snapshot complet
// n'est plus téléchargeable par un simple porteur de code : rejoindre est un
// acte enregistré côté serveur (POST /adhesion/{code}), qui pose l'adhérent,
// prévient le responsable (demandes/{code}) et rend les données une fois.
// inscription : { nom, telephone, email } facultatif — le worker reprend le
// nom du compte en repli. Le groupe est aussi mémorisé sous le compte Google
// (uid), donc rejoignable ensuite sans code.
export async function rejoindreParCode(codeStr, inscription) {
  const code = (codeStr || '').trim().toUpperCase()
  if (!code) return { ok: false, raison: 'Tapez le code d\u2019invitation reçu du responsable.' }
  if (!/^[A-Z2-9]{6}$/.test(code)) {
    return { ok: false, raison: 'Le code contient 6 caractères (lettres et chiffres sans ambiguïté).' }
  }
  if (!syncDisponible()) {
    return { ok: false, raison: 'Synchronisation indisponible' }
  }
  if (getGroups().some((g) => g.codeUnique && g.codeUnique === code)) {
    return { ok: false, raison: 'Ce groupe est déjà présent sur cet appareil.' }
  }
  let snapshot
  let adhesion = null
  try {
    const fiche = await chargerFicheGroupe(code)
    if (!fiche || !fiche.nom) {
      return { ok: false, raison: 'Groupe introuvable : vérifiez le code et que le responsable a activé la synchronisation.' }
    }
    snapshot = await adhererGroupe(code, {
      nom: ((inscription && inscription.nom) || '').trim(),
      telephone: ((inscription && inscription.telephone) || '').trim(),
      email: ((inscription && inscription.email) || '').trim(),
    })
    adhesion = (snapshot && snapshot.adhesion) || null
    if (!snapshot || !snapshot.groupe || !snapshot.groupe.nom) {
      // Le groupe n'existe qu'en miroir relationnel : le POST vient de rendre
      // ce compte adhérent, la lecture directe est donc autorisée.
      snapshot = await chargerGroupe(code)
    }
  } catch {
    return { ok: false, raison: 'Connexion impossible : vérifiez votre accès internet.' }
  }
  if (!snapshot || !snapshot.groupe || !snapshot.groupe.nom) {
    return { ok: false, raison: 'Groupe introuvable : vérifiez le code et que le responsable a activé la synchronisation.' }
  }
  const groupe = rejoindreDepuisSnapshot(snapshot)
  if (!groupe) return { ok: false, raison: 'Ce groupe est déjà présent sur cet appareil.' }

  // Le responsable est au courant dès lors que la demande part maintenant ou
  // que ce compte était déjà enregistré sur le groupe (autre appareil).
  const inscrit = !!(adhesion && (adhesion.demandeId || adhesion.dejaAdherent))

  // Mémorise le groupe sous le compte Google pour le retrouver plus tard
  // sur n'importe quel appareil, sans code d'invitation.
  if (inscription && inscription.uid) {
    enregistrerGroupeCompte(inscription.uid, code, { nom: groupe.nom, role: 'membre' }).catch(() => {})
  }

  return { ok: true, groupe, inscrit }
}

// Invité connecté : retrouve les groupes mémorisés sous son compte Google
// (users/{uid}/groupes) et les rejoint s'ils ne sont pas déjà présents.
// Renvoie le nombre de groupes (re)joints.
export async function restaurerMesGroupes(uid) {
  if (!syncDisponible() || !uid) return 0
  let liste
  try {
    liste = await chargerGroupesCompte(uid)
  } catch {
    return 0
  }
  let compteur = 0
  for (const { code } of liste) {
    if (getGroups().some((g) => g.codeUnique && g.codeUnique === code)) continue
    try {
      const snapshot = await chargerGroupe(code)
      if (snapshot && snapshot.groupe && snapshot.groupe.nom) {
        if (rejoindreDepuisSnapshot(snapshot)) compteur++
      }
    } catch {}
  }
  return compteur
}

// Responsable : traite une demande d'inscription (enregistrement automatique).
// L'invité est ajouté comme membre (dédupliqué par uid/email/téléphone), puis
// la demande est supprimée du cloud. Renvoie true si un membre a été ajouté.
export async function traiterDemande(groupeId, demandeId, demande) {
  const g = getGroup(groupeId)
  if (!g || !demande || !demande.nom) return false
  const membre = accepterInscription(groupeId, {
    nom: demande.nom,
    telephone: demande.telephone || '',
    email: demande.email || '',
    uid: demande.uid || null,
  })
  if (!membre) return false
  if (g.codeUnique && demandeId) supprimerDemande(g.codeUnique, demandeId).catch(() => {})
  // Si l'invité est connecté, on mémorise aussi le groupe sous son compte
  // Google : il le retrouvera sur un autre appareil sans code.
  if (membre.uid && g.codeUnique) {
    enregistrerGroupeCompte(membre.uid, g.codeUnique, { nom: g.nom, role: 'membre' }).catch(() => {})
  }
  return true
}

// Sauvegarde privée d'un groupe personnel : copie le snapshot sous
// users/{uid}/sauvegardes/{sauvegardeUid} (fonctionne même sans code
// d'invitation). Renvoie le sauvegardeUid, ou null en cas d'échec.
export function publierSauvegardePrivee(g, uid) {
  if (!syncDisponible() || !uid || g.rejoint) return null
  const sauvegardeUid = assurerSauvegardeUid(g.id)
  if (!sauvegardeUid) return null
  const data = construireSnapshot(g, uid)
  if (!data) return null
  publierPrivee(uid, sauvegardeUid, data).catch(() => {})
  return sauvegardeUid
}

// Sauvegarde complète du compte : republie tous les groupes du responsable
// sous users/{uid}/tontines (groupes synchronisés) et, pour chaque groupe
// personnel, une copie privée sous users/{uid}/sauvegardes/{sauvegardeUid}.
// Renvoie le nombre de groupes sauvegardés.
export async function sauvegarderCompte(uid) {
  if (!syncDisponible() || !uid) return 0
  const propres = getGroups().filter((g) => !g.rejoint)
  let compte = 0
  for (const g of propres) {
    if (g.synchronise && g.codeUnique && estResponsableDuGroupe(g, uid)) {
      const data = construireSnapshot(g, uid)
      if (data) publierCloud(g.codeUnique, data, uid).catch(() => {})
      compte++
    }
    // La copie privée reste due à chaque compte : c'est SA sauvegarde, elle ne
    // passe pas par le document partagé du groupe.
    if (publierSauvegardePrivee(g, uid)) compte++
  }
  return compte
}

// Restauration : réimporte les groupes sauvegardés sous users/{uid}/tontines
// et les copies privées users/{uid}/sauvegardes qui ne sont pas déjà présents
// sur l'appareil. Renvoie le nombre restaurés.
export async function restaurerCompte(uid) {
  if (!syncDisponible() || !uid) return 0
  let sauvegardes = []
  try {
    sauvegardes = await chargerSauvegardes(uid)
  } catch {}
  let compteur = 0
  for (const { code, data } of sauvegardes) {
    if (!data || !data.groupe || !data.groupe.nom) continue
    if (getGroups().some((g) => g.codeUnique && g.codeUnique === code)) continue
    const snapshot = { ...data, groupe: { ...data.groupe, codeUnique: code } }
    const proprietaire = data.groupe.proprietaire
    // S'il s'agit de ses propres groupes sauvegardés, on les restaure comme
    // groupes personnels (éditables) ; sinon, simple copie de lecture seule.
    if (proprietaire && proprietaire === uid) {
      if (rejoindreDepuisSnapshot(snapshot, { rejoint: false })) compteur++
    } else if (rejoindreDepuisSnapshot(snapshot)) {
      compteur++
    }
  }
  // Copies privées (groupes personnels, potentiellement sans code).
  let privees = []
  try {
    privees = await chargerSauvegardesPrivees(uid)
  } catch {}
  for (const { sauvegardeUid, data } of privees) {
    if (!data || !data.groupe || !data.groupe.nom) continue
    if (getGroups().some((g) => g.sauvegardeUid && g.sauvegardeUid === sauvegardeUid)) continue
    const snapshot = { ...data, groupe: { ...data.groupe, sauvegardeUid } }
    if (rejoindreDepuisSnapshot(snapshot, { rejoint: false })) compteur++
  }
  return compteur
}

// Supprime la sauvegarde cloud d'un groupe du compte (à sa suppression locale).
export function supprimerDeCompte(uid, code, sauvegardeUid) {
  if (!syncDisponible() || !uid) return
  if (code) supprimerSauvegarde(uid, code).catch(() => {})
  if (sauvegardeUid) supprimerSauvegardePrivee(uid, sauvegardeUid).catch(() => {})
}

// Supprime un groupe localement et, si connecté, sa sauvegarde cloud du compte.
export function supprimerGroupeComplet(groupeId, uid) {
  const g = getGroup(groupeId)
  if (g && g.codeUnique && !g.rejoint) {
    supprimerDoc(g.codeUnique, uid || null).catch(() => {})
  }
  if (g && g.sauvegardeUid && !g.rejoint && uid) {
    supprimerSauvegardePrivee(uid, g.sauvegardeUid).catch(() => {})
  }
  deleteGroup(groupeId)
  delete syncmeta[groupeId]
  sauverSyncmeta()
}
