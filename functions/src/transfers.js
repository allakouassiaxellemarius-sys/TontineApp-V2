// ═══════════════════════════════════════════════════════════════
// Retraits / distribution des fonds (Transfers API Flutterwave).
//
// Règles de sécurité :
//  - Seul le Rôle « Responsable » ou « Trésorier » du groupe peut
//    déclencher un retrait.
//  - Au-delà d'un seuil configurable (RETRAIT_SEUIL_DOUBLE), une DOUBLE
//    validation est obligatoire : le demandeur et l'approbateur doivent
//    être deux personnes distinctes ayant un rôle de gestion, et l'un
//    doit être le Responsable (ou les deux rôles présents).
//  - Toute opération est journalisée (audit immuable).
//  - Les clés Flutterwave restent côté serveur.
// ═══════════════════════════════════════════════════════════════
const { lire, ecrire, pousser, roleDansGroupe } = require('./db')
const flw = require('./flutterwave')
const audit = require('./audit')
const { RETRAIT_SEUIL_DOUBLE } = require('./secrets')

const CHEMIN = (code) => 'transferts/' + encodeURIComponent(String(code))

function estGerant(role) {
  return role === 'responsable' || role === 'tresorier'
}

async function creerRetrait({ uid, code, montant, currency, bankCode, accountNumber, fullname, narration }) {
  const role = await roleDansGroupe(code, uid)
  if (!estGerant(role)) {
    const e = new Error('Seul le Responsable ou le Trésorier peut effectuer un retrait.')
    e.code = 403
    throw e
  }
  const montantN = Number(montant)
  if (!montantN || montantN <= 0) throw new Error('Montant invalide')
  const groupe = await lire('tontines/' + encodeURIComponent(String(code)) + '/groupe')
  if (!groupe) throw new Error('Groupe introuvable')

  const doubleRequise = montantN > RETRAIT_SEUIL_DOUBLE
  const transferId = flw.nouveauTxRef('TR').replace(/[^A-Za-z0-9]/g, '')
  const record = {
    montant: montantN,
    devise: currency || groupe.deviseSymbole || 'NGN',
    destinataire: { bankCode: String(bankCode), accountNumber: String(accountNumber), fullname: String(fullname) },
    narration: String(narration || 'Retrait tontine').slice(0, 80),
    demandeurUid: uid,
    demandeurRole: role,
    creeLe: Date.now(),
    statut: 'brouillon',
    doubleValidation: doubleRequise,
  }

  // Groupes sans second gestionnaire : la double validation est impossible.
  const aCoGerant = groupe.coGerants && Object.keys(groupe.coGerants).length > 0
  if (doubleRequise && !aCoGerant && role === 'responsable') {
    const e = new Error('Retrait au-dessus du seuil : ajoutez un Trésorier (co-gérant) pour la double validation.')
    e.code = 400
    throw e
  }

  if (doubleRequise) {
    record.statut = 'en_attente_double'
    await ecrire(CHEMIN(code) + '/' + transferId, record)
    await audit.journaliser(code, {
      qui: uid, action: 'retrait_demande', statut: 'en_attente_double', montant: montantN,
      devise: record.devise, details: { transferId, seuil: RETRAIT_SEUIL_DOUBLE },
    })
    return { ok: true, statut: 'en_attente_double', transferId, doubleValidation: true }
  }

  // Exécution directe (sous le seuil).
  return executer(code, transferId, record, uid)
}

async function executer(code, transferId, record, approbateurUid) {
  let resultat
  if (!flw.estConfigure()) {
    resultat = { id: null, flwRef: 'demo-' + transferId, status: 'demo' }
    record.statut = 'execute_demo'
  } else {
    const t = await flw.creerTransfert({
      bankCode: record.destinataire.bankCode,
      accountNumber: record.destinataire.accountNumber,
      fullname: record.destinataire.fullname,
      amount: record.montant,
      currency: record.devise,
      narration: record.narration,
      txRef: transferId,
    })
    resultat = t
    record.statut = t.status === 'successful' || t.status === 'completed' ? 'execute' : 'execute_en_cours'
  }
  record.flwRef = resultat.flwRef
  record.flwId = resultat.id
  record.executeLe = Date.now()
  if (approbateurUid) record.approbateurUid = approbateurUid
  await ecrire(CHEMIN(code) + '/' + transferId, record)
  await audit.journaliser(code, {
    qui: approbateurUid || record.demandeurUid,
    action: 'retrait_execute', statut: record.statut, montant: record.montant, devise: record.devise,
    details: { transferId, flwRef: resultat.flwRef },
  })
  return { ok: true, statut: record.statut, transferId, flwRef: resultat.flwRef }
}

async function approuverRetrait({ uid, code, transferId }) {
  const role = await roleDansGroupe(code, uid)
  if (!estGerant(role)) {
    const e = new Error('Seul le Responsable ou le Trésorier peut approuver un retrait.')
    e.code = 403
    throw e
  }
  const rec = await lire(CHEMIN(code) + '/' + encodeURIComponent(String(transferId)))
  if (!rec) throw new Error('Retrait introuvable')
  if (rec.statut !== 'en_attente_double') throw new Error('Ce retrait n’est pas en attente de validation.')
  if (rec.demandeurUid === uid) {
    const e = new Error('Le demandeur initial ne peut pas approuver lui-même (double validation).')
    e.code = 400
    throw e
  }
  return executer(code, transferId, rec, uid)
}

async function listerRetraits(code) {
  return lire(CHEMIN(code))
}

module.exports = { creerRetrait, approuverRetrait, listerRetraits, estGerant }
