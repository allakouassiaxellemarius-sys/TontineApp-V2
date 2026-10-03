// ═══════════════════════════════════════════════════════════════
// Stockage chiffré du jeton de session
// ---------------------------------------------------------------
// Le JWT n'est plus écrit en clair dans localStorage : il est scellé
// avec une clé AES-GCM NON EXTRACTIBLE (WebCrypto) persistée dans
// IndexedDB. Une injection de script qui lirait localStorage ne récupère
// donc que du texte chiffré, et la clé ne peut pas être sérialisée.
//
// Si le navigateur/webview refuse IndexedDB ou WebCrypto, on retombe sur
// localStorage : la connexion reste possible, quitte à être moins sûre.
// ═══════════════════════════════════════════════════════════════

const NOM_BDD = 'tontine_securite'
const MAGASIN = 'cles'
const CLE_JETON = 'session'
const CLE_IV = 'session_iv'

function disponible() {
  return typeof indexedDB !== 'undefined' && !!(globalThis.crypto && globalThis.crypto.subtle)
}

function ouvrirBdd() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(NOM_BDD, 1)
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(MAGASIN)) req.result.createObjectStore(MAGASIN)
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
    req.onblocked = () => reject(new Error('IndexedDB bloqué'))
  })
}

function lire(db, cle) {
  return new Promise((resolve, reject) => {
    const req = db.transaction(MAGASIN, 'readonly').objectStore(MAGASIN).get(cle)
    req.onsuccess = () => resolve(req.result === undefined ? null : req.result)
    req.onerror = () => reject(req.error)
  })
}

function ecrire(db, cle, valeur) {
  return new Promise((resolve, reject) => {
    const req = db.transaction(MAGASIN, 'readwrite').objectStore(MAGASIN).put(valeur, cle)
    req.onsuccess = () => resolve(true)
    req.onerror = () => reject(req.error)
  })
}

function supprimer(db, cle) {
  return new Promise((resolve, reject) => {
    const req = db.transaction(MAGASIN, 'readwrite').objectStore(MAGASIN).delete(cle)
    req.onsuccess = () => resolve(true)
    req.onerror = () => reject(req.error)
  })
}

// La clé est générée une seule fois et n'est jamais exportable.
async function obtenirCle(db) {
  const existante = await lire(db, CLE_JETON + '_clef')
  if (existante) return existante
  const clef = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt'])
  await ecrire(db, CLE_JETON + '_clef', clef)
  return clef
}

export async function enregistrerJeton(token) {
  if (!disponible()) throw new Error('Stockage sécurisé indisponible')
  const db = await ouvrirBdd()
  try {
    const clef = await obtenirCle(db)
    const iv = crypto.getRandomValues(new Uint8Array(12))
    const données = await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv },
      clef,
      new TextEncoder().encode(String(token))
    )
    await ecrire(db, CLE_IV, iv)
    await ecrire(db, CLE_JETON, new Uint8Array(données))
    return true
  } finally {
    db.close()
  }
}

export async function lireJeton() {
  if (!disponible()) return null
  const db = await ouvrirBdd()
  try {
    const [chiffre, iv, clef] = await Promise.all([
      lire(db, CLE_JETON),
      lire(db, CLE_IV),
      lire(db, CLE_JETON + '_clef'),
    ])
    if (!chiffre || !iv || !clef) return null
    const clair = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, clef, chiffre)
    return new TextDecoder().decode(clair)
  } finally {
    db.close()
  }
}

export async function effacerJeton() {
  if (!disponible()) return false
  const db = await ouvrirBdd()
  try {
    await supprimer(db, CLE_JETON)
    await supprimer(db, CLE_IV)
    return true
  } finally {
    db.close()
  }
}
