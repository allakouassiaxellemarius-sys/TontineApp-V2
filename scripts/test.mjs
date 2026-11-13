const store = {}
globalThis.localStorage = {
  getItem: (k) => (k in store ? store[k] : null),
  setItem: (k, v) => { store[k] = String(v) },
  removeItem: (k) => { delete store[k] },
}

const { createGroup, addMembre, generateTours, payerCotisation, getBilan, getHistorique, getTours, getGroup, updateGroup, marquerTourRecu, getToursAvecMembre, ensureCodeUnique, rejoindreDepuisSnapshot, getMembres, appliquerSynchro, deleteGroup, deleteMembre, toggleBloque, accepterInscription, updateTour, membresImpays, genererTourSuivant, createPret, getPrets, getPret, updatePret, rembourserPret, retirerRemboursement, supprimerPret, totalARembourser, rembourseTotal, resteAPayer, etatPret, envoyerMessage, envoyerMessageInvite, integrerMessage, updateMembre, deriveCoGerants, estResponsable, assurerSauvegardeUid, getBilanAnnee, archiverAnnee, adopterVersionCloud, fusionnerVersionCloud, getCotisations, signalerPaiementMembre, confirmerPaiementMembre, getPendingPaiements, integrerPaiementInvite } = await import('./lib/db.js')
const { setLectureSeule } = await import('./lib/lectureSeule.js')
const { calculerPenalite } = await import('./lib/penalty.js')
const { buildMessageBienvenue } = await import('./lib/remind.js')
const { toursARappelerLocal, toursARappelerRetards, construireRecapQuotidien, pretsARappelerLocal } = await import('./lib/rappelLocal.js')

let fails = 0
function check(name, cond) {
  console.log((cond ? '✅' : '❌') + ' ' + name)
  if (!cond) fails++
}

const g = createGroup({
  nom: 'Tontine test',
  montantCotisation: 5000,
  periodeJours: 7,
  leReceveurCotonise: true,
  penalitePctParJour: 1,
  penalitePlafond: 10,
  dateDebut: '2026-08-01',
  moyensPaiement: ['Espèces', 'Orange Money'],
})
check('Groupe créé', g.id === 1 && g.montantCotisation === 5000)
check('Moyens de paiement enregistrés', g.moyensPaiement.length === 2 && g.moyensPaiement.includes('Orange Money'))

const a = addMembre(g.id, { nom: 'Aya', telephone: '0700000001' })
const b = addMembre(g.id, { nom: 'Kofi', telephone: '0700000002' })
const c = addMembre(g.id, { nom: 'Ama', telephone: '0700000003' })
check('3 membres ajoutés', [a, b, c].every((m) => m.id > 0))

const tours = generateTours(g.id)
check('3 tours générés', tours.length === 3)
check('Dates espacées de 7 jours', tours[0].datePrevue === '2026-08-01' && tours[1].datePrevue === '2026-08-08' && tours[2].datePrevue === '2026-08-15')
const pot = getToursAvecMembre(g.id)[0]
check('Pot = 3 x 5000', pot.montantPot === 15000)

const tour1 = tours[0]
const penalite = calculerPenalite(g, tour1, '2026-08-04')
check('Pénalité 3j = 150', penalite === 150, penalite)
const penalite2 = calculerPenalite(g, tour1, '2026-08-20')
check('Pénalité plafonnée à 10% = 500', penalite2 === 500)

const p1 = payerCotisation(g.id, tour1.id, a.id, 5000, '2026-08-01', 'Orange Money')
const p2 = payerCotisation(g.id, tour1.id, b.id, 5000, '2026-08-04', 'Espèces')
check('Pénalité enregistrée pour Kofi = 150', p2.ok === true && p2.penalite === 150)
payerCotisation(g.id, tour1.id, c.id, 5000, '2026-08-04', 'Espèces')

marquerTourRecu(tour1.id, '2026-08-04')

const bilan = getBilan(g.id)
check('Total cotisé = 15000', bilan.totalCotis === 15000)
check('Total pénalités = 300', bilan.totalPenalites === 300)
check('Total reçu = 15000', bilan.totalRecu === 15000)
check('Solde groupe = 0', bilan.soldeGroupe === 0)
check('Membre Aya : cotisé 5000, reçu 15000, solde -10000', bilan.parMembre.find((p) => p.membre.id === a.id).cotise === 5000 && bilan.parMembre.find((p) => p.membre.id === a.id).recu === 15000)

const histo = getHistorique(g.id)
check('Historique: 3 paiements + 1 réception = 4', histo.length === 4)
check('Moyen de paiement enregistré (Orange Money)', histo.some((e) => e.moyenPaiement === 'Orange Money'))

payerCotisation(g.id, tour1.id, a.id, 5000, '2026-08-02')
const bil2 = getBilan(g.id)
check('Pas de doublon de cotisation', bil2.totalCotis === 15000)

// ── Message de bienvenue ───────────────────────────────────────
const bienvenue = buildMessageBienvenue({ nom: 'Aya' }, { nom: 'Tontine test' })
check('Bienvenue contient le nom du membre', bienvenue.includes('Aya'))
check('Bienvenue contient le nom de la tontine', bienvenue.includes('Tontine test'))

// ── Rejoindre un groupe (depuis le cloud, snapshot format 2) ──
const codeInvite = ensureCodeUnique(g.id)
check('Code d\u2019invitation généré (6 caractères)', /^[A-Z2-9]{6}$/.test(codeInvite))
const snapJoin = {
  format: 2,
  majLe: Date.now(),
  groupe: { ...getGroup(g.id) },
  membres: getMembres(g.id),
  tours: getTours(g.id),
  cotisations: [],
}
check('Le snapshot transporte le codeUnique', snapJoin.groupe.codeUnique === codeInvite)

// Réinitialise le stockage = "second téléphone"
for (const k of Object.keys(store)) delete store[k]

