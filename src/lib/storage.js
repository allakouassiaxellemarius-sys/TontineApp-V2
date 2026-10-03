const PREFIX = 'tontine_'

const listeners = new Set()
// Compteur de versions : incrémenté à chaque écriture locale. Sert à invalider
// les mémoires de calcul (getBilan).
let version = 0
export function getVersion() {
  return version
}
function notify() {
  version++
  listeners.forEach((fn) => {
    try { fn() } catch { /* ignore */ }
  })
}

function load(key, fallback) {
  try {
    const raw = localStorage.getItem(PREFIX + key)
    return raw ? JSON.parse(raw) : fallback
  } catch {
    return fallback
  }
}

function save(key, value) {
  try {
    localStorage.setItem(PREFIX + key, JSON.stringify(value))
    notify()
    return true
  } catch (e) {
    console.error('Erreur de sauvegarde', key, e)
    return false
  }
}

function remove(key) {
  try {
    localStorage.removeItem(PREFIX + key)
    notify()
  } catch {}
}

export function onStorageChange(fn) {
  listeners.add(fn)
  return () => listeners.delete(fn)
}

// Efface toutes les données de l'application sur cet appareil (session,
// groupes, réglages, PIN, consentement). Utilisé par la suppression de compte.
export function effacerDonneesLocales() {
  const cles = []
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i)
    if (k && k.startsWith(PREFIX)) cles.push(k)
  }
  for (const k of cles) {
    try {
      localStorage.removeItem(k)
    } catch { /* ignore */ }
  }
  notify()
  return cles.length
}

export const storage = { load, save, remove }

export function nextId(items) {
  return items.length ? Math.max(...items.map((i) => Number(i.id) || 0)) + 1 : 1
}

// Date locale au format YYYY-MM-DD : toISOString() bascule en UTC et décale
// le jour de 17h à minuit (selon le fuseau), ce qui fausse les échéances.
function localDateStr(d) {
  const p = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}

export function nowIso() {
  return new Date().toISOString()
}

export function todayStr() {
  return localDateStr(new Date())
}

export function addDays(dateStr, days) {
  const d = new Date(dateStr + 'T12:00:00')
  d.setDate(d.getDate() + days)
  return localDateStr(d)
}

export function dateISO(date) {
  if (!date) return ''
  if (typeof date === 'string') return date.slice(0, 10)
  return localDateStr(date)
}
