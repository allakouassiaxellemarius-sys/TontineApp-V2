// ═══════════════════════════════════════════════════════════════
// Analyse financière d'une tontine (comptabilité + data + conseil)
// ---------------------------------------------------------------
// Les petits modèles de langage interrogés par l'assistant sont mauvais en
// arithmetic et inventent des chiffres. Tout ce module calcule donc ICI, à
// partir de la base locale (source de vérité), un digest numérique + un brief
// en français que l'assistant n'a plus qu'à expliquer et commenter.
// Entrées : uniquement src/lib/db.js (getBilan, mis en cache) et penalty.js.
// ═══════════════════════════════════════════════════════════════
import { getBilan } from './db.js'
import { calculerPenalite } from './penalty.js'
import { todayStr, addDays } from './storage.js'

const r0 = (n) => Math.round(Number(n) || 0)
const pct = (a, b) => (b > 0 ? Math.round((a / b) * 100) : 0)
const joursEntre = (debut, fin) => {
  const a = new Date(debut + 'T23:59:59')
  const b = new Date(fin + 'T23:59:59')
  if (isNaN(a) || isNaN(b)) return 0
  return Math.ceil((a - b) / 86400000)
}

export function analyseGroupe(groupeId) {
  const bilan = getBilan(groupeId)
  if (!bilan || !bilan.groupe) return null
  const g = bilan.groupe
  const auj = todayStr()
  const membres = bilan.membres || []
  const montant = Number(g.montantCotisation) || 0
  const cotisees = (bilan.cotisations || []).filter((c) => c.statut === 'paye')
  const tours = (bilan.tours || []).filter((t) => t.statut !== 'annule')
  const toursEchus = tours.filter((t) => t.datePrevue && t.datePrevue <= auj)
  const toursRecus = tours.filter((t) => t.statut === 'recu')

  // Le bénéficiaire d'un tour cotise ou non selon le réglage du groupe : toute
  // l'analyse (attendu, retards, régularité) doit suivre cette même règle, sinon
  // elle accuse à tort le bénéficiaire d'être en retard.
  const doitCotiser = (tour, membre) => (g.leReceveurCotonise ? true : tour.membreId !== membre.id)

  const ecrituresAttendues = toursEchus.reduce(
    (s, t) => s + membres.filter((m) => doitCotiser(t, m)).length, 0
  )
  const attendu = ecrituresAttendues * montant
  const collecte = r0(bilan.totalCotis)
  const manque = Math.max(0, attendu - collecte)

  // ── Ponctualité ────────────────────────────────────────────
  const retards = []
  let horsDelai = 0
  for (const c of cotisees) {
    const t = tours.find((x) => x.id === c.tourId)
    if (!t || !t.datePrevue || !c.datePaiement) continue
    const r = joursEntre(c.datePaiement, t.datePrevue)
    if (r > 0) { horsDelai++; retards.push(r) }
  }
  const retardMoyen = retards.length ? Math.round(retards.reduce((s, x) => s + x, 0) / retards.length) : 0
  const ponctualite = cotisees.length ? 100 - pct(horsDelai, cotisees.length) : null

  // ── Paires (membre, tour échu) non réglées : le stock du retard ──
  const impayes = []
  for (const t of toursEchus) {
    for (const m of membres) {
      if (!doitCotiser(t, m)) continue
      const ligne = cotisees.find((c) => c.tourId === t.id && c.membreId === m.id)
      if (!ligne) impayes.push({ tour: t, membre: m })
    }
  }
  const coutPenaliteSiRegle = (deltaJours) => r0(impayes.reduce(
    (s, { tour }) => s + calculerPenalite(g, tour, addDays(auj, deltaJours)), 0
  ))
  const coutPenaliteJour = g.penalitePctParJour > 0
    ? r0(impayes.length * montant * (Number(g.penalitePctParJour) / 100))
    : 0

  // ── Régularité par membre ──────────────────────────────────
  const parMembre = membres.map((m) => {
    const info = (bilan.parMembre || []).find((p) => p.membre && p.membre.id === m.id)
    const dus = toursEchus.filter((t) => doitCotiser(t, m)).length
    const payees = cotisees.filter((c) => c.membreId === m.id).length
    return {
      nom: m.nom,
      role: m.role,
      tauxRegularite: pct(payees, dus),
      payees,
      dus,
      cotise: r0(info?.cotise),
      recu: r0(info?.recu),
      solde: r0(info?.solde),
      penalitesPayees: r0(info?.penalites),
      penalitesQuiCourent: r0(info?.penalitesEnCours),
      joursRetard: impayes.filter((x) => x.membre.id === m.id)
        .reduce((mx, x) => Math.max(mx, joursEntre(auj, x.tour.datePrevue)), 0),
    }
  }).sort((a, b) => b.tauxRegularite - a.tauxRegularite || b.joursRetard - a.joursRetard)

  const enRetard = parMembre
    .filter((p) => p.joursRetard > 0 || p.penalitesQuiCourent > 0)
    .sort((a, b) => b.joursRetard - a.joursRetard)
    .slice(0, 12)
  const totalQuiCourent = r0(parMembre.reduce((s, p) => s + p.penalitesQuiCourent, 0))

  // ── Trésorerie ─────────────────────────────────────────────
  const depuis30 = addDays(auj, -30)
  const encaisses30 = r0(cotisees
    .filter((c) => c.datePaiement && c.datePaiement >= depuis30)
    .reduce((s, c) => s + Number(c.montant || 0) + Number(c.penalite || 0), 0))
  const decaisses30 = r0(toursRecus
    .filter((t) => (t.dateReception || t.datePrevue) >= depuis30)
    .reduce((s, t) => s + Number(t.montantPot || 0), 0))

  const prochain = tours
    .filter((t) => t.statut === 'en_attente' && t.datePrevue && t.datePrevue >= auj)
    .sort((a, b) => String(a.datePrevue).localeCompare(String(b.datePrevue)))[0] || null
  const dernier = tours.slice().sort((a, b) => String(a.datePrevue).localeCompare(String(b.datePrevue)))[tours.length - 1] || null
  const nom = (id) => membres.find((m) => m.id === id)?.nom || '—'

  // ── Contrôle comptable : ce qui ne colle pas ───────────────
  const anomalies = []
  if (bilan.totalRecu > collecte && collecte > 0) {
    anomalies.push({
      type: 'distribution_superieure_a_la_collecte',
      gravite: 'haute',
      detail: `${r0(bilan.totalRecu)} FCFA distribués pour ${collecte} FCFA collectés : le groupe est découvert de ${r0(bilan.totalRecu - collecte)} FCFA.`,
    })
  }
  const surCotisees = cotisees.filter((c) => montant > 0 && Number(c.montant) > montant)
  if (surCotisees.length) {
    anomalies.push({
      type: 'cotisation_superieure',
      gravite: 'moyenne',
      detail: `${surCotisees.length} paiement(s) supérieur(s) à la cotisation de ${montant} FCFA (saisie à vérifier).`,
    })
  }
  const futurs = cotisees.filter((c) => c.datePaiement && c.datePaiement > auj)
  if (futurs.length) {
    anomalies.push({
      type: 'paiement_futur',
      gravite: 'moyenne',
      detail: `${futurs.length} paiement(s) daté(s) après aujourd’hui : les pénalités et le retard sont sous-estimés.`,
    })
  }
  const vus = new Map()
  for (const c of cotisees) {
    const cle = `${c.membreId}|${c.datePaiement}|${r0(c.montant)}`
    vus.set(cle, (vus.get(cle) || 0) + 1)
  }
  const doublons = [...vus.values()].filter((n) => n > 1).length
  if (doublons) {
    anomalies.push({
      type: 'suspicion_double_saisie',
      gravite: 'basse',
      detail: `${doublons} paiement(s) identiques (même membre, même jour, même montant) sur des tours différents : possible double saisie.`,
    })
  }
  const sansTour = cotisees.filter((c) => !tours.some((t) => t.id === c.tourId))
  if (sansTour.length) {
    anomalies.push({
      type: 'ecriture_orpheline',
      gravite: 'haute',
      detail: `${sansTour.length} cotisation(s) ne rattachée(s) à aucun tour du groupe.`,
    })
  }
  const sansDate = tours.filter((t) => !t.datePrevue)
  if (sansDate.length) {
    anomalies.push({
      type: 'tour_sans_date',
      gravite: 'moyenne',
      detail: `${sansDate.length} tour(s) sans date prévue : ni échéance ni pénalité calculable pour eux.`,
    })
  }

  // ── Score de santé, entièrement explicable ─────────────────
  const facteurs = []
  let score = 100
  const retire = (points, motif) => {
    if (points <= 0) return
    score -= points
    facteurs.push(`−${r0(points)} : ${motif}`)
  }
  if (ecrituresAttendues > 0) {
    const tauxCollecteLocal = pct(collecte, attendu)
    if (tauxCollecteLocal < 95) {
      retire(Math.min(35, (95 - tauxCollecteLocal) * 0.5), `collecte à ${tauxCollecteLocal}% de ce qui est dû`)
    }
  }
  if (ponctualite !== null && ponctualite < 90) {
    retire(Math.min(25, (90 - ponctualite) * 0.4), `${horsDelai} paiement(s) sur ${cotisees.length} arrivés après l’échéance`)
  }
  if (totalQuiCourent > 0 && montant > 0) {
    retire(Math.min(20, (totalQuiCourent / montant) * 10), `${totalQuiCourent} FCFA de pénalités en cours de formation`)
  }
  if (bilan.totalRecu > collecte && collecte > 0) {
    retire(25, 'plus distribué que collecté')
  }
  if (toursEchus.length > 0 && cotisees.length === 0) {
    retire(20, 'aucune cotisation enregistrée alors que des tours sont échus')
  }
  if (membres.length === 0) retire(40, 'aucun membre dans le groupe')
  score = Math.max(0, Math.min(100, Math.round(score)))

  const niveau = score >= 80 ? 'solide' : score >= 60 ? 'correcte' : score >= 40 ? 'fragile' : 'critique'

  const digest = {
    devise: g.deviseSymbole || 'FCFA',
    dateAnalyse: auj,
    periode: {
      effectif: membres.length,
      toursPlanifies: tours.length,
      toursEchus: toursEchus.length,
      toursDistribues: toursRecus.length,
      tourSuivant: prochain
        ? { numero: prochain.numero, beneficiaire: nom(prochain.membreId), date: prochain.datePrevue, pot: r0(prochain.montantPot) }
        : null,
      finDeCyclePrevue: dernier ? dernier.datePrevue : null,
      periodeJours: Number(g.periodeJours) || 0,
    },
    collecte: { attendu, collecte, manque, tauxCollectePct: pct(collecte, attendu), cotisation: montant },
    penalites: {
      regle: g.penalitePctParJour > 0 ? `${g.penalitePctParJour}%/jour${g.penalitePlafond ? `, plafond ${g.penalitePlafond}%` : ''}` : 'aucune',
      dejaEncaissees: r0(bilan.totalPenalites),
      quiCourent: totalQuiCourent,
      coutParJour: coutPenaliteJour,
      siRegleAujourdhui: coutPenaliteSiRegle(0),
      siRegleDans7Jours: coutPenaliteSiRegle(7),
      siRegleDans30Jours: coutPenaliteSiRegle(30),
      ecrituresEnRetard: impayes.length,
    },
    ponctualite: ponctualite === null ? null : {
      tauxPct: ponctualite,
      paiementsHorsDelai: horsDelai,
      paiementsEnregistres: cotisees.length,
      retardMoyenJours: retardMoyen,
      plusGrosRetardJours: retards.length ? Math.max(...retards) : 0,
    },
    tresorerie: {
      entrees30Jours: encaisses30,
      sorties30Jours: decaisses30,
      net30Jours: encaisses30 - decaisses30,
      soldeGroupe: r0(bilan.soldeGroupe),
    },
    membres: {
      regularite: parMembre.slice(0, 12),
      enRetard,
      meilleur: parMembre[0] || null,
      plusEnRetard: enRetard[0] || null,
      aJour: parMembre.filter((p) => p.dus > 0 && p.joursRetard === 0).length,
    },
    sante: { score, niveau, facteurs },
    anomalies,
  }
  digest.recommandations = recommandations(digest, { g, auj, nom })
  digest.brief = brief(digest)
  return digest
}

