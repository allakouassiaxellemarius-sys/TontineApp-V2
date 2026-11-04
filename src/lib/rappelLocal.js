// ═══════════════════════════════════════════════════════════════
// Rappels de tour — notifications locales planifiées
// ---------------------------------------------------------------
// Fonctionne sans serveur ni compte : chaque appareil planifie ses
// propres rappels pour les prochains tours (échéance aujourd'hui ou
// demain à 08h00). Les push FCM (worker Cloudflare) restent un plus
// serveur, inutile pour ces rappels locaux.
// ═══════════════════════════════════════════════════════════════
import { getGroups, getTours, getGroup, membresImpays, getToursAvecMembre, getPrets, etatPret, getMembre, getMembres, getPaiementMembre } from './db'
import { getSyncUid } from './cloudApi'
import { getSettings, formatMontant } from './format'

// Imports dynamiques : le plugin n'est chargé qu'en natif, jamais dans
// Node (tests) ni dans le navigateur (où ces fonctions sont inutilisées).
async function chargerLocalNotifications() {
  return await import('@capacitor/local-notifications')
}

export function rappelsLocauxDisponibles() {
  const cap = typeof window !== 'undefined' ? window.Capacitor : undefined
  return !!(cap && cap.isNativePlatform && cap.isNativePlatform())
}

function heure8(jourStr) {
  const [a, m, j] = String(jourStr).split('-').map(Number)
  return new Date(a, m - 1, j, 8, 0, 0)
}

