// ═══════════════════════════════════════════════════════════════
// Tests des rappels WhatsApp par le serveur (Cloud API de Meta)
//   - le client ne fournit QUE le numéro du tour : tout le reste (numéros,
//     montant, noms) est relu du groupe en base et part dans un template
//     Utilitaire approuvé — jamais de texte libre ;
//   - seuls le propriétaire et les co-gérants d'un groupe réellement publié
//     peuvent lancer un envoi (404 sinon, 403 pour un étranger) ;
//   - anti-abus : plafond horaire, anti-doublon 24 h, opt-out (STOP/START,
//     refus Meta 131047) ;
//   - webhook public : vérification hub.*, signature X-Hub-Signature-256,
//     statuts remis/lu/échec reflétés dans le journal.
// D1 est simulé par le mini-interpréteur SQL de discussion.test.mjs ; l'appel
// Graph est intercepté en remplaçant globalThis.fetch.
// ═══════════════════════════════════════════════════════════════
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createHmac } from 'node:crypto'
import worker from '../src/index.js'

const BASE = 'https://sync.test'
const MDP = 'motdepasse'
const PHONE_ID = '987654321'
const JETON = 'jeton-wa-test'

// ── Mini D1 (identique à discussion.test.mjs) ────────────────
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

function envWa(surcharge = {}) {
  return {
    DB: mockDB(),
    JWT_SECRET: 'secret-test',
    NOTIFIER_TOKEN: null,
    WA_TOKEN: JETON,
    WA_PHONE_NUMBER_ID: PHONE_ID,
    ...surcharge,
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
  return { status: res.status, body: j, res }
}

async function inscrire(e, email) {
  const r = await call(e, 'POST', '/auth2/register', null, { email, password: MDP, displayName: email.split('@')[0] })
  assert.equal(r.status, 200, 'inscription ' + email)
  return r.body
}

// Graphe intercepté : capture les appels sortants vers graph.facebook.com.
function stubGraph(corps = { messages: [{ id: 'wamid.test-1' }] }, ok = true) {
  const appels = []
  const originel = globalThis.fetch
  globalThis.fetch = async (url, options = {}) => {
    appels.push({ url: String(url), options })
    return { ok, status: ok ? 200 : 400, json: async () => corps }
  }
  return { appels, restaurer() { globalThis.fetch = originel } }
}

// Snapshot publié : 4 membres (2 joignables, 2 non), 1 tour terminé + 1 en
// attente, Awa (receveuse du tour 2) a déjà payé.
function snapshotTontine(code, uid, surcharge = {}) {
  const base = {
    format: 2,
    groupe: {
      codeUnique: code, nom: 'Tontine ' + code, proprietaire: uid,
      montantCotisation: 5000, deviseSymbole: 'FCFA', devisePosition: 'after',
      leReceveurCotonise: true,
    },
    membres: [
      { id: 1, nom: 'Awa', telephone: '0701020304', uid: 'uid-awa' },
      { id: 2, nom: 'Moussa', telephone: '+2250705060708', uid: 'uid-mou' },
      { id: 3, nom: 'Fatou', telephone: '', uid: 'uid-fatou' },
      { id: 4, nom: 'Ibrahim', telephone: '12345', uid: 'uid-ibr' },
    ],
    tours: [
      { id: 1, numero: 1, membreId: 1, datePrevue: '2026-10-05T00:00:00.000Z', montantPot: 20000, statut: 'termine' },
      { id: 2, numero: 2, membreId: 2, datePrevue: '2026-10-12T00:00:00.000Z', montantPot: 20000, statut: 'en_attente' },
    ],
    cotisations: [{ id: 1, tourId: 2, membreId: 1, montant: 5000, statut: 'paye' }],
    prets: [],
  }
  return { ...base, ...surcharge, groupe: { ...base.groupe, ...(surcharge.groupe || {}) } }
}

async function publier(e, code, token, uid, surcharge = {}) {
  const r = await call(e, 'PUT', '/tontines/' + code, token, snapshotTontine(code, uid, surcharge))
  assert.equal(r.status, 200, 'publication ' + code)
}

async function postWebhook(e, brut, signature) {
  const headers = { 'Content-Type': 'application/json' }
  if (signature) headers['X-Hub-Signature-256'] = signature
  const res = await worker.fetch(new Request(BASE + '/whatsapp/webhook', { method: 'POST', headers, body: brut }), e, {})
  let j = null
  try { j = await res.clone().json() } catch {}
  return { status: res.status, body: j }
}

const recitStatut = (id, statut, extra = {}) => JSON.stringify({
  object: 'whatsapp_business_account',
  entry: [{ changes: [{ field: 'messages', value: { statuses: [{ id, status: statut, timestamp: '1759', recipient_id: '2250705060708', ...extra }] } }] }],
})
const recitMessage = (from, texte) => JSON.stringify({
  object: 'whatsapp_business_account',
  entry: [{ changes: [{ field: 'messages', value: { messages: [{ from, id: 'wamid.msg-1', type: 'text', text: { body: texte } }] } }] }],
})

// ── 1. Garde d'accès ─────────────────────────────────────────
test('un groupe non publié n’existe pas pour les rappels (404)', async () => {
  const e = envWa()
  const alice = await inscrire(e, 'alice@test.ci')
  const r = await call(e, 'POST', '/whatsapp/ZZ404', alice.token, {})
  assert.equal(r.status, 404)
})

test('un étranger ne peut ni voir l’aperçu, ni le journal, ni lancer l’envoi (403)', async () => {
  const e = envWa()
  const alice = await inscrire(e, 'alice@test.ci')
  const bob = await inscrire(e, 'bob@test.ci')
  await publier(e, 'RT200', alice.token, alice.user.uid)

  const s = await call(e, 'GET', '/whatsapp/RT200/statut', bob.token)
  assert.equal(s.status, 403)
  const j = await call(e, 'GET', '/whatsapp/RT200', bob.token)
  assert.equal(j.status, 403)
  const p = await call(e, 'POST', '/whatsapp/RT200', bob.token, {})
  assert.equal(p.status, 403)
})

test('un co-gérant peut lancer l’envoi', async () => {
  const e = envWa()
  const alice = await inscrire(e, 'alice@test.ci')
  const bob = await inscrire(e, 'bob@test.ci')
  await publier(e, 'RT201', alice.token, alice.user.uid, { groupe: { coGerants: { [bob.user.uid]: { nom: 'Bob' } } } })

  const stub = stubGraph()
  try {
    const r = await call(e, 'POST', '/whatsapp/RT201', bob.token, {})
    assert.equal(r.status, 200)
    assert.equal(r.body.tour, 2)
    assert.equal(r.body.envoyes.length, 1)
  } finally { stub.restaurer() }
})

// ── 2. Aperçu ────────────────────────────────────────────────
test('l’aperçu montre le tour en attente, les joignables et les raisons d’exclusion', async () => {
  const e = envWa()
  const alice = await inscrire(e, 'alice@test.ci')
  await publier(e, 'RT202', alice.token, alice.user.uid)

  const r = await call(e, 'GET', '/whatsapp/RT202/statut', alice.token)
  assert.equal(r.status, 200)
  assert.equal(r.body.configure, true)
  assert.equal(r.body.groupe, 'Tontine RT202')
  assert.equal(r.body.tour.numero, 2)
  assert.equal(r.body.tour.datePrevue, '2026-10-12T00:00:00.000Z')
  // Awa a payé, Moussa est relançable, Fatou (sans numéro) et Ibrahim
  // (numéro local incomplet) sont écartés avec une raison explicite.
  assert.deepEqual(r.body.aRelancer.map((x) => x.nom), ['Moussa', 'Fatou', 'Ibrahim'])
  assert.equal(r.body.aRelancer[0].joignable, true)
  assert.equal(r.body.aRelancer[0].raison, null)
  assert.equal(r.body.aRelancer[1].joignable, false)
  assert.match(r.body.aRelancer[1].raison, /indicatif/)
  assert.match(r.body.aRelancer[2].raison, /indicatif/)
})

test('l’aperçu peut viser un tour précis (?tour=1) plutôt que le premier en attente', async () => {
  const e = envWa()
  const alice = await inscrire(e, 'alice@test.ci')
  await publier(e, 'RT210', alice.token, alice.user.uid)

  const r = await call(e, 'GET', '/whatsapp/RT210/statut?tour=1', alice.token)
  assert.equal(r.status, 200)
  assert.equal(r.body.tour.numero, 1)
  assert.equal(r.body.tour.datePrevue, '2026-10-05T00:00:00.000Z')
  // La cotisation d'Awa porte sur le tour 2 : sur le tour 1 elle repasse dans
  // la liste, contrairement à l'aperçu par défaut.
  assert.deepEqual(r.body.aRelancer.map((x) => x.nom), ['Awa', 'Moussa', 'Fatou', 'Ibrahim'])
  assert.equal(r.body.aRelancer[0].joignable, true)
})

// ── 3. Envoi ─────────────────────────────────────────────────
test('l’envoi construit le payload Graph exact (template Utilitaire, 3 variables)', async () => {
  const e = envWa()
  const alice = await inscrire(e, 'alice@test.ci')
  await publier(e, 'RT203', alice.token, alice.user.uid)

  const stub = stubGraph()
  try {
    const r = await call(e, 'POST', '/whatsapp/RT203', alice.token, {})
    assert.equal(r.status, 200)
    assert.equal(r.body.configure, true)
    assert.equal(r.body.tour, 2)
    assert.deepEqual(r.body.envoyes.map((x) => x.nom), ['Moussa'])
    assert.equal(r.body.envoyes[0].id, 'wamid.test-1')
    assert.deepEqual(r.body.ignores.map((x) => x.nom), ['Fatou', 'Ibrahim'])

    assert.equal(stub.appels.length, 1)
    const { url, options } = stub.appels[0]
    assert.equal(url, 'https://graph.facebook.com/v25.0/' + PHONE_ID + '/messages')
    assert.equal(options.method, 'POST')
    assert.equal(options.headers.Authorization, 'Bearer ' + JETON)
    const corps = JSON.parse(options.body)
    assert.equal(corps.messaging_product, 'whatsapp')
    assert.equal(corps.to, '2250705060708')
    assert.equal(corps.type, 'template')
    assert.equal(corps.template.name, 'rappel_cotisation')
    assert.deepEqual(corps.template.language, { code: 'fr' })
    assert.deepEqual(
      corps.template.components[0].parameters.map((p) => p.text),
      ['Moussa', '5 000 FCFA avant le 12/10/2026', 'Tontine RT203']
    )

    // Journal relu par le propriétaire.
    const jr = await call(e, 'GET', '/whatsapp/RT203', alice.token)
    assert.equal(jr.status, 200)
    assert.equal(jr.body.items.length, 1)
    assert.equal(jr.body.items[0].statut, 'envoye')
    assert.equal(jr.body.items[0].id, 'wamid.test-1')
    assert.equal(jr.body.items[0].tour, 2)
    assert.equal(jr.body.dernier.envoyes, 1)
  } finally { stub.restaurer() }
})

test('anti-doublon : pas de second envoi au même membre à moins de 24 h', async () => {
  const e = envWa()
  const alice = await inscrire(e, 'alice@test.ci')
  await publier(e, 'RT204', alice.token, alice.user.uid)

  const stub = stubGraph()
  try {
    const r1 = await call(e, 'POST', '/whatsapp/RT204', alice.token, {})
    assert.equal(r1.body.envoyes.length, 1)
    const r2 = await call(e, 'POST', '/whatsapp/RT204', alice.token, {})
    assert.equal(r2.status, 200)
    assert.equal(r2.body.envoyes.length, 0)
    assert.match(r2.body.ignores.find((x) => x.nom === 'Moussa').raison, /24 h/)
    assert.equal(stub.appels.length, 1, 'un seul appel Graph au total')
  } finally { stub.restaurer() }
})

test('un numéro désabonné est écarté sans appel Graph', async () => {
  const e = envWa()
  const alice = await inscrire(e, 'alice@test.ci')
  await publier(e, 'RT205', alice.token, alice.user.uid)
  e.DB.kv.set('wa/optout/2250705060708', JSON.stringify({ le: Date.now(), motif: 'stop' }))

  const stub = stubGraph()
  try {
    const r = await call(e, 'POST', '/whatsapp/RT205', alice.token, {})
    assert.equal(r.status, 200)
    assert.equal(r.body.envoyes.length, 0)
    assert.match(r.body.ignores.find((x) => x.nom === 'Moussa').raison, /ne plus recevoir/)
    assert.equal(stub.appels.length, 0)
  } finally { stub.restaurer() }
})

test('non configuré : le serveur répond sans envoyer et le mode manuel reste seul', async () => {
  const e = envWa({ WA_TOKEN: undefined, WA_PHONE_NUMBER_ID: undefined })
  const alice = await inscrire(e, 'alice@test.ci')
  await publier(e, 'RT206', alice.token, alice.user.uid)

  const stub = stubGraph()
  try {
    const r = await call(e, 'POST', '/whatsapp/RT206', alice.token, {})
    assert.equal(r.status, 200)
    assert.equal(r.body.configure, false)
    assert.equal(r.body.envoyes.length, 0)
    assert.match(r.body.raison, /pas configuré/)
    assert.equal(stub.appels.length, 0)
    const s = await call(e, 'GET', '/whatsapp/RT206/statut', alice.token)
    assert.equal(s.body.configure, false)
  } finally { stub.restaurer() }
})

test('plafond horaire : 6 appels par heure et par compte', async () => {
  const e = envWa()
  const alice = await inscrire(e, 'alice@test.ci')
  await publier(e, 'RT207', alice.token, alice.user.uid)

  const stub = stubGraph()
  try {
    for (let i = 0; i < 6; i++) {
      const r = await call(e, 'POST', '/whatsapp/RT207', alice.token, {})
      assert.equal(r.status, 200, 'appel ' + (i + 1))
    }
    const r7 = await call(e, 'POST', '/whatsapp/RT207', alice.token, {})
    assert.equal(r7.status, 429)
    assert.match(r7.body.error, /Trop d’envois/)
  } finally { stub.restaurer() }
})

test('le client peut viser un tour précis (tourNumero)', async () => {
  const e = envWa()
  const alice = await inscrire(e, 'alice@test.ci')
  await publier(e, 'RT208', alice.token, alice.user.uid)

  const stub = stubGraph()
  try {
    const r = await call(e, 'POST', '/whatsapp/RT208', alice.token, { tourNumero: 1 })
    assert.equal(r.status, 200)
    assert.equal(r.body.tour, 1)
  } finally { stub.restaurer() }
})

test('le receveur non cotisant est exclu quand le groupe le demande', async () => {
  const e = envWa()
  const alice = await inscrire(e, 'alice@test.ci')
  await publier(e, 'RT209', alice.token, alice.user.uid, { groupe: { leReceveurCotonise: false } })

  const r = await call(e, 'GET', '/whatsapp/RT209/statut', alice.token)
  assert.equal(r.status, 200)
  // Moussa est le receveur du tour 2 et ne cotise pas : il sort de la liste.
  assert.deepEqual(r.body.aRelancer.map((x) => x.nom), ['Fatou', 'Ibrahim'])

  const stub = stubGraph()
  try {
    const p = await call(e, 'POST', '/whatsapp/RT209', alice.token, {})
    assert.equal(p.body.envoyes.length, 0)
    assert.equal(stub.appels.length, 0)
  } finally { stub.restaurer() }
})

// ── 4. Webhook ───────────────────────────────────────────────
test('webhook : la vérification hub.* renvoie le challenge, refuse le reste', async () => {
  const e = envWa({ WA_VERIFY_TOKEN: 'verif-123' })
  const ok = await worker.fetch(new Request(BASE + '/whatsapp/webhook?hub.mode=subscribe&hub.verify_token=verif-123&hub.challenge=chal-42'), e, {})
  assert.equal(ok.status, 200)
  assert.equal(await ok.text(), 'chal-42')

  const faux = await worker.fetch(new Request(BASE + '/whatsapp/webhook?hub.mode=subscribe&hub.verify_token=autre&hub.challenge=chal-42'), e, {})
  assert.equal(faux.status, 403)

  const sans = await worker.fetch(new Request(BASE + '/whatsapp/webhook?hub.mode=subscribe&hub.verify_token=verif-123&hub.challenge=chal-42'), envWa(), {})
  assert.equal(sans.status, 403, 'sans WA_VERIFY_TOKEN, la vérification est refusée')
})

test('webhook : la signature X-Hub-Signature-256 protège le récit', async () => {
  const e = envWa({ WA_APP_SECRET: 'secret-app' })
  const brut = JSON.stringify({ object: 'whatsapp_business_account', entry: [] })

  const mauvaise = await postWebhook(e, brut, 'sha256=deadbeef')
  assert.equal(mauvaise.status, 403)

  const bonne = await postWebhook(e, brut, 'sha256=' + createHmac('sha256', 'secret-app').update(brut).digest('hex'))
  assert.equal(bonne.status, 200)
  assert.equal(bonne.body.ok, true)

  // Sans WA_APP_SECRET, la signature n'est pas exigée.
  const sans = await postWebhook(envWa(), brut, null)
  assert.equal(sans.status, 200)
})

test('webhook : STOP désabonne, START réabonne', async () => {
  const e = envWa()
  await postWebhook(e, recitMessage('2250705060708', 'Stop'), null)
  assert.ok(e.DB.kv.has('wa/optout/2250705060708'), 'STOP enregistre le désabonnement')

  await postWebhook(e, recitMessage('2250705060708', 'START'), null)
  assert.ok(!e.DB.kv.has('wa/optout/2250705060708'), 'START efface le désabonnement')
})

test('webhook : les statuts mettent le journal à jour, 131047 désabonne', async () => {
  const e = envWa()
  const alice = await inscrire(e, 'alice@test.ci')
  await publier(e, 'RT210', alice.token, alice.user.uid)

  const stub = stubGraph({ messages: [{ id: 'wamid.statut-1' }] })
  try {
    const r = await call(e, 'POST', '/whatsapp/RT210', alice.token, {})
    assert.equal(r.body.envoyes.length, 1)
  } finally { stub.restaurer() }

  await postWebhook(e, recitStatut('wamid.statut-1', 'delivered'), null)
  let jr = await call(e, 'GET', '/whatsapp/RT210', alice.token)
  assert.equal(jr.body.items[0].statut, 'remis')

  await postWebhook(e, recitStatut('wamid.statut-1', 'failed', { errors: [{ code: 131047, title: 'Re-engagement message' }] }), null)
  jr = await call(e, 'GET', '/whatsapp/RT210', alice.token)
  assert.equal(jr.body.items[0].statut, 'echec')
  assert.match(jr.body.items[0].erreur, /Re-engagement/)
  assert.ok(e.DB.kv.has('wa/optout/2250705060708'), '131047 traité comme un désabonnement')
})
