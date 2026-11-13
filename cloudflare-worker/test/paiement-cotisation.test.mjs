// ═══════════════════════════════════════════════════════════════
// Paiement Money Fusion par cotisation.
//   - le montant vient du miroir D1, jamais du corps de la requête ;
//   - un membre ne crée un lien que pour SA cotisation (admin : tous) ;
//   - l'URL rendue par le fournisseur repasse la porte de collecte ;
//   - le statut est un indice borné, et le webhook non signé n'écrit rien.
//   node --test test/paiement-cotisation.test.mjs
// ═══════════════════════════════════════════════════════════════
import { test } from 'node:test'
import assert from 'node:assert/strict'
import worker from '../src/index.js'

const BASE = 'https://sync.test'
const MDP = 'motdepasse'
const CLE = 'https://api.moneyfusion.test/paiement/cle-secrete'
const CODE = 'PAY001'

// ── Mini D1 (même interpréteur que les autres suites) ─────────
function mockDB() {
  const kv = new Map()
  const tables = {
    media: [], groupes: [], membres: [], groupe_co_gerants: [],
    tours: [], cotisations: [],
  }
  let seq = 0

  const rows = (t) => (tables[t] = tables[t] || [])
  const conditions = (where, params) => {
    const cols = [...where.matchAll(/([a-z_]+)\s*=\s*\?/g)].map((m) => m[1])
    return (row) => cols.every((c, i) => params[i] !== undefined && String(row[c]) === String(params[i]))
  }
  const stmt = (sql, params) => ({
    async first() {
      if (/^SELECT value FROM kv WHERE key = \?/.test(sql)) {
        return kv.has(params[0]) ? { value: kv.get(params[0]) } : null
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
          const i = liste.findIndex((r) => r.id === row.id)
          if (i !== -1) liste[i] = row
          else liste.push(row)
        } else liste.push(row)
      }
      return { success: true, meta: { changes: 1, last_row_id: seq } }
    },
  })

  return {
    kv, tables,
    prepare: (sql) => ({ bind: (...params) => stmt(sql, params) }),
    async batch(stmts) { for (const s of stmts) await s.run() },
  }
}

function env(opts = {}) {
  return {
    DB: mockDB(), JWT_SECRET: 'secret-test', NOTIFIER_TOKEN: null,
    ADMIN_UIDS: '', COLLECTE_PLATEFORME: '', COLLECTE_TITULAIRE: '',
    ...opts,
  }
}

// Groupe, membre et tour directement dans le miroir : le test ne dépend
// pas de la publication d'un snapshot.
function semer(e, { membreUid = null, statutTour = 'en_attente', montant = 5000 } = {}) {
  e.DB.tables.groupes.push({
    id: 1, code_unique: CODE, nom: 'Tontine test',
    montant_cotisation: montant, devise_symbole: 'FCFA', statut: 'active',
  })
  e.DB.tables.membres.push({
    id: 10, groupe_id: 1, nom: 'Alice', telephone: '0102030405',
    uid: membreUid, role: 'membre', bloque: 0,
  })
  e.DB.tables.tours.push({ id: 20, groupe_id: 1, numero: 3, membre_id: 10, statut: statutTour })
  e.DB.tables.cotisations.push({ id: 1, groupe_id: 1, tour_id: 99, membre_id: 10, statut: 'paye' })
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
  const r = await call(e, 'POST', '/auth2/register', null, {
    email, password: MDP, displayName: email.split('@')[0],
  })
  assert.equal(r.status, 200, 'inscription ' + email)
  return r.body
}

function avecFournisseur(reponse, observation) {
  const original = globalThis.fetch
  globalThis.fetch = async (url, opts) => {
    if (observation) observation.push({ url: String(url), methode: (opts && opts.method) || 'GET', corps: opts && opts.body ? JSON.parse(opts.body) : null })
    return new Response(JSON.stringify(reponse), { status: 200, headers: { 'Content-Type': 'application/json' } })
  }
  return () => { globalThis.fetch = original }
}

const initier = (e, token, extra = {}) =>
  call(e, 'POST', '/paiement/init', token, { code: CODE, membreId: 10, tourId: 20, ...extra })

// ── 1. Sans clé marchande ────────────────────────────────────
test('sans clé Money Fusion, init répond 503 sans appeler le fournisseur', async () => {
  const e = env()
  const alice = await inscrire(e, 'alice@t.test')
  semer(e, { membreUid: alice.user.uid })
  const appels = []
  const rendre = avecFournisseur({ statut: true, token: 'Tok123456', url: 'https://www.pay.moneyfusion.net/pay/Tok123456' }, appels)
  try {
    const r = await initier(e, alice.token)
    assert.equal(r.status, 503)
    assert.equal(r.body.code, 'sans_cle')
    assert.equal(appels.length, 0, 'aucun appel sortant')
    const c = await call(e, 'GET', '/paiement/config', alice.token)
    assert.deepEqual(c.body, { actif: false })
  } finally { rendre() }
})

