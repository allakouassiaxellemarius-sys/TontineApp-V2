import { HUES } from './hues'

export const PALETTE_CLAIR = { bg: '250 249 246', bgCard: '255 255 252', border: '214 208 195', borderSubtle: '228 223 212', accent: '22 163 74', accentLight: '34 197 94', text: '43 42 60', textDim: '96 93 118', textMuted: '140 136 158', success: '46 138 90', error: '190 84 52' }

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
  const palettes = HUES[hue] || HUES.defaut
  return palettes[moment] || palettes.matin
}

export function paletteMeta(code, moment) {
  return palettePour(code, moment).meta || { hue: 'Akan', icon: '🎨' }
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
  root.style.transition = 'background-color 1.2s ease, color 0.8s ease'
}

// Mode léger (téléphones modestes / batteries faibles) : coupe les
// animations et halos coûteux via la classe .lite (voir index.css).
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
