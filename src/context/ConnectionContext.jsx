import { createContext, useContext, useEffect, useState } from 'react'
import { setLectureSeule } from '../lib/lectureSeule'

export const ConnectionContext = createContext({
  enLigne: true,
  modeHorsLigne: false,
  demandeHorsLigne: false,
})

export function useConnection() {
  return useContext(ConnectionContext)
}

export function ConnectionProvider({ children }) {
  const [enLigne, setEnLigne] = useState(() => (typeof navigator !== 'undefined' ? navigator.onLine !== false : true))
  // null = pas encore demandé, true = mode hors ligne accepté, false = refusé (rester actif).
  const [confirmeHorsLigne, setConfirmeHorsLigne] = useState(null)

  useEffect(() => {
    if (typeof window === 'undefined') return
    const on = () => setEnLigne(true)
    const off = () => setEnLigne(false)
    window.addEventListener('online', on)
    window.addEventListener('offline', off)

    return () => {
      window.removeEventListener('online', on)
      window.removeEventListener('offline', off)
    }
  }, [])

  // Retour de connexion : on réarme la demande pour la prochaine panne
  // et on sort du mode lecture seule.
  useEffect(() => {
    if (enLigne) {
      setConfirmeHorsLigne(null)
      setLectureSeule(false)
    }
  }, [enLigne])

  const modeHorsLigne = !enLigne && confirmeHorsLigne === true
  const demandeHorsLigne = !enLigne && confirmeHorsLigne === null

  return (
    <ConnectionContext.Provider
      value={{
        enLigne,
        modeHorsLigne,
        demandeHorsLigne,
        confirmerHorsLigne: () => {
          setConfirmeHorsLigne(true)
          setLectureSeule(true)
        },
        resterActif: () => {
          // « Rester actif » considère l'app comme en ligne : les écritures
          // locales restent autorisées même si navigator.onLine est incertain.
          setConfirmeHorsLigne(false)
          setLectureSeule(false)
          setEnLigne(true)
        },
      }}
    >
      {children}
    </ConnectionContext.Provider>
  )
}