// ── 2. Le prix vient du serveur ──────────────────────────────
test('le montant du corps est ignoré : c est celui du groupe qui part', async () => {
  const e = env({ MONEYFUSION_API_KEY_URL: CLE })
  const alice = await inscrire(e, 'alice@t.test')
  semer(e, { membreUid: alice.user.uid, montant: 5000 })
  const appels = []
  const rendre = avecFournisseur({ statut: true, token: 'Tok123456', url: 'https://www.pay.moneyfusion.net/pay/Tok123456' }, appels)
  try {
    const r = await initier(e, alice.token, { montant: 1, totalPrice: '1' })
    assert.equal(r.status, 200, JSON.stringify(r.body))
    assert.equal(appels.length, 1)
    assert.equal(appels[0].corps.totalPrice, '5000', 'montant serveur')
    assert.equal(appels[0].corps.article[0].price, '5000')
    assert.equal(appels[0].corps.personal_Info[0].orderId, 20, 'tour dans orderId')
    assert.equal(appels[0].corps.personal_Info[0].userId, 10, 'membre dans userId')
    assert.equal(appels[0].corps.return_url, BASE + '/paiement/retour')
    assert.equal(appels[0].corps.webhook_url, BASE + '/paiement/notify')
    assert.ok(!JSON.stringify(appels[0].corps).includes('cle-secrete'), 'la clé ne fuit pas dans le corps')
    assert.equal(r.body.montant, 5000)
    const rec = JSON.parse(e.DB.kv.get('paiement_liens/Tok123456'))
    assert.equal(rec.uid, String(alice.user.uid))
    assert.equal(rec.montant, 5000)
    assert.equal(rec.tourNumero, 3)
  } finally { rendre() }
})

// ── 3. Un membre ne paie pas pour un autre ───────────────────
test('le lien d un membre ne peut pas être créé par un autre compte', async () => {
  const e = env({ MONEYFUSION_API_KEY_URL: CLE })
  const alice = await inscrire(e, 'alice@t.test')
  const bob = await inscrire(e, 'bob@t.test')
  semer(e, { membreUid: bob.user.uid })
  const appels = []
  const rendre = avecFournisseur({ statut: true, token: 'Tok123456', url: 'https://www.pay.moneyfusion.net/pay/Tok123456' }, appels)
  try {
    const r = await initier(e, alice.token)
    assert.equal(r.status, 403)
    assert.equal(r.body.code, 'pas_ton_paiement')
    assert.equal(appels.length, 0)
  } finally { rendre() }
})

// ── 4. L URL du fournisseur repasse la porte de collecte ─────
test('une URL de paiement hors Money Fusion est refusée et rien n est stocké', async () => {
  const e = env({ MONEYFUSION_API_KEY_URL: CLE })
  const alice = await inscrire(e, 'alice@t.test')
  semer(e, { membreUid: alice.user.uid })
  const rendre = avecFournisseur({ statut: true, token: 'Tok123456', url: 'https://evil.example/pay/Tok123456' })
  try {
    const r = await initier(e, alice.token)
    assert.equal(r.status, 502)
    assert.equal(r.body.code, 'fournisseur')
    assert.equal(e.DB.kv.has('paiement_liens/Tok123456'), false)
  } finally { rendre() }
})

// ── 5. Tour clos : pas de nouveau lien ──────────────────────
test('un tour déjà reçu ne produit pas de lien de paiement', async () => {
  const e = env({ MONEYFUSION_API_KEY_URL: CLE })
  const alice = await inscrire(e, 'alice@t.test')
  semer(e, { membreUid: alice.user.uid, statutTour: 'recu' })
  const rendre = avecFournisseur({ statut: true, token: 'Tok123456', url: 'https://www.pay.moneyfusion.net/pay/Tok123456' })
  try {
    const r = await initier(e, alice.token)
    assert.equal(r.status, 409)
    assert.equal(r.body.code, 'tour_close')
  } finally { rendre() }
})

// ── 6. Statut borné, réservé au titulaire ───────────────────
test('le statut fournisseur est réservé au titulaire du lien', async () => {
  const e = env({ MONEYFUSION_API_KEY_URL: CLE })
  const alice = await inscrire(e, 'alice@t.test')
  const bob = await inscrire(e, 'bob@t.test')
  e.DB.kv.set('paiement_liens/Tok123456', JSON.stringify({
    code: CODE, tourId: 20, membreId: 10, uid: String(alice.user.uid), montant: 5000,
  }))
  const rendre = avecFournisseur({
    statut: true,
    data: { statut: 'paid', Montant: 5000, numeroTransaction: 'MF-42', moyen: 'wave', compte: 'secret-interne' },
  })
  try {
    const interdit = await call(e, 'GET', '/paiement/statut?token=Tok123456', bob.token)
    assert.equal(interdit.status, 403)
    const sien = await call(e, 'GET', '/paiement/statut?token=Tok123456', alice.token)
    assert.equal(sien.status, 200)
    assert.deepEqual(sien.body, { statut: 'paid', montant: 5000, numeroTransaction: 'MF-42', moyen: 'wave' })
  } finally { rendre() }
})

// ── 7. Le webhook non signé n écrit rien ────────────────────
test('le webhook public répond 200 sans inscrire de paiement', async () => {
  const e = env({ MONEYFUSION_API_KEY_URL: CLE })
  const avant = e.DB.kv.size
  const r = await call(e, 'POST', '/paiement/notify', null, {
    token: 'Tok123456', statut: 'paid', montant: 5000,
  })
  assert.equal(r.status, 200)
  assert.equal(e.DB.kv.size, avant, 'aucune écriture KV')
  assert.equal(e.DB.tables.cotisations.length, 0, 'aucune cotisation créée')
  const page = await worker.fetch(new Request(BASE + '/paiement/retour'), e, {})
  assert.equal(page.status, 200)
  assert.match(await page.text(), /Retour à Tontine Manager/)
})
