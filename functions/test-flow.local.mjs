// Test local du flux Flutterwave via les émulateurs Firebase.
// Le script démarre l'émulateur, attend qu'il soit prêt, exécute les tests,
// puis arrête l'émulateur. Tout se passe dans un seul process Node.
import admin from 'firebase-admin'
import net from 'net'
import crypto from 'crypto'
import fs from 'fs'
import { spawn, execSync } from 'child_process'

// Le child emulator (et son java) peut émettre des évènements résiduels
// après l'arrêt ; on les ignore pour ne pas faire échouer le code de sortie.
process.on('unhandledRejection', () => {})
process.on('uncaughtException', () => {})

const PROJECT = 'tontine-manager-f3965'
const CODE = 'TEST01'
const WEBHOOK = `http://127.0.0.1:5001/${PROJECT}/us-central1/flutterwaveWebhook`
const EMU_CMD = 'firebase emulators:start --only functions,database,auth --project ' + PROJECT

function waitPort(port, host = '127.0.0.1', timeoutMs = 150000) {
  const start = Date.now()
  return new Promise((resolve, reject) => {
    const tryOnce = () => {
      const s = net.connect(port, host)
      s.once('connect', () => { s.destroy(); resolve(true) })
      s.once('error', () => {
        s.destroy()
        if (Date.now() - start > timeoutMs) reject(new Error('port ' + port + ' timeout'))
        else setTimeout(tryOnce, 1000)
      })
    }
    tryOnce()
  })
}

let emu = null
function startEmulator() {
  emu = spawn(EMU_CMD, {
    shell: true,
    env: {
      ...process.env,
      FLW_SECRET_KEY: '',
      FLW_PUBLIC_KEY: '',
      FLW_ENCRYPTION_KEY: '',
      FLW_TRANSFER_SECRET: '',
      FLW_WEBHOOK_SECRET: 'testhash',
      FLW_MODE: 'sandbox',
      FIREBASE_AUTH_EMULATOR_HOST: '127.0.0.1:9099',
    },
  })
  emu.stdout.on('data', (d) => { fs.appendFileSync('emu-out.log', d); process.stdout.write('[emu] ' + d) })
  emu.stderr.on('data', (d) => { fs.appendFileSync('emu-err.log', d); process.stderr.write('[emu] ' + d) })
  emu.on('error', () => {})
  emu.on('exit', () => {})
}

function stopEmulator() {
  killEmulators()
}

function killTree(pid) {
  try { execSync(`taskkill /F /T /PID ${pid}`, { windowsHide: true, stdio: 'ignore', timeout: 8000 }) } catch {}
}
function killEmulators() {
  if (emu) { killTree(emu.pid); emu = null }
  // Tue tout java restant (emulator RTDB) et tout firebase.cmd orphelin.
  try { execSync('taskkill /F /IM java.exe /T', { windowsHide: true, stdio: 'ignore', timeout: 8000 }) } catch {}
  try { execSync('taskkill /F /IM firebase.cmd /T', { windowsHide: true, stdio: 'ignore', timeout: 8000 }) } catch {}
}

// ---------- helpers RTDB ----------
const { privateKey } = crypto.generateKeyPairSync('rsa', {
  modulusLength: 2048,
  privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
})
process.env.FIREBASE_DATABASE_EMULATOR_HOST = '127.0.0.1:9000'
admin.initializeApp({
  credential: admin.credential.cert({ projectId: PROJECT, clientEmail: 'fake@fake.com', privateKey }),
  databaseURL: `https://${PROJECT}-default-rtdb.firebaseio.com`,
})
const db = admin.database()
process.env.FIREBASE_AUTH_EMULATOR_HOST = '127.0.0.1:9099'
const put = (p, v) => db.ref(p).set(v)
const get = async (p) => (await db.ref(p).once('value')).val()
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

// Mint un vrai ID token via l'émulateur Auth (échange custom token → idToken).
async function getIdToken(uid) {
  try { await admin.auth().createUser({ uid }) } catch {}
  const custom = await admin.auth().createCustomToken(uid)
  const r = await fetch('http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken?key=fake', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token: custom, returnSecureToken: true }),
  })
  const j = await r.json()
  if (!j.idToken) throw new Error('idToken manquant: ' + JSON.stringify(j))
  return j.idToken
}

async function postWebhook(payload, hash) {
  const r = await fetch(WEBHOOK, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'verif-hash': hash },
    body: JSON.stringify(payload),
  })
  return { status: r.status, body: await r.text() }
}
const payload = (flwRef, narration) => ({
  event: 'charge.completed',
  data: { status: 'successful', flw_ref: flwRef, tx_ref: 'tx_' + flwRef, amount: 1000, currency: 'NGN', account_number: '0000000000', narration },
})

