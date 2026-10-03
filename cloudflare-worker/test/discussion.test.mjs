// ═══════════════════════════════════════════════════════════════
// Tests de la discussion : round-trip des champs structurés des
// messages (cle / repondreA / media / epingle / modifie_le) à travers le
// miroir relationnel D1, et garde d'accès des canaux lectures/ et media/.
//   node --test test/discussion.test.mjs
// D1 est simulé par un mini-interpréteur SQL (les vraies requêtes du worker
// sont reconnues une à une).
// ═══════════════════════════════════════════════════════════════
import { test } from 'node:test'
import assert from 'node:assert/strict'
import worker from '../src/index.js'

const BASE = 'https://sync.test'
const MDP = 'motdepasse'

// ── Mini D1 ──────────────────────────────────────────────────
function mockDB() {
  const kv = new Map()
  const tables = {}
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
      const j = sql.match(/FROM membres m JOIN groupes gr .*WHERE gr\.code_unique = \? AND m\.uid = \?/)
      if (j) {
        const g = rows('groupes').find((x) => String(x.code_unique) === String(params[0]))
        return g && rows('membres').some((m) => String(m.groupe_id) === String(g.id) && String(m.uid) === String(params[1])) ? { x: 1 } : null
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
      const m = sql.match(/SELECT (.+?) FROM (\w+)(?: WHERE (.+?))?(?: ORDER BY .*)?$/)
      if (!m) return { results: [] }
      const [, cols, table, where] = m
      let out = rows(table)
      if (where) out = out.filter(conditions(where, params))
      if (/^\*$/.test(cols.trim())) return { results: out }
      const nom = cols.split(/\s+AS\s+/i).pop().trim()
      return { results: out.map((r) => ({ [nom]: r[nom] })) }
    },
    async run() {
      if (/^INSERT INTO kv/.test(sql)) kv.set(params[0], params[1])
      else if (/^DELETE FROM kv WHERE key = \?/.test(sql)) kv.delete(params[0])
      else if (/^DELETE FROM kv WHERE key GLOB \?/.test(sql)) {
        const prefix = String(params[0]).replace(/\*$/, '')
        for (const k of [...kv.keys()]) if (k.startsWith(prefix)) kv.delete(k)
      } else if (/^INSERT (?:OR REPLACE )?INTO (\w+) \(([^)]+)\) VALUES/.test(sql)) {
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
        const wcols = [...whereSql.matchAll(/([a-z_]+)\s*=\s*\?/g)].map((m) => m[1])
        const wv = params.slice(colonnes.length)
        for (const r of rows(table)) {
          if (wcols.every((c, i) => String(r[c]) === String(wv[i]))) {
            colonnes.forEach((c, i) => { r[c] = params[i] })
          }
        }
      }
      return { success: true, meta: { last_row_id: seq } }
    },
  })

  return {
    kv,
    tables,
    prepare: (sql) => ({ bind: (...params) => stmt(sql, params) }),
    async batch(stmts) { for (const s of stmts) await s.run() },
  }
}

function env() {
  return { DB: mockDB(), JWT_SECRET: 'secret-test', NOTIFIER_TOKEN: null }
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
  return { status: res.status, body: j, res }
}

async function inscrire(e, email) {
  const r = await call(e, 'POST', '/auth2/register', null, { email, password: MDP, displayName: email.split('@')[0] })
  assert.equal(r.status, 200, 'inscription ' + email)
  return r.body
}

const PNG = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='