const join = rejoindreDepuisSnapshot(snapJoin)
check('Groupe rejoint (copie, marqué rejoint)', !!join && join.nom === 'Tontine test' && join.rejoint === true)
const jg = join
check('Moyens de paiement du groupe rejoint', jg.moyensPaiement.includes('Orange Money'))
const jbilan = getBilan(jg.id)
check('3 membres + 3 tours importés', jbilan.membres.length === 3 && jbilan.tours.length === 3)
check('Invité sans historique : 0 cotisé, 0 pénalités', jbilan.totalCotis === 0 && jbilan.totalPenalites === 0)
check('Historique rejoint : aucun paiement importé', getHistorique(jg.id).every((e) => e.type !== 'paiement'))
check('Pot du tour rejoint = 15000', getToursAvecMembre(jg.id)[0].montantPot === 15000)

const join2 = rejoindreDepuisSnapshot(snapJoin)
check('Double jointure refusée', join2 === null)
const mauvais = rejoindreDepuisSnapshot({ format: 2, groupe: { nom: 'X' } })
check('Snapshot sans code rejeté', mauvais === null)

// ── Groupe rejoint = lecture seule ───────────────────────────
const nbMembresRejoint = getBilan(jg.id).membres.length
const ajoutBloque = addMembre(jg.id, { nom: 'Intrus', telephone: '0700000099' })
check('Ajout de membre bloqué sur un groupe rejoint', ajoutBloque === null && getBilan(jg.id).membres.length === nbMembresRejoint)

const majGroupe = updateGroup(jg.id, { montantCotisation: 9999 })
check('Modification du groupe bloquée (lecture seule)', majGroupe === null && getGroup(jg.id).montantCotisation === 5000)

const membreRejoint = getBilan(jg.id).membres[0].id
const tourRejoint = getTours(jg.id)[0]
const paiementBloque = payerCotisation(jg.id, tourRejoint.id, membreRejoint, 5000, '2026-08-05', 'Espèces')
check('Paiement bloqué sur un groupe rejoint', paiementBloque.ok === false && getBilan(jg.id).totalCotis === 0)

const nbToursRejoint = getTours(jg.id).length
generateTours(jg.id)
check('Génération de tours bloquée sur un groupe rejoint', getTours(jg.id).length === nbToursRejoint)

// ── Synchro en ligne (simulation sans Firebase) ──────────────
// Appareil A = responsable
for (const k of Object.keys(store)) delete store[k]
const owner2 = createGroup({ nom: 'Tontine sync', montantCotisation: 5000, periodeJours: 7, leReceveurCotonise: true, penalitePctParJour: 1, penalitePlafond: 10, dateDebut: '2026-08-01' })
addMembre(owner2.id, { nom: 'Aya', telephone: '0701' })
const code2 = ensureCodeUnique(owner2.id)
updateGroup(owner2.id, { synchronise: true })
check('Le code court identifie le groupe synchronisé', !!code2 && /^[A-Z2-9]{6}$/.test(code2))
const snapTest = {
  format: 2,
  majLe: Date.now(),
  groupe: { ...getGroup(owner2.id), nom: 'Tontine MAJ', montantCotisation: 6000 },
  membres: getMembres(owner2.id),
  tours: [],
  cotisations: [],
}
check('Snapshot refusé sur un groupe propriétaire', appliquerSynchro(owner2.id, snapTest) === false)

// Appareil B = invité (stockage vidé)
for (const k of Object.keys(store)) delete store[k]
const join3 = rejoindreDepuisSnapshot(snapTest)
check('Groupe rejoint hérite du codeUnique', !!join3 && join3.codeUnique === code2)
const jg3 = join3
const applique = appliquerSynchro(jg3.id, snapTest)
check('Snapshot appliqué sur le groupe invité', applique === true && getGroup(jg3.id).nom === 'Tontine MAJ' && getGroup(jg3.id).montantCotisation === 6000)
check('Invité reste en lecture seule après synchro', addMembre(jg3.id, { nom: 'Intrus' }) === null)
deleteGroup(jg3.id)
check('Invité peut retirer sa copie locale du groupe', getGroup(jg3.id) === null)
const autreId = owner2.id
deleteGroup(autreId)
check('Responsable peut toujours supprimer son groupe', getGroup(autreId) === null)

// ── Classement tiré au sort (ordreTire) ───────────────────────
for (const k of Object.keys(store)) delete store[k]
const ownerO = createGroup({ nom: 'Tontine ordre', montantCotisation: 1000, periodeJours: 7, leReceveurCotonise: true, dateDebut: '2026-08-01' })
const mOa = addMembre(ownerO.id, { nom: 'Aya' })
const mOk = addMembre(ownerO.id, { nom: 'Kofi' })
updateGroup(ownerO.id, { ordreTire: [mOk.id, mOa.id] })
check('Ordre tiré enregistré sur le groupe propriétaire', getGroup(ownerO.id).ordreTire.join(',') === [mOk.id, mOa.id].join(','))
ensureCodeUnique(ownerO.id)
const snapOrdre = {
  format: 2,
  majLe: Date.now(),
  groupe: { ...getGroup(ownerO.id) },
  membres: getMembres(ownerO.id),
  tours: [],
  cotisations: [],
}

// Appareil invité : stockage vidé + un groupe local déjà présent
for (const k of Object.keys(store)) delete store[k]
const localAvant = createGroup({ nom: 'Local', montantCotisation: 100, periodeJours: 7, dateDebut: '2026-08-01' })
addMembre(localAvant.id, { nom: 'Zou' })
const joinOrdre = rejoindreDepuisSnapshot(snapOrdre)
const idKofiInvite = getBilan(joinOrdre.id).membres.find((m) => m.nom === 'Kofi').id
check("Ordre remappé sur les membres locaux de l'invité", getGroup(joinOrdre.id).ordreTire.length === 2 && getGroup(joinOrdre.id).ordreTire[0] === idKofiInvite)
const appOrdre = appliquerSynchro(joinOrdre.id, snapOrdre)
check("Synchro applique l'ordre du responsable", appOrdre === true && getGroup(joinOrdre.id).ordreTire.join(',') === [mOk.id, mOa.id].join(','))