let ok = true
const assert = (cond, msg) => { console.log((cond ? '✅' : '❌') + ' ' + msg); if (!cond) ok = false }

async function runTests() {
  console.log('— 1) Création du groupe (déclenche le compte virtuel auto) —')
  // Nettoyage préalable pour forcer le onValueCreated même si la DB persiste.
  await put('tontines/' + CODE, null)
  await put('comptesVirtuels/' + CODE, null)
  await put('comptesParNumero/0000000000', null)
  await sleep(400)
  await put('tontines/' + CODE, {
    groupe: { proprietaire: 'uid1', nom: 'Test', coGerants: {}, montantCotisation: 1000 },
    membres: [{ id: 1, nom: 'A', uid: 'uid1' }, { id: 2, nom: 'B', uid: 'uid2' }],
    tours: [{ id: 1, numero: 1, statut: 'en_attente', membreId: 1 }],
  })
  let compte = null
  for (let i = 0; i < 40; i++) { compte = await get('comptesVirtuels/' + CODE); if (compte) break; await sleep(400) }
  assert(compte && compte.accountNumber, 'Compte virtuel créé automatiquement')
  console.log('   compte =', JSON.stringify(compte))

  console.log('— 2) Webhook avec référence valide (réconciliation auto) —')
  await put('references/' + CODE + '/REF-ABCDEFGHIJKL', { uid: 'uid1', membreId: 1 })
  let r = await postWebhook(payload('FLW1', 'REF-ABCDEFGHIJKL merci'), 'testhash')
  console.log('   statut', r.status, r.body)
  await sleep(900)
  const paiement = (await get('paiements/' + CODE) || {}).FLW1
  assert(paiement && paiement.statut === 'paye' && paiement.membreId === 1 && paiement.tourId === 1, 'Paiement auto-réconcilié vers membre 1 / tour 1')

  console.log('— 3) Idempotence (même flw_ref) —')
  r = await postWebhook(payload('FLW1', 'REF-ABCDEFGHIJKL merci'), 'testhash')
  console.log('   statut', r.status)
  const nb = Object.keys((await get('paiements/' + CODE)) || {}).length
  assert(nb === 1, 'Pas de doublon (1 seul paiement)')
  assert(!!(await get('traites/FLW1')), 'flw_ref marqué comme traité')

  console.log('— 4) Signature invalide (doit être rejetée 401) —')
  r = await postWebhook(payload('FLWX', 'REF-ABCDEFGHIJKL'), 'mauvais_hash')
  assert(r.status === 401, 'Webhook rejette une signature invalide (401, recu=' + r.status + ')')

  console.log('— 5) Paiement SANS référence (réconciliation manuelle) —')
  r = await postWebhook(payload('FLW2', 'virement sans ref'), 'testhash')
  console.log('   statut', r.status)
  await sleep(900)
  const recon = (await get('reconciliation/' + CODE) || {}).FLW2
  assert(recon && recon.statutReconciliation === 'en_attente', 'Paiement non reconnu → reconciliation/{code}')

  console.log('— 6) Réconciliation manuelle réelle (flutterwaveReconcile) —')
  const idToken = await getIdToken('uid1') // proprietaire → rôle responsable
  r = await fetch(`http://127.0.0.1:5001/${PROJECT}/us-central1/flutterwaveReconcile`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + idToken },
    body: JSON.stringify({ code: CODE, reconciliationId: 'FLW2', membreId: 2, tourId: 1 }),
  })
  console.log('   statut', r.status, await r.text())
  await sleep(900)
  const paiementRecon = (await get('paiements/' + CODE) || {}).FLW2
  assert(paiementRecon && paiementRecon.membreId === 2 && paiementRecon.tourId === 1 && paiementRecon.reconnu === true,
    'Réconciliation manuelle → paiement FLW2 assigné membre 2 / tour 1')
  assert(!(await get('reconciliation/' + CODE + '/FLW2')), 'Entrée reconciliation/FLW2 supprimée après traitement')


  console.log(ok ? '\n🎉 TOUS LES TESTS PASSENT' : '\n⚠️ CERTAINS TESTS ÉCHEC')
}

;(async () => {
  try {
    killEmulators()
    startEmulator()
    console.log('attente de l\'émulateur (5001 + 9000 + 9099)...')
    await waitPort(9000)
    await waitPort(5001)
    await waitPort(9099)
    console.log('émulateur prêt')
    await sleep(6000)
    await runTests()
  } catch (e) {
    console.error('ERREUR:', e)
    ok = false
  } finally {
    stopEmulator()
  }
  const code = ok ? 0 : 1
  process.exit(code)
})()
