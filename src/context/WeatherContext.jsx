import { createContext, useContext, useEffect, useState, useCallback, useRef } from 'react'
import {
  appliquerPalette, palettePour, paletteMeta, momentJournee, isThemeClair,
  getWeatherThemePref, setWeatherThemePref, lireCacheMeteo, ecrireCacheMeteo, WEATHER_TTL,
} from '../lib/theme'

const WeatherContext = createContext(null)

const OWM_KEY = '4d8fb5b93d4af21d66a2948710284366'

export function WeatherThemeProvider({ children }) {
  const [actif, setActif] = useState(() => getWeatherThemePref())
  const [meteoCode, setMeteoCode] = useState(0)
  const [moment, setMoment] = useState(() => momentJournee())
  const [meta, setMeta] = useState({ hue: 'Akan', icon: '🎨' })
  const [loading, setLoading] = useState(false)
  const dernierFetch = useRef(0)

  const appliquerMeteo = useCallback((code, mom) => {
    const palette = palettePour(code, mom)
    const m = paletteMeta(code, mom)
    appliquerPalette(palette, { clair: isThemeClair() })
    setMeteoCode(code)
    setMoment(mom)
    setMeta(m)
  }, [])

  const rafraichir = useCallback(async () => {
    if (!actif) return
    const now = Date.now()
    if (now - dernierFetch.current < WEATHER_TTL) return
    dernierFetch.current = now
    const cache = lireCacheMeteo()
    if (cache) {
      appliquerMeteo(cache.code, cache.moment)
      return
    }
    setLoading(true)
    try {
      if (!navigator.geolocation) {
        appliquerMeteo(0, momentJournee())
        return
      }
      const pos = await new Promise((resolve, reject) => {
        navigator.geolocation.getCurrentPosition(resolve, reject, { timeout: 8000, maximumAge: WEATHER_TTL })
      })
      if (!actif) return
      const { latitude, longitude } = pos.coords
      const res = await fetch(`https://api.openweathermap.org/data/2.5/weather?lat=${latitude}&lon=${longitude}&appid=${OWM_KEY}&units=metric&lang=fr`)
      if (!res.ok) throw new Error('API error')
      if (!actif) return
      const code = (await res.json()).weather?.[0]?.id || 0
      const mom = momentJournee()
      ecrireCacheMeteo(code, mom)
      appliquerMeteo(code, mom)
    } catch {
      if (!actif) return
      appliquerMeteo(0, momentJournee())
    } finally {
      setLoading(false)
    }
  }, [actif, appliquerMeteo])

  useEffect(() => {
    if (!actif) {
      const mom = momentJournee()
      appliquerMeteo(0, mom)
    } else {
      rafraichir()
    }
    // La palette suit le moment de la journée même sans thème météo actif.
    const id = setInterval(() => {
      const mom = momentJournee()
      setMoment(mom)
      if (actif) rafraichir()
      else appliquerMeteo(0, mom)
    }, 300 * 1000)
    return () => clearInterval(id)
  }, [actif, rafraichir, appliquerMeteo])

  const basculer = useCallback((valeur) => {
    setActif(valeur)
    setWeatherThemePref(valeur)
    if (valeur) {
      dernierFetch.current = 0
      rafraichir()
    } else {
      appliquerMeteo(0, momentJournee())
    }
  }, [rafraichir, appliquerMeteo])

  return (
    <WeatherContext.Provider value={{ actif, basculer, meteoCode, moment, meta, loading }}>
      {children}
    </WeatherContext.Provider>
  )
}

export function useWeatherTheme() {
  const ctx = useContext(WeatherContext)
  if (!ctx) throw new Error('useWeatherTheme doit être utilisé dans WeatherThemeProvider')
  return ctx
}