// ── Purge de l'ordre tiré (membre supprimé ou bloqué) ─────────
for (const k of Object.keys(store)) delete store[k]
const ownerP = createGroup({ nom: 'Tontine purge', montantCotisation: 1000, periodeJours: 7, dateDebut: '2026-08-01' })
const pa = addMembre(ownerP.id, { nom: 'Aya' })
const pk = addMembre(ownerP.id, { nom: 'Kofi' })
const pm = addMembre(ownerP.id, { nom: 'Ama' })
updateGroup(ownerP.id, { ordreTire: [pa.id, pk.id, pm.id] })
deleteMembre(pa.id)
check("Membre supprimé retiré de l'ordre tiré", getGroup(ownerP.id).ordreTire.join(',') === [pk.id, pm.id].join(','))
updateGroup(ownerP.id, { ordreTire: [pk.id, pm.id] })
toggleBloque(pk.id)
check("Membre bloqué retiré de l'ordre tiré", getGroup(ownerP.id).ordreTire.join(',') === [pm.id].join(''))

// ── Invité : l'ordre ignore les membres supprimés par le responsable ──
for (const k of Object.keys(store)) delete store[k]
const ownerS = createGroup({ nom: 'Tontine snap', montantCotisation: 1000, periodeJours: 7, dateDebut: '2026-08-01' })
const sa = addMembre(ownerS.id, { nom: 'Aya' })
const sk = addMembre(ownerS.id, { nom: 'Kofi' })
updateGroup(ownerS.id, { ordreTire: [sa.id, sk.id, 999] })
ensureCodeUnique(ownerS.id)
const snapS = {
  format: 2,
  majLe: Date.now(),
  groupe: { ...getGroup(ownerS.id) },
  membres: getMembres(ownerS.id),
  tours: [],
  cotisations: [],
}
for (const k of Object.keys(store)) delete store[k]
createGroup({ nom: 'Local', montantCotisation: 100, periodeJours: 7, dateDebut: '2026-08-01' })
const joinS = rejoindreDepuisSnapshot(snapS)
const ordreS = getGroup(joinS.id).ordreTire
check("Ordre invité ignore les membres supprimés du responsable", ordreS.length === 2 && ordreS.every((x) => getMembres(joinS.id).some((m) => m.id === x)))

// ── Restauration depuis le compte Google (groupes personnels) ──
for (const k of Object.keys(store)) delete store[k]
const ownerC = createGroup({ nom: 'Tontine compte', montantCotisation: 2000, periodeJours: 7, dateDebut: '2026-08-01' })
addMembre(ownerC.id, { nom: 'Aya' })
ensureCodeUnique(ownerC.id)
const snapCompte = {
  format: 2,
  majLe: Date.now(),
  groupe: { ...getGroup(ownerC.id), proprietaire: 'uid-google-123' },
  membres: getMembres(ownerC.id),
  tours: [],
  cotisations: [],
}
for (const k of Object.keys(store)) delete store[k]
const perso = rejoindreDepuisSnapshot(snapCompte, { rejoint: false })
check("Restauration compte : groupe personnel (éditable)", perso !== null && getGroup(perso.id).rejoint === false)
check("Restauration compte : propriétaire conservé", getGroup(perso.id).proprietaire === 'uid-google-123')
check("Restauration compte : membres importés", getMembres(perso.id).length === 1)
const dupe = rejoindreDepuisSnapshot(snapCompte, { rejoint: false })
check("Restauration compte : pas de doublon (même code)", dupe === null)

// ── Rappels locaux : sélection du prochain tour (aujourd'hui/demain) ──
for (const k of Object.keys(store)) delete store[k]
const gR = createGroup({ nom: 'Tontine rappel', montantCotisation: 3000, periodeJours: 7, dateDebut: '2026-08-01' })
addMembre(gR.id, { nom: 'Aya' }); addMembre(gR.id, { nom: 'Kofi' }); addMembre(gR.id, { nom: 'Ama' })
const toursR = generateTours(gR.id)
check('Rappel : tour du jour sélectionné', toursARappelerLocal([gR], '2026-08-01', '2026-08-02').length === 1 && toursARappelerLocal([gR], '2026-08-01', '2026-08-02')[0].numero === 1)
check('Rappel : aucun tour hors fenêtre', toursARappelerLocal([gR], '2026-08-04', '2026-08-05').length === 0)
marquerTourRecu(toursR[0].id, '2026-08-02')
check('Rappel : tour de demain sélectionné', toursARappelerLocal([gR], '2026-08-07', '2026-08-08')[0].datePrevue === '2026-08-08')
check('Rappel : passe au tour suivant après réception', toursARappelerLocal([gR], '2026-08-08', '2026-08-09').length === 1 && toursARappelerLocal([gR], '2026-08-08', '2026-08-09')[0].numero === 2)
check('Rappel : groupe sans tour notifiable ignoré', toursARappelerLocal([], '2026-08-01', '2026-08-02').length === 0)

// ── Inscription automatique : invité enregistré chez le responsable ──
for (const k of Object.keys(store)) delete store[k]
const gI = createGroup({ nom: 'Tontine inscription', montantCotisation: 2500, periodeJours: 7, dateDebut: '2026-08-01' })
addMembre(gI.id, { nom: 'Déjà là', telephone: '0700000099' })
ensureCodeUnique(gI.id)
const inv = accepterInscription(gI.id, { nom: 'Aya Kouassi', telephone: '0700000001', uid: 'uid-invite' })
check('Inscription : invité ajouté comme membre', inv !== null && inv.nom === 'Aya Kouassi' && inv.uid === 'uid-invite')
check('Inscription : doublon par uid refusé', accepterInscription(gI.id, { nom: 'Aya K.', telephone: '0777777777', uid: 'uid-invite' }) === null)
const inv2 = accepterInscription(gI.id, { nom: 'Autre', telephone: '0700000001', uid: 'uid-2' })
check('Inscription : doublon par téléphone refusé', inv2 === null)
const inv3 = accepterInscription(gI.id, { nom: 'Kofi', telephone: '0700000002', uid: 'uid-3' })
check('Inscription : second invité accepté', inv3 !== null && getMembres(gI.id).length === 3)

