// ═══════════════════════════════════════════════════════════════
// Régime « administrateur unique » (décision du 07/11/2026).
//   Un seul compte écrit (création, réglages, planning, collecte,
//   confirmation des paiements) ; un seul compte destinataire reçoit
//   l'argent : celui de la plateforme. Les autres comptes gardent la
//   lecture de leurs groupes et le dépôt de leur propre signalement.
//   ADMIN_UIDS / COLLECTE_PLATEFORME vides = ancien régime, et c'est
//   celui des autres suites (cloisonnement, discussion) : rien ne bouge.
//   node --test test/admin-plateforme.test.mjs
// ═══════════════════════════════════════════════════════════════
import { test } from 'node:test'
import assert from 'node:assert/strict'
import worker from '../src/index.js'

const BASE = 'https://sync.test'
const MDP = 'motdepasse'

const LIEN_PLATEFORME = 'https://payin.moneyfusion.net/payment/abcdef12'
const LIEN_ETRANGER = 'https://payin.moneyfusion.net/payment/9vq3zzzzzzzz'
const TITULAIRE = 'Tontine Manager'

// ── Mini D1 (même interpréteur que cloisonnement.test.mjs) ────
function mockDB() {
  const kv = new Map()
  const tables = { media: [], groupes: [], membres: [], groupe_co_gerants: [] }
  let seq = 0

  const rows = (t) => (tables[t] = tables[t] || [])
  const conditions = (where, params) => {
    const cols = [...where.matchAll(/([a-z_]+)\s*=\s*\?/g)].map((m) => m[1])
    return (row) => cols.every((c, i) => params[i] !== undefined && String(row[c]) === String(params[i]))
  }
  const rattachement = (sql) =>
    sql.match(/^SELECT 1 AS x FROM (membres|groupe_co_gerants) \w+ JOIN groupes gr ON \w+\.groupe_id = gr\.id WHERE gr\.code_unique = \? AND \w+\.uid = \?/)
  const stmt = (sql, params) => ({
    async first() {
      if (/^SELECT value FROM kv WHERE key = \?/.test(sql)) {
        return kv.has(params[0]) ? { value: kv.get(params[0]) } : null
      }
      const j = rattachement(sql)
      if (j) {
        const g = rows('groupes').find((x) => String(x.code_unique) === String(params[0]))
        if (!g) return null
        return rows(j[1]).some((r) => String(r.groupe_id) === String(g.id) && String(r.uid) === String(params[1])) ? { x: 1 } : null
      }
      const m = sql.match(/SELECT (.+?) FROM (\w+)(?: .*)? WHERE (.+)/)
      if (!m) return null
      const [, cols, table, where] = m
      const trouve = rows(table).find(conditions(where, params))
      if (!trouve) return null
      if (/^\*/.test(cols.trim())) return trouve
      const projet = {}
      for (const c of cols.split(',').map((x) => x.trim())) projet[c] = trouve[c]
      return projet
    },
    async all() {
      if (/^SELECT key, value FROM kv WHERE key GLOB \?/.test(sql)) {
        const prefix = String(params[0]).replace(/\*$/, '')
        return { results: [...kv.entries()].filter(([k]) => k.startsWith(prefix)).map(([key, value]) => ({ key, value })) }
      }
      return { results: [] }
    },
    async run() {
      if (/^INSERT INTO kv/.test(sql)) kv.set(params[0], params[1])
      else if (/^DELETE FROM kv WHERE key = \?/.test(sql)) kv.delete(params[0])
      else if (/^INSERT (?:OR REPLACE )?INTO (\w+) \(([^)]+)\) VALUES/.test(sql)) {
        const [, table, colonnes] = sql.match(/^INSERT (?:OR REPLACE )?INTO (\w+) \(([^)]+)\) VALUES/)
        const cols = colonnes.split(',').map((c) => c.trim())
        const row = {}
        cols.forEach((c, i) => { row[c] = params[i] })
        if (row.id == null && row.code == null) row.id = ++seq
        const liste = rows(table)
        if (/^INSERT OR REPLACE/.test(sql)) {
          const cle = table === 'media' ? (r) => r.code === row.code && r.id === row.id : (r) => r.id === row.id
          const i = liste.findIndex(cle)
          if (i !== -1) liste[i] = row
          else liste.push(row)
        } else liste.push(row)
      } else if (/^DELETE FROM (\w+) WHERE (.+)/.test(sql)) {
        const [, table, where] = sql.match(/^DELETE FROM (\w+) WHERE (.+)/)
        if (table === 'kv') { kv.delete(params[0]); return { success: true } }
        const ok = conditions(where, params)
        tables[table] = rows(table).filter((r) => !ok(r))
      } else if (/^UPDATE (\w+) SET /.test(sql)) {
        const [, table, setSql, whereSql] = sql.match(/^UPDATE (\w+) SET (.+?) WHERE (.+)$/)
        const colonnes = setSql.split(',').map((c) => c.split('=')[0].trim())
        const wcols = [...whereSql.matchAll(/([a-z_]+)\s*=\s*\?/g)].map((mm) => mm[1])
        const wv = params.slice(colonnes.length)
        for (const r of rows(table)) {
          if (wcols.every((c, i) => String(r[c]) === String(wv[i]))) colonnes.forEach((c, i) => { r[c] = params[i] })
        }
      }
      return { success: true, meta: { changes: 1, last_row_id: seq } }
    },
  })

  return { kv, tables, prepare: (sql) => ({ bind: (...params) => stmt(sql, params) }), async batch(stmts) { for (const s of stmts) await s.run() } }
}