function snapshotAvecMessage(code, uid, surcharge = {}) {
  return {
    format: 2,
    groupe: {
      codeUnique: code, nom: 'Tontine ' + code, proprietaire: uid, montantCotisation: 5000, coGerants: {},
      messages: [{
        id: 1, cle: 'mmu9k2-a1b2c3', auteur: 'Awa', uid: 'uid-awa', email: 'awa@x.yz',
        texte: 'Bonjour tous le monde', date: '2026-09-30T10:00:00.000Z', enAttente: false,
        repondreA: null, media: null, epingle: true, modifieLe: null,
      }, {
        id: 2, cle: 'mmu9k3-d4e5f6', auteur: 'Moussa', uid: 'uid-mou', texte: '', date: '2026-09-30T10:01:00.000Z',
        repondreA: 'mmu9k2-a1b2c3', media: '/media/' + code + '/p1', epingle: false,
      }],
      pendingMessages: [{ id: 'inv-1-xyz', cle: 'mmu9k4-g7h8i9', texte: 'envoyé par un invité', auteur: 'Fatou', uid: 'uid-fatou', enAttente: true, repondreA: 'mmu9k2-a1b2c3', media: '/media/' + code + '/p2' }],
      ...surcharge,
    },
    membres: [{ id: 1, uid: 'uid-fatou', nom: 'Fatou', telephone: '07000000' }],
    tours: [], cotisations: [], prets: [],
  }
}

// ── 1. Round-trip des champs structurés ──────────────────────
test('les champs structurés des messages survivent au miroir relationnel', async () => {
  const e = env()
  const alice = await inscrire(e, 'alice@test.ci')
  const uid = alice.user.uid
  const pub = await call(e, 'PUT', '/tontines/RT123', alice.token, snapshotAvecMessage('RT123', uid))
  assert.equal(pub.status, 200, 'publication acceptée')

  const lu = await call(e, 'GET', '/tontines/RT123', alice.token)
  assert.equal(lu.status, 200)
  const messages = lu.body.groupe.messages
  assert.equal(messages.length, 2, 'les deux messages sont relus')

  const m1 = messages.find((m) => m.cle === 'mmu9k2-a1b2c3')
  assert.ok(m1, 'la cle applicative est revenue (sans elle, répondre est impossible)')
  assert.equal(m1.epingle, true, 'epingle revenue en booléen')
  assert.equal(m1.texte, 'Bonjour tous le monde')
  assert.equal(m1.uid, 'uid-awa', 'uid de lauteur conservé')

  const m2 = messages.find((m) => m.cle === 'mmu9k3-d4e5f6')
  assert.equal(m2.repondreA, 'mmu9k2-a1b2c3', 'repondreA conservé')
  assert.equal(m2.media, '/media/RT123/p1', 'media conservé')
  assert.equal(m2.modifieLe, null, 'modifieLe absent reste null et non « null »')

  // Miroir SQL : les colonnes existent réellement, pas seulement dans le blob KV.
  const rows = e.DB.tables.groupe_messages
  assert.equal(rows.length, 2, 'le miroir groupe_messages a bien deux lignes')
  assert.equal(rows.find((r) => r.cle === 'mmu9k2-a1b2c3').epingle, 1, 'epingle stockée en 1')
  assert.equal(rows.find((r) => r.cle === 'mmu9k3-d4e5f6').repondre_a, 'mmu9k2-a1b2c3', 'repondre_a en colonne')

  // Une re-publication ne décale rien : les ids changent, les clés restent.
  await call(e, 'PUT', '/tontines/RT123', alice.token, snapshotAvecMessage('RT123', uid, {
    messages: [...snapshotAvecMessage('RT123', uid).groupe.messages, { id: 3, cle: 'mmu9k5-j1k2l3', texte: 'troisième', auteur: 'Awa', date: '2026-09-30T10:02:00.000Z' }],
  }))
  const relu = await call(e, 'GET', '/tontines/RT123', alice.token)
  assert.equal(relu.body.groupe.messages.length, 3, 'le message ajouté est présent')
  assert.deepEqual(
    new Set(relu.body.groupe.messages.map((m) => m.cle)),
    new Set(['mmu9k2-a1b2c3', 'mmu9k3-d4e5f6', 'mmu9k5-j1k2l3']),
    'aucune cle perdue ni dupliquée après re-publication'
  )
})

