export function calculerPenalite(groupe, tour, datePaiement) {
  if (!groupe || !tour) return 0
  const pct = Number(groupe.penalitePctParJour) || 0
  const plafondPct = Number(groupe.penalitePlafond) || 0
  if (pct <= 0) return 0

  const echeance = new Date((tour.datePrevue || '') + 'T23:59:59')
  const paiement = new Date((datePaiement || '') + 'T23:59:59')
  if (!datePaiement || paiement <= echeance) return 0

  const jours = Math.ceil((paiement - echeance) / 86400000)
  if (jours <= 0) return 0

  const base = Number(groupe.montantCotisation) || 0
  let penalite = base * (pct / 100) * jours
  if (plafondPct > 0) {
    penalite = Math.min(penalite, base * (plafondPct / 100))
  }
  return Math.round(penalite * 100) / 100
}

export function penaliteEstimee(groupe, tour) {
  if (!groupe || !tour) return 0
  const pct = Number(groupe.penalitePctParJour) || 0
  const plafondPct = Number(groupe.penalitePlafond) || 0
  if (pct <= 0) return 0

  const echeance = new Date((tour.datePrevue || '') + 'T23:59:59')
  const maintenant = new Date()
  if (maintenant <= echeance) return 0
  const jours = Math.ceil((maintenant - echeance) / 86400000)
  if (jours <= 0) return 0

  const base = Number(groupe.montantCotisation) || 0
  let penalite = base * (pct / 100) * jours
  if (plafondPct > 0) penalite = Math.min(penalite, base * (plafondPct / 100))
  return Math.round(penalite * 100) / 100
}

export function formatRegle(groupe) {
  const pct = Number(groupe.penalitePctParJour) || 0
  const plafond = Number(groupe.penalitePlafond) || 0
  if (pct <= 0) return 'Pas de pénalité'
  if (plafond > 0) return `${pct}% / jour, plafond ${plafond}%`
  return `${pct}% / jour`
}
