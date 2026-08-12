import { createContext, useContext, useCallback, useEffect, useState } from 'react'
import { getGroups } from '../lib/db'
import { getSettings } from '../lib/format'
import { onStorageChange } from '../lib/storage'

const DataContext = createContext(null)

export function DataProvider({ children }) {
  const [version, setVersion] = useState(0)
  const [settings, setSettings] = useState(() => getSettings())

  const refresh = useCallback(() => {
    setSettings(getSettings())
    setVersion((v) => v + 1)
  }, [])

  // Temps réel : chaque écriture dans le stockage rafraîchit les données.
  useEffect(() => onStorageChange(refresh), [refresh])

  const groups = getGroups()

  return (
    <DataContext.Provider value={{ version, settings, groups, refresh }}>
      {children}
    </DataContext.Provider>
  )
}

export const useData = () => useContext(DataContext)
