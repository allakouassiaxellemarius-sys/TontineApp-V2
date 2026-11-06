// ═══════════════════════════════════════════════════════════════
// Cloisonnement des canaux monétaires (DEF-1 / DEF-2 / AC-SEC-1).
//   paiements, paiements_invite, transferts, auditLogs, media.
// Deux comptes dans deux groupes distincts : aucun ne doit pouvoir
// lire ni écrire chez l'autre, et un code jamais publié ne donne
// aucun droit.
// D1 est simulé par un mini-interpréteur SQL (kv + tables du vrai
// schéma de migrations/0002), comme dans discussion.test.mjs.
//   node --test test/cloisonnement.test.mjs
// ═══════════════════════════════════════════════════════════════
import { test } from 'node:test'
import assert from 'node:assert/strict'
import worker from '../src/index.js'

const BASE = 'https://sync.test'
const MDP = 'motdepasse'
const PNG = 'iVBORw0KGgoAAAANSUhEUg=='

// ── Mini D1 ──────────────────────────────────────────────────
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

function env() { return { DB: mockDB(), JWT_SECRET: 'secret-test', NOTIFIER_TOKEN: null } }

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
  assert.equal(r.status, 200, "inscription " + email)
  return r.body
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

// Seed direct du canal d'apport : y déposent aujourd'hui les apporteurs de
// paiement (journal conservé), le canal reste clos à la lecture croisée.
function deposerCanal(e, canal, code, id, rec) { e.DB.kv.set(canal + '/' + code + '/' + id, JSON.stringify(rec)) }
const CANAUX = ['paiements', 'paiements_invite', 'transferts', 'auditLogs']

test('lecture croisée refusée sur les quatre canaux monétaires', async () => {
  const e = env()
  const alice = await inscrire(e, 'alice@test.ci')
  const bob = await inscrire(e, 'bob@test.ci')
  await call(e, 'PUT', '/tontines/GROUPEA', alice.token, snapshot('GROUPEA', alice.user.uid))
  await call(e, 'PUT', '/tontines/GROUPEB', bob.token, snapshot('GROUPEB', bob.user.uid))
  deposerCanal(e, 'paiements', 'GROUPEA', 'tx1', { statut: 'completed', montant: 5000, reference: 'REF-AAAA' })
  deposerCanal(e, 'paiements_invite', 'GROUPEA', 'inv1', { nom: 'Alice', montant: 5000 })
  deposerCanal(e, 'transferts', 'GROUPEA', 't1', { montant: 25000, mode: 'manuel' })
  deposerCanal(e, 'auditLogs', 'GROUPEA', 'a1', { action: 'distribution', montant: 25000 })

  for (const canal of CANAUX) {
    const lu = await call(e, 'GET', '/' + canal + '/GROUPEA', alice.token)
    assert.equal(lu.status, 200, canal + " : le responsable lit les siens")
    assert.ok(Object.keys(lu.body || {}).length, canal + " : la liste est renvoyée")
  }
  for (const canal of CANAUX) {
    const ko = await call(e, 'GET', '/' + canal + '/GROUPEA', bob.token)
    assert.equal(ko.status, 403, canal + " : un étranger du code est refusé")
    assert.equal(ko.body && ko.body.error, 'Interdit')
  }
  assert.ok(e.DB.kv.has('paiements/GROUPEA/tx1'), "aucune donnée touchée par les tentatives")
  assert.ok(e.DB.kv.has('transferts/GROUPEA/t1'), "aucun transfert effacé")
})

test('un membre simple ne gère pas les canaux du groupe', async () => {
  const e = env()
  const alice = await inscrire(e, 'alice@test.ci')
  const dave = await inscrire(e, 'dave@test.ci')
  await call(e, 'PUT', '/tontines/GROUPEA', alice.token,
    snapshot('GROUPEA', alice.user.uid, { membres: [{ id: 1, nom: 'Dave', uid: dave.user.uid }] }))
  deposerCanal(e, 'paiements', 'GROUPEA', 'tx1', { statut: 'completed', montant: 5000 })

  assert.equal((await call(e, 'GET', '/paiements/GROUPEA', dave.token)).status, 403, "pas la liste des transactions d'autrui")
  assert.equal((await call(e, 'GET', '/auditLogs/GROUPEA', dave.token)).status, 403, "pas le journal")
  assert.equal((await call(e, 'POST', '/transferts/GROUPEA', dave.token, { montant: 900000, membreId: 1 })).status, 403, "pas de sortie d'argent")
  assert.equal((await call(e, 'DELETE', '/paiements/GROUPEA/tx1', dave.token)).status, 403, "ne purge pas le canal")
  assert.ok(e.DB.kv.has('paiements/GROUPEA/tx1'), "la transaction survit")

  const depose = await call(e, 'PUT', '/paiements_invite/GROUPEA/inv-dave', dave.token, { id: 'inv-dave', nom: 'Dave', montant: 5000 })
  assert.equal(depose.status, 200, "le signalement de sa propre cotisation passe")
  const enregistre = JSON.parse(e.DB.kv.get('paiements_invite/GROUPEA/inv-dave'))
  assert.equal(enregistre.par, dave.user.uid, "auteur apposé par le serveur, pas par le client")
})

