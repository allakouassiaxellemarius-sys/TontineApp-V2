import { createContext, useContext, useEffect, useState, useCallback } from 'react'
import { appliquerPalette, palettePour, momentJournee, isThemeClair, appliquerAnimationsReduites } from '../lib/theme'
import { getSettings } from '../lib/format'

const ThemeContext = createContext(null)

const STORAGE_KEY = 'tontine_theme'

function getSysteme() {
  return window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'sombre' : 'clair'
}

export function ThemeProvider({ children }) {
  const [choix, setChoix] = useState(() => {
    try {
      return localStorage.getItem(STORAGE_KEY) || 'sombre'
    } catch {
      return 'sombre'
    }
  })

  const appliquer = useCallback((valeur) => {
    const actif = valeur === 'auto' ? getSysteme() : valeur
    const sombre = actif === 'sombre'
    document.documentElement.classList.toggle('dark', sombre)
    const meta = document.querySelector('meta[name="theme-color"]')
    if (meta) meta.setAttribute('content', sombre ? '#061626' : '#f7f9fb')
  }, [])

  useEffect(() => {
    appliquer(choix)
    appliquerPalette(palettePour(0, momentJournee()), { clair: isThemeClair() })
    try { appliquerAnimationsReduites(getSettings().animationsReduites) } catch { /* ignore */ }
    if (choix !== 'auto') return
    const mq = window.matchMedia?.('(prefers-color-scheme: dark)')
    if (!mq) return
    const onChange = () => appliquer('auto')
    mq.addEventListener?.('change', onChange)
    return () => mq.removeEventListener?.('change', onChange)
  }, [choix, appliquer])

  const setChoixPersiste = (valeur) => {
    setChoix(valeur)
    try {
      localStorage.setItem(STORAGE_KEY, valeur)
    } catch { /* ignore */ }
  }

  return (
    <ThemeContext.Provider value={{ choix, setChoix: setChoixPersiste }}>
      {children}
    </ThemeContext.Provider>
  )
}

export function useTheme() {
  const ctx = useContext(ThemeContext)
  if (!ctx) throw new Error('useTheme doit être utilisé dans ThemeProvider')
  return ctx
}
