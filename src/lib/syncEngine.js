import { getGroup, getGroups, getMembres, getTours, getCotisations, getPrets, updateGroup, ensureCodeUnique, rejoindreDepuisSnapshot, deleteGroup, accepterInscription } from './db'
import {
  publierGroupe as publierCloud,
  supprimerDoc,
  chargerGroupe,
  chargerSauvegardes,
  supprimerSauvegarde,
  envoyerDemande,
  supprimerDemande,
  enregistrerGroupeCompte,
  chargerGroupesCompte,
} from './sync'
import { firebaseConfigure } from './firebaseConfig'
import { declencherNotifMessage } from './notifierMessage'

export function construireSnapshot(g, uid) {
  const groupe = getGroup(g.id)
  if (!groupe) return null
  return {
    format: 2,
    majLe: Date.now(),
    groupe: { ...groupe, proprietaire: uid || groupe.proprietaire || null },
    membres: getMembres(g.id),
    tours: getTours(g.id),
    cotisations: getCotisations(g.id),
    prets: getPrets(g.id),
  }
}

// Responsable : publie le groupe vers le cloud (appelé à chaque changement).
// La clé cloud est le code court d'invitation. Si uid est fourni, une copie
// de sauvegarde est aussi écrite sous users/{uid}/tontines/{code}.
export function publierSnapshot(g, uid) {
  if (!firebaseConfigure() || g.rejoint || !g.synchronise || !g.codeUnique) return false
  const data = construireSnapshot(g, uid)
  if (!data) return false
  publierCloud(g.codeUnique, data, uid || null).catch(() => {})
  notifierNouveauMessage(g.codeUnique, data)
  return true
}

// Dès qu'un nouveau message arrive dans le snapshot publié, déclenche le
// worker de notification (le dernier message de la liste est le nouveau :
// envoyerMessage les ajoute à la fin). Le code/dernier id est mémorisé pour
// ne pas re-notifier le même message à chaque publication du snapshot.
function notifierNouveauMessage(code, data) {
  const messages = (data.groupe && data.groupe.messages) || []
  if (!messages.length) return
  const dernier = String(messages[messages.length - 1].id)
  declencherNotifMessage(code, dernier)
}

// Responsable : active la synchro (s'assure d'un code court, publie immédiatement).
export function activerSynchro(groupeId, uid) {
  if (!firebaseConfigure()) {
    return { ok: false, raison: 'Firebase non configuré : renseignez src/lib/firebaseConfig.js' }
  }
  const g = getGroup(groupeId)
  if (!g) return { ok: false, raison: 'Groupe introuvable.' }
  if (g.rejoint) return { ok: false, raison: 'Seul le responsable peut activer la synchro.' }
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
  if (code) supprimerDoc(code, uid || null).catch(() => {})
  return { ok: true }
}

// Invité : rejoint un groupe en tapant le code court, les données sont
// téléchargées depuis le cloud (le responsable doit avoir activé la synchro).
// inscription : { nom, telephone, email, uid } facultatif — si fourni,
// l'invité s'enregistre auprès du responsable (demandes/{code}), qui
// l'ajoute ensuite comme membre. Avec uid, le groupe est aussi mémorisé
// sous le compte Google (rejoignable ensuite sans code).
export async function rejoindreParCode(codeStr, inscription) {
  const code = (codeStr || '').trim().toUpperCase()
  if (!code) return { ok: false, raison: 'Tapez le code d\u2019invitation reçu du responsable.' }
  if (!/^[A-Z2-9]{6}$/.test(code)) {
    return { ok: false, raison: 'Le code contient 6 caractères (lettres et chiffres sans ambiguïté).' }
  }
  if (!firebaseConfigure()) {
    return { ok: false, raison: 'Firebase non configuré : renseignez src/lib/firebaseConfig.js' }
  }
  if (getGroups().some((g) => g.codeUnique && g.codeUnique === code)) {
    return { ok: false, raison: 'Ce groupe est déjà présent sur cet appareil.' }
  }
  let snapshot
  try {
    snapshot = await chargerGroupe(code)
  } catch {
    return { ok: false, raison: 'Connexion impossible : vérifiez votre accès internet.' }
  }
  if (!snapshot || !snapshot.groupe || !snapshot.groupe.nom) {
    return { ok: false, raison: 'Groupe introuvable : vérifiez le code et que le responsable a activé la synchronisation.' }
  }
  const groupe = rejoindreDepuisSnapshot(snapshot)
  if (!groupe) return { ok: false, raison: 'Ce groupe est déjà présent sur cet appareil.' }

  // Inscription de l'invité auprès du responsable (best effort : si elle
  // échoue, le groupe est quand même rejoint, sans enregistrement).
  let inscrit = false
  if (inscription && (inscription.nom || '').trim()) {
    try {
      const demande = {
        nom: (inscription.nom || '').trim(),
        telephone: (inscription.telephone || '').trim(),
        email: (inscription.email || '').trim(),
        uid: inscription.uid || null,
        majLe: Date.now(),
      }
      const ref = await envoyerDemande(code, demande)
      inscrit = !!ref
    } catch {}
  }

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
  if (!firebaseConfigure() || !uid) return 0
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

// Sauvegarde complète du compte : republie tous les groupes du responsable
// sous users/{uid}/tontines. Renvoie le nombre de groupes sauvegardés.
export async function sauvegarderCompte(uid) {
  if (!firebaseConfigure() || !uid) return 0
  const propres = getGroups().filter((g) => !g.rejoint && g.synchronise && g.codeUnique)
  for (const g of propres) {
    const data = construireSnapshot(g, uid)
    if (data) publierCloud(g.codeUnique, data, uid).catch(() => {})
  }
  return propres.length
}

// Restauration : réimporte les groupes sauvegardés sous users/{uid}/tontines
// qui ne sont pas déjà présents sur l'appareil. Renvoie le nombre restaurés.
export async function restaurerCompte(uid) {
  if (!firebaseConfigure() || !uid) return 0
  let sauvegardes
  try {
    sauvegardes = await chargerSauvegardes(uid)
  } catch {
    return 0
  }
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
  return compteur
}

// Supprime la sauvegarde cloud d'un groupe du compte (à sa suppression locale).
export function supprimerDeCompte(uid, code) {
  if (!firebaseConfigure() || !uid || !code) return
  supprimerSauvegarde(uid, code).catch(() => {})
}

// Supprime un groupe localement et, si connecté, sa sauvegarde cloud du compte.
export function supprimerGroupeComplet(groupeId, uid) {
  const g = getGroup(groupeId)
  if (g && g.codeUnique && !g.rejoint) {
    supprimerDoc(g.codeUnique, uid || null).catch(() => {})
  }
  deleteGroup(groupeId)
}