test('une co-gérante a les droits de gestion, un e-mail déclaré ne donne rien', async () => {
  const e = env()
  const alice = await inscrire(e, 'alice@test.ci')
  const carol = await inscrire(e, 'carol@test.ci')
  const intrus = await inscrire(e, 'intrus@test.ci')
  await call(e, 'PUT', '/tontines/GROUPEA', alice.token, snapshot('GROUPEA', alice.user.uid, {
    groupe: { coGerants: { [carol.user.uid]: { nom: 'Carol' } } },
    membres: [{ id: 2, nom: 'Intrus', email: intrus.user.email }],
  }))
  deposerCanal(e, 'transferts', 'GROUPEA', 't1', { montant: 25000 })

  assert.equal((await call(e, 'GET', '/transferts/GROUPEA', carol.token)).status, 200, "la co-gérante lit")
  assert.equal((await call(e, 'POST', '/transferts/GROUPEA', carol.token, { montant: 5000, membreId: 2 })).status, 200, "la co-gérante encaisse")
  assert.equal((await call(e, 'GET', '/transferts/GROUPEA', intrus.token)).status, 403, "l'e-mail seul ne donne aucun droit")
})

test('un code jamais publié ne donne aucun droit (DEF-2)', async () => {
  const e = env()
  const mallory = await inscrire(e, 'mallory@test.ci')
  for (const canal of CANAUX) {
    assert.equal((await call(e, 'GET', '/' + canal + '/FANTOME1', mallory.token)).status, 403, canal + " : lecture")
  }
  assert.equal((await call(e, 'PUT', '/paiements_invite/FANTOME1/x1', mallory.token, { id: 'x1', montant: 1000 })).status, 403, "dépôt sur groupe fantôme")
  assert.equal((await call(e, 'POST', '/transferts/FANTOME1', mallory.token, { montant: 1000 })).status, 403, "transfert sur groupe fantôme")
  assert.equal((await call(e, 'POST', '/auditLogs/FANTOME1', mallory.token, { action: 'faux' })).status, 403, "écriture dans un journal fantôme")
  assert.ok(![...e.DB.kv.keys()].some((k) => k.includes('FANTOME1')), "aucune donnée créée pour ce code")
})

test('groupe historique sans propriétaire : adoptable vierge, refusé dès qu il porte de l argent', async () => {
  const e = env()
  const first = await inscrire(e, 'first@test.ci')
  const second = await inscrire(e, 'second@test.ci')

  e.DB.kv.set('tontines/VIERGE1', JSON.stringify(snapshot('VIERGE1', null)))
  assert.equal((await call(e, 'GET', '/transferts/VIERGE1', first.token)).status, 200, "le premier éditeur adopte le groupe vierge")

  e.DB.kv.set('tontines/ORPHELIN1', JSON.stringify(snapshot('ORPHELIN1', null, { cotisations: [{ id: 9, montant: 5000 }] })))
  for (const canal of CANAUX) {
    assert.equal((await call(e, 'GET', '/' + canal + '/ORPHELIN1', second.token)).status, 403, canal + " : refus sur groupe orphelin porteur d'argent")
  }
  // Limite assumée, inchangée depuis l'original : un blob sans propriétaire et
  // sans aucune trace d'argent reste adoptable par plusieurs comptes, car le
  // premier publish (syncEngine.js:51) estampille son auteur et ferme la porte.
  // Ce que la correction garantit ici : il n'y a rien à y lire, et dès qu'il y a
  // de l'argent (ORPHELIN1 ci-dessus) plus personne n'adopte.
  const secondChezLePremier = await call(e, 'GET', '/transferts/VIERGE1', second.token)
  assert.equal(secondChezLePremier.status, 200)
  assert.deepEqual(secondChezLePremier.body, {}, "canal vide : aucune donnée d'autrui exposée")
})

test('DELETE /media : l auteur ou un gestionnaire, pas un autre membre', async () => {
  const e = env()
  const alice = await inscrire(e, 'alice@test.ci')
  const dave = await inscrire(e, 'dave@test.ci')
  await call(e, 'PUT', '/tontines/MEDIA1', alice.token,
    snapshot('MEDIA1', alice.user.uid, { membres: [{ id: 1, nom: 'Dave', uid: dave.user.uid }] }))

  await call(e, 'PUT', '/media/MEDIA1/photodave', dave.token, { type: 'image/png', data: PNG })
  assert.equal(e.DB.tables.media.filter((r) => r.id === 'photodave').length, 1, "la photo est écrite")
  assert.equal((await call(e, 'DELETE', '/media/MEDIA1/photodave', alice.token)).status, 200, "le responsable peut purger une image du groupe")
  assert.equal(e.DB.tables.media.filter((r) => r.id === 'photodave').length, 0)

  await call(e, 'PUT', '/media/MEDIA1/photodalice', alice.token, { type: 'image/png', data: PNG })
  assert.equal((await call(e, 'DELETE', '/media/MEDIA1/photodalice', dave.token)).status, 403, "un membre ne supprime pas l'image d'un autre")
  assert.equal(e.DB.tables.media.filter((r) => r.id === 'photodalice').length, 1, "l'image est conservée")
  assert.equal((await call(e, 'DELETE', '/media/MEDIA1/photodalice', alice.token)).status, 200, "l'auteur peut la supprimer")
  assert.equal((await call(e, 'DELETE', '/media/MEDIA1/inexistante', alice.token)).status, 200, "suppression idempotente")
})

