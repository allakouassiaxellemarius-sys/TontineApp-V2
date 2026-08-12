const PREFIX = 'tontine_'

const listeners = new Set()
function notify() {
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
  } catch (e) {
    console.error('Erreur de sauvegarde', key, e)
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

export const storage = { load, save, remove }

export function nextId(items) {
  return items.length ? Math.max(...items.map((i) => Number(i.id) || 0)) + 1 : 1
}

export function nowIso() {
  return new Date().toISOString()
}

export function todayStr() {
  const d = new Date()
  return d.toISOString().slice(0, 10)
}

export function addDays(dateStr, days) {
  const d = new Date(dateStr + 'T12:00:00')
  d.setDate(d.getDate() + days)
  return d.toISOString().slice(0, 10)
}

export function dateISO(date) {
  if (!date) return ''
  if (typeof date === 'string') return date.slice(0, 10)
  return date.toISOString().slice(0, 10)
}