test('les messages en attente de l’invité gardent cle, réponse et média', async () => {
  const e = env()
  const alice = await inscrire(e, 'alice@test.ci')
  await call(e, 'PUT', '/tontines/PM123', alice.token, snapshotAvecMessage('PM123', alice.user.uid))
  const row = e.DB.tables.pending_messages.find((r) => r.id === 'inv-1-xyz')
  assert.ok(row, 'la ligne pending_messages est écrite')
  assert.equal(row.repondre_a, 'mmu9k2-a1b2c3')
  assert.equal(row.media, '/media/PM123/p2')
})

test('un message sans texte, seulement une photo, traverse le miroir', async () => {
  const e = env()
  const alice = await inscrire(e, 'alice@test.ci')
  const snap = snapshotAvecMessage('PHOTO1', alice.user.uid)
  snap.groupe.messages = [{ cle: 'mmu9k9-ph01', auteur: 'Awa', uid: 'uid-awa', date: '2026-10-01T08:00:00.000Z', media: '/media/PHOTO1/p7' }]
  await call(e, 'PUT', '/tontines/PHOTO1', alice.token, snap)
  const lu = await call(e, 'GET', '/tontines/PHOTO1', alice.token)
  assert.equal(lu.body.groupe.messages.length, 1, 'la photo seule n’a pas été jetée faute de texte')
  assert.equal(lu.body.groupe.messages[0].media, '/media/PHOTO1/p7')
  assert.equal(lu.body.groupe.messages[0].cle, 'mmu9k9-ph01')
  assert.equal(lu.body.groupe.messages[0].texte, '', 'texte absent → chaîne vide, jamais « undefined »')
})

test('deux messages portant la même cle ne vident pas le miroir du groupe', async () => {
  const e = env()
  const alice = await inscrire(e, 'alice@test.ci')
  const snap = snapshotAvecMessage('DUBLON', alice.user.uid)
  // Deux appareils ayant publié le même message : le blob contient le doublon.
  snap.groupe.messages = [...snap.groupe.messages, { ...snap.groupe.messages[0], id: 77 }]
  await call(e, 'PUT', '/tontines/DUBLON', alice.token, snap)
  const lu = await call(e, 'GET', '/tontines/DUBLON', alice.token)
  assert.equal(lu.body.groupe.messages.length, 2, 'le doublon est évincé à l’écriture')
  assert.equal(lu.body.membres.length, 1, 'les membres sont toujours là : l’index unique n’a pas fait échouer le batch')
  assert.equal(lu.body.groupe.nom, 'Tontine DUBLON', 'le groupe n’est pas redevenu vide côté lecture')
})

// ── 2. Accusés de lecture ────────────────────────────────────
test('lectures/{code} : ouvert aux participants, fermé aux autres', async () => {
  const e = env()
  const alice = await inscrire(e, 'alice@test.ci')
  await call(e, 'PUT', '/tontines/LC123', alice.token, snapshotAvecMessage('LC123', alice.user.uid))
  const intrus = await inscrire(e, 'intrus@test.ci')

  const ok = await call(e, 'PUT', '/lectures/LC123', alice.token, {
    luLe: '2026-09-30T10:05:00.000Z', derniereDate: '2026-09-30T10:01:00.000Z', derniereCle: 'mmu9k3-d4e5f6', nom: 'Awa',
  })
  assert.equal(ok.status, 200, 'le responsable publie son accusé')

  // Fatou est membre déclarée du groupe : elle a droit au « vu par ».
  const membre = await inscrire(e, 'fatou@test.ci')
  e.DB.tables.membres.push({ id: 99, groupe_id: e.DB.tables.groupes.find((g) => g.code_unique === 'LC123').id, uid: membre.user.uid, nom: 'Fatou' })
  const pub = await call(e, 'PUT', '/lectures/LC123', membre.token, { luLe: '2026-09-30T10:06:00.000Z', derniereDate: '2026-09-30T10:00:00.000Z', nom: 'Fatou' })
  assert.equal(pub.status, 200, 'une membre du groupe publie le sien')

  const refus = await call(e, 'PUT', '/lectures/LC123', intrus.token, { luLe: '2026-09-30T10:07:00.000Z', derniereDate: 'x' })
  assert.equal(refus.status, 403, 'un compte étranger au groupe est refusé')
  const refusLu = await call(e, 'GET', '/lectures/LC123', intrus.token)
  assert.equal(refusLu.status, 403, 'il ne peut pas non plus lire les accusés')

  const liste = await call(e, 'GET', '/lectures/LC123', membre.token)
  assert.equal(liste.status, 200)
  const pointeurs = Object.values(liste.body)
  assert.equal(pointeurs.length, 2, 'les deux accusés du groupe sont lisibles par une membre')
  assert.ok(pointeurs.every((x) => x.derniereDate && x.luLe && x.uid), 'chaque pointeur porte uid, luLe, derniereDate')

  const incomplet = await call(e, 'PUT', '/lectures/LC123', alice.token, { luLe: '2026-09-30T10:09:00.000Z' })
  assert.equal(incomplet.status, 400, 'sans derniereDate le pointeur est inutile → 400')
})

