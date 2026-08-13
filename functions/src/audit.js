// ═══════════════════════════════════════════════════════════════
// Journal d'audit IMMUABLE. Chaque événement financier (paiement reçu,
// réconciliation, retrait, approbation) y est consigné en ANNEXE : les
// clients n'ont pas le droit d'écrire (règle RTDB), seulement de lire.
// Format : auditLogs/{code}/{logId} = { qui, action, montant, devise,
// statut, quand, details }. Horodaté et non modifiable a posteriori.
// ═══════════════════════════════════════════════════════════════
const { pousser, lire } = require('./db')

async function journaliser(code, entry) {
  const log = {
    qui: entry.qui || 'system',
    action: String(entry.action || 'inconnu'),
    montant: Number(entry.montant) || 0,
    devise: entry.devise || '',
    statut: entry.statut || '',
    quand: Date.now(),
    details: entry.details || {},
  }
  await pousser('auditLogs/' + encodeURIComponent(String(code)), log)
}

// Lecture du journal (pour l'interface de transparence).
async function lireJournal(code) {
  return lire('auditLogs/' + encodeURIComponent(String(code)))
}

module.exports = { journaliser, lireJournal }