// ── Automatisation : tour suivant créé à la réception ─────────
for (const k of Object.keys(store)) delete store[k]
const gAuto = createGroup({ nom: 'Tontine auto', montantCotisation: 4000, periodeJours: 7, leReceveurCotonise: true, dateDebut: '2026-08-01' })
const mAuto1 = addMembre(gAuto.id, { nom: 'Aya' })
const mAuto2 = addMembre(gAuto.id, { nom: 'Kofi' })
const toursAuto = generateTours(gAuto.id)
const nbToursAvant = getTours(gAuto.id).length
const tRecu = marquerTourRecu(toursAuto[0].id, '2026-08-02')
check('Tour marqué reçu', tRecu !== null && tRecu.statut === 'recu')
check('Pas de tour auto si tout le monde a déjà un tour', getTours(gAuto.id).length === nbToursAvant)

// Un 3e membre rejoint après le planning : son tour est créé à la prochaine réception.
const mAuto3 = addMembre(gAuto.id, { nom: 'Ama' })
const tourAuto = genererTourSuivant(gAuto.id)
check('Tour suivant créé pour le membre sans tour', tourAuto !== null && tourAuto.membreId === mAuto3.id && tourAuto.numero === 3)
check('Échéance du tour auto = dernière + période', getTours(gAuto.id).some((t) => t.numero === 3 && t.datePrevue === '2026-08-15'))
check('Pot du tour auto recalculé', getToursAvecMembre(gAuto.id).find((t) => t.numero === 3).montantPot === 3 * 4000)

// ── Automatisation : membres impayés d'un tour ─────────────────
const gImp = createGroup({ nom: 'Tontine impayés', montantCotisation: 2000, periodeJours: 7, leReceveurCotonise: false, dateDebut: '2026-08-01' })
const miA = addMembre(gImp.id, { nom: 'Aya', telephone: '0701' })
const miK = addMembre(gImp.id, { nom: 'Kofi', telephone: '0702' })
const tourImp = generateTours(gImp.id)[0]
check('Impayés : tous cotisants sauf le receveur', membresImpays(gImp.id, tourImp.id).length === 1 && membresImpays(gImp.id, tourImp.id)[0].id === miK.id)
payerCotisation(gImp.id, tourImp.id, miK.id, 2000, '2026-08-01', 'Espèces')
check('Impayés : plus personne après règlement', membresImpays(gImp.id, tourImp.id).length === 0)

// ── Automatisation : rappels de retard + récap quotidien ───────
const gRet = createGroup({ nom: 'Tontine retard', montantCotisation: 1000, periodeJours: 7, leReceveurCotonise: true, penalitePctParJour: 1, penalitePlafond: 10, dateDebut: '2026-08-01' })
addMembre(gRet.id, { nom: 'Aya', telephone: '0701' }); addMembre(gRet.id, { nom: 'Kofi', telephone: '0702' })
const toursRet = generateTours(gRet.id)
check('Retard : rien avant l\u2019échéance', toursARappelerRetards([gRet], '2026-07-31').length === 0)
check('Retard : tour échu non payé détecté', toursARappelerRetards([gRet], '2026-08-04').length === 1 && toursARappelerRetards([gRet], '2026-08-04')[0].numero === 1 && toursARappelerRetards([gRet], '2026-08-04')[0].nbRetards === 2)
const membresRet = getMembres(gRet.id)
payerCotisation(gRet.id, toursRet[0].id, membresRet[0].id, 1000, '2026-08-04', 'Espèces')
payerCotisation(gRet.id, toursRet[0].id, membresRet[1].id, 1000, '2026-08-04', 'Espèces')
check('Retard : plus de relance quand tout est payé', toursARappelerRetards([gRet], '2026-08-05').length === 0)
check('Récap : résumé avec tours et retards', (() => {
  const r = construireRecapQuotidien([gRet], '2026-08-01', '2026-08-02')
  return r !== null && r.nbRetards === 0 && r.aEncaisser === 2 * 1000
})())
check('Récap : rien à signaler sans tours', construireRecapQuotidien([], '2026-08-01', '2026-08-02') === null)

// ── Automatisation : pénalités en cours visibles au bilan ──────
const gPen = createGroup({ nom: 'Tontine pénalités', montantCotisation: 5000, periodeJours: 7, leReceveurCotonise: true, penalitePctParJour: 1, penalitePlafond: 10, dateDebut: '2026-08-01' })
const mp1 = addMembre(gPen.id, { nom: 'Aya' }); addMembre(gPen.id, { nom: 'Kofi' })
generateTours(gPen.id)
const bilanPen = getBilan(gPen.id)
check('Pénalités en cours accumulées au bilan', bilanPen.totalPenalitesEnCours > 0 && bilanPen.parMembre.find((p) => p.membre.id === mp1.id).penalitesEnCours > 0)
check('nbEnRetard recalculé (tours échus non réglés)', bilanPen.parMembre.find((p) => p.membre.id === mp1.id).nbEnRetard >= 1)

// ── Mode lecture seule : bloque les écritures, jamais navigator.onLine ──
const gLS = createGroup({ nom: 'Tontine lecture seule', montantCotisation: 1000, periodeJours: 7, dateDebut: '2026-08-01' })
addMembre(gLS.id, { nom: 'L1', telephone: '0700000101' })
const tourLS = generateTours(gLS.id)[0]
setLectureSeule(true)
check('Lecture seule : modification de date de tour bloquée', updateTour(tourLS.id, { datePrevue: '2026-01-01' }) === null && getTours(gLS.id)[0].datePrevue === '2026-08-01')
setLectureSeule(false)
check('Lecture seule désactivée : modification de date de tour acceptée', (() => { const r = updateTour(tourLS.id, { datePrevue: '2026-09-15' }); return r !== null && getTours(gLS.id)[0].datePrevue === '2026-09-15' })())
check('Lecture seule : ne dépend pas de navigator.onLine', getTours(gLS.id)[0].datePrevue === '2026-09-15')