// ── 3. Médias ────────────────────────────────────────────────
test('media/{code}/{id} : téléversement réservé aux participants, types bornés', async () => {
  const e = env()
  const alice = await inscrire(e, 'alice@test.ci')
  await call(e, 'PUT', '/tontines/MEDIA1', alice.token, snapshotAvecMessage('MEDIA1', alice.user.uid))
  const intrus = await inscrire(e, 'intrus@test.ci')

  const envoye = await call(e, 'PUT', '/media/MEDIA1/p1', alice.token, { type: 'image/png', data: PNG })
  assert.equal(envoye.status, 200)
  assert.equal(envoye.body.media, '/media/MEDIA1/p1', 'le worker renvoie le chemin à stocker dans le message')
  const ligne = e.DB.tables.media.find((r) => r.code === 'MEDIA1' && r.id === 'p1')
  assert.ok(ligne, 'l’image est en base, hors du blob du groupe')
  assert.equal(ligne.par, alice.user.uid, 'l’auteur du téléversement est tracé')

  // Le blob du groupe ne doit pas grossir : la photo n'y est pas.
  const blob = JSON.parse(e.DB.kv.get('tontines/MEDIA1'))
  assert.ok(JSON.stringify(blob).length < 8000, 'le snapshot du groupe reste léger (' + JSON.stringify(blob).length + ' octets)')

  const refus = await call(e, 'PUT', '/media/MEDIA1/p2', intrus.token, { type: 'image/png', data: PNG })
  assert.equal(refus.status, 403, 'un étranger n’écrit pas dans le media d’autrui')
  const refusLu = await call(e, 'GET', '/media/MEDIA1/p1', intrus.token)
  assert.equal(refusLu.status, 403, 'il ne le lit pas non plus')

  const lu = await call(e, 'GET', '/media/MEDIA1/p1', alice.token)
  assert.equal(lu.status, 200)
  assert.equal(lu.body.type, 'image/png')
  assert.equal(lu.body.data, PNG, 'le base64 revient intact')

  const traversant = await call(e, 'PUT', '/media/MEDIA1/p3', alice.token, { type: 'image/svg+xml', data: PNG })
  assert.equal(traversant.status, 415, 'un SVG (script embarqué) est refusé')
  const vide = await call(e, 'PUT', '/media/MEDIA1/p4', alice.token, { type: 'image/png', data: '' })
  assert.equal(vide.status, 400, 'une image vide est refusée')
  const tropLourd = await call(e, 'PUT', '/media/MEDIA1/p5', alice.token, { type: 'image/png', data: 'A'.repeat(600 * 1024) })
  assert.equal(tropLourd.status, 413, 'au-delà de ~400 Ko c’est refusé (la base de données n’est pas un disque)')

  const remplace = await call(e, 'PUT', '/media/MEDIA1/p1', alice.token, { type: 'image/jpeg', data: PNG.slice(0, 40) })
  assert.equal(remplace.status, 200)
  assert.equal(e.DB.tables.media.filter((r) => r.code === 'MEDIA1' && r.id === 'p1').length, 1, 'un ré-envoi remplace la ligne au lieu d’empiler')
})