// Conseil financier : des phrases courtes, chiffrées, actionnables. Elles
// s'adressent au trésorier, pas au modèle — l'assistant doit les commenter, pas
// les réinventer.
function recommandations(d, ctx) {
  const { g, auj } = ctx
  const out = []
  const m = d.collecte.cotisation
  const montantManquant = d.collecte.manque

  if (d.periode.effectif === 0) {
    return ['Le groupe n’a encore aucun membre : ajoute les participants avant toute analyse financière.']
  }
  if (montantManquant > 0 && d.penalites.ecrituresEnRetard > 0) {
    out.push(
      `Il manque ${montantManquant} ${d.devise} pour couvrir les ${d.penalites.ecrituresEnRetard} cotisation(s) échue(s) : ${d.membres.enRetard.length} membre(s) concernés, le plus souvent ${d.membres.plusEnRetard?.nom || '—'} (${d.membres.plusEnRetard?.joursRetard || 0} j de retard).`
    )
  } else if (montantManquant === 0 && d.collecte.attendu > 0) {
    out.push(`Collecte complète : ${d.collecte.collecte} ${d.devise} encaissés sur ${d.collecte.attendu} ${d.devise} dus, rien à relancer.`)
  }
  if (d.penalites.coutParJour > 0) {
    out.push(
      `Le retard coûte ${d.penalites.coutParJour} ${d.devise} par jour au groupe : réglé aujourd’hui il ne reste que ${d.penalites.siRegleAujourdhui} ${d.devise} de pénalité, dans 7 jours ${d.penalites.siRegleDans7Jours}, dans 30 jours ${d.penalites.siRegleDans30Jours}.`
    )
  } else {
    out.push(`Aucune pénalité n’est prévue dans ce groupe (${d.penalites.regle}) : la seule pression est sociale. Tu peux instaurer ${Math.max(1, Math.round(m * 0.02))} ${d.devise}/jour pour rendre les retards coûteux.`)
  }
  if (d.ponctualite && d.ponctualite.tauxPct < 70) {
    out.push(
      `Seulement ${d.ponctualite.tauxPct}% des paiements sont arrivés à l’heure (retard moyen ${d.ponctualite.retardMoyenJours} j) : la régularité est le vrai risque ici, pas le montant. Rappelle les membres 2-3 jours avant l’échéance plutôt qu’après.`
    )
  }
  if (d.periode.tourSuivant) {
    const t = d.periode.tourSuivant
    // Le pot attendu en caisse dépend du réglage « le bénéficiaire cotise » :
    // l'estimer avec (effectif − 1) quand le bénéficiaire cotise aussi faux d'une
    // cotisation entière.
    const nbContributes = g.leReceveurCotonise ? d.periode.effectif : d.periode.effectif - 1
    const du = r0(nbContributes * m)
    out.push(
      `Prochain tour #${t.numero} : ${t.beneficiaire} doit recevoir ${t.pot} ${d.devise} le ${t.date}. Il faut ${du} ${d.devise} en caisse, soit ${nbContributes} cotisation(s) de ${m} ${d.devise} (${g.leReceveurCotonise ? 'bénéficiaire compris' : 'bénéficiaire hors cotisation'}).`
    )
  }
  if (d.tresorerie.soldeGroupe < 0) {
    out.push(
      `Trésorerie négative : ${Math.abs(d.tresorerie.soldeGroupe)} ${d.devise} déjà distribués de plus que collectés. Il faut combler avant le prochain tour, sinon c’est le responsable qui avance l’argent.`
    )
  }
  for (const a of d.anomalies.filter((x) => x.gravite === 'haute')) out.push(`Point de contrôle : ${a.detail}`)
  if (d.periode.finDeCyclePrevue) {
    const jours = Math.max(0, Math.ceil((new Date(d.periode.finDeCyclePrevue + 'T23:59:59') - new Date(auj + 'T23:59:59')) / 86400000))
    out.push(
      `Le cycle complet s’achève le ${d.periode.finDeCyclePrevue} (${jours} jours restants, ${d.periode.toursPlanifies} tours). Total versé par membre sur le cycle : ${r0(d.periode.toursPlanifies * m)} ${d.devise}.`
    )
  }
  out.push(`Santé du groupe : ${d.sante.score}/100 (${d.sante.niveau}).${d.sante.facteurs.length ? ' Détail : ' + d.sante.facteurs.join(' · ') : ''}`)
  return out
}

