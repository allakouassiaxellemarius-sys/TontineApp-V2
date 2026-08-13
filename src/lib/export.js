import { jsPDF } from 'jspdf'
import autoTable from 'jspdf-autotable'
import QRCode from 'qrcode'
import { Capacitor } from '@capacitor/core'
import { Filesystem, Directory } from '@capacitor/filesystem'
import { Share } from '@capacitor/share'
import { getGroup, getBilan, getHistorique, getToursAvecMembre, getMembre, getTours, ensureCodeUnique } from './db.js'
import { formatMontant, formatDate } from './format.js'
import { buildMessageInvitationGroupe } from './remind.js'

function downloadBlob(content, filename, type) {
  const blob = new Blob([content], { type })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  setTimeout(() => URL.revokeObjectURL(url), 2000)
}

function blobEnBase64(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onerror = () => reject(reader.error || new Error('Lecture du fichier impossible'))
    reader.onload = () => resolve(reader.result.split(',')[1])
    reader.readAsDataURL(blob)
  })
}

// Sur Android, l'attribut <a download> est ignoré par la WebView (aucun
// DownloadListener) : les exports ne produisaient rien. En natif on écrit
// le fichier dans le stockage privé via Filesystem puis on ouvre la feuille
// de partage (Share) pour l'enregistrer ou l'ouvrir dans Excel.
export async function sauvegarderFichier(blob, nomFichier) {
  if (Capacitor.isNativePlatform()) {
    const base64 = await blobEnBase64(blob)
    const sauvegarde = await Filesystem.writeFile({
      path: nomFichier,
      data: base64,
      directory: Directory.Data,
    })
    await Share.share({
      title: nomFichier,
      dialogTitle: nomFichier,
      files: [sauvegarde.uri],
    })
    return
  }
  downloadBlob(blob, nomFichier)
}

// Partage une image en dataURL (PNG) : écriture native + partage, ou téléchargement web.
async function partagerDataUrl(dataUrl, nomFichier) {
  if (Capacitor.isNativePlatform()) {
    const base64 = dataUrl.split(',')[1]
    const sauvegarde = await Filesystem.writeFile({
      path: nomFichier,
      data: base64,
      directory: Directory.Data,
    })
    await Share.share({
      title: nomFichier,
      dialogTitle: nomFichier,
      files: [sauvegarde.uri],
    })
    return
  }
  const blob = await (await fetch(dataUrl)).blob()
  downloadBlob(blob, nomFichier)
}

