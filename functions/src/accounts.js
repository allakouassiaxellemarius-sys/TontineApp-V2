// ═══════════════════════════════════════════════════════════════
// Comptes virtuels Flutterwave par groupe + références uniques par membre.
//
//  - Un compte virtuel PERMANENT est créé dès la création du groupe
//    (déclenché par la publication du snapshot dans la RTDB).
//  - Chaque membre reçoit une RÉFÉRENCE unique (token) qu'il doit saisir
//    dans le libellé (narration) de son virement. Le webhook utilise cette
//    référence pour réconcilier le paiement automatiquement vers le bon
//    membre ; sans elle (ou inconnue), le paiement reste en attente de
//    validation manuelle par le trésorier.
// ═══════════════════════════════════════════════════════════════
const { lire, ecrire, mettreAJour, pousser, emailUtilisateur, roleDansGroupe } = require('./db')
const flw = require('./flutterwave')
const audit = require('./audit')

const CHEMIN_COMPTE = (code) => 'comptesVirtuels/' + encodeURIComponent(String(code))
const CHEMIN_REFS = (code) => 'references/' + encodeURIComponent(String(code))
const CHEMIN_REFS_MEMBRE = (code) => 'refsMembre/' + encodeURIComponent(String(code))

function nouveauRef() {
  const c = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  let s = ''
  for (let i = 0; i < 12; i++) s += c[Math.floor(Math.random() * c.length)]
  return 'REF-' + s
}

// Crée (ou recrée) le compte virtuel pour un groupe. Appelé automatiquement
// à la création du groupe, ou manuellement par le responsable (réessai).
async function creerComptePourGroupe(code) {
  const groupe = await lire('tontines/' + encodeURIComponent(String(code)) + '/groupe')
  if (!groupe) throw new Error('Groupe introuvable')
  if (!flw.estConfigure()) {
    // Mode démo : on stocke un compte factice pour ne pas bloquer l'UI.
    const demo = {
      accountNumber: '0000000000',
      accountName: (groupe.nom || 'Tontine').slice(0, 30),
      bankName: 'BANQUE DEMO (sandbox)',
      bankCode: 'demo',
      orderRef: 'demo-' + code,
      provider: 'flutterwave',
      devise: 'NGN',
      demo: true,
      creeLe: Date.now(),
    }
    await ecrire(CHEMIN_COMPTE(code), demo)
    // Index inversé compte -> code (le webhook s'en sert pour retrouver le
    // groupe, y compris en mode démo où le compte est factice).
    if (demo.accountNumber) {
      await ecrire('comptesParNumero/' + encodeURIComponent(String(demo.accountNumber)), String(code))
    }
    await audit.journaliser(code, { qui: 'system', action: 'compte_virtuel_demo', statut: 'demo', details: { mode: flw.mode() } })
    return demo
  }
  const uid = groupe.proprietaire
  const email = (await emailUtilisateur(uid)) || 'tontine-' + String(code).toLowerCase() + '@tontine.app'
  const txRef = flw.nouveauTxRef('VA')
  const cpt = await flw.creerCompteVirtuel({
    email,
    narration: 'Tontine ' + (groupe.nom || code),
    txRef,
  })
  const record = {
    ...cpt,
    provider: 'flutterwave',
    txRef,
    email,
    devise: cpt.currency || 'NGN',
    creeLe: Date.now(),
  }
  await ecrire(CHEMIN_COMPTE(code), record)
  // Index inversé compte -> code (utilisé par le webhook pour retrouver
  // le groupe sans scanner toute la base).
  if (cpt.accountNumber) {
    await ecrire('comptesParNumero/' + encodeURIComponent(String(cpt.accountNumber)), String(code))
  }
  await audit.journaliser(code, { qui: uid || 'system', action: 'compte_virtuel_cree', statut: 'ok', details: { bank: cpt.bankName, mode: flw.mode() } })
  return record
}

async function getCompte(code) {
  return lire(CHEMIN_COMPTE(code))
}

// Résout le membreId d'un uid dans le groupe.
async function membreIdPourUid(code, uid) {
  const groupe = await lire('tontines/' + encodeURIComponent(String(code)) + '/groupe')
  const membres = (groupe && Array.isArray(groupe.membres) ? groupe.membres : [])
  const m = membres.find((x) => x && x.uid === uid)
  return m ? Number(m.id) : null
}

// Retourne (et crée si besoin) la référence unique du membre pour ce groupe.
async function getOuCreerReference(code, uid) {
  const existant = await lire(CHEMIN_REFS_MEMBRE(code) + '/' + encodeURIComponent(String(uid)))
  if (existant) return existant
  const membreId = await membreIdPourUid(code, uid)
  let ref = nouveauRef()
  // Évite les collisions (très improbable).
  let essais = 0
  while (await lire(CHEMIN_REFS(code) + '/' + ref)) {
    ref = nouveauRef()
    if (++essais > 5) break
  }
  const entree = { uid, membreId, creeLe: Date.now() }
  await ecrire(CHEMIN_REFS(code) + '/' + ref, entree)
  await ecrire(CHEMIN_REFS_MEMBRE(code) + '/' + encodeURIComponent(String(uid)), ref)
  return ref
}

// Résout une référence saisie vers un membreId (pour le webhook).
async function resoudreReference(code, ref) {
  if (!ref) return null
  const r = await lire(CHEMIN_REFS(code) + '/' + String(ref).trim().toUpperCase())
  return r ? r.membreId : null
}

module.exports = {
  creerComptePourGroupe,
  getCompte,
  getOuCreerReference,
  resoudreReference,
  membreIdPourUid,
}
