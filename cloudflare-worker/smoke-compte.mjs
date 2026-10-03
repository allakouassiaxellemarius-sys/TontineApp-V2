// Vérifie DELETE /compte sur le worker déployé, avec un compte jetable.
const BASE = 'https://tontine-sync.tontine-manager.workers.dev'
const sel = String(Date.now()).slice(-6)
const email = 'qoder.smoke.' + sel + '@exemple.com'
const code = 'SM' + sel
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

const inscrit = await j('POST', '/auth2/register', { email, password: mdp, displayName: 'Compte de test' })
console.log('register', inscrit.status)
if (inscrit.status !== 200) process.exit(1)
const { token, user } = inscrit.data

const snap = {
  format: 2,
  groupe: { codeUnique: code, nom: 'Groupe jetable', proprietaire: user.uid, montantCotisation: 1000, coGerants: {} },
  membres: [], tours: [], cotisations: [], prets: [],
}
console.log('put groupe', (await j('PUT', '/tontines/' + code + '', snap, token)).status)
console.log('get groupe', (await j('GET', '/tontines/' + code + '', undefined, token)).status)

console.log('delete sans mdp', (await j('DELETE', '/compte', { confirmation: true }, token)).status)
console.log('delete sans confirmation', (await j('DELETE', '/compte', { password: mdp }, token)).status)
const suppr = await j('DELETE', '/compte', { password: mdp, confirmation: true }, token)
console.log('delete ok', suppr.status, JSON.stringify(suppr.data))
const apres = await j('GET', '/tontines/' + code, undefined, token)
console.log('get groupe apres', apres.status, apres.status === 200 ? 'ENCORE ACCESSIBLE' : 'accès coupé')
console.log('re-login apres', (await j('POST', '/auth2/login', { email, password: mdp })).status)