// Par défaut : aucun admin déclaré, aucun lien imposé = ancien régime.
function env(opts = {}) {
  return {
    DB: mockDB(), JWT_SECRET: 'secret-test', NOTIFIER_TOKEN: null,
    ADMIN_UIDS: '', COLLECTE_PLATEFORME: '', COLLECTE_TITULAIRE: '',
    ...opts,
  }
}

async function call(e, method, path, token, body) {
  const req = new Request(BASE + path, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  const res = await worker.fetch(req, e, {})
  let j = null
  try { j = await res.clone().json() } catch {}
  return { status: res.status, body: j }
}

async function inscrire(e, email) {
  const r = await call(e, 'POST', '/auth2/register', null, { email, password: MDP, displayName: email.split('@')[0] })
  assert.equal(r.status, 200, 'inscription ' + email)
  return r.body
}

// Le régime ne s active que quand l uid figure dans ADMIN_UIDS : on inscrit
// d abord le compte, on le déclare ensuite — exactement ce que fait un
// redéploiement après édition de wrangler.toml.
async function equipe(opts = {}) {
  const e = env(opts)
  const admin = await inscrire(e, 'admin@t.test')
  e.ADMIN_UIDS = String(admin.user.uid)
  if (!('COLLECTE_PLATEFORME' in opts)) e.COLLECTE_PLATEFORME = LIEN_PLATEFORME
  if (!('COLLECTE_TITULAIRE' in opts)) e.COLLECTE_TITULAIRE = TITULAIRE
  return { e, admin }
}

const snapshot = (code, uid, extra = {}) => ({
  format: 2,
  groupe: {
    codeUnique: code, nom: 'Tontine ' + code, proprietaire: uid,
    montantCotisation: 5000, coGerants: {}, ...(extra.groupe || {}),
  },
  membres: extra.membres || [], tours: extra.tours || [],
  cotisations: extra.cotisations || [], prets: [],
})

const rangee = (e, code) => e.DB.tables.groupes.find((g) => String(g.code_unique) === String(code))
const blob = (e, key) => JSON.parse(e.DB.kv.get(key))

// ── 1. Écrire : seul l'admin ──────────────────────────────────
test('un compte ordinaire ne publie plus SON PROPRE groupe', async () => {
  const { e } = await equipe()
  const alice = await inscrire(e, 'alice@t.test')
  const w = await call(e, 'PUT', '/tontines/ADM001', alice.token, snapshot('ADM001', alice.user.uid))
  assert.equal(w.status, 403, 'écriture refusée')
  assert.equal(w.body.raison, 'admin_plateforme', 'le refus est motivé, pas muet')
  assert.equal(e.DB.kv.has('tontines/ADM001'), false, 'rien n a été stocké')
  assert.equal((await call(e, 'DELETE', '/tontines/ADM001', alice.token)).status, 403, 'elle ne supprime pas non plus')
})

test('l admin publie et le code sans propriétaire est à lui', async () => {
  const { e, admin } = await equipe()
  const ok = await call(e, 'PUT', '/tontines/ADM002', admin.token, {
    format: 2, groupe: { codeUnique: 'ADM002', nom: 'Groupe fléché', montantCotisation: 2000 },
  })
  assert.equal(ok.status, 200, 'publication acceptée')
  assert.equal(blob(e, 'tontines/ADM002').groupe.proprietaire, String(admin.user.uid), 'le propriétaire stocké est l admin')
})

// ── 2. Collecte : le lien de la plateforme, partout ──────────
test('le compte de collecte d un tiers est remplace avant stockage', async () => {
  const { e, admin } = await equipe()
  const dave = await inscrire(e, 'dave@t.test')
  await call(e, 'PUT', '/tontines/ADM003', admin.token, snapshot('ADM003', admin.user.uid, {
    membres: [{ id: 1, nom: 'Dave', uid: dave.user.uid }],
    groupe: { collecte: { type: 'moneyfusion', nom: 'Ma caisse', compte: LIEN_ETRANGER, titulaire: 'Quelqu un d autre' } },
  }))
  const lu = await call(e, 'GET', '/tontines/ADM003', dave.token)
  assert.equal(lu.status, 200, 'Dave lit le groupe')
  assert.equal(lu.body.groupe.collecte.compte, LIEN_PLATEFORME, 'le membre ne voit que le lien de la plateforme')
  assert.equal(lu.body.groupe.collecte.titulaire, TITULAIRE, 'le titulaire imposé')
  assert.equal(blob(e, 'tontines/ADM003').groupe.collecte.compte, LIEN_PLATEFORME, 'le blob KV aussi, pas seulement la lecture')
  assert.equal(JSON.parse(rangee(e, 'ADM003').collecte).compte, LIEN_PLATEFORME, 'le miroir D1 aussi')
})

test('un blob plus ancien est corrige a la lecture, puis a l écriture', async () => {
  const { e, admin } = await equipe()
  const dave = await inscrire(e, 'dave2@t.test')
  // Vieux blob posé sans passer par la route : groupe publié avant le régime,
  // que personne n a encore réécrit.
  e.DB.kv.set('tontines/ADM004', JSON.stringify(snapshot('ADM004', admin.user.uid, {
    membres: [{ id: 1, nom: 'Dave', uid: dave.user.uid }],
    groupe: { collecte: { type: 'moneyfusion', compte: LIEN_ETRANGER, titulaire: 'Ancien' } },
  })))
  const lu = await call(e, 'GET', '/tontines/ADM004', dave.token)
  assert.equal(lu.body.groupe.collecte.compte, LIEN_PLATEFORME, 'lien de la plateforme même sur un blob hérité')

  // Copie privée de Dave, avec son compte à lui : réécriture à l aller, puis à la lecture en liste.
  await call(e, 'PUT', '/users/' + dave.user.uid + '/groupes/ADM004', dave.token, snapshot('ADM004', dave.user.uid, {
    groupe: { collecte: { type: 'moneyfusion', compte: LIEN_ETRANGER, titulaire: 'Dave' } },
  }))
  const liste = await call(e, 'GET', '/users/' + dave.user.uid + '/groupes', dave.token)
  assert.equal(liste.status, 200)
  assert.equal(liste.body.ADM004.groupe.collecte.compte, LIEN_PLATEFORME, 'la liste groupée est imposée aussi')
})

// ── 3. L'ancien responsable redescend au niveau membre ───────
test('l ancien proprietaire lit son groupe et paie, il ne gere plus', async () => {
  const { e } = await equipe()
  const alice = await inscrire(e, 'alice3@t.test')
  // Blob posé tel quel, comme sous le régime précédent : état des comptes déjà
  // en service, dont personne ne va réécrire le snapshot.
  e.DB.kv.set('tontines/ADM005', JSON.stringify(snapshot('ADM005', alice.user.uid, {
    membres: [{ id: 1, nom: 'Alice', uid: alice.user.uid }],
  })))
  assert.equal((await call(e, 'GET', '/tontines/ADM005', alice.token)).status, 200, 'Alice lit toujours son groupe')
  assert.equal((await call(e, 'GET', '/paiements/ADM005', alice.token)).status, 403, 'plus le registre des transactions')
  assert.equal((await call(e, 'POST', '/transferts/ADM005', alice.token, { montant: 5000, membreId: 1 })).status, 403, 'plus les sorties d argent')
  assert.equal((await call(e, 'GET', '/auditLogs/ADM005', alice.token)).status, 403, 'plus le journal de trésorerie')
  assert.equal((await call(e, 'GET', '/demandes/ADM005', alice.token)).status, 403, 'plus les demandes de ses membres')
  const signale = await call(e, 'PUT', '/paiements_invite/ADM005/inv-alice', alice.token, { id: 'inv-alice', nom: 'Alice', montant: 5000 })
  assert.equal(signale.status, 200, 'elle peut toujours signaler sa cotisation')
  assert.equal((await call(e, 'GET', '/paiements_invite/ADM005', alice.token)).status, 403, 'et ne se valide pas elle-même')
})

test('l admin gere l argent de n importe quel groupe', async () => {
  const { e, admin } = await equipe()
  const alice = await inscrire(e, 'alice4@t.test')
  await call(e, 'PUT', '/tontines/ADM006', admin.token, snapshot('ADM006', alice.user.uid, {
    membres: [{ id: 1, nom: 'Alice', uid: alice.user.uid }],
  }))
  assert.equal((await call(e, 'GET', '/paiements/ADM006', admin.token)).status, 200, 'l admin lit le canal')
  assert.equal((await call(e, 'POST', '/transferts/ADM006', admin.token, { montant: 5000, membreId: 1 })).status, 200, 'l admin encaisse et décaisse')
  assert.equal((await call(e, 'GET', '/auditLogs/ADM006', admin.token)).status, 200, 'l admin lit le journal')
  assert.equal((await call(e, 'GET', '/demandes/ADM006', admin.token)).status, 200, 'l admin lit les demandes')
  assert.equal((await call(e, 'GET', '/paiements_invite/ADM006', admin.token)).status, 200, 'l admin absorbe les signalements')
})

// ── 4. Les chemins de copie privée ne réécrivent plus le groupe ──
test('la copie privee d un compte reste inscriptible sans toucher au groupe', async () => {
  const { e, admin } = await equipe()
  const dave = await inscrire(e, 'dave3@t.test')
  await call(e, 'PUT', '/tontines/ADM008', admin.token, snapshot('ADM008', admin.user.uid, {
    membres: [{ id: 1, nom: 'Dave', uid: dave.user.uid }],
  }))
  const avant = { ...rangee(e, 'ADM008') }
  const w = await call(e, 'PUT', '/users/' + dave.user.uid + '/groupes/ADM008', dave.token, snapshot('ADM008', dave.user.uid, {
    groupe: { nom: 'Le groupe selon Dave', montantCotisation: 999000, collecte: { type: 'moneyfusion', compte: LIEN_ETRANGER } },
  }))
  assert.equal(w.status, 200, 'sa copie privée est acceptée')
  const apres = rangee(e, 'ADM008')
  assert.equal(apres.nom, avant.nom, 'la ligne du groupe n a pas été réécrite par Dave')
  assert.equal(apres.montant_cotisation, avant.montant_cotisation, 'ni le montant')
  assert.equal(blob(e, 'users/' + dave.user.uid + '/groupes/ADM008').groupe.collecte.compte, LIEN_PLATEFORME, 'et sa copie ne garde pas un compte étranger')
})

test('la sauvegarde d un compte ne diffuse pas son propre compte de collecte', async () => {
  const { e } = await equipe()
  const dave = await inscrire(e, 'dave4@t.test')
  const w = await call(e, 'PUT', '/users/' + dave.user.uid + '/sauvegardes/sav1', dave.token, snapshot('ADM009', dave.user.uid, {
    groupe: { collecte: { type: 'moneyfusion', compte: LIEN_ETRANGER, titulaire: 'Dave' } },
  }))
  assert.equal(w.status, 200, 'sauvegarder reste possible')
  assert.equal(blob(e, 'users/' + dave.user.uid + '/sauvegardes/sav1').groupe.collecte.compte, LIEN_PLATEFORME, 'le compte stocké est celui de la plateforme')
  assert.equal(rangee(e, 'ADM009'), undefined, 'aucun groupe créé dans le miroir par cette sauvegarde')
})

// ── 5. L'interrupteur : variables vides = ancien régime ──────
test('ADMIN_UIDS vide = ancien comportement, champ libre au responsable', async () => {
  const e = env()
  const alice = await inscrire(e, 'alice5@t.test')
  const w = await call(e, 'PUT', '/tontines/ADM010', alice.token, snapshot('ADM010', alice.user.uid, {
    groupe: { collecte: { type: 'moneyfusion', compte: LIEN_ETRANGER, titulaire: 'Alice' } },
  }))
  assert.equal(w.status, 200, 'publication acceptée hors régime')
  const lu = await call(e, 'GET', '/tontines/ADM010', alice.token)
  assert.equal(lu.body.groupe.collecte.compte, LIEN_ETRANGER, 'son compte à elle conservé')
  assert.equal((await call(e, 'GET', '/paiements/ADM010', alice.token)).status, 200, 'elle reste gestionnaire chez elle')
})

test('ADMIN_UIDS seul : droits verrouilles, compte de collecte laisse tel quel', async () => {
  const { e, admin } = await equipe({ COLLECTE_PLATEFORME: '' })
  const alice = await inscrire(e, 'alice6@t.test')
  assert.equal((await call(e, 'PUT', '/tontines/ADM011', alice.token, snapshot('ADM011', alice.user.uid))).status, 403, 'le verrouillage des droits ne dépend pas du lien')
  await call(e, 'PUT', '/tontines/ADM011', admin.token, snapshot('ADM011', admin.user.uid, {
    groupe: { collecte: { type: 'moneyfusion', compte: LIEN_ETRANGER, titulaire: 'Alice' } },
  }))
  const lu = await call(e, 'GET', '/tontines/ADM011', admin.token)
  assert.equal(lu.body.groupe.collecte.compte, LIEN_ETRANGER, 'sans lien de plateforme, rien n est imposé ni effacé')
})

// ── 6. Les deux formes de lien Money Fusion, lues dans la doc du fournisseur ─
// Le lien d'un compte marchand (payin…/payment/<ref>) et celui que rend l'API
// quand elle crée un paiement (www.pay…/pay/<jeton>) sont tous deux des pages où
// l'on règle quelque chose. /paiementNotif/<jeton> est l'API de statut en lecture :
// la diffuser comme compte de collecte enverrait les membres sur du JSON.
const LIEN_API = 'https://www.pay.moneyfusion.net/pay/f5EJ33JYmxqosi8BvaEt'
const LIEN_STATUT = 'https://www.pay.moneyfusion.net/paiementNotif/8L5teSc5TaIkP3ds9Dlx'

test('le lien rendu par l API de creation est un compte de collecte valide', async () => {
  const { e, admin } = await equipe({ COLLECTE_PLATEFORME: LIEN_API })
  await call(e, 'PUT', '/tontines/ADM012', admin.token, snapshot('ADM012', admin.user.uid, {
    groupe: { collecte: { type: 'moneyfusion', compte: LIEN_ETRANGER, titulaire: 'Alice' } },
  }))
  const lu = await call(e, 'GET', '/tontines/ADM012', admin.token)
  assert.equal(lu.body.groupe.collecte.compte, LIEN_API, 'le lien cree par l API est impose au groupe')
  assert.equal(blob(e, 'tontines/ADM012').groupe.collecte.compte, LIEN_API, 'le blob KV aussi')
})

test('l API de statut n est pas une page de paiement : imposition desactivee', async () => {
  const { e, admin } = await equipe({ COLLECTE_PLATEFORME: LIEN_STATUT })
  await call(e, 'PUT', '/tontines/ADM013', admin.token, snapshot('ADM013', admin.user.uid, {
    groupe: { collecte: { type: 'moneyfusion', compte: LIEN_ETRANGER, titulaire: 'Alice' } },
  }))
  const lu = await call(e, 'GET', '/tontines/ADM013', admin.token)
  assert.equal(lu.body.groupe.collecte.compte, LIEN_ETRANGER, 'rien n est impose avec un lien refuse par la porte')
})
