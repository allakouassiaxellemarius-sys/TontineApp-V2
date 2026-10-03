// Smoke test du worker DÉPLOYÉ : le digest financier de l'app atteint-il le
// modèle en production, et les canaux de discussion sont-ils bien verrouillés ?
// Utilise des comptes jetables et se supprime lui-même (DELETE /compte).
const BASE = 'https://tontine-sync.tontine-manager.workers.dev'
const sel = String(Date.now()).slice(-6)
const code = 'SK' + sel
const mdp = 'test-jetable-2026'

const j = async (method, path, body, token) => {
  const res = await fetch(BASE + path, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  let data = null
  try { data = await res.json() } catch {}
  return { status: res.status, data }
}

const inscrire = async (nom) => {
  const email = 'qoder.smoke.' + sel + '.' + nom + '@exemple.com'
  const r = await j('POST', '/auth2/register', { email, password: mdp, displayName: 'Smoke ' + nom })
  if (r.status !== 200) throw new Error('register ' + nom + ' → ' + r.status + ' ' + JSON.stringify(r.data))
  return { ...r.data, email }
}

const owner = await inscrire('prop')
const invite = await inscrire('inv')
const curieux = await inscrire('curieux')
console.log('comptes créés :', sel)

const snap = {
  format: 2,
  groupe: {
    codeUnique: code, nom: 'Tontine smoke', proprietaire: owner.user.uid,
    montantCotisation: 5000, periodeJours: 30, penalitePctParJour: 2, penalitePlafond: 20,
    leReceveurCotonise: true, coGerants: {},
  },
  membres: [
    { id: 1, nom: 'Awa Traoré', role: 'responsable', telephone: '0700112233' },
    { id: 2, nom: 'Koffi Atta', role: 'membre', telephone: '0700445566' },
  ],
  tours: [{ id: 10, numero: 1, membreId: 2, datePrevue: '2026-09-05', montantPot: 10000, statut: 'en_attente' }],
  cotisations: [{ id: 20, tourId: 10, membreId: 1, montant: 5000, statut: 'paye', datePaiement: '2026-09-03' }],
  prets: [],
}
console.log('put groupe', (await j('PUT', '/tontines/' + code, snap, owner.token)).status)

// Chiffre sentinel : 3777 FCFA n'existe nulle part dans le snapshot cloud, il ne
// peut arriver dans la réponse que par le digest transmis par l'app.
const digest = {
  devise: 'FCFA',
  dateAnalyse: '2026-09-30',
  brief: 'Analyse du 2026-09-30 — 2 membres, 1/1 tours échus.\n' +
    'Collecte : 5000 / 10000 FCFA (50%), manque 5000 FCFA.\n' +
    "Pénalités : règle 2%/jour, 0 FCFA déjà payées, 3777 FCFA en cours, 100 FCFA/jour tant que rien ne rentre.\n" +
    'En retard : Koffi Atta (25 j, 3777 FCFA de pénalité qui court)',
  sante: { score: 41, niveau: 'fragile', facteurs: ['−23 : collecte à 50% de ce qui est dû'] },
  collecte: { attendu: 10000, collecte: 5000, manque: 5000, tauxCollectePct: 50, cotisation: 5000 },
  penalites: { dejaEncaissees: 0, quiCourent: 3777, coutParJour: 100, siRegleAujourdhui: 3777, siRegleDans7Jours: 3777, siRegleDans30Jours: 3777, ecrituresEnRetard: 1 },
  tresorerie: { entrees30Jours: 5000, sorties30Jours: 0, net30Jours: 5000, soldeGroupe: 5000 },
  membres: { regularite: [], enRetard: [{ nom: 'Koffi Atta', joursRetard: 25, penalitesQuiCourent: 3777 }] },
  recommandations: [
    'Il manque 5000 FCFA pour couvrir la cotisation échue de Koffi Atta.',
    'Le retard coûte 100 FCFA par jour au groupe.',
  ],
  anomalies: [],
}

const ask = async (message, avecAnalyse) => {
  const body = { code, message, nomMembre: 'Awa Traoré' }
  if (avecAnalyse) body.contexte = { analyse: digest }
  const r = await j('POST', '/assistant/agent', body, owner.token)
  return { status: r.status, texte: (r.data && r.data.reponse) || '', actions: (r.data && r.data.actions) || [] }
}

console.log('\n── IA avec digest ──')
const avec = await ask("Combien de pénalités courent actuellement sur le groupe ? Réponds avec le chiffre du dossier.", true)
console.log('status', avec.status, '| actions', avec.actions.length)
console.log(avec.texte.slice(0, 600))
console.log('\n3777 présent ?', /3\s?777/.test(avec.texte) ? 'OUI (digest arrivé au modèle)' : 'NON')
console.log('persona experte ?', /tr[ée]sorier|sant[ée]|p[ée]nalit[ée]s/i.test(avec.texte) ? 'OUI' : 'NON')

console.log('\n── IA sans digest (contrôle) ──')
const sans = await ask('Quel est le montant exact des pénalités qui courent ?', false)
console.log('status', sans.status)
console.log(sans.texte.slice(0, 400))
console.log('3777 présent ?', /3\s?777/.test(sans.texte) ? 'OUI (surprenant)' : 'NON (attendu : le chiffre nest pas dans le cloud)')

console.log('\n── Canaux de discussion ──')
const demande = await j('POST', '/demandes/' + code, { nom: 'Koffi', telephone: '0700000000', email: 'k@test.ci' }, invite.token)
console.log('POST demandes (invité)', demande.status)
console.log('GET demandes (responsable)', (await j('GET', '/demandes/' + code, undefined, owner.token)).status)
console.log('GET demandes (curieux)', (await j('GET', '/demandes/' + code, undefined, curieux.token)).status, '(attendu 403)')
const msg = await j('POST', '/messages_utilisateur/' + code, { texte: 'Bonjour', auteur: 'Koffi' }, invite.token)
console.log('POST messages_utilisateur (invité)', msg.status)
console.log('GET messages_utilisateur (curieux)', (await j('GET', '/messages_utilisateur/' + code, undefined, curieux.token)).status, '(attendu 403)')
if (demande.data && demande.data.id) {
  console.log('DELETE demande (responsable)', (await j('DELETE', '/demandes/' + code + '/' + demande.data.id, undefined, owner.token)).status, '(attendu 200)')
}

console.log('\n── Nettoyage ──')
for (const [qui, c] of [['invité', invite], ['curieux', curieux], ['propriétaire', owner]]) {
  const r = await j('DELETE', '/compte', { password: mdp, confirmation: true }, c.token)
  console.log('delete compte', qui, r.status, JSON.stringify(r.data))
}
console.log('GET groupe après nettoyage', (await j('GET', '/tontines/' + code, undefined, owner.token)).status, '(attendu 401, jetons révoqués)')
