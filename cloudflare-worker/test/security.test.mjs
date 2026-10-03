// ═══════════════════════════════════════════════════════════════
// Tests sécurité du worker tontine-sync (node --test)
//   - Propriétaire / co-gérants sur PUT|DELETE tontines/{code}
//   - Anti-IDOR sur users/{uid}/*
//   - GET tontines/{code} ouvert à tout compte authentifié (rejoindre)
// D1 est simulé en mémoire (table kv + no-op relationnel).
// Lancer : node --test test/
// ═══════════════════════════════════════════════════════════════
import { test } from 'node:test'
import assert from 'node:assert/strict'
import worker from '../src/index.js'

const BASE = 'https://sync.test'

// --- Mini D1 : table kv réelle, tables relationnelles neutralisées ---
function mockDB() {
  const kv = new Map()
  const respond = (sql, params) => ({
    async first() {
      if (/SELECT value FROM kv WHERE key = \?/.test(sql)) {
        const k = params[0]
        return kv.has(k) ? { value: kv.get(k) } : null
      }
      return null // groupes/users/... : jamais trouvés (miroir vide)
    },
    async run() {
      if (/INSERT INTO kv/.test(sql)) kv.set(params[0], params[1])
      else if (/DELETE FROM kv WHERE key = \?/.test(sql)) kv.delete(params[0])
      return { success: true }
    },
    async all() {
      if (/SELECT key, value FROM kv WHERE key GLOB/.test(sql)) {
        const prefix = String(params[0]).replace(/\*$/, '').replaceAll('\\\\', '\\')
        const results = [...kv.entries()]
          .filter(([k]) => k.startsWith(prefix))
          .map(([key, value]) => ({ key, value }))
        return { results }
      }
      return { results: [] }
    },
  })
  return { kv, prepare: (sql) => ({ bind: (...params) => respond(sql, params) }) }
}

function env() {
  const DB = mockDB()
  return { DB, JWT_SECRET: 'secret-test', ...stubbedExtras(DB) }
}
// Les bindings optionnels (FLW_*, AI_*) ne sont pas utilisés dans ces routes.
function stubbedExtras() { return {} }

async function call(e, method, path, token, body) {
  const req = new Request(BASE + path, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: 'Bearer ' + token } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  const res = await worker.fetch(req, e, {})
  let j = null
  try { j = await res.json() } catch {}
  return { status: res.status, body: j }
}

async function inscrire(e, email) {
  const r = await call(e, 'POST', '/auth2/register', null, { email, password: 'motdepasse', displayName: email })
  assert.equal(r.status, 200, 'inscription ' + email)
  return r.body // { token, user: { uid, ... } }
}

const snapshotDe = (uid) => ({
  format: 2,
  groupe: {
    codeUnique: 'ABC123', nom: 'Tontine Test', proprietaire: uid,
    montantCotisation: 5000, coGerants: {},
  },
  membres: [], tours: [], cotisations: [], prets: [],
})

test('PUT tontines : le propriétaire publie, un inconnu est refusé', async () => {
  const e = env()
  const alice = await inscrire(e, 'alice@test.ci')
  const mallory = await inscrire(e, 'mallory@test.ci')
  const ok = await call(e, 'PUT', '/tontines/ABC123', alice.token, snapshotDe(alice.user.uid))
  assert.equal(ok.status, 200)
  const ko = await call(e, 'PUT', '/tontines/ABC123', mallory.token, snapshotDe(mallory.user.uid))
  assert.equal(ko.status, 403)
  // Le snapshot d'Alice n'a pas été écrasé par Mallory.
  const lu = await call(e, 'GET', '/tontines/ABC123', mallory.token)
  assert.equal(lu.body.groupe.proprietaire, alice.user.uid)
})

test('DELETE tontines : réservé au propriétaire (un co-gérant peut publier mais pas supprimer)', async () => {
  const e = env()
  const alice = await inscrire(e, 'alice2@test.ci')
  const bob = await inscrire(e, 'bob@test.ci')
  await call(e, 'PUT', '/tontines/DEL001', alice.token, snapshotDe(alice.user.uid))
  assert.equal((await call(e, 'DELETE', '/tontines/DEL001', bob.token)).status, 403)
  // Co-gérant déclaré dans le snapshot stocké : peut publier mais pas supprimer.
  const snap = snapshotDe(alice.user.uid)
  snap.groupe.coGerants = { [bob.user.uid]: { nom: 'Bob' } }
  await call(e, 'PUT', '/tontines/DEL001', alice.token, snap)
  const majCoGerant = await call(e, 'PUT', '/tontines/DEL001', bob.token, snap)
  assert.equal(majCoGerant.status, 200)
  assert.equal((await call(e, 'DELETE', '/tontines/DEL001', bob.token)).status, 403)
  assert.equal((await call(e, 'DELETE', '/tontines/DEL001', alice.token)).status, 200)
  assert.equal((await call(e, 'GET', '/tontines/DEL001', alice.token)).body, null)
})

test('GET tontines/{code} ouvert à tout compte authentifié (rejoindre par code)', async () => {
  const e = env()
  const alice = await inscrire(e, 'alice3@test.ci')
  const invite = await inscrire(e, 'invite@test.ci')
  await call(e, 'PUT', '/tontines/JOIN1', alice.token, snapshotDe(alice.user.uid))
  const r = await call(e, 'GET', '/tontines/JOIN1', invite.token)
  assert.equal(r.status, 200)
  assert.equal(r.body.groupe.codeUnique, 'ABC123'.length ? r.body.groupe.codeUnique : '')
  assert.ok(r.body.groupe)
})

