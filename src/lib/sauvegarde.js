// ═══════════════════════════════════════════════════════════════
// Sauvegarde complète locale (export / import JSON)
// ---------------------------------------------------------------
// Exporte l'intégralité des données de l'appareil (groupes, membres,
// tours, cotisations, épargnes, paramètres) dans un fichier JSON
// partageable, et permet de le réimporter sur ce même appareil ou un
// autre. Complète la sauvegarde cloud (compte Google).
// ═══════════════════════════════════════════════════════════════
import { storage } from './storage'
import { getSettings } from './format'
import { sauvegarderFichier } from './export'

const FORMAT = 'tontine-manager-backup'
const VERSION = 1

const CLES_DONNEES = ['groups', 'membres', 'tours', 'cotisations', 'prets', 'epargnes']

// Rassemble toutes les données dans un objet sérialisable.
export function construireSauvegarde() {
  const data = {}
  for (const cle of CLES_DONNEES) data[cle] = storage.load(cle, [])
  data.settings = getSettings()
  return {
    format: FORMAT,
    version: VERSION,
    exportLe: new Date().toISOString(),
    data,
  }
}

// Génère le fichier JSON et l'enregistre / le partage.
export async function exporterSauvegarde() {
  const json = JSON.stringify(construireSauvegarde(), null, 2)
  const stamp = new Date().toISOString().slice(0, 10)
  await sauvegarderFichier(new Blob([json], { type: 'application/json' }), `tontine-manager-sauvegarde-${stamp}.json`)
  return { ok: true }
}

// Valide un texte JSON et renvoie { ok, raison?, detail? }.
export function validerSauvegarde(texte) {
  let obj
  try {
    obj = JSON.parse(texte)
  } catch {
    return { ok: false, raison: 'Fichier illisible : ce n\u2019est pas un JSON valide.' }
  }
  if (!obj || obj.format !== FORMAT) {
    return { ok: false, raison: 'Ce fichier n\u2019est pas une sauvegarde Tontine Manager.' }
  }
  const d = obj.data || {}
  return { ok: true, data: d }
}

// Remplace les données locales par celles de la sauvegarde.
// Renvoie un décompte des éléments restaurés.
export function appliquerSauvegarde(texte) {
  const v = validerSauvegarde(texte)
  if (!v.ok) return v
  const d = v.data || {}
  let total = 0
  for (const cle of CLES_DONNEES) {
    const valeur = Array.isArray(d[cle]) ? d[cle] : []
    storage.save(cle, valeur)
    total += valeur.length
  }
  if (d.settings && typeof d.settings === 'object') {
    const s = { ...getSettings(), ...d.settings }
    s.pinActive = false
    s.pinHash = null
    s.pinSalt = null
    s.totpActive = false
    s.totpSecret = null
    localStorage.setItem('tontine_settings', JSON.stringify(s))
  }
  return { ok: true, detail: `${total} élément(s) restauré(s).` }
}

// Lit un fichier via <input type="file"> (fonctionne aussi en WebView Capacitor).
export function lireFichier(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onerror = () => reject(reader.error || new Error('Lecture impossible'))
    reader.onload = () => resolve(String(reader.result))
    reader.readAsText(file)
  })
}
