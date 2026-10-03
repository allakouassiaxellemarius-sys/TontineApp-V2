// ═══════════════════════════════════════════════════════════════
// Rapprochement assisté des cotisations.
// ---------------------------------------------------------------
// L'argent arrive déjà très bien par Wave / Orange Money : ce qui coûte,
// c'est de reconnaître QUEL virement correspond à QUEL membre et à QUEL
// tour. Le responsable colle son relevé brut (SMS, historique copié de
// l'app opérateur, export) ; on en tire des lignes structurées, on les
// rapproche des attendus du tour, et il ne reste qu'à valider en masse.
//
// Trois niveaux de confiance, du plus sûr au moins sûr :
//   ref    — la narration contient la référence du membre : identification certaine
//   tel    — le numéro émetteur correspond au téléphone d'un membre
//   nom    — le nom complet du membre (profil Wave / libellé SMS) apparaît dans la ligne
//   montant— le montant égale exactement le reste dû d'un seul membre : indice,
//            jamais appliqué sans validation explicite
// ═══════════════════════════════════════════════════════════════
import { referencePourMembre } from './cotisation'
import { getPaiementsTour, STATUT } from './paiements'
import { todayStr } from './storage'

const RE_REF = /\bREF-[A-Z0-9]{6,}\b/i
const RE_DATE_ISO = /\b(20\d{2})[-/.](\d{1,2})[-/.](\d{1,2})\b/
const RE_DATE_FR = /\b(\d{1,2})[-/.](\d{1,2})[-/.](20\d{2}|\d{2})\b/
// Un numéro de téléphone fait au moins 8 chiffres ; un montant fait au plus 9
// chiffres et n'est jamais collé à 8 autres. Cette différence de longueur est
// le seul moyen fiable de les distinguer dans du texte libre.
const RE_NUM_LONG = /\+?\d[\d\s.,\-()]{6,17}\d/g
const RE_MONTANT = /(\d[\d\s.,]*(?:\.\d{3})*)\s*(?:FCFA|F\b|M\b)/i
const RE_OPERATEUR = [
  [/wave/i, 'Wave'],
  [/orange|orange money|\bom\b/i, 'Orange Money'],
  [/mtn[-\s]?momo|mtn/i, 'MTN MoMo'],
  [/moov/i, 'Moov Money'],
  [/free[-\s]?money/i, 'Free Money'],
]

