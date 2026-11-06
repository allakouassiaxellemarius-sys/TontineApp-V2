import { getGroup, getMembres, getMembre, getTourProchain, getPaiementMembre, addMembre, terminerGroup, createGroup, marquerTourRecu } from './db'
import { enregistrerPaiement } from './paiements'
import { envoyerRappel } from './remind'
import { exporterBilanPDF } from './export'
import { exporterGroupeExcel } from './excel'
import { todayStr } from './storage'

const auj = () => todayStr()

// Exécute une action proposée par l'assistant (côté client, source de vérité locale)
export async function executerAction(action, ctx) {
  const { groupId } = ctx
  const tool = (action.tool || '').toString()
  const args = action.args || {}
  const groupe = getGroup(groupId)
  switch (tool) {
    case 'addMember': {
      if (!args.nom) return '⚠️ Nom du membre manquant.'
      const cree = addMembre(groupId, { nom: String(args.nom), telephone: args.telephone ? String(args.telephone) : '' })
      if (!cree) return `⚠️ Ajout de « ${args.nom} » impossible (groupe plein, rejoint ou hors ligne).`
      return `✅ Membre « ${args.nom} » ajouté.`
    }
    case 'recordPayment': {
      const membres = getMembres(groupId)
      const cible = membres.find(
        (m) => m.nom && String(m.nom).toLowerCase().includes(String(args.membre || '').toLowerCase())
      )
      if (!cible) return `⚠️ Membre « ${args.membre} » introuvable.`
      const tour = getTourProchain(groupId)
      if (!tour) return '⚠️ Aucun tour planifié pour enregistrer le paiement.'
      const montant = Number(args.montant) || (groupe && groupe.montantCotisation) || 0
      // L'assistant renvoie un code ('pispi' | 'cash'), l'app stocke un libellé.
      const moyen = args.moyen === 'pispi' ? 'Pi-Spi' : 'Espèces'
      const res = enregistrerPaiement(groupe, tour, cible, montant, auj(), moyen, {})
      if (!res.ok) return `⚠️ ${res.message}`
      return `✅ Paiement de ${montant} FCFA enregistré pour « ${cible.nom} » (${moyen}).`
    }
    case 'createGroup': {
      if (!args.nom) return '⚠️ Nom de la tontine manquant.'
      const data = { nom: String(args.nom), montantCotisation: Number(args.montantCotisation) || 0, devise: 'FCFA' }
      const res = createGroup(data)
      const id = typeof res === 'string' ? res : res && (res.id || res.code)
      if (id && Array.isArray(args.membres)) {
        for (const mm of args.membres) if (mm && mm.nom) addMembre(id, { nom: String(mm.nom), telephone: mm.telephone ? String(mm.telephone) : '' })
      }
      return `✅ Tontine « ${args.nom} » créée.`
    }
    case 'sendReminder': {
      const membres = getMembres(groupId)
      const tour = getTourProchain(groupId)
      const cible = args.cible || 'retardataires'
      let cibles = membres
      if (tour && cible === 'retardataires') {
        cibles = membres.filter((m) => !getPaiementMembre(tour.id, m.id))
      }
      if (!cibles.length) return 'ℹ️ Aucun membre à relancer.'
      const msg = args.message || (groupe ? `Rappel: ${groupe.montantCotisation} FCFA à verser.` : 'Rappel de cotisation.')
      let n = 0
      for (const m of cibles) {
        try { await envoyerRappel(m, groupe, tour); n++ } catch { /* ignore */ }
      }
      return `📨 Relances envoyées à ${n} membre(s).`
    }
    case 'distribuerPot': {
      const tour = getTourProchain(groupId)
      if (!tour) return '⚠️ Aucun tour en cours à clôturer.'
      const result = marquerTourRecu(tour.id)
      if (!result) return '⚠️ Clôture du tour impossible.'
      const benef = getMembre(tour.membreId)
      return `✅ Pot du tour #${tour.numero} remis à ${benef ? benef.nom : 'au bénéficiaire'} — le tour suivant est planifié.`
    }
    case 'terminerTour': {
      terminerGroup(groupId, true)
      return '✅ Tour clôturé.'
    }
    case 'exportReport': {
      try {
        if ((args.format || 'pdf') === 'excel') await exporterGroupeExcel(groupId)
        else await exporterBilanPDF(groupId)
        return '📄 Rapport généré et partagé.'
      } catch (e) {
        return '⚠️ Export: ' + (e.message || e)
      }
    }
    default:
      return '⚠️ Action inconnue: ' + tool
  }
}

export function decrireAction(a) {
  const t = a.tool
  const p = a.args || {}
  switch (t) {
    case 'addMember': return `➕ Ajouter le membre « ${p.nom} »${p.telephone ? ' (' + p.telephone + ')' : ''}`
    case 'recordPayment': return `💸 Enregistrer ${Number(p.montant) || ''} FCFA pour « ${p.membre} »${p.moyen ? ' via ' + p.moyen : ''}`
    case 'createGroup': return `🏗️ Créer la tontine « ${p.nom} » (${Number(p.montantCotisation) || 0} FCFA)${Array.isArray(p.membres) ? ' +' + p.membres.length + ' membres' : ''}`
    case 'sendReminder': return `📨 Relancer : ${p.cible === 'tous' ? 'tous les membres' : p.cible === 'retardataires' ? 'les retardataires' : 'les membres'}${p.message ? ' — « ' + p.message + ' »' : ''}`
    case 'distribuerPot': return `🎉 Distribuer le pot du tour en cours`
    case 'terminerTour': return `🏁 Clôturer le tour en cours`
    case 'exportReport': return `📄 Générer un rapport (${p.format === 'excel' ? 'Excel' : 'PDF'})`
    default: return String(t)
  }
}