// Version texte : c'est ce que l'assistant lit en priorité. Un bloc de chiffres
// brut laisse un petit modèle libre de se tromper de colonne.
function brief(d) {
  const l = []
  l.push(`Analyse du ${d.dateAnalyse} — ${d.periode.effectif} membres, ${d.periode.toursEchus}/${d.periode.toursPlanifies} tours échus.`)
  l.push(`Collecte : ${d.collecte.collecte} / ${d.collecte.attendu} ${d.devise} (${d.collecte.tauxCollectePct}%), manque ${d.collecte.manque} ${d.devise}. Cotisation : ${d.collecte.cotisation} ${d.devise}.`)
  if (d.ponctualite) {
    l.push(`Ponctualité : ${d.ponctualite.tauxPct}% (${d.ponctualite.paiementsHorsDelai}/${d.ponctualite.paiementsEnregistres} hors délai, retard moyen ${d.ponctualite.retardMoyenJours} j, pire ${d.ponctualite.plusGrosRetardJours} j).`)
  }
  l.push(`Pénalités : règle ${d.penalites.regle}, ${d.penalites.dejaEncaissees} ${d.devise} déjà payées, ${d.penalites.quiCourent} ${d.devise} en cours, ${d.penalites.coutParJour} ${d.devise}/jour tant que rien ne rentre.`)
  l.push(`Trésorerie 30 jours : +${d.tresorerie.entrees30Jours} / −${d.tresorerie.sorties30Jours} = ${d.tresorerie.net30Jours} ${d.devise}. Solde du groupe : ${d.tresorerie.soldeGroupe} ${d.devise}.`)
  if (d.membres.enRetard.length) {
    l.push('En retard : ' + d.membres.enRetard.map((p) => `${p.nom} (${p.joursRetard} j, ${p.penalitesQuiCourent} ${d.devise} de pénalité qui court)`).join('; '))
  } else {
    l.push('Aucun membre en retard.')
  }
  if (d.anomalies.length) l.push('Contrôles comptables : ' + d.anomalies.map((a) => `[${a.gravite}] ${a.detail}`).join(' | '))
  l.push('Recommandations :')
  for (const r of d.recommandations) l.push('• ' + r)
  return l.join('\n')
}
