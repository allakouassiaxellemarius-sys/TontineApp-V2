// ═══════════════════════════════════════════════════════════════
// Tests de conformité RGPD du worker (routes publiques HTML)
//   - GET /privacy et GET /suppression accessibles sans jeton
//   - POST /suppression enregistre la demande, sans lire de donnée de tontine
//   - les autres routes restent protégées
// D1 est simulé en mémoire (table kv réelle, relationnel neutralisé).
// ═══════════════════════════════════════════════════════════════
import { test } from 'node:test'
import assert from 'node:assert/strict'
import worker from '../src/index.js'

const BASE = 'https://sync.test'

function mockDB() {
  const kv = new Map()
  const respond = (sql, params) => ({
    async first() {
      if (/SELECT value FROM kv WHERE key = \?/.test(sql)) {
        const k = params[0]
        return kv.has(k) ? { value: kv.get(k) } : null
      }
      return null
    },
    async run() {
      if (/INSERT INTO kv/.test(sql)) kv.set(params[0], params[1])
      else if (/DELETE FROM kv WHERE key = \?/.test(sql)) kv.delete(params[0])
      return { success: true }
    },
    async all() {
      if (/SELECT key, value FROM kv WHERE key GLOB/.test(sql)) {
        const prefix = String(params[0]).replace(/\*$/, '').replaceAll('\\\\', '\\')
        return { results: [...kv.entries()].filter(([k]) => k.startsWith(prefix)).map(([key, value]) => ({ key, value })) }
      }
      return { results: [] }
    },
  })
  return { kv, prepare: (sql) => ({ bind: (...params) => respond(sql, params) }) }
}

function env() {
  return { DB: mockDB(), JWT_SECRET: 'secret-test' }
}

async function getHtml(e, path) {
  const res = await worker.fetch(new Request(BASE + path), e, {})
  const text = await res.text()
  return { status: res.status, type: res.headers.get('Content-Type'), texte: text }
}

async function postJson(e, path, body, headers = {}) {
  const res = await worker.fetch(new Request(BASE + path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify(body),
  }), e, {})
  let j = null
  try { j = await res.json() } catch {}
  return { status: res.status, body: j }
}

test('GET /privacy est public, en HTML, et cite l email de contact', async () => {
  const r = await getHtml(env(), '/privacy')
  assert.equal(r.status, 200)
  assert.match(r.type, /text\/html/)
  assert.match(r.texte, /Politique de confidentialité/)
  assert.match(r.texte, /tontine\.manager\.app@gmail\.com/)
  // aucune donnée sensible ne doit fuiter dans la page
  assert.doesNotMatch(r.texte, /JWT_SECRET|Bearer|workers\.dev\/tontines/)
})

test('GET /confidentialite est un alias de la politique', async () => {
  const r = await getHtml(env(), '/confidentialite')
  assert.equal(r.status, 200)
  assert.match(r.texte, /Politique de confidentialité/)
})

test('GET /privacy divulgue le traitement WhatsApp (Meta) des rappels par le serveur', async () => {
  const r = await getHtml(env(), '/privacy')
  assert.equal(r.status, 200)
  assert.match(r.texte, /WhatsApp/)
  assert.match(r.texte, /Meta/)
  assert.match(r.texte, /STOP/)
})

test('GET /suppression publie le formulaire, sans jeton', async () => {
  const r = await getHtml(env(), '/suppression')
  assert.equal(r.status, 200)
  assert.match(r.texte, /<form/)
  assert.match(r.texte, /Suppression de données/)
  assert.match(r.texte, /30 jours/)
})

test('POST /suppression enregistre la demande dans kv', async () => {
  const e = env()
  const r = await postJson(e, '/suppression', {
    email: '  Zotou@Example.COM ',
    uid: 'uid-1',
    message: 'Merci de tout supprimer',
  })
  assert.equal(r.status, 200)
  assert.equal(r.body.ok, true)
  const brute = e.DB.kv.get('rgpd/suppressions/zotou@example.com')
  assert.ok(brute, 'la clé normalisée doit exister')
  const d = JSON.parse(brute)
  assert.equal(d.email, 'zotou@example.com')
  assert.equal(d.uid, 'uid-1')
  assert.equal(d.message, 'Merci de tout supprimer')
  assert.equal(d.nb_envois, 1)
  assert.ok(d.recu_le)
})