function toCSV(rows) {
  const esc = (v) => {
    const s = v == null ? '' : String(v)
    return /[";\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s
  }
  return rows.map((r) => r.map(esc).join(';')).join('\r\n')
}

function exportCSV(rows, nomFichier) {
  const contenu = '\uFEFF' + toCSV(rows)
  sauvegarderFichier(new Blob([contenu], { type: 'text/csv;charset=utf-8' }), nomFichier)
}

// ── Excel (CSV compatible) ───────────────────────────────────
export function exporterMembresCSV(groupeId) {
  const g = getGroup(groupeId)
  const bilan = getBilan(groupeId)
  const rows = [
    ['Nom', 'Téléphone', 'Blocage', 'Cotisé', 'Pénalités', 'Reçu', 'Solde'],
    ...bilan.parMembre.map((p) => [
      p.membre.nom,
      p.membre.telephone,
      p.membre.bloque ? 'Oui' : 'Non',
      p.cotise,
      p.penalites,
      p.recu,
      p.solde,
    ]),
  ]
  exportCSV(rows, `${slug(g.nom)}-membres.csv`)
}

export function exporterToursCSV(groupeId) {
  const g = getGroup(groupeId)
  const tours = getToursAvecMembre(groupeId)
  const rows = [
    ['Tour', 'Bénéficiaire', 'Date prévue', 'Pot', 'Statut'],
    ...tours.map((t) => [
      t.numero,
      t.membre?.nom || '—',
      t.datePrevue,
      t.montantPot,
      t.statut,
    ]),
  ]
  exportCSV(rows, `${slug(g.nom)}-tours.csv`)
}

export function exporterHistoriqueCSV(groupeId) {
  const g = getGroup(groupeId)
  const histo = getHistorique(groupeId)
  const rows = [
    ['Date', 'Type', 'Description', 'Montant', 'Pénalité', 'Moyen de paiement', 'Opérateur', 'Référence'],
    ...histo.map((e) => [
      e.date,
      e.type,
      e.libelle,
      e.montant,
      e.penalite || 0,
      e.type === 'paiement' ? e.moyenPaiement || '' : '',
      e.type === 'paiement' ? e.modeOperateur || '' : '',
      e.type === 'paiement' ? e.modeReference || '' : '',
    ]),
  ]
  exportCSV(rows, `${slug(g.nom)}-historique.csv`)
}

// ── PDF ──────────────────────────────────────────────────────
export function exporterBilanPDF(groupeId) {
  const g = getGroup(groupeId)
  const bilan = getBilan(groupeId)
  const tours = getToursAvecMembre(groupeId)
  const histo = getHistorique(groupeId)

  const doc = new jsPDF()
  doc.setFontSize(18)
  doc.setTextColor(67, 56, 202)
  doc.text(`Tontine « ${g.nom} »`, 14, 20)
  doc.setFontSize(10)
  doc.setTextColor(90, 90, 90)
  doc.text(`Exporté le ${new Date().toLocaleDateString('fr-FR')}`, 14, 27)
  doc.text(`Devise : ${g.deviseSymbole}`, 14, 33)

  doc.setFontSize(13)
  doc.setTextColor(20, 20, 20)
  doc.text('Synthèse', 14, 45)
  autoTable(doc, {
    startY: 48,
    head: [['Total cotisé', 'Pénalités', 'Total reçu', 'Solde groupe']],
    body: [[
      formatMontant(bilan.totalCotis, g),
      formatMontant(bilan.totalPenalites, g),
      formatMontant(bilan.totalRecu, g),
      formatMontant(bilan.soldeGroupe, g),
    ]],
    theme: 'grid',
    headStyles: { fillColor: [67, 56, 202] },
  })

  doc.setFontSize(13)
  doc.text('Membres', 14, doc.lastAutoTable.finalY + 12)
  autoTable(doc, {
    startY: doc.lastAutoTable.finalY + 15,
    head: [['Nom', 'Téléphone', 'Cotisé', 'Pénalités', 'Reçu', 'Solde']],
    body: bilan.parMembre.map((p) => [
      p.membre.nom,
      p.membre.telephone || '—',
      formatMontant(p.cotise, g),
      formatMontant(p.penalites, g),
      formatMontant(p.recu, g),
      formatMontant(p.solde, g),
    ]),
    theme: 'striped',
    headStyles: { fillColor: [67, 56, 202] },
  })

  doc.setFontSize(13)
  doc.text('Planning des tours', 14, doc.lastAutoTable.finalY + 12)
  autoTable(doc, {
    startY: doc.lastAutoTable.finalY + 15,
    head: [['#', 'Bénéficiaire', 'Date prévue', 'Pot', 'Statut']],
    body: tours.map((t) => [
      t.numero,
      t.membre?.nom || '—',
      formatDate(t.datePrevue),
      formatMontant(t.montantPot, g),
      t.statut === 'recu' ? 'Reçu' : t.statut === 'annule' ? 'Annulé' : 'En attente',
    ]),
    theme: 'striped',
    headStyles: { fillColor: [67, 56, 202] },
  })

  doc.setFontSize(13)
  doc.text('Historique', 14, doc.lastAutoTable.finalY + 12)
  autoTable(doc, {
    startY: doc.lastAutoTable.finalY + 15,
    head: [['Date', 'Type', 'Description', 'Montant', 'Pénalité', 'Moyen de paiement']],
    body: histo.slice(0, 60).map((e) => [
      formatDate(e.date),
      e.type === 'paiement' ? 'Paiement' : 'Réception',
      e.libelle,
      formatMontant(e.montant, g),
      e.penalite ? formatMontant(e.penalite, g) : '—',
      e.type === 'paiement' ? e.moyenPaiement || '—' : '—',
    ]),
    theme: 'striped',
    headStyles: { fillColor: [67, 56, 202] },
  })

  sauvegarderFichier(doc.output('blob'), `${slug(g.nom)}-bilan.pdf`)
}

function slug(s) {
  return (s || 'tontine')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'tontine'
}

// ── Reçu de cotisation (preuve de paiement) ──────────────────
export function exporterRecuPDF(groupeId, cotisationId) {
  const g = getGroup(groupeId)
  const c = getBilan(groupeId).cotisations.find((x) => x.id === Number(cotisationId))
  if (!g || !c) return
  const membre = getMembre(c.membreId)
  const tour = getTours(groupeId).find((t) => t.id === Number(c.tourId))

  const doc = new jsPDF()
  doc.setFontSize(20)
  doc.setTextColor(67, 56, 202)
  doc.text('Reçu de cotisation', 14, 20)
  doc.setDrawColor(67, 56, 202)
  doc.setLineWidth(0.8)
  doc.line(14, 25, 196, 25)

  doc.setFontSize(12)
  doc.setTextColor(20, 20, 20)
  doc.text(`Tontine « ${g.nom} »`, 14, 36)
  doc.setFontSize(10)
  doc.setTextColor(90, 90, 90)
  doc.text(`Émis le ${new Date().toLocaleDateString('fr-FR')}`, 14, 42)

  autoTable(doc, {
    startY: 50,
    theme: 'grid',
    body: [
      ['Membre', membre?.nom || '—'],
      ['Tour', tour ? `#${tour.numero}` : '—'],
      ['Montant de la cotisation', formatMontant(c.montant, g)],
      ['Date de paiement', formatDate(c.datePaiement)],
      ['Moyen de paiement', c.moyenPaiement || '—'],
      ...(c.modeOperateur || c.modeNumero || c.modeReference
        ? [
            ['Opérateur', c.modeOperateur || '—'],
            ['Numéro émetteur', c.modeNumero || '—'],
            ['Référence transaction', c.modeReference || '—'],
          ]
        : []),
      ['Pénalité appliquée', c.penalite ? formatMontant(c.penalite, g) : '—'],
    ],
    columnStyles: { 0: { fontStyle: 'bold', cellWidth: 80 } },
    headStyles: { fillColor: [67, 56, 202] },
  })

  const total = Number(c.montant || 0) + Number(c.penalite || 0)
  doc.setFontSize(12)
  doc.setTextColor(20, 20, 20)
  doc.text(`Total : ${formatMontant(total, g)}`, 14, doc.lastAutoTable.finalY + 12)

  doc.setFontSize(9)
  doc.setTextColor(130, 130, 130)
  doc.text('Document généré par Tontine Manager — preuve de paiement officieuse.', 14, 282)

  sauvegarderFichier(doc.output('blob'), `${slug(g.nom)}-recu-tour-${tour ? tour.numero : ''}.pdf`)
}

// ── QR code d'invitation ─────────────────────────────────────
export async function genererQRInvitation(groupeId) {
  const g = getGroup(groupeId)
  if (!g) return ''
  const code = ensureCodeUnique(groupeId) || ''
  const msg = buildMessageInvitationGroupe(g, { lien: g.whatsappLien, code })
  try {
    return await QRCode.toDataURL(msg, { width: 640, margin: 2, errorCorrectionLevel: 'M' })
  } catch {
    return ''
  }
}

export async function partagerQRInvitation(groupeId) {
  const g = getGroup(groupeId)
  const dataUrl = await genererQRInvitation(groupeId)
  if (!dataUrl || !g) return
  await partagerDataUrl(dataUrl, `${slug(g.nom)}-invitation.png`)
}
