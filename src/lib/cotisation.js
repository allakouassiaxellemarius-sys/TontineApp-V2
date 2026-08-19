// Logique de paiement zéro-KYC (aucune Cloud Function). Tout passe par le
// Worker de synchronisation (KV) :
// - référence unique déterministe du membre (narration du virement) ;
// - retraits/distributions MANUELS écrits dans transferts/<code> ;
// - lectures de transparence (transferts, journal d'audit).
import { cloudRequest, poll, getSyncUid } from './cloudApi'

// Référence unique et stable du membre (à saisir dans la narration du virement).
// Calculée LOCALEMENT et de façon déterministe à partir de (code, uid) :
// identique sur tous les appareils pour un même membre, sans Cloud Function.
// Format : REF-XXXXXXXXXXXX (alphabet base32).
function referencePourMembre(code, uid) {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  const seed = 'tontine:' + String(code) + ':' + String(uid)
  let buf = seed
  let out = ''
  for (let i = 0; i < 12; i++) {
    let x = 0x811c9dc5 >>> 0
    for (let j = 0; j < buf.length; j++) {
      x ^= buf.charCodeAt(j)
      x = Math.imul(x, 0x01000193) >>> 0
    }
    out += alphabet[x % alphabet.length]
    buf = x.toString(36) + seed + String(i)
  }
  return 'REF-' + out
}

// Référence du membre connecté (zéro KYC, calcul local).
async function getReference(code) {
  const uid = getSyncUid()
  if (!uid) return ''
  return referencePourMembre(code, uid)
}

// Abonnements (temps réel simulé par sondage).
function abonnerTransferts(code, onData) {
  return poll('transferts/' + encodeURIComponent(String(code)), (v) => onData(v || null))
}
function abonnerAudit(code, onData) {
  return poll('auditLogs/' + encodeURIComponent(String(code)), (v) => onData(v || null))
}

// Paiement de sortie MANUEL (zéro KYC) : enregistre un paiement déjà effectué
// depuis le compte bancaire de la tontine. Écrit dans transferts/<code>.
async function retraitManuel(code, { montant, membreId, nom, note }) {
  const uid = getSyncUid()
  if (!uid) throw new Error('Non connecté')
  const c = encodeURIComponent(String(code))
  const record = {
    montant: Number(montant),
    membreId: Number(membreId),
    nom: String(nom || ''),
    note: String(note || ''),
    par: uid,
    le: Date.now(),
    mode: 'manuel',
  }
  const res = await cloudRequest('POST', 'transferts/' + c, record)
  const id = res && res.id
  return { ok: true, id, record: { ...record, id } }
}

export { referencePourMembre, getReference, abonnerTransferts, abonnerAudit, retraitManuel }