test('sans jeton de session, les canaux répondent 401', async () => {
  const e = env()
  const alice = await inscrire(e, 'alice@test.ci')
  await call(e, 'PUT', '/tontines/GROUPEA', alice.token, snapshot('GROUPEA', alice.user.uid))
  for (const canal of CANAUX) {
    assert.equal((await call(e, 'GET', '/' + canal + '/GROUPEA', null)).status, 401, canal + " : 401 avant toute donnée")
  }
})

test('le lien SasPay du responsable arrive jusqu au membre', async () => {
  const e = env()
  const alice = await inscrire(e, 'alice@test.ci')
  const dave = await inscrire(e, 'dave@test.ci')
  const lien = 'https://pay.saspay.me/checkout/kx7f2q1a'
  await call(e, 'PUT', '/tontines/GROUPEA', alice.token, snapshot('GROUPEA', alice.user.uid, {
    membres: [{ id: 1, nom: 'Dave', uid: dave.user.uid }],
    groupe: { collecte: { type: 'saspay', nom: 'Grammaire', compte: lien, titulaire: 'Alla' } },
  }))

  const lu = await call(e, 'GET', '/tontines/GROUPEA', dave.token)
  assert.equal(lu.status, 200, 'le membre lit le groupe')
  assert.ok(lu.body.groupe.collecte, 'le compte de collecte traverse la synchro (sinon : « Aucun compte configuré »)')
  assert.equal(lu.body.groupe.collecte.compte, lien, 'le lien payable est intact')
  assert.equal(lu.body.groupe.collecte.titulaire, 'Alla')
  assert.equal(lu.body.groupe.collecte.type, 'saspay')

  // Re-publication sans lien : l ancien ne doit pas survivre.
  await call(e, 'PUT', '/tontines/GROUPEA', alice.token, snapshot('GROUPEA', alice.user.uid, {
    membres: [{ id: 1, nom: 'Dave', uid: dave.user.uid }],
  }))
  const vide = await call(e, 'GET', '/tontines/GROUPEA', dave.token)
  assert.equal(vide.body.groupe.collecte, null, 'un lien retire du groupe est retire du miroir')
})

// Le compte de collecte vient d'un autre appareil et s'affiche chez tous les
// membres : seule une URL https d un domaine saspay.me traverse. Un nom libre,
// un ancien alias Pi-Spi ou un lien d un autre service n encaisse rien : le
// publier enverrait les membres payer dans le vide.
test('un compte de collecte qui n est pas un lien SasPay n est jamais stocke', async () => {
  const e = env()
  const alice = await inscrire(e, 'alice@test.ci')
  const pubs = async (compte) => {
    await call(e, 'PUT', '/tontines/GROUPEA', alice.token, snapshot('GROUPEA', alice.user.uid, {
      groupe: { collecte: { type: 'saspay', compte, titulaire: 'Alla' } },
    }))
    return (await call(e, 'GET', '/tontines/GROUPEA', alice.token)).body.groupe.collecte
  }
  const refuse = [
    'javascript:alert(1)',
    'data:text/html,<script>alert(1)</script>',
    'https://',
    'marcus tontine',
    'marcus.tontine',
    '34589dd2-a93b-4372-b515-d163772b10dd',
    'http://pay.saspay.me/checkout/kx7f2q1a',
    'https://api.saspay.me/api/v1/payments',
    'https://pay.saspay.me.evil.example/checkout/x',
    'https://pay.saspay.me@evil.example/checkout/x',
    'https://evil.example/@pay.saspay.me',
  ]
  for (const compte of refuse) {
    assert.equal(await pubs(compte), null, 'refuse : ' + compte)
  }
  const lien = await pubs('https://pay.saspay.me/checkout/kx7f2q1a')
  assert.ok(lien, 'le lien de paiement SasPay est accepte')
  assert.equal(lien.compte, 'https://pay.saspay.me/checkout/kx7f2q1a')
  assert.equal(lien.type, 'saspay')
  await call(e, 'PUT', '/tontines/GROUPEA', alice.token, snapshot('GROUPEA', alice.user.uid, {
    groupe: { collecte: { type: 'saspay', compte: 'https://pay.saspay.me/' + 'x'.repeat(500), titulaire: 'Y'.repeat(500) } },
  }))
  const borne = (await call(e, 'GET', '/tontines/GROUPEA', alice.token)).body.groupe.collecte
  assert.ok(borne.compte.length <= 400, 'le lien est borne a 400 caracteres')
  assert.ok(borne.titulaire.length <= 120, 'le titulaire est borne a 120 caracteres')
})
