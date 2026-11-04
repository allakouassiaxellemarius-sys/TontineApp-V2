// ═══════════════════════════════════════════════════════════════
// Bornes de tout ce qui entre dans l'appareil.
// ---------------------------------------------------------------
// Trois sources de données, aucune fiable : la saisie manuelle, le snapshot
// téléchargé d'un compte étranger (rejoindre par code), le fichier de
// sauvegarde choisi par l'utilisateur. Un montant négatif inverserait les
// bilans et ferait « payer » une tontine ; un pourcentage démesuré gonflerait
// une pénalité sans que rien ne le signale. L'import ne doit jamais être plus
// perméable que le formulaire : les deux chemins passent par ces fonctions.
// ═══════════════════════════════════════════════════════════════

// Un montant dû : entier, borné, jamais négatif.
export function bornerPositif(v, max = Number.MAX_SAFE_INTEGER) {
  const n = Number(v)
  if (!Number.isFinite(n) || n <= 0) return 0
  return Math.min(max, Math.round(n))
}

// Les pourcentages (pénalité par jour, plafond, intérêt) s'interprètent
// toujours relativement à la cotisation : au-delà de 100 %, la règle n'a
// plus de sens monétaire et ne peut être qu'une valeur injectée.
export const bornerPct = (v) => bornerPositif(v, 100)

// Écart entre deux tours : en jours, au moins 1, sinon le planning se fige.
export function bornerPeriode(v, defaut = 7) {
  const n = Math.round(Number(v))
  if (!Number.isFinite(n) || n < 1) return defaut
  return Math.min(3650, n)
}

// Une écriture d'épargne garde son signe : un retrait est négatif par
// construction (retirerEpargne). On refuse seulement l'infini, NaN et le
// texte — ce qui rendrait le solde illisible, pas seulement faux.
export function bornerMouvement(v) {
  const n = Number(v)
  return Number.isFinite(n) ? Math.round(n) : 0
}

function bornerStatut(v, autorises, defaut) {
  return autorises.includes(v) ? v : defaut
}

const STATUTS_TOUR = ['en_attente', 'recu', 'annule']
const STATUTS_COTISATION = ['paye', 'en_attente']
const STATUTS_PRET = ['en_cours', 'rembourse']

// Les objets sont rendus tels quels (mêmes clés, mêmes identifiants) : seule
// la valeur d'un champ monétaire ou d'un statut est corrigée.
export function bornesGroupe(g) {
  if (!g || typeof g !== 'object') return g
  return {
    ...g,
    montantCotisation: bornerPositif(g.montantCotisation),
    periodeJours: bornerPeriode(g.periodeJours),
    penalitePctParJour: bornerPct(g.penalitePctParJour),
    penalitePlafond: bornerPct(g.penalitePlafond),
    membresMin: bornerPositif(g.membresMin),
    membresMax: bornerPositif(g.membresMax),
  }
}

export function bornesTour(t) {
  if (!t || typeof t !== 'object') return t
  return {
    ...t,
    montantPot: bornerPositif(t.montantPot),
    penaliteAuto: t.penaliteAuto === undefined || t.penaliteAuto === null
      ? t.penaliteAuto
      : bornerPositif(t.penaliteAuto),
    statut: bornerStatut(t.statut, STATUTS_TOUR, 'en_attente'),
  }
}

export function bornesCotisation(c) {
  if (!c || typeof c !== 'object') return c
  return {
    ...c,
    montant: bornerPositif(c.montant),
    penalite: bornerPositif(c.penalite),
    statut: bornerStatut(c.statut, STATUTS_COTISATION, 'en_attente'),
  }
}

export function bornesPret(p) {
  if (!p || typeof p !== 'object') return p
  return {
    ...p,
    montant: bornerPositif(p.montant),
    tauxInteret: bornerPct(p.tauxInteret),
    statut: bornerStatut(p.statut, STATUTS_PRET, 'en_cours'),
    remboursements: Array.isArray(p.remboursements)
      ? p.remboursements.map((r) => (r && typeof r === 'object' ? { ...r, montant: bornerPositif(r.montant) } : r))
      : [],
  }
}

export function bornesEpargne(e) {
  if (!e || typeof e !== 'object') return e
  return {
    ...e,
    objectif: bornerPositif(e.objectif),
    versements: Array.isArray(e.versements)
      ? e.versements.map((v) => (v && typeof v === 'object' ? { ...v, montant: bornerMouvement(v.montant) } : v))
      : [],
  }
}

const ASSAINISSEURS = {
  groups: bornesGroupe,
  tours: bornesTour,
  cotisations: bornesCotisation,
  prets: bornesPret,
  epargnes: bornesEpargne,
}

// Une collection entière (clés de stockage = noms des collections de la
// sauvegarde) : les membres ne portent aucun argent, ils traversent inchangés.
export function assainirCollection(cle, liste) {
  const assainir = ASSAINISSEURS[cle]
  if (!assainir || !Array.isArray(liste)) return liste
  return liste.map((x) => assainir(x))
}
