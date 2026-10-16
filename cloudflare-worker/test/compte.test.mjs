// ═══════════════════════════════════════════════════════════════
// Tests de DELETE /compte (RGPD art. 17) — node --test
//   - ré-authentification par mot de passe, confirmation explicite
//   - effacement du miroir KV (snapshot + espace personnel + jeton push)
//   - cascade relationnelle sur les groupes possédés
//   - anonymisation de l'uid dans les groupes d'autrui
// D1 est simulé : table kv réelle + tables relationnelles suivies en mémoire.
// Lancer : node --test test/compte.test.mjs
// ═══════════════════════════════════════════════════════════════
import { test } from 'node:test'
import assert from 'node:assert/strict'
import worker from '../src/index.js'

const BASE = 'https://sync.test'

const TABLES = ['groupes', 'membres', 'tours', 'cotisations', 'prets', 'demandes',
  'groupe_messages', 'pending_messages', 'groupe_co_gerants']

function mockDB() {
  const kv = new Map()
  const tables = Object.fromEntries(TABLES.map((t) => [t, []]))

  const matches = (row, where, params) => {
    // Where minimaliste : « col = ? [AND col = ?] », « col = ? OR col = ? ».
    const cols = [...where.matchAll(/([a-z_]+)\s*=\s*\?/g)].map((m) => m[1])
    return cols.every((c, i) => params[i] !== undefined && String(row[c]) === String(params[i]))
  }

  const stmt = (sql, params) => ({
    async first() {
      if (/SELECT value FROM kv WHERE key = \?/.test(sql)) {
        return kv.has(params[0]) ? { value: kv.get(params[0]) } : null
      }
      const m = sql.match(/SELECT (.+) FROM (\w+) WHERE (.+)/)
      if (!m) return null
      const [, , table] = m
      return (tables[table] || []).find((r) => matches(r, m[3], params)) || null
    },
    async all() {
      if (/DELETE FROM kv WHERE key GLOB \?/.test(sql)) return { results: [] }
      if (/SELECT key, value FROM kv WHERE key GLOB \?/.test(sql)) {
        const prefix = String(params[0]).replace(/\*$/, '')
        const results = [...kv.entries()]
          .filter(([k]) => k.startsWith(prefix))
          .map(([key, value]) => ({ key, value }))
        return { results }
      }
      const m = sql.match(/SELECT (.+) FROM (\w+) WHERE (.+)/)
      if (!m) return { results: [] }
      return { results: (tables[m[2]] || []).filter((r) => matches(r, m[3], params)) }
    },
    async run() {
      if (/INSERT INTO kv/.test(sql)) kv.set(params[0], params[1])
      else if (/DELETE FROM kv WHERE key = \?/.test(sql)) kv.delete(params[0])
      else if (/DELETE FROM kv WHERE key GLOB \?/.test(sql)) {
        const prefix = String(params[0]).replace(/\*$/, '')
        for (const k of [...kv.keys()]) if (k.startsWith(prefix)) kv.delete(k)
      } else if (/^DELETE FROM (\w+) WHERE (.+)/.test(sql)) {
        const [, table, where] = sql.match(/^DELETE FROM (\w+) WHERE (.+)/)
        if (tables[table]) tables[table] = tables[table].filter((r) => !matches(r, where, params))
      } else if (/^UPDATE (\w+) SET (\w+)[^W]*WHERE (.+)/.test(sql)) {
        const [, table, col, where] = sql.match(/^UPDATE (\w+) SET (\w+)[^W]*WHERE (.+)/)
        const last = params.length - 1
        for (const r of tables[table] || []) {
          if (String(r[where.match(/([a-z_]+)\s*=\s*\?$/)[1]]) === String(params[last])) r[col] = null
        }
      }
      return { success: true }
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
  return { DB: mockDB(), JWT_SECRET: 'secret-test' }
}

async function call(e, method, path, token, body) {
  const req = new Request(BASE + path, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  const res = await worker.fetch(req, e, {})
  let j = null
  try { j = await res.json() } catch {}
  return { status: res.status, body: j }
}

const MDP = 'motdepasse'

async function inscrire(e, email) {
  const r = await call(e, 'POST', '/auth2/register', null, { email, password: MDP, displayName: email })
  assert.equal(r.status, 200, 'inscription ' + email)
  return r.body
}

// Alice publie un groupe ; on retrouve l'uid et le id relationnel créé.
async function publierGroupe(e, alice, code) {
  const uid = alice.user.uid
  const snap = {
    format: 2,
    groupe: { codeUnique: code, nom: 'Tontine ' + code, proprietaire: uid, montantCotisation: 5000, coGerants: {} },
    membres: [{ uid: 'm1', nom: 'Membre un', telephone: '07000000' }],
    tours: [], cotisations: [], prets: [],
  }
  const r = await call(e, 'PUT', '/tontines/' + code, alice.token, snap)
  assert.equal(r.status, 200, 'publication du groupe')
  // Miroir relationnel : le vrai worker upserte cette ligne ; le mock ne fait
  // que du KV, donc on la pose après l'appel pour qu'il ne l'efface pas.
  e.DB.tables.groupes.push({ id: 'g_' + code, code_unique: code, proprietaire_uid: uid, sauvegarde_uid: uid })
  return uid
}

test('DELETE /compte exige le mot de passe et une confirmation explicite', async () => {
  const e = env()
  const alice = await inscrire(e, 'alice@test.ci')
  await publierGroupe(e, alice, 'ABC123')

  const sansMdp = await call(e, 'DELETE', '/compte', alice.token, { confirmation: true })
  assert.equal(sansMdp.status, 401)

  const mauvaisMdp = await call(e, 'DELETE', '/compte', alice.token, { password: 'faux', confirmation: true })
  assert.equal(mauvaisMdp.status, 401)

  const sansConfirm = await call(e, 'DELETE', '/compte', alice.token, { password: MDP })
  assert.equal(sansConfirm.status, 400)

  // Rien n'a été touché par les tentatives refusées.
  assert.ok(e.DB.kv.has('users/alice@test.ci'))
  assert.ok(e.DB.kv.has('tontines/ABC123'))

  const anon = await call(e, 'DELETE', '/compte', null, { password: MDP, confirmation: true })
  assert.equal(anon.status, 401)
})

test('DELETE /compte efface le compte, ses groupes et son miroir KV', async () => {
  const e = env()
  const alice = await inscrire(e, 'alice@test.ci')
  const uid = await publierGroupe(e, alice, 'ABC123')
  e.DB.kv.set('users/' + uid + '/profil', JSON.stringify({ bio: 'x' }))
  e.DB.kv.set('fcm/' + uid, JSON.stringify({ token: 'tok' }))
  e.DB.kv.set('demandes/ABC123/d1', JSON.stringify({ uid }))
  e.DB.kv.set('messages_utilisateur/ABC123/m1', JSON.stringify({ uid }))
  e.DB.kv.set('tontines/ZEBRA', JSON.stringify({ groupe: { codeUnique: 'ZEBRA' } }))

  const r = await call(e, 'DELETE', '/compte', alice.token, { password: MDP, confirmation: true })
  assert.equal(r.status, 200)
  assert.equal(r.body.supprimes.groupes, 1)

  for (const k of ['users/alice@test.ci', 'users/' + uid + '/profil', 'fcm/' + uid,
    'tontines/ABC123', 'demandes/ABC123/d1', 'messages_utilisateur/ABC123/m1']) {
    assert.ok(!e.DB.kv.has(k), 'clé supprimée : ' + k)
  }
  // Un groupe voisin appartenant à autrui est intact.
  assert.ok(e.DB.kv.has('tontines/ZEBRA'))
  assert.deepEqual(e.DB.tables.groupes, [])
})

test('Le jeton émis avant une suppression de compte ne donne plus accès à rien', async () => {
  const e = env()
  const alice = await inscrire(e, 'alice@test.ci')
  await publierGroupe(e, alice, 'ABC123')
  assert.equal((await call(e, 'GET', '/tontines/ABC123', alice.token)).status, 200, 'accès normal avant suppression')

  // Avant la correction, requireAuth ne comparait que tokenVer : le porteur du
  // bearer restait autorisé jusqu'à l'expiration du jeton, alors que le compte
  // (et toutes ses données) venait d'être effacé.
  const r = await call(e, 'DELETE', '/compte', alice.token, { password: MDP, confirmation: true })
  assert.equal(r.status, 200)
  assert.equal((await call(e, 'GET', '/tontines/ABC123', alice.token)).status, 401, 'lecture refusée')
  assert.equal((await call(e, 'PUT', '/tontines/ABC123', alice.token, { format: 2, groupe: { codeUnique: 'ABC123' } })).status, 401, 'écriture refusée')
  assert.equal((await call(e, 'DELETE', '/users/' + alice.user.uid + '/tontines', alice.token)).status, 401, 'espace personnel fermé')
})

test('DELETE /compte anonymise l’uid dans les groupes d’un autre compte', async () => {
  const e = env()
  const bob = await inscrire(e, 'bob@test.ci')
  const bobUid = await publierGroupe(e, bob, 'BOB001')
  const alice = await inscrire(e, 'alice@test.ci')
  const aliceUid = alice.user.uid
  // Alice est simple membre du groupe de Bob.
  e.DB.tables.membres.push({ id: 'mb1', groupe_id: 'g_BOB001', uid: aliceUid, nom: 'Alice' })
  e.DB.tables.groupe_co_gerants.push({ uid: aliceUid, groupe_id: 'g_BOB001' })

  const r = await call(e, 'DELETE', '/compte', alice.token, { password: MDP, confirmation: true })
  assert.equal(r.status, 200)
  assert.equal(r.body.supprimes.groupes, 0)

  // Le groupe de Bob survit, son membre est anonymisé.
  assert.equal(e.DB.tables.groupes.length, 1)
  assert.ok(e.DB.kv.has('tontines/BOB001'))
  assert.equal(e.DB.tables.membres.length, 1)
  assert.equal(e.DB.tables.membres[0].uid, null)
  assert.deepEqual(e.DB.tables.groupe_co_gerants, [])
  // Bob garde l'accès à son compte.
  assert.ok(e.DB.kv.has('users/bob@test.ci'))
  assert.ok(bobUid)
})

test('DELETE /compte rattrape un groupe présent uniquement dans le miroir KV', async () => {
  const e = env()
  const alice = await inscrire(e, 'alice@test.ci')
  const uid = alice.user.uid
  // Publication sans ligne `groupes` (miroir relationnel absent ou upsert échoué).
  e.DB.kv.set('tontines/KVONLY', JSON.stringify({
    format: 2, groupe: { codeUnique: 'KVONLY', nom: 'Groupe KV', proprietaire: uid }, membres: [],
  }))
  e.DB.kv.set('paiements_invite/KVONLY/p1', JSON.stringify({ uid }))

  const r = await call(e, 'DELETE', '/compte', alice.token, { password: MDP, confirmation: true })
  assert.equal(r.status, 200)
  assert.equal(r.body.supprimes.groupes, 1)
  assert.ok(!e.DB.kv.has('tontines/KVONLY'), 'le snapshot KV doit être supprimé')
  assert.ok(!e.DB.kv.has('paiements_invite/KVONLY/p1'), 'les enfants du groupe aussi')
})

test('DELETE /compte est limité en fréquence par compte', async () => {
  const e = env()
  const alice = await inscrire(e, 'alice@test.ci')
  let bloque = false
  // 12 tentatives et non 8 : la fenêtre de rateLimit est alignée sur l'horloge
  // (index.js:83, Math.floor(Date.now()/60000)), donc une exécution qui franchit
  // la minute répartit les compteurs sur deux fenêtres et le seuil (5) n'est
  // jamais atteint. Avec 12, une fenêtre en reçoit au moins 6 quelle que soit la
  // coupure, donc le 429 est déclenché de façon déterministe.
  for (let i = 0; i < 12; i++) {
    const r = await call(e, 'DELETE', '/compte', alice.token, { password: 'faux' })
    if (r.status === 429) bloque = true
  }
  assert.ok(bloque, 'le rate limit doit se déclencher')
  assert.ok(e.DB.kv.has('users/alice@test.ci'), 'le compte est encore là')
})
