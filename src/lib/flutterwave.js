// ═══════════════════════════════════════════════════════════════
// Client Flutterwave — compte virtuel de cotisation (backend Functions).
// L'app ne voit JAMAIS les clés API : elle appelle uniquement les
// Cloud Functions (qui détiennent les secrets) et lit les données
// publiées dans la Realtime Database (compte, réconciliation, retraits,
// journal d'audit). Les actions sensibles sont signées par le JWT Firebase.
// ═══════════════════════════════════════════════════════════════
import { getApp } from 'firebase/app'
import { getDatabase, ref, onValue, get } from 'firebase/database'
import { getAuth } from 'firebase/auth'
import { functionsUrl } from './firebaseConfig'

function db() {
  return getDatabase(getApp())
}

// Appel d'une Cloud Function (POST) avec le JWT de l'utilisateur courant.
async function appelerFonction(route, payload) {
  const user = getAuth().currentUser
  if (!user) throw new Error('Non connecté')
  const token = await user.getIdToken()
  const res = await fetch(functionsUrl + '/' + route, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
    body: JSON.stringify(payload || {}),
  })
  let data = {}
  try { data = await res.json() } catch {}
  if (!res.ok) throw new Error((data && data.erreur) || ('Erreur ' + res.status))
  return data
}

async function getCompte(code) {
  const snap = await get(ref(db(), 'comptesVirtuels/' + encodeURIComponent(String(code))))
  return snap.val() || null
}
function abonnerCompte(code, onData) {
  return onValue(ref(db(), 'comptesVirtuels/' + encodeURIComponent(String(code))), (s) => onData(s.val() || null))
}
function abonnerReconciliation(code, onData) {
  return onValue(ref(db(), 'reconciliation/' + encodeURIComponent(String(code))), (s) => onData(s.val() || null))
}
function abonnerTransferts(code, onData) {
  return onValue(ref(db(), 'transferts/' + encodeURIComponent(String(code))), (s) => onData(s.val() || null))
}
function abonnerAudit(code, onData) {
  return onValue(ref(db(), 'auditLogs/' + encodeURIComponent(String(code))), (s) => onData(s.val() || null))
}

// Référence unique du membre (à saisir dans la narration du virement).
async function getReference(code) {
  const r = await appelerFonction('flutterwave-reference', { code: String(code) })
  return r.reference
}

// Le trésorier assigne manuellement un paiement non reconnu à un membre/tour.
async function reconcilierManuel(code, reconciliationId, membreId, tourId) {
  return appelerFonction('flutterwave-reconcile', {
    code: String(code),
    reconciliationId: String(reconciliationId),
    membreId: Number(membreId),
    tourId: Number(tourId),
  })
}

// Demande de retrait / distribution (Responsable ou Trésorier).
async function demanderRetrait(code, { montant, currency, bankCode, accountNumber, fullname, narration }) {
  return appelerFonction('flutterwave-transfer', {
    code: String(code),
    montant: Number(montant),
    currency: String(currency || 'NGN'),
    bankCode: String(bankCode),
    accountNumber: String(accountNumber),
    fullname: String(fullname),
    narration: String(narration || ''),
  })
}

// 2e validation (double) d'un retrait au-dessus du seuil.
async function approuverRetrait(code, transferId) {
  return appelerFonction('flutterwave-transfer-approve', { code: String(code), transferId: String(transferId) })
}

export const flutterwave = {
  appelerFonction,
  getCompte,
  abonnerCompte,
  abonnerReconciliation,
  abonnerTransferts,
  abonnerAudit,
  getReference,
  reconcilierManuel,
  demanderRetrait,
  approuverRetrait,
}
export default flutterwave
