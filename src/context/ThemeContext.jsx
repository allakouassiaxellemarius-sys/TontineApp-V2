import { createContext, useContext, useEffect, useState, useCallback } from 'react'

const ThemeContext = createContext(null)

const STORAGE_KEY = 'tontine_theme'

function getSysteme() {
  return window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'sombre' : 'clair'
}

export function ThemeProvider({ children }) {
  const [choix, setChoix] = useState(() => {
    try {
      return localStorage.getItem(STORAGE_KEY) || 'auto'
    } catch {
      return 'auto'
    }
  })

  const appliquer = useCallback((valeur) => {
    const actif = valeur === 'auto' ? getSysteme() : valeur
    document.documentElement.classList.toggle('dark', actif === 'sombre')
    const meta = document.querySelector('meta[name="theme-color"]')
    if (meta) meta.setAttribute('content', actif === 'sombre' ? '#141417' : '#43a047')
  }, [])

  useEffect(() => {
    appliquer(choix)
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
