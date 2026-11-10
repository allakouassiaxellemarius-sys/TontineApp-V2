import { HUES } from './hues'
import { PALETTE_CLAIR, PALETTE_SOMBRE } from './charte'

// La palette claire n'a plus rien d'arbitraire : c'est la charte « Accueil.pdf ».
// Re-exportée pour les imports existants.
export { PALETTE_CLAIR, PALETTE_SOMBRE }

export function momentJournee() {
  const h = new Date().getHours()
  if (h >= 5 && h < 8) return 'aube'
  if (h >= 8 && h < 12) return 'matin'
  if (h >= 12 && h < 17) return 'apresmidi'
  if (h >= 17 && h < 20) return 'soir'
  return 'nuit'
}

export function hueFromWeatherCode(code) {
  if (!code && code !== 0) return 'defaut'
  if (code >= 200 && code < 300) return 'orage'
  if (code >= 300 && code < 400) return 'bruine'
  if (code >= 500 && code < 600) return 'pluie'
  if (code >= 600 && code < 700) return 'neige'
  if (code >= 700 && code < 800) return 'brume'
  if (code === 800) return 'degage'
  if (code === 801) return 'peu_nuageux'
  if (code >= 802) return 'nuageux'
  return 'defaut'
}

export function palettePour(code, moment) {
  const hue = hueFromWeatherCode(code)
  // « defaut » = pas de météo retenue : c'est la charte de l'accueil qui peint
  // l'app, plus la rampe bleue « Akan » de HUES. Les teintes météo restent
  // atteignables quand l'option « thème météo » est activée.
  if (hue === 'defaut') return PALETTE_SOMBRE
  const palettes = HUES[hue] || HUES.defaut
  return palettes[moment] || palettes.matin
}

export function paletteMeta(code, moment) {
  return palettePour(code, moment).meta || PALETTE_SOMBRE.meta || { hue: 'Tontine', icon: '🎨' }
}

export function appliquerPalette(palette, { clair = false } = {}) {
  const p = clair ? PALETTE_CLAIR : palette
  const root = document.documentElement
  root.style.setProperty('--bg', p.bg)
  root.style.setProperty('--bg-card', p.bgCard)
  root.style.setProperty('--border', p.border)
  root.style.setProperty('--border-subtle', p.borderSubtle)
  root.style.setProperty('--accent', p.accent)
  root.style.setProperty('--accent-light', p.accentLight)
  root.style.setProperty('--text', p.text)
  root.style.setProperty('--text-dim', p.textDim)
  root.style.setProperty('--text-muted', p.textMuted)
  root.style.setProperty('--success', p.success)
  root.style.setProperty('--error', p.error)
}

// Mode léger (téléphones modestes / batteries faibles) : retire le fond
// décoratif flou via la classe .lite (voir index.css). L'app n'anime plus rien.
export function appliquerAnimationsReduites(actif) {
  document.documentElement.classList.toggle('lite', !!actif)
}

export function getWeatherThemePref() {
  try {
    return localStorage.getItem('tontine_weather_theme') === 'actif'
  } catch {
    return false
  }
}

export function setWeatherThemePref(actif) {
  try {
    localStorage.setItem('tontine_weather_theme', actif ? 'actif' : 'inactif')
  } catch { /* ignore */ }
}

export function isThemeClair() {
  try {
    const choix = localStorage.getItem('tontine_theme') || 'sombre'
    const actif = choix === 'auto'
      ? (window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'sombre' : 'clair')
      : choix
    return actif === 'clair'
  } catch {
    return false
  }
}

export const WEATHER_TTL = 1800 * 1000
const KEY_CODE = 'tontine_weather_code'
const KEY_MOMENT = 'tontine_weather_moment'
const KEY_TS = 'tontine_weather_ts'

export function lireCacheMeteo() {
  try {
    const ts = parseInt(localStorage.getItem(KEY_TS) || '0', 10)
    if (Date.now() - ts > WEATHER_TTL) return null
    return {
      code: parseInt(localStorage.getItem(KEY_CODE) || '0', 10),
      moment: localStorage.getItem(KEY_MOMENT) || momentJournee(),
    }
  } catch {
    return null
  }
}

export function ecrireCacheMeteo(code, moment) {
  try {
    localStorage.setItem(KEY_CODE, String(code))
    localStorage.setItem(KEY_MOMENT, moment)
    localStorage.setItem(KEY_TS, String(Date.now()))
  } catch { /* ignore */ }
}
