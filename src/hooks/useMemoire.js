import { useState, useEffect, useCallback } from 'react'

const CLE = 'tontine_memoire'

export function useMemoire() {
  const [memoire, setMemoire] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem(CLE)) || {}
    } catch {
      return {}
    }
  })

  useEffect(() => {
    try {
      localStorage.setItem(CLE, JSON.stringify(memoire))
    } catch { /* ignore */ }
  }, [memoire])

  const set = useCallback((patch) => setMemoire((m) => ({ ...m, ...patch })), [])

  // Résumé texte envoyé au modèle comme « mémoire »
  const texte = useCallback(() => {
    const parts = []
    if (memoire.nom) parts.push("Nom de l'utilisateur: " + memoire.nom)
    if (memoire.role) parts.push('Rôle: ' + memoire.role)
    if (memoire.langue) parts.push('Langue préférée: ' + memoire.langue)
    if (memoire.rappel) parts.push('Message de rappel par défaut: ' + memoire.rappel)
    if (memoire.notes) parts.push('Préférences: ' + memoire.notes)
    return parts.join('. ')
  }, [memoire])

  return { memoire, set, texte }
}