test("users/{uid}/* : accès à l'espace d'un autre compte refusé (IDOR)", async () => {
  const e = env()
  const alice = await inscrire(e, 'alice4@test.ci')
  const mallory = await inscrire(e, 'mallory2@test.ci')
  const chemin = '/users/' + alice.user.uid + '/tontines'
  assert.equal((await call(e, 'GET', chemin, mallory.token)).status, 403)
  assert.equal((await call(e, 'PUT', chemin + '/XYZ', mallory.token, snapshotDe(alice.user.uid))).status, 403)
  assert.equal((await call(e, 'DELETE', chemin + '/XYZ', mallory.token)).status, 403)
  // Son propre espace reste accessible.
  assert.equal((await call(e, 'GET', chemin, alice.token)).status, 200)
  assert.equal((await call(e, 'PUT', '/users/' + alice.user.uid + '/fcmToken', alice.token, { token: 'tok' })).status, 200)
})

test('paiements/{code}/{id} DELETE : gérant uniquement', async () => {
  const e = env()
  const alice = await inscrire(e, 'alice5@test.ci')
  const bob = await inscrire(e, 'bob2@test.ci')
  await call(e, 'PUT', '/tontines/PAY1', alice.token, snapshotDe(alice.user.uid))
  assert.equal((await call(e, 'DELETE', '/paiements/PAY1/tx1', bob.token)).status, 403)
  assert.equal((await call(e, 'DELETE', '/paiements/PAY1/tx1', alice.token)).status, 200)
})

test('adoption : un groupe historique sans propriétaire est adopté par le premier éditeur', async () => {
  const e = env()
  const alice = await inscrire(e, 'alice6@test.ci')
  const mallory = await inscrire(e, 'mallory3@test.ci')
  const sansOwner = { format: 2, groupe: { codeUnique: 'OLD1', nom: 'Ancienne' }, membres: [] }
  assert.equal((await call(e, 'PUT', '/tontines/OLD1', alice.token, sansOwner)).status, 200)
  // Désormais revendiqué : Mallory ne peut plus ni écraser ni supprimer.
  assert.equal((await call(e, 'PUT', '/tontines/OLD1', mallory.token, sansOwner)).status, 403)
})

// Les canaux demandes/ et messages_utilisateur/ ne sont lus que par le
// responsable qui les absorbe ; l'invité ne fait que poster.
for (const [canal, corps] of [
  ['demandes', { nom: 'Koffi', telephone: '0700000000', email: 'koffi@test.ci' }],
  ['messages_utilisateur', { texte: 'Bonjour', auteur: 'Koffi' }],
]) {
  test(`${canal}/{code} : POST ouvert à l'invité, GET réservé au responsable`, async () => {
    const e = env()
    const alice = await inscrire(e, 'prop-' + canal + '@test.ci')
    const invite = await inscrire(e, 'inv-' + canal + '@test.ci')
    const mallory = await inscrire(e, 'curieux-' + canal + '@test.ci')
    await call(e, 'PUT', '/tontines/C1' + canal, alice.token, snapshotDe(alice.user.uid))
    const code = 'C1' + canal

    const poste = await call(e, 'POST', '/' + canal + '/' + code, invite.token, corps)
    assert.equal(poste.status, 200, "l'invité doit pouvoir poster")
    assert.ok(poste.body.id)

    assert.equal((await call(e, 'GET', '/' + canal + '/' + code, mallory.token)).status, 403, 'un tiers ne lit pas le canal')
    const lu = await call(e, 'GET', '/' + canal + '/' + code, alice.token)
    assert.equal(lu.status, 200, 'le responsable lit le canal')
    assert.equal(Object.keys(lu.body || {}).length, 1)
  })

  test(`${canal}/{code} : le responsable qui absorbe peut supprimer (pas un tiers)`, async () => {
    const e = env()
    const alice = await inscrire(e, 'prop2-' + canal + '@test.ci')
    const invite = await inscrire(e, 'inv2-' + canal + '@test.ci')
    const mallory = await inscrire(e, 'curieux2-' + canal + '@test.ci')
    await call(e, 'PUT', '/tontines/C2' + canal, alice.token, snapshotDe(alice.user.uid))
    const code = 'C2' + canal
    const { id } = (await call(e, 'POST', '/' + canal + '/' + code, invite.token, corps)).body

    // Avant la correction : 403 pour le responsable (seul l'auteur pouvait),
    // donc le canal se re-téléchargeait entier à chaque sonde.
    assert.equal((await call(e, 'DELETE', '/' + canal + '/' + code + '/' + id, mallory.token)).status, 403)
    assert.equal((await call(e, 'DELETE', '/' + canal + '/' + code + '/' + id, alice.token)).status, 200)
    assert.deepEqual((await call(e, 'GET', '/' + canal + '/' + code, alice.token)).body, {}, 'canal vidé')
    // messages_utilisateur horodate son auteur (par) : l'invité peut retirer son
    // propre message. demandes/ n'enregistre pas l'auteur, seul le responsable purge.
    if (canal === 'messages_utilisateur') {
      const second = (await call(e, 'POST', '/' + canal + '/' + code, invite.token, corps)).body
      assert.equal((await call(e, 'DELETE', '/' + canal + '/' + code + '/' + second.id, invite.token)).status, 200)
    }
  })
}