test('un id de média invalide ne permet pas d’écrire hors du groupe', async () => {
  const e = env()
  const alice = await inscrire(e, 'alice@test.ci')
  await call(e, 'PUT', '/tontines/TRAVERS1', alice.token, snapshotAvecMessage('TRAVERS1', alice.user.uid))
  await call(e, 'PUT', '/media/TRAVERS1/..%2F..%2Fsecret', alice.token, { type: 'image/png', data: PNG })
  assert.ok(e.DB.tables.media.length > 0, 'la requête a bien écrit quelque chose')
  for (const r of e.DB.tables.media) {
    assert.equal(r.code, 'TRAVERS1', 'groupe confiné : ' + r.code)
    assert.ok(/^[A-Za-z0-9_-]+$/.test(r.id), 'id assaini : ' + r.id)
  }
})

// ── 4. Nettoyage ─────────────────────────────────────────────
test('supprimer le groupe emporte les accusés de lecture et les photos', async () => {
  const e = env()
  const alice = await inscrire(e, 'alice@test.ci')
  await call(e, 'PUT', '/tontines/DEL123', alice.token, snapshotAvecMessage('DEL123', alice.user.uid))
  await call(e, 'PUT', '/media/DEL123/p1', alice.token, { type: 'image/png', data: PNG })
  await call(e, 'PUT', '/lectures/DEL123', alice.token, { luLe: '2026-09-30T10:05:00.000Z', derniereDate: '2026-09-30T10:00:00.000Z' })
  assert.ok(e.DB.tables.media.length && [...e.DB.kv.keys()].some((k) => k.startsWith('lectures/DEL123/')))

  const r = await call(e, 'DELETE', '/tontines/DEL123', alice.token)
  assert.equal(r.status, 200)
  assert.equal(e.DB.tables.media.length, 0, 'les photos du groupe ont été effacées')
  assert.ok(![...e.DB.kv.keys()].some((k) => k.startsWith('lectures/DEL123/')), 'les accusés de lecture ont suivi')
})

test('DELETE /compte efface les photos et les pointeurs de lecture du compte', async () => {
  const e = env()
  const alice = await inscrire(e, 'alice@test.ci')
  await call(e, 'PUT', '/tontines/CO123', alice.token, snapshotAvecMessage('CO123', alice.user.uid))
  await call(e, 'PUT', '/media/CO123/p1', alice.token, { type: 'image/png', data: PNG })
  await call(e, 'PUT', '/lectures/CO123', alice.token, { luLe: '2026-09-30T10:05:00.000Z', derniereDate: '2026-09-30T10:00:00.000Z' })

  const bob = await inscrire(e, 'bob@test.ci')
  await call(e, 'PUT', '/tontines/BOB001', bob.token, snapshotAvecMessage('BOB001', bob.user.uid))
  await call(e, 'PUT', '/lectures/BOB001', bob.token, { luLe: '2026-09-30T10:07:00.000Z', derniereDate: '2026-09-30T10:00:00.000Z', nom: 'Bob' })
  // Alice pose un accusé dans le groupe de Bob : en partant, elle doit emporter son pointeur.
  await call(e, 'PUT', '/lectures/BOB001', alice.token, { luLe: '2026-09-30T10:06:00.000Z', derniereDate: '2026-09-30T10:00:00.000Z' })

  const r = await call(e, 'DELETE', '/compte', alice.token, { password: MDP, confirmation: true })
  assert.equal(r.status, 200)
  assert.equal(e.DB.tables.media.length, 0, 'plus aucune photo')
  assert.ok(![...e.DB.kv.keys()].some((k) => k.startsWith('lectures/CO123/')), 'accusés du groupe supprimé partis')
  assert.ok(![...e.DB.kv.keys()].some((k) => k === 'lectures/BOB001/' + alice.user.uid), 'son pointeur chez autrui est retiré')
  assert.ok([...e.DB.kv.keys()].some((k) => k === 'lectures/BOB001/' + bob.user.uid), 'le groupe de Bob garde les accusés des autres')
})
