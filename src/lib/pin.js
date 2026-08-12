export async function sha256Hex(text) {
  try {
    const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text))
    return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, '0')).join('')
  } catch {
    let h1 = 0
    let h2 = 0
    for (let i = 0; i < text.length; i++) {
      h1 = (Math.imul(31, h1) + text.charCodeAt(i)) | 0
      h2 = (Math.imul(2654435761, h2) ^ text.charCodeAt(i)) | 0
    }
    return 'fb_' + Math.abs(h1).toString(36) + '_' + Math.abs(h2).toString(36) + '_' + text.length
  }
}

function randomSalt() {
  const arr = new Uint8Array(16)
  if (crypto && crypto.getRandomValues) crypto.getRandomValues(arr)
  return Array.from(arr).map((b) => b.toString(16).padStart(2, '0')).join('')
}

export function isValidPin(pin) {
  return /^\d{4,6}$/.test(pin)
}

// Schéma v2 : dérivation itérée (10000 × SHA-256) pour ralentir le
// brute-force hors ligne d'un code à 4-6 chiffres. Anciens hashs (une
// seule passe, sans préfixe) restent vérifiables (voir verifyPin).
const SCHEME = 'k10000:'

export async function hashPin(pin, salt) {
  let h = await sha256Hex(salt + ':' + pin)
  for (let i = 1; i < 10000; i++) h = await sha256Hex(h)
  return SCHEME + h
}

export async function makePinRecord(pin) {
  const salt = randomSalt()
  const hash = await hashPin(pin, salt)
  return { salt, hash }
}

export async function verifyPin(pin, salt, hash) {
  if (!salt || !hash) return false
  if (hash.indexOf(SCHEME) === 0) {
    const h = await hashPin(pin, salt)
    return h === hash
  }
  const legacy = await sha256Hex(salt + ':' + pin)
  return legacy === hash
}