test('POST /suppression sans email ni uid est refusé', async () => {
  const e = env()
  const r = await postJson(e, '/suppression', { message: 'bonjour' })
  assert.equal(r.status, 400)
  const demandes = [...e.DB.kv.keys()].filter((k) => k.startsWith('rgpd/suppressions/'))
  assert.deepEqual(demandes, [], 'aucune demande ne doit être écrite')
})

test('POST /suppression est limité en fréquence par IP', async () => {
  const e = env()
  const h = { 'CF-Connecting-IP': '5.6.7.8' }
  for (let i = 1; i <= 5; i++) {
    const r = await postJson(e, '/suppression', { email: 'ip' + i + '@example.com' }, h)
    assert.equal(r.status, 200, 'envoi ' + i)
  }
  const refus = await postJson(e, '/suppression', { email: 'sature@example.com' }, h)
  assert.equal(refus.status, 429)
  assert.equal(e.DB.kv.has('rgpd/suppressions/sature@example.com'), false)
})

test('le corps de POST /suppression est borné', async () => {
  const e = env()
  await postJson(e, '/suppression', {
    email: 'a'.repeat(400) + '@example.com',
    uid: 'u'.repeat(400),
    message: 'm'.repeat(5000),
  })
  const d = JSON.parse(e.DB.kv.get('rgpd/suppressions/' + 'a'.repeat(200)))
  assert.equal(d.email.length, 200)
  assert.equal(d.uid.length, 120)
  assert.equal(d.message.length, 2000)
})

test('une route de données reste protégée alors que les pages sont publiques', async () => {
  const e = env()
  const res = await worker.fetch(new Request(BASE + '/tontines/ABCD12'), e, {})
  assert.equal(res.status, 401)
})

test('POST /notifier/{code} : anonyme refusé, code inconnu refusé, non-participant refusé', async () => {
  const e = env()
  const anonyme = await worker.fetch(
    new Request(BASE + '/notifier/ABCD12', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{"texte":"x"}' }),
    e, {}
  )
  assert.equal(anonyme.status, 401)

  const inscrit = await postJson(e, '/auth2/register', { email: 'notif@example.com', password: 'motdepasse', displayName: 'Notif' })
  assert.equal(inscrit.status, 200)
  const token = inscrit.body.token
  const uid = inscrit.body.user.uid

  const inexistant = await worker.fetch(new Request(BASE + '/notifier/ABCD12', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
    body: JSON.stringify({ texte: 'groupe jamais publié' }),
  }), e, {})
  assert.equal(inexistant.status, 404, 'un code non publié ne peut pas être notifié')

  // Groupe publié par un autre compte, sans l appeler dans les membres.
  e.DB.kv.set('tontines/GGGGGG', JSON.stringify({ groupe: { nom: 'Autre', proprietaireUid: 'quelqu-un-d-autre' }, membres: [] }))
  const etranger = await worker.fetch(new Request(BASE + '/notifier/GGGGGG', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
    body: JSON.stringify({ texte: 'spam possible si la route était ouverte' }),
  }), e, {})
  assert.equal(etranger.status, 403, 'un compte quelconque ne peut pas notifier un groupe')

  // Même groupe, en y figurant comme membre : la notification passe.
  e.DB.kv.set('tontines/HHHHHH', JSON.stringify({
    groupe: { nom: 'Le groupe', proprietaireUid: 'quelqu-un-d-autre' },
    membres: [{ uid, nom: 'Notif' }],
  }))
  const membre = await worker.fetch(new Request(BASE + '/notifier/HHHHHH', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
    body: JSON.stringify({ texte: 'bonjour' }),
  }), e, {})
  assert.equal(membre.status, 200)
})