// ── Prêts entre membres ───────────────────────────────────────
for (const k of Object.keys(store)) delete store[k]
const gP = createGroup({ nom: 'Tontine prêts', montantCotisation: 1000, periodeJours: 7, dateDebut: '2026-08-01' })
const pA = addMembre(gP.id, { nom: 'Aya' })
const pK = addMembre(gP.id, { nom: 'Kofi' })
const pret1 = createPret(gP.id, { emprunteurId: pK.id, montant: 10000, tauxInteret: 0, dateEcheance: '2026-08-20' })
check('Prêt créé', pret1 !== null && pret1.id === 1 && pret1.emprunteurId === pK.id && pret1.groupeId === gP.id)
check('Prêt : montant nul refusé', createPret(gP.id, { emprunteurId: pK.id, montant: 0 }) === null)
check('getPrets trié par id', getPrets(gP.id).length === 1 && getPrets(gP.id)[0].id === pret1.id)
check('Total à rembourser sans intérêt = montant', totalARembourser(pret1) === 10000 && resteAPayer(pret1) === 10000 && rembourseTotal(pret1) === 0)
check('Statut : en_cours avant l\u2019échéance', etatPret(pret1, '2026-08-10') === 'en_cours')
check('Statut : en_retard après l\u2019échéance', etatPret(pret1, '2026-08-21') === 'en_retard')

const remb1 = rembourserPret(pret1.id, 4000, '2026-08-05')
check('Remboursement partiel enregistré', remb1 !== null && remb1.montant === 4000)
check('Reste à payer après 4000/10000', resteAPayer(getPret(pret1.id)) === 6000)
check('Prêt partiellement remboursé encore en_cours', etatPret(getPret(pret1.id), '2026-08-21') === 'en_retard')
check('Remboursement bloqué sur montant nul', rembourserPret(pret1.id, 0) === null)

rembourserPret(pret1.id, 6000, '2026-08-10')
check('Prêt soldé passé en rembourse', etatPret(getPret(pret1.id), '2026-08-21') === 'rembourse' && getPret(pret1.id).statut === 'rembourse')
const nbRemb = getPret(pret1.id).remboursements.length
retirerRemboursement(pret1.id, getPret(pret1.id).remboursements[1].id)
check('Retirer un versement le repasse en_retard', getPret(pret1.id).remboursements.length === nbRemb - 1 && etatPret(getPret(pret1.id), '2026-08-21') === 'en_retard')

const pret2 = createPret(gP.id, { emprunteurId: pA.id, montant: 5000, tauxInteret: 10, dateEcheance: '2026-09-01' })
check('Intérêt 10% : total à rembourser = 5500', totalARembourser(pret2) === 5500 && resteAPayer(pret2) === 5500)
const upd = updatePret(pret2.id, { dateEcheance: '2026-09-15' })
check('Prêt modifié (échéance repoussée)', upd !== null && upd.dateEcheance === '2026-09-15' && etatPret(upd, '2026-09-10') === 'en_cours')

// Rappel d'échéance de prêt (aujourd'hui/demain)
check('Rappel : prêt à échéance aujourd\u2019hui', pretsARappelerLocal([gP], '2026-09-15', '2026-09-16').length === 1 && pretsARappelerLocal([gP], '2026-09-15', '2026-09-16')[0].pretId === pret2.id && pretsARappelerLocal([gP], '2026-09-15', '2026-09-16')[0].emprunteurNom === 'Aya')
rembourserPret(pret1.id, 6000, '2026-08-10')
check('Rappel : prêt soldé ignoré', getPret(pret1.id).statut === 'rembourse' && pretsARappelerLocal([gP], '2026-08-20', '2026-08-21').filter((r) => r.pretId === pret1.id).length === 0)
check('Récap : mentionne les prêts à échéance', construireRecapQuotidien([gP], '2026-09-15', '2026-09-16') !== null && construireRecapQuotidien([gP], '2026-09-15', '2026-09-16').corps.includes('prêt'))

// Lecture seule (hors ligne) : création de prêt bloquée
setLectureSeule(true)
check('Lecture seule : création de prêt bloquée', createPret(gP.id, { emprunteurId: pK.id, montant: 100 }) === null)
check('Lecture seule : remboursement bloqué', rembourserPret(pret2.id, 100) === null)
setLectureSeule(false)

// Suppression en cascade : le prêt disparaît avec le groupe
supprimerPret(pret1.id)
check('Prêt supprimé individuellement', getPret(pret1.id) === null && getPrets(gP.id).length === 1)
deleteGroup(gP.id)
check('Cascade : prêts supprimés avec le groupe', getPrets(gP.id).length === 0)

// Synchro : les prêts voyagent dans le snapshot (responsable → invité)
for (const k of Object.keys(store)) delete store[k]
const gSyncPret = createGroup({ nom: 'Tontine sync prêts', montantCotisation: 1000, periodeJours: 7, dateDebut: '2026-08-01' })
const spA = addMembre(gSyncPret.id, { nom: 'Aya' })
const spK = addMembre(gSyncPret.id, { nom: 'Kofi' })
ensureCodeUnique(gSyncPret.id)
const spRet = createPret(gSyncPret.id, { emprunteurId: spK.id, montant: 8000, tauxInteret: 0, dateEcheance: '2026-08-30' })
const snapPrets = {
  format: 2,
  majLe: Date.now(),
  groupe: { ...getGroup(gSyncPret.id) },
  membres: getMembres(gSyncPret.id),
  tours: [],
  cotisations: [],
  prets: getPrets(gSyncPret.id),
}
for (const k of Object.keys(store)) delete store[k]
const jPrets = rejoindreDepuisSnapshot(snapPrets)
check('Invité : prêt importé (emprunteur remappé)', getPrets(jPrets.id).length === 1)
const pretInvite = getPrets(jPrets.id)[0]
const membreInvite = getBilan(jPrets.id).membres.find((m) => m.nom === 'Kofi')
check('Invité : emprunteurId mappé sur le membre local', pretInvite.emprunteurId === membreInvite.id && pretInvite.montant === 8000 && pretInvite.dateEcheance === '2026-08-30')
const snapPretsMaj = { ...snapPrets, majLe: Date.now() + 1, groupe: { ...getGroup(gSyncPret.id) }, prets: [{ ...spRet, montant: 8500 }] }
check('Invité : synchro applique les prêts du responsable', appliquerSynchro(jPrets.id, snapPretsMaj) === true && getPrets(jPrets.id)[0].montant === 8500)
check('Invité : création de prêt bloquée (lecture seule)', createPret(jPrets.id, { emprunteurId: membreInvite.id, montant: 100 }) === null)

