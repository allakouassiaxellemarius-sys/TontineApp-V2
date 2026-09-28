import { useCallback, useEffect, useState } from 'react'

const CLE = 'tontine_objectifs'

function lire() {
  try {
    const raw = localStorage.getItem(CLE)
    const arr = raw ? JSON.parse(raw) : []
    return Array.isArray(arr) ? arr : []
  } catch {
    return []
  }
}

function trier(liste) {
  return [...liste].sort((a, b) => (a.termine === b.termine ? a.ordre - b.ordre : a.termine ? 1 : -1))
}

export function useObjectifs() {
  const [objectifs, setObjectifs] = useState(() => lire())

  useEffect(() => {
    try {
      localStorage.setItem(CLE, JSON.stringify(objectifs))
    } catch { /* ignore */ }
  }, [objectifs])

  const ajouter = useCallback((obj) => {
    setObjectifs((prev) => trier([...prev, { id: Date.now() + '-' + Math.random().toString(36).slice(2, 6), ordre: prev.length, termine: false, ...obj }]))
  }, [])

  const modifier = useCallback((id, patch) => {
    setObjectifs((prev) => trier(prev.map((o) => (o.id === id ? { ...o, ...patch } : o))))
  }, [])

  const supprimer = useCallback((id) => {
    setObjectifs((prev) => prev.filter((o) => o.id !== id))
  }, [])

  return { objectifs, ajouter, modifier, supprimer }
}