// Nom comparable : sans accent, en minuscules, espaces normalisés. Les relevés
// sont saisis par les opérateurs et les membres eux-mêmes : la casse et les
// diacritiques varient d'un message à l'autre.
function normNom(valeur) {
  return String(valeur || '')
    .normalize('NFD')
    .replace(/[\u0300-\u0308]/g, '')
    .toLowerCase()
    .replace(/[^a-zÀ-ÿ' ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

// Opérateur émetteur, pour pré-remplir le moyen de paiement.
function operateurDe(texte) {
  for (const [re, nom] of RE_OPERATEUR) if (re.test(texte)) return nom
  return 'Mobile Money'
}

// Un membre peut être signalé par plusieurs indices simultanément (référence
// absente, numéro inconnu, mais nom présent) : on empile les raisons plutôt
// que d'écraser la première, sinon la ligne paraît « propre » alors qu'elle ne
// l'est pas.
function ajouterMotif(sortie, motif) {
  sortie.motif = sortie.motif ? `${sortie.motif} · ${motif}` : motif
}

// Clé de comparaison téléphone : les 9 derniers chiffres, donc insensible au
// préfixe international (+225 / 00225 / 07…).
function cleTel(valeur) {
  const chiffres = String(valeur || '').replace(/\D/g, '')
  return chiffres.length >= 9 ? chiffres.slice(-9) : chiffres
}

function versISO(annee, mois, jour) {
  let a = Number(annee)
  if (a < 100) a += 2000
  const m = String(mois).padStart(2, '0')
  const j = String(jour).padStart(2, '0')
  if (a < 2000 || a > 2100 || m < 1 || m > 12 || j < 1 || j > 31) return ''
  return `${a}-${m}-${j}`
}

function lireMontant(valeur) {
  if (!valeur) return 0
  // « 1 000 », « 1.000 », « 1,000 » → 1000 ; « 1 000,50 » → 1000 (les cotisations
  // se paient en FCFA entiers). L'ancien retrait de [ , . ] sans discernement
  // transformait « 1 000,50 » en 100050 : rapprochement impossible.
  let s = String(valeur).replace(/\s/g, '').replace(/[^\d.,]/g, '')
  const dernier = Math.max(s.lastIndexOf('.'), s.lastIndexOf(','))
  if (dernier !== -1) {
    const estMilliers = /^\d{3}$/.test(s.slice(dernier + 1)) && /^\d+([.,]\d{3})+$/.test(s)
    s = estMilliers ? s : s.slice(0, dernier)
  }
  const n = Number(s.replace(/[.,]/g, ''))
  return Number.isFinite(n) && n >= 0 ? Math.floor(n) : 0
}

// Une ligne de relevé → { brut, montant, date, telephone, reference }.
export function analyserLigne(ligne) {
  const brut = (ligne || '').trim()
  if (!brut) return null
  let reste = brut
  const sortie = { brut, montant: 0, date: '', telephone: '', reference: '', operateur: '' }

  const ref = RE_REF.exec(brut)
  if (ref) {
    sortie.reference = ref[0].toUpperCase()
    reste = reste.replace(ref[0], ' ')
  }

  const iso = RE_DATE_ISO.exec(reste)
  if (iso) {
    sortie.date = versISO(iso[1], iso[2], iso[3])
    reste = reste.replace(iso[0], ' ')
  } else {
    const fr = RE_DATE_FR.exec(reste)
    if (fr) {
      sortie.date = versISO(fr[3], fr[2], fr[1])
      reste = reste.replace(fr[0], ' ')
    }
  }

  // Le montant se lit AVANT le numéro : une somme explicite (« 12.345.678 FCFA »)
  // a 8 chiffres ou plus et RE_NUM_LONG la prendrait pour un numéro émetteur.
  const libelle = RE_MONTANT.exec(reste)
  if (libelle) {
    sortie.montant = lireMontant(libelle[1])
    reste = reste.replace(libelle[0], ' ')
  }

  const tel = reste.match(RE_NUM_LONG)
  if (tel && tel.length) {
    // Le premier candidat d'au moins 8 chiffres est le numéro émetteur.
    const trouve = tel.find((t) => t.replace(/\D/g, '').length >= 8)
    if (trouve) {
      sortie.telephone = trouve.trim()
      reste = reste.replace(trouve, ' ')
    }
  }

  if (!sortie.montant) {
    const orphelin = reste.match(RE_NUM_LONG) || reste.match(/\b\d[\d\s.,]*\d\b|\b\d{2,}\b/)
    if (orphelin) {
      const c = orphelin[0] ? orphelin[0].trim() : orphelin.trim()
      if (c.replace(/\D/g, '').length <= 9) sortie.montant = lireMontant(c)
    }
  }

  sortie.operateur = operateurDe(brut)

  return sortie
}

export function analyserReleve(texte) {
  return (texte || '')
    .split(/\r?\n+/)
    .map(analyserLigne)
    .filter((l) => l && (l.montant || l.reference || l.telephone))
}

// Reste dû d'un membre pour un tour : cotisation + pénalité, moins ce qui a
// déjà été encaissé. Sert de garde-fou contre un rapprochement par montant.
function resteDu(groupe, lignePaiement) {
  if (lignePaiement.statut === STATUT.PAYE) return 0
  const base = Number(groupe.montantCotisation) || 0
  const penalite = Number(lignePaiement.paiement?.penalite || 0)
  return base + penalite
}

// Rapproche un relevé analysé des attendus d'un tour.
// Retourne [{ ...ligne, cle, confiance, membre, reste, dejaEncaisse, motif }]
export function rapprocher({ lignes, groupe, tour, membres }) {
  const paiementParMembre = new Map()
  if (tour) {
    for (const l of getPaiementsTour(groupe, tour)) paiementParMembre.set(Number(l.membre.id), l)
  }

  // Index de recherche : référence (liée à un uid uniquement), téléphone, nom.
  const parRef = new Map()
  const parTel = new Map()
  const parNom = new Map()
  for (const m of membres || []) {
    if (m.uid && groupe.codeUnique) parRef.set(referencePourMembre(groupe.codeUnique, m.uid).toUpperCase(), m)
    const cle = cleTel(m.telephone)
    if (cle) {
      if (!parTel.has(cle)) parTel.set(cle, [])
      parTel.get(cle).push(m)
    }
    const nom = normNom(m.nom)
    // Un prénom seul est trop fréquent dans un relevé (il apparaît aussi comme
    // destinataire ou dans une pub) : seuls les noms complets sont indexés.
    if (nom && nom.includes(' ')) {
      if (!parNom.has(nom)) parNom.set(nom, [])
      parNom.get(nom).push(m)
    }
  }

  // Nom complet trouvé dans la narration (profil Wave, libellé SMS).
  const parNomTexte = (texte) => {
    for (const [nom, candidats] of parNom) if (texte.includes(nom)) return candidats
    return []
  }

  const sorties = lignes.map((ligne, i) => {
    const texte = normNom(ligne.brut)
    const sortie = {
      ...ligne,
      cle: `${i}:${ligne.brut}`,
      confiance: '',
      membre: null,
      reste: 0,
      dejaEncaisse: false,
      motif: '',
    }

    if (ligne.reference && parRef.has(ligne.reference)) {
      sortie.membre = parRef.get(ligne.reference)
      sortie.confiance = 'ref'
    } else if (ligne.telephone) {
      const candidats = parTel.get(cleTel(ligne.telephone)) || []
      if (candidats.length === 1) {
        sortie.membre = candidats[0]
        sortie.confiance = 'tel'
      } else if (candidats.length > 1) {
        sortie.motif = `Numéro partagé par ${candidats.length} membres : à trancher`
        return sortie
      }
    }

    if (!sortie.membre) {
      const candidats = parNomTexte(texte)
      if (candidats.length === 1) {
        sortie.membre = candidats[0]
        sortie.confiance = 'nom'
      } else if (candidats.length > 1) {
        sortie.motif = `Nom commun à ${candidats.length} membres : à trancher`
        return sortie
      }
    }

    if (!sortie.membre) {
      // Dernier indice : un montant qui ne correspond qu'à UN seul membre encore
      // redevable exactement de cette somme. Ambigu par nature, donc jamais
      // appliqué sans validation explicite du responsable.
      const auBonMontant = (membres || []).filter((m) => {
        const l = paiementParMembre.get(Number(m.id))
        if (!l) return false
        return resteDu(groupe, l) > 0 && resteDu(groupe, l) === ligne.montant
      })
      if (auBonMontant.length === 1) {
        sortie.membre = auBonMontant[0]
        sortie.confiance = 'montant'
      } else if (auBonMontant.length > 1) {
        ajouterMotif(sortie, `${auBonMontant.length} membres doivent ce montant`)
      } else {
        ajouterMotif(sortie, ligne.montant
          ? `Aucun membre attendu pour ${ligne.montant} FCFA`
          : 'Ligne sans numéro, nom ni montant exploitable')
      }
      if (ligne.reference) ajouterMotif(sortie, 'Référence inconnue dans ce groupe')
      if (!sortie.membre) return sortie
    }

    const paiement = paiementParMembre.get(Number(sortie.membre.id))
    sortie.reste = paiement ? resteDu(groupe, paiement) : resteDu(groupe, { statut: STATUT.EN_ATTENTE, paiement: null })
    if (paiement && paiement.statut === STATUT.PAYE) {
      sortie.dejaEncaisse = true
      ajouterMotif(sortie, 'Déjà enregistré pour ce tour')
    } else if (ligne.montant && sortie.reste && ligne.montant !== sortie.reste) {
      ajouterMotif(sortie, `Montant différent : ${ligne.montant} reçus pour ${sortie.reste} attendus`)
    }
    return sortie
  })

  return marquerDoublons(sorties)
}

// Deux lignes du relevé peuvent désigner le même membre (double SMS, ou
// virement + capture). Les appliquer les deux écrirait la seconde par-dessus
// la première sans prévenir : on n'en garde qu'une, l'autre passe en « à trancher ».
// Exportée car l'UI rejoue ce contrôle après chaque association manuelle.
export function marquerDoublons(sorties) {
  const sortiees = sorties.map((s) => ({
    ...s,
    motif: (s.motif || '')
      .split(' · ')
      .filter((m) => m && !m.startsWith('Déjà une ligne pour '))
      .join(' · '),
  }))
  const dejaPris = new Set()
  for (const s of sortiees) {
    if (!s.membre || s.dejaEncaisse) continue
    const cle = Number(s.membre.id)
    if (dejaPris.has(cle)) ajouterMotif(s, `Déjà une ligne pour ${s.membre.nom}`)
    else dejaPris.add(cle)
  }
  return sortiees
}

// Lignes applicables en masse : identifiées, non déjà encaissées, sans écart
// de montant non expliqué. « montant » reste exclu : un montant seul n'identifie
// personne, il ne fait que coller à une attente.
export function estApplicable(ligne) {
  return (
    !!ligne.membre &&
    !ligne.dejaEncaisse &&
    (ligne.confiance === 'ref' || ligne.confiance === 'tel' || ligne.confiance === 'nom' || ligne.confiance === 'manuel') &&
    !ligne.motif
  )
}

export const LIBELLES_CONFIANCE = {
  ref: 'Référence',
  tel: 'Numéro',
  nom: 'Nom',
  montant: 'Montant',
  manuel: 'Toi',
}

// Ce qu'un membre doit encore au tour choisi. Utilisé quand le responsable
// associe une ligne à la main : le reste dû et l'écart de montant doivent
// être recalculés, pas repris de l'ancienne identification.
export function attenteMembre(groupe, tour, membre) {
  const enAttente = { reste: resteDu(groupe, { statut: STATUT.EN_ATTENTE, paiement: null }), dejaEncaisse: false }
  if (!tour || !membre) return enAttente
  const l = getPaiementsTour(groupe, tour).find((x) => Number(x.membre.id) === Number(membre.id))
  if (!l) return enAttente
  return { reste: resteDu(groupe, l), dejaEncaisse: l.statut === STATUT.PAYE, ligne: l }
}

// Ce qui sera réellement écrit en base pour une ligne retenue.
export function paiementDe(ligne, groupe) {
  const montant = Number(ligne.montant) || Number(ligne.reste) || Number(groupe.montantCotisation) || 0
  return {
    montant,
    datePaiement: ligne.date || todayStr(),
    moyen: ligne.operateur || 'Mobile Money',
    details: {
      operateur: ligne.operateur || '',
      numero: ligne.telephone || '',
      reference: ligne.reference || '',
    },
  }
}

export function resumeRapprochement(lignes) {
  return {
    total: lignes.length,
    applicables: lignes.filter(estApplicable).length,
    aTrancher: lignes.filter((l) => !l.membre).length,
    dejaLa: lignes.filter((l) => l.dejaEncaisse).length,
  }
}