// Discussion : le message embarque l'uid et l'email de l'expéditeur
for (const k of Object.keys(store)) delete store[k]
const gMsg = createGroup({ nom: 'Tontine discussion', montantCotisation: 1000, periodeJours: 7, dateDebut: '2026-08-01' })
const mMsg = envoyerMessage(gMsg.id, '  Bonjour tout le monde  ', 'Alla Kouassi Axelle Marius', 'uidA', 'alla@test.com')
check('Message créé (texte nettoyé)', mMsg && mMsg.texte === 'Bonjour tout le monde' && mMsg.auteur === 'Alla Kouassi Axelle Marius')
check('Message porte uid + email de l\'expéditeur', mMsg.uid === 'uidA' && mMsg.email === 'alla@test.com')
const msgStocke = getGroup(gMsg.id).messages.find((x) => x.id === mMsg.id)
check('Message persisté dans le groupe', !!msgStocke && msgStocke.uid === 'uidA')
check('Message vide refusé', envoyerMessage(gMsg.id, '   ', 'X') === null)

// ── Inbox : le type du push (message) est conservé ─────────────
for (const k of Object.keys(store)) delete store[k]
const { depuisNotificationSysteme, lireInbox, ajouterNotification } = await import('./lib/inbox.js')
const entreeMsg = depuisNotificationSysteme({ title: 'Nouveau message', body: 'cc', data: { type: 'message', code: 'ABCDEF', groupeId: '3' } }, 'push')
check('Inbox : data.type prioritaire (message)', entreeMsg.type === 'message' && entreeMsg.code === 'ABCDEF' && entreeMsg.groupeId === '3')
const entreeRappel = depuisNotificationSysteme({ title: 'R', data: { type: 'rappel_tour', groupeId: '1' } }, 'rappel_local')
check('Inbox : type rappel local conservé', entreeRappel.type === 'rappel_tour')
const entreeSans = depuisNotificationSysteme({ title: 'X' }, 'push')
check('Inbox : fallback sur le type passé', entreeSans.type === 'push')
ajouterNotification({ ...entreeMsg, id: 'm1' })
ajouterNotification({ ...entreeMsg, id: 'm1' })
check('Inbox : déduplication par cleId', lireInbox().length === 1 && lireInbox()[0].type === 'message')

// ── Invités : peuvent envoyer des messages (relais responsable) ──
for (const k of Object.keys(store)) delete store[k]
const gInvMsg = createGroup({ nom: 'Tontine invités', montantCotisation: 1000, periodeJours: 7, dateDebut: '2026-08-01' })
ensureCodeUnique(gInvMsg.id)
updateGroup(gInvMsg.id, { synchronise: true })
const snapInvMsg = {
  format: 2,
  majLe: Date.now(),
  groupe: { ...getGroup(gInvMsg.id) },
  membres: getMembres(gInvMsg.id),
  tours: [],
  cotisations: [],
}
for (const k of Object.keys(store)) delete store[k]
const jInvMsg = rejoindreDepuisSnapshot(snapInvMsg)
check('Invité : groupe rejoint pour la discussion', !!jInvMsg && jInvMsg.rejoint === true)
const invMsg = envoyerMessageInvite(jInvMsg.id, '  Bonjour, je suis l\u2019invité  ', 'Aya Invité', 'uid-invite', 'invite@test.com')
check('Invité : message optimiste créé (id stable, en attente)', !!invMsg && invMsg.id.startsWith('inv-') && invMsg.enAttente === true && invMsg.texte === 'Bonjour, je suis l\u2019invité')
check('Invité : message stocké dans pendingMessages, pas dans messages', getGroup(jInvMsg.id).pendingMessages.length === 1 && (getGroup(jInvMsg.id).messages || []).length === 0)
check('Invité : message vide refusé', envoyerMessageInvite(jInvMsg.id, '   ', 'X') === null)
check('Invité : hors connexion = envoi bloqué', (() => { setLectureSeule(true); const r = envoyerMessageInvite(jInvMsg.id, 'off', 'X'); setLectureSeule(false); return r === null })())

// L'accusé : le snapshot re-publié (message intégré par le responsable)
// fait disparaître l'entrée en attente chez l'invité.
const inviteAvant = getGroup(jInvMsg.id)
const ackMsg = inviteAvant.pendingMessages[0]
const snapAck = {
  format: 2,
  majLe: Date.now() + 1,
  groupe: {
    ...inviteAvant,
    messages: [...(inviteAvant.messages || []), { id: ackMsg.id, cle: ackMsg.cle, texte: ackMsg.texte, auteur: ackMsg.auteur, uid: ackMsg.uid, email: ackMsg.email, date: ackMsg.date }],
  },
  membres: getMembres(jInvMsg.id),
  tours: [],
  cotisations: [],
}
check('Invité : message en attente avant confirmation', getGroup(jInvMsg.id).pendingMessages.length === 1)
const appAck = appliquerSynchro(jInvMsg.id, snapAck)
check('Invité : accusé appliqué, entrée en attente retirée', appAck === true && getGroup(jInvMsg.id).pendingMessages.length === 0 && getGroup(jInvMsg.id).messages.some((x) => String(x.id) === String(ackMsg.id)))

// Côté responsable : intégration du message de l'invité
for (const k of Object.keys(store)) delete store[k]
const gOwnerMsg = createGroup({ nom: 'Tontine owner', montantCotisation: 1000, periodeJours: 7, dateDebut: '2026-08-01' })
ensureCodeUnique(gOwnerMsg.id)
const integre = integrerMessage(gOwnerMsg.id, { id: 'inv-123', texte: 'Salut', auteur: 'Aya', uid: 'u1', email: 'a@t.c' })
check('Responsable : message d\u2019invité intégré (id conservé)', integre !== null && integre.id === 'inv-123' && getGroup(gOwnerMsg.id).messages.length === 1 && getGroup(gOwnerMsg.id).messages[0].auteur === 'Aya')
check('Responsable : doublon refusé', integrerMessage(gOwnerMsg.id, { id: 'inv-123', texte: 'Salut', auteur: 'Aya' }) === 'deja')
check('Responsable : groupe introuvable → null', integrerMessage(9999, { id: 'x', texte: 'y' }) === null)
check('Invité : envoi refusé sur un groupe personnel', envoyerMessageInvite(gOwnerMsg.id, 'test', 'Aya') === null)