function dateMoins(jourStr, n) {
  const [a, m, j] = String(jourStr).split('-').map(Number)
  const d = new Date(a, m - 1, j)
  d.setDate(d.getDate() + n)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function dateLocale() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export function demainLocal() {
  const d = new Date(); d.setDate(d.getDate() + 1)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

// Logique pure : pour chaque groupe, le prochain tour à notifier (échéance
// aujourd'hui ou demain). Renvoie [{ id: groupeId, nom, numero, datePrevue }].
export function toursARappelerLocal(groups, aujourd, demain) {
  const auj = aujourd || dateLocale()
  const dem = demain || demainLocal()
  const resultats = []
  for (const g of groups || []) {
    const prochain = getTours(g.id)
      .filter((t) => t.statut === 'en_attente' && t.datePrevue)
      .sort((a, b) => String(a.datePrevue).localeCompare(String(b.datePrevue)))[0]
    if (!prochain) continue
    const datePrevue = String(prochain.datePrevue)
    if (datePrevue !== auj && datePrevue !== dem) continue
    resultats.push({ id: g.id, tourId: prochain.id, nom: g.nom, numero: prochain.numero, datePrevue })
  }
  return resultats
}

// Logique pure : pour chaque groupe, le premier tour EN RETARD (échéance
// dépassée) avec au moins un membre n'ayant pas payé. Renvoie
// [{ id, nom, numero, datePrevue, retardataires: [noms], nbRetards }].
export function toursARappelerRetards(groups, aujourd) {
  const auj = aujourd || dateLocale()
  const resultats = []
  for (const g of groups || []) {
    const tour = getTours(g.id)
      .filter((t) => t.statut === 'en_attente' && t.datePrevue && String(t.datePrevue) < auj)
      .sort((a, b) => String(a.datePrevue).localeCompare(String(b.datePrevue)))[0]
    if (!tour) continue
    const impays = membresImpays(g.id, tour.id)
    if (!impays.length) continue
    resultats.push({
      id: g.id,
      tourId: tour.id,
      nom: g.nom,
      numero: tour.numero,
      datePrevue: tour.datePrevue,
      retardataires: impays.map((m) => m.nom),
      nbRetards: impays.length,
    })
  }
  return resultats
}

// Logique pure : pour chaque groupe, les prêts à échéance aujourd'hui ou
// demain et pas encore soldés. Renvoie
// [{ id: groupeId, nom, pretId, emprunteurNom, reste, dateEcheance }].
export function pretsARappelerLocal(groups, aujourd, demain) {
  const auj = aujourd || dateLocale()
  const dem = demain || demainLocal()
  const resultats = []
  for (const g of groups || []) {
    for (const p of getPrets(g.id)) {
      if (etatPret(p, auj) === 'rembourse') continue
      const echeance = String(p.dateEcheance || '')
      if (echeance !== auj && echeance !== dem) continue
      const membre = getMembre(p.emprunteurId)
      resultats.push({
        id: g.id,
        nom: g.nom,
        pretId: p.id,
        emprunteurNom: membre ? membre.nom : 'Un membre',
        montant: p.montant,
        dateEcheance: echeance,
      })
    }
  }
  return resultats
}

// Logique pure : résumé du jour pour la notification récapitulative du matin.
// Renvoie null s'il n'y a rien d'important à signaler.
export function construireRecapQuotidien(groups, aujourd, demain) {
  const auj = aujourd || dateLocale()
  const dem = demain || demainLocal()
  const toursDuJour = []
  const retards = toursARappelerRetards(groups, auj)
  let aEncaisser = 0
  let nbTours = 0
  for (const g of groups || []) {
    const tour = getToursAvecMembre(g.id)
      .filter((t) => t.statut === 'en_attente' && t.datePrevue)
      .sort((a, b) => String(a.datePrevue).localeCompare(String(b.datePrevue)))[0]
    if (!tour) continue
    const d = String(tour.datePrevue)
    if (d === auj || d === dem) {
      toursDuJour.push(tour)
      nbTours++
      aEncaisser += Number(tour.montantPot || 0)
    }
  }
  const nbRetards = retards.reduce((s, r) => s + r.nbRetards, 0)
  const pretsDuJour = pretsARappelerLocal(groups, auj, dem)
  if (!nbTours && !retards.length && !pretsDuJour.length) return null
  const lignes = []
  if (nbTours) {
    lignes.push(`${nbTours} tour${nbTours > 1 ? 's' : ''} à encaisser ${formatMontant(aEncaisser, getSettings())} (aujourd'hui/demain).`)
  }
  if (pretsDuJour.length) {
    lignes.push(`${pretsDuJour.length} prêt${pretsDuJour.length > 1 ? 's' : ''} à échéance aujourd'hui/demain.`)
  }
  if (nbRetards) {
    lignes.push(`${nbRetards} retardataire${nbRetards > 1 ? 's' : ''} sur ${retards.length} tour${retards.length > 1 ? 's' : ''} en retard.`)
  }
  return { titre: 'Récap tontines du jour', corps: lignes.join(' '), aEncaisser, nbRetards }
}

// Le même rappel ne dit pas la même chose des deux côtés : un groupe `rejoint`
// est la copie locale d'un membre, qui doit payer ; les autres sont gérés depuis
// cet appareil, qui doit encaisser.
function corpsRappelTourMembre(g, numero, montantPot, quand, settings, retard = false) {
  const s = settings || getSettings()
  const montant = formatMontant(Number(g.montantCotisation) || Number(montantPot) || 0, s)
  return retard
    ? `Ta cotisation de ${montant} est en retard (tour #${numero}). Touche pour payer.`
    : `Ta cotisation de ${montant} est due ${quand} pour le tour #${numero}. Touche pour payer.`
}

// Un membre qui a déjà payé son tour ne doit pas être relancé : sur la copie
// locale d'un groupe rejoint, la cotisation confirmée par le responsable
// descend par la synchronisation, donc le verdict est lisible ici.
// Sans identité résolue, on ne bloque aucune relance (membre = le doute).
function cotisationDejaPayee(group, tourId) {
  try {
    const uid = getSyncUid()
    if (!uid) return false
    const moi = getMembres(group.id).find((m) => m.uid === uid)
    if (!moi || tourId == null) return false
    return !!getPaiementMembre(tourId, moi.id)
  } catch {
    return false
  }
}

export async function statutPermissionLocal() {
  try {
    const { LocalNotifications } = await chargerLocalNotifications()
    const p = await LocalNotifications.checkPermissions()
    return (p && p.display) || 'prompt'
  } catch {
    return 'prompt'
  }
}

export async function demanderPermissionLocal() {
  try {
    const { LocalNotifications } = await chargerLocalNotifications()
    const p = await LocalNotifications.requestPermissions()
    return (p && p.display) || 'prompt'
  } catch {
    return 'denied'
  }
}

// Reprogne tous les rappels locaux : échéances (aujourd'hui/demain à 08h00),
// relances quotidiennes des tours en retard (répétées à 08h00) et récap du
// matin (07h30). ID stable = id du groupe (le remplacement écrase l'ancien).
export async function programmerRappelsLocaux() {
  if (!rappelsLocauxDisponibles()) return
  try {
    const { LocalNotifications } = await chargerLocalNotifications()
    const aujourd = dateLocale()
    const demain = demainLocal()
    const idsGarde = new Set()

    // 0) Relances anticipées (J-3 et J-1) pour chaque tour à venir.
    for (const g of getGroups()) {
      const prochains = getTours(g.id)
        .filter((t) => t.statut === 'en_attente' && t.datePrevue)
        .sort((a, b) => String(a.datePrevue).localeCompare(String(b.datePrevue)))
      for (const t of prochains) {
        if (g.rejoint && cotisationDejaPayee(g, t.id)) continue
        for (const [decal, suffix, base] of [[-3, 'J-3', 3000000], [-1, 'J-1', 4000000]]) {
          const cible = dateMoins(t.datePrevue, decal)
          let at = heure8(cible)
          if (at.getTime() <= Date.now()) continue
          const idRel = base + t.id
          idsGarde.add(idRel)
          await LocalNotifications.schedule({
            notifications: [{
              id: idRel,
              title: `Rappel ${suffix} — ${g.nom}`,
              body: g.rejoint
                ? corpsRappelTourMembre(g, t.numero, t.montantPot, `le ${t.datePrevue}`)
                : `Tour #${t.numero} (${t.membre?.nom || 'membre'}) : échéance le ${t.datePrevue}. Préparez le pot de ${formatMontant(t.montantPot, getSettings())}.`,
              sound: 'chime_duo.wav',
              schedule: { at },
              data: { type: 'rappel_avance', code: null, groupeId: String(g.id) },
            }],
          }).catch(() => {})
        }
      }
    }

    // 1) Échéances aujourd'hui / demain.
    const rappels = toursARappelerLocal(getGroups(), aujourd, demain)
    for (const r of rappels) {
      const g = getGroup(r.id)
      // Déjà payé : on ne reprogramme pas, et l'ancien rappel encore en attente
      // sort de la liste des IDs gardés donc la phase de nettoyage l'annule.
      if (g && g.rejoint && cotisationDejaPayee(g, r.tourId)) continue
      idsGarde.add(r.id)
      const quand = r.datePrevue === aujourd ? "aujourd'hui" : 'demain'
      let at = heure8(r.datePrevue)
      if (at.getTime() <= Date.now()) at = new Date(Date.now() + 60 * 1000)
      await LocalNotifications.schedule({
        notifications: [{
          id: r.id,
          title: 'Rappel de tontine — ' + r.nom,
          body: g && g.rejoint
            ? corpsRappelTourMembre(g, r.numero, 0, quand)
            : `Tour #${r.numero} : échéance ${quand} à 08h00. Pensez à rappeler les membres.`,
          sound: 'chime_duo.wav',
          schedule: { at },
          data: { type: 'rappel_tour', code: null, groupeId: String(r.id) },
        }],
      }).catch(() => {})
    }

    // 2) Relances quotidiennes des tours en retard (08h00, répétées chaque jour).
    const retards = toursARappelerRetards(getGroups(), aujourd)
    for (const r of retards) {
      const g = getGroup(r.id)
      if (g && g.rejoint && cotisationDejaPayee(g, r.tourId)) continue
      idsGarde.add(1000000 + r.id)
      const noms = r.retardataires.slice(0, 3).join(', ')
      const body = g && g.rejoint
        ? corpsRappelTourMembre(g, r.numero, 0, '', true)
        : `Tour #${r.numero} en retard (${r.datePrevue}). ${r.nbRetards} membre(s) sans paiement : ${noms}${r.nbRetards > 3 ? '…' : ''}.`
      await LocalNotifications.schedule({
        notifications: [{
          id: 1000000 + r.id,
          title: 'Tour en retard — ' + r.nom,
          body,
          sound: 'chime_duo.wav',
          schedule: { on: { hour: 8, minute: 0, second: 0 }, repeats: true },
          data: { type: 'rappel_retard', code: null, groupeId: String(r.id) },
        }],
      }).catch(() => {})
    }

    // 3) Récap du matin (07h30, répété chaque jour) si activé.
    const s = getSettings()
    const recap = construireRecapQuotidien(getGroups(), aujourd, demain)
    if (s.recapQuotidienActif && recap) {
      idsGarde.add(999999999)
      await LocalNotifications.schedule({
        notifications: [{
          id: 999999999,
          title: recap.titre,
          body: recap.corps,
          sound: 'chime_duo.wav',
          schedule: { on: { hour: 7, minute: 30, second: 0 }, repeats: true },
          data: { type: 'recap_journalier', code: null, groupeId: null },
        }],
      }).catch(() => {})
    }

    // 4) Échéances de prêts aujourd'hui / demain (08h00). ID = 2000000 + id du prêt.
    const prets = pretsARappelerLocal(getGroups(), aujourd, demain)
    for (const r of prets) {
      idsGarde.add(2000000 + r.pretId)
      let at = heure8(r.dateEcheance)
      if (at.getTime() <= Date.now()) at = new Date(Date.now() + 60 * 1000)
      await LocalNotifications.schedule({
        notifications: [{
          id: 2000000 + r.pretId,
          title: 'Échéance de prêt — ' + r.nom,
          body: `${r.emprunteurNom} doit rembourser ${formatMontant(r.montant, s)} (échéance ${r.dateEcheance === aujourd ? "aujourd'hui" : 'demain'}).`,
          sound: 'chime_duo.wav',
          schedule: { at },
          data: { type: 'rappel_pret', code: null, groupeId: String(r.id) },
        }],
      }).catch(() => {})
    }

    // Annule les rappels d'anciens groupes dont l'échéance n'est plus à notifier.
    const pending = await LocalNotifications.getPending().catch(() => ({ notifications: [] }))
    const ids = (pending && pending.notifications) || []
    const aAnnuler = ids.filter((n) => !idsGarde.has(n.id))
    if (aAnnuler.length) await LocalNotifications.cancel({ notifications: aAnnuler }).catch(() => {})
  } catch {}
}

export async function annulerRappelsLocaux() {
  if (!rappelsLocauxDisponibles()) return
  try {
    const { LocalNotifications } = await chargerLocalNotifications()
    const pending = await LocalNotifications.getPending()
    const ids = (pending && pending.notifications) || []
    if (ids.length) await LocalNotifications.cancel({ notifications: ids })
  } catch {}
}

// Envoie une notification de test dans 5 s pour vérifier que l'appareil
// affiche bien les notifications. Retourne l'état de chaque étape.
export async function testerRappelLocal() {
  if (!rappelsLocauxDisponibles()) return { ok: false, raison: "Notifications disponibles uniquement sur l'application mobile." }
  try {
    const { LocalNotifications } = await chargerLocalNotifications()
    const p = await LocalNotifications.checkPermissions()
    let perm = p && p.display
    if (perm !== 'granted') {
      const r = await LocalNotifications.requestPermissions()
      perm = r && r.display
    }
    if (perm !== 'granted') {
      return { ok: false, raison: 'Autorisation refusée : activez « Notifications » pour Tontine Manager dans les réglages du téléphone (Paramètres → Applications → Tontine Manager → Notifications).' }
    }
    await LocalNotifications.schedule({
      notifications: [{
        id: Number(Date.now() % 100000),
        title: 'Tontine Manager — test',
        body: 'Vos notifications fonctionnent correctement ✓',
        sound: 'chime_duo.wav',
        schedule: { at: new Date(Date.now() + 5000) },
        data: { type: 'test', code: null, groupeId: null },
      }],
    })
    return { ok: true, detail: 'Notification programmée dans 5 secondes. Si rien ne s\u2019affiche, désactivez le mode « Ne pas déranger » et vérifiez que les notifications de l\u2019app sont bien activées dans les réglages Android.' }
  } catch (e) {
    return { ok: false, raison: 'Erreur lors de l\u2019envoi : ' + ((e && e.message) || 'échec inconnu') }
  }
}

export async function surRappelLocalTape(cb) {
  if (!rappelsLocauxDisponibles()) return () => {}
  try {
    const { LocalNotifications } = await chargerLocalNotifications()
    const r = await LocalNotifications.addListener('localNotificationActionPerformed', (n) => cb(n))
    return r.remove
  } catch {
    return () => {}
  }
}

// Notification locale affichée pendant que l'app est au premier plan.
export async function surRappelLocalRecu(cb) {
  if (!rappelsLocauxDisponibles()) return () => {}
  try {
    const { LocalNotifications } = await chargerLocalNotifications()
    const r = await LocalNotifications.addListener('localNotificationReceived', (n) => cb(n))
    return r.remove
  } catch {
    return () => {}
  }
}

// Affiche immédiatement une notification système (ex. push de discussion
// reçue pendant que l'app est au premier plan : Android ne l'affiche pas
// automatiquement, il faut la reprogrammer en local).
export async function afficherNotificationImmediate(titre, corps, data) {
  if (!rappelsLocauxDisponibles()) return
  try {
    const { LocalNotifications } = await chargerLocalNotifications()
    const p = await LocalNotifications.checkPermissions()
    if ((p && p.display) !== 'granted') return
    await LocalNotifications.schedule({
      notifications: [{
        id: Number(Date.now() % 1000000),
        title: titre,
        body: corps,
        sound: 'chime_duo.wav',
        schedule: { at: new Date(Date.now() + 250) },
        data: data || {},
      }],
    })
  } catch {}
}