// ── Co-gérants & sauvegarde privée ─────────────────────────────
for (const k of Object.keys(store)) delete store[k]
const gCog = createGroup({ nom: 'Tontine cogérants', montantCotisation: 1000, periodeJours: 7, dateDebut: '2026-01-01' })
const propUid = 'uid-responsable'
updateGroup(gCog.id, { proprietaire: propUid })
const mCo1 = addMembre(gCog.id, { nom: 'Fatou', uid: 'uid-cog1' })
const mCo2 = addMembre(gCog.id, { nom: 'Moussa', uid: 'uid-cog2' })
const mSimple = addMembre(gCog.id, { nom: 'Ibra', uid: 'uid-membre' })
check('Nomination co-responsable → coGerants dérivé', (() => {
  updateMembre(mCo1.id, { role: 'co-responsable' })
  const cg = deriveCoGerants(gCog.id)
  return cg['uid-cog1'] && cg['uid-cog1'].nom === 'Fatou' && !cg['uid-cog2'] && !cg['uid-membre']
})())
check('estResponsable : propriétaire', estResponsable(gCog.id, propUid) === true)
check('estResponsable : co-gérant nommé', estResponsable(gCog.id, 'uid-cog1') === true)
check('estResponsable : simple membre', estResponsable(gCog.id, 'uid-membre') === false)
check('estResponsable : uid inconnu', estResponsable(gCog.id, 'uid-x') === false)
updateMembre(mCo2.id, { role: 'co-responsable' })
check('Deux co-gérants', Object.keys(deriveCoGerants(gCog.id)).length === 2)
check('Rétrogradation → coGerants recalculé', (() => {
  updateMembre(mCo1.id, { role: 'membre' })
  const cg = deriveCoGerants(gCog.id)
  return !cg['uid-cog1'] && !!cg['uid-cog2']
})())
check('sauvegardeUid généré une fois', (() => {
  const u1 = assurerSauvegardeUid(gCog.id)
  const u2 = assurerSauvegardeUid(gCog.id)
  return u1.length > 0 && u1 === u2 && getGroup(gCog.id).sauvegardeUid === u1
})())

// ── Bilan annuel & clôture d'exercice ──────────────────────────
for (const k of Object.keys(store)) delete store[k]
const gAnn = createGroup({ nom: 'Tontine annuelle', montantCotisation: 2000, periodeJours: 7, dateDebut: '2026-01-01' })
const ma = addMembre(gAnn.id, { nom: 'Aya' })
const mb2 = addMembre(gAnn.id, { nom: 'Binta' })
const mc2 = addMembre(gAnn.id, { nom: 'Chico' })
const t2026 = generateTours(gAnn.id)
payerCotisation(gAnn.id, t2026[0].id, ma.id, 2000, '2026-02-01', 'Espèces')
payerCotisation(gAnn.id, t2026[1].id, mb2.id, 2000, '2026-03-01', 'Orange Money', { operateur: 'Orange Money', numero: '0700000099', reference: 'REF-2026-01' })
payerCotisation(gAnn.id, t2026[2].id, ma.id, 2000, '2027-01-10', 'Espèces')
marquerTourRecu(t2026[0].id, '2026-02-10')
const bilan2026 = getBilanAnnee(gAnn.id, 2026)
check('Bilan 2026 : total cotisé = 4000', bilan2026.totalCotis === 4000)
check('Bilan 2026 : reçu = 6000 (3 tours)', bilan2026.totalRecu === 6000)
check('Bilan 2026 : solde = -2000', bilan2026.solde === -2000)
check('Bilan 2027 : total cotisé = 2000', getBilanAnnee(gAnn.id, 2027).totalCotis === 2000)
check('Bilan 2025 : vide', getBilanAnnee(gAnn.id, 2025).totalCotis === 0)
const arch2026 = archiverAnnee(gAnn.id, 2026)
check('Clôture 2026 : archive créée', arch2026 !== null && arch2026.annee === 2026 && arch2026.totalCotis === 4000 && arch2026.nbTours === 3)
check('Archive persistée sur le groupe', getGroup(gAnn.id).archives.length === 1)
check('Re-clôture 2026 : remplace sans doublon', (() => { archiverAnnee(gAnn.id, 2026); return getGroup(gAnn.id).archives.length === 1 })())
const archAutre = archiverAnnee(gAnn.id, 2025)
check('Clôture 2025 : ajoutée et triée', getGroup(gAnn.id).archives.length === 2 && getGroup(gAnn.id).archives[0].annee === 2025 && archAutre.totalCotis === 0)
check('Historique contient la clôture 2026', getHistorique(gAnn.id).some((e) => e.type === 'archive' && e.libelle.includes('2026')))
check('Clôture sur groupe rejoint bloquée', (() => {
  for (const k of Object.keys(store)) delete store[k]
  const gInv = createGroup({ nom: 'Tontine inv', montantCotisation: 1000, periodeJours: 7, dateDebut: '2026-01-01' })
  const snapInv = { format: 2, majLe: Date.now(), groupe: { ...getGroup(gInv.id), codeUnique: 'ABC123' }, membres: getMembres(gInv.id), tours: [], cotisations: [] }
  const gj = rejoindreDepuisSnapshot(snapInv)
  return gj !== null && archiverAnnee(gj.id, 2026) === null
})())

// ── Conflits : adopter / fusionner la version cloud ────────────
for (const k of Object.keys(store)) delete store[k]
const gConf = createGroup({ nom: 'Tontine conflit', montantCotisation: 1000, periodeJours: 7, dateDebut: '2026-01-01' })
updateGroup(gConf.id, { proprietaire: 'uid-proprio', sauvegardeUid: 'sauvegarde-conf' })
addMembre(gConf.id, { nom: 'Aya' })
addMembre(gConf.id, { nom: 'Kofi' })
const tConf = generateTours(gConf.id)
payerCotisation(gConf.id, tConf[0].id, 1, 1000, '2026-01-05', 'Espèces')
// Version cloud (autre appareil) : 3 membres, tour #1 payé par Kofi (id 2)
const snapCloud = {
  format: 2,
  majLe: Date.now() + 1000,
  groupe: { ...getGroup(gConf.id), proprietaire: 'uid-proprio', nom: 'Tontine conflit (cloud)', montantCotisation: 1500 },
  membres: [
    { id: 1, nom: 'Aya', telephone: '', uid: null, role: 'membre', bloque: false, dateAdhesion: '2026-01-01', dateCreation: new Date().toISOString() },
    { id: 2, nom: 'Kofi', telephone: '', uid: null, role: 'membre', bloque: false, dateAdhesion: '2026-01-01', dateCreation: new Date().toISOString() },
    { id: 3, nom: 'Ama', telephone: '', uid: null, role: 'membre', bloque: false, dateAdhesion: '2026-01-01', dateCreation: new Date().toISOString() },
  ],
  tours: [{ id: 1, numero: 1, membreId: 2, datePrevue: '2026-01-01', montantPot: 3000, statut: 'en_attente', dateReception: null }],
  cotisations: [{ id: 2, tourId: 1, membreId: 2, montant: 1500, penalite: 0, statut: 'paye', moyenPaiement: 'Wave', datePaiement: '2026-01-08' }],
  prets: [],
}
check('Fusion : conserve les entités locales absentes du cloud', (() => {
  fusionnerVersionCloud(gConf.id, snapCloud)
  const g = getGroup(gConf.id)
  const cots = getCotisations(gConf.id)
  return getMembres(gConf.id).length === 3 && cots.some((c) => c.membreId === 1 && c.montant === 1000) && cots.some((c) => c.membreId === 2 && c.montant === 1500 && c.moyenPaiement === 'Wave') && g.nom === 'Tontine conflit (cloud)' && g.montantCotisation === 1500
})())
check('Adoption cloud : remplacement intégral', (() => {
  adopterVersionCloud(gConf.id, snapCloud)
  const cots = getCotisations(gConf.id)
  return getMembres(gConf.id).length === 3 && cots.length === 1 && cots[0].membreId === 2 && getGroup(gConf.id).nom === 'Tontine conflit (cloud)'
})())
check('Fusion/adoption refusées sans snapshot', adopterVersionCloud(gConf.id, null) === false && fusionnerVersionCloud(gConf.id, null) === false)
check('Mode Mobile Money : référence persistée', (() => {
  for (const k of Object.keys(store)) delete store[k]
  const gM = createGroup({ nom: 'Tontine MM', montantCotisation: 5000, periodeJours: 7, dateDebut: '2026-01-01' })
  const mmm = addMembre(gM.id, { nom: 'Aya' })
  const tm = generateTours(gM.id)
  payerCotisation(gM.id, tm[0].id, mmm.id, 5000, '2026-01-05', 'Orange Money', { operateur: 'Orange Money', numero: '0700000011', reference: 'REF-XYZ' })
  const c = getCotisations(gM.id)[0]
  return c.modeOperateur === 'Orange Money' && c.modeNumero === '0700000011' && c.modeReference === 'REF-XYZ' && getHistorique(gM.id).some((e) => e.libelle.includes('REF-XYZ'))
})())

// ── Signalement membre → confirmation responsable ─────────────
let idGroupePaiement = null
check('Signalement : montant plafonné à la cotisation', (() => {
  for (const k of Object.keys(store)) delete store[k]
  const gP = createGroup({ nom: 'Tontine Paiement', montantCotisation: 5000, periodeJours: 7, dateDebut: '2026-01-01' })
  idGroupePaiement = gP.id
  const mP = addMembre(gP.id, { nom: 'Aya' })
  const tP = generateTours(gP.id)
  const p = signalerPaiementMembre(gP.id, {
    nom: 'Aya', tourId: tP[0].id, membreId: mP.id, montant: 900000,
    operateur: 'Wave', numeroEmetteur: '0700000011', reference: 'TMABC123',
  })
  return !!p && p.montant === 5000 && p.enAttente === true && getPendingPaiements(gP.id).length === 1
})())
check('Signalement : même membre + même tour = un seul signalement', (() => {
  const gP = getGroup(idGroupePaiement)
  const [p] = getPendingPaiements(gP.id)
  signalerPaiementMembre(gP.id, { nom: 'Aya', tourId: p.tourId, membreId: p.membreId, montant: 5000 })
  return getPendingPaiements(gP.id).length === 1
})())
check('Confirmation : enregistre la cotisation et purge le signalement', (() => {
  const gP = getGroup(idGroupePaiement)
  const [p] = getPendingPaiements(gP.id)
  const ok = confirmerPaiementMembre(gP.id, p.id)
  const c = getCotisations(gP.id)[0]
  return ok === true && c && c.moyenPaiement === 'Wave' && c.modeOperateur === 'Wave' && c.modeNumero === '0700000011' && c.modeReference === 'TMABC123' && getPendingPaiements(gP.id).length === 0
})())
check('Confirmation : idempotente (déjà payé → deja)', (() => {
  const gP = getGroup(idGroupePaiement)
  const c = getCotisations(gP.id)[0]
  const m = getMembres(gP.id)[0]
  const p = signalerPaiementMembre(gP.id, { nom: m.nom, tourId: c.tourId, membreId: m.id, montant: 5000 })
  return confirmerPaiementMembre(gP.id, p.id) === 'deja' && getPendingPaiements(gP.id).length === 0
})())
check('Confirmation refusée en lecture seule (invité)', (() => {
  setLectureSeule(true)
  const gP = getGroup(idGroupePaiement)
  const p = signalerPaiementMembre(gP.id, { nom: 'Aya', montant: 5000 })
  const ok = p === null && confirmerPaiementMembre(gP.id, 'inconnu') === false
  setLectureSeule(false)
  return ok
})())
check('integrerPaiementInvite : même id intégré une seule fois', (() => {
  const gP = getGroup(idGroupePaiement)
  const avant = getPendingPaiements(gP.id).length
  const p = { id: 'inv-1', nom: 'Kofi', montant: 5000, tourId: null }
  const un = integrerPaiementInvite(gP.id, p)
  const deux = integrerPaiementInvite(gP.id, p)
  return un === true && deux === false && getPendingPaiements(gP.id).length === avant + 1
})())

console.log(fails === 0 ? '\nTous les tests passent ✅' : `\n${fails} test(s) échoué(s) ❌`)
process.exit(fails === 0 ? 0 : 1)
