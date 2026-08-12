import { useEffect, useRef } from 'react'
import { useData } from '../context/DataContext'
import { useAuth } from '../context/AuthContext'
import { useConnection } from '../context/ConnectionContext'
import { sauvegarderCompte } from '../lib/syncEngine'
import { firebaseConfigure } from '../lib/firebaseConfig'

// Sauvegarde cloud automatique : pousse les groupes synchronisés du compte
// vers Firebase toutes les 5 minutes (tant qu'un changement a eu lieu) et à
// chaque retour de connexion. Complète la publication temps réel (à chaque
// modification) en couvrant les périodes hors ligne ou déconnectées.
export function useSauvegardeAuto() {
  const { groups } = useData()
  const { utilisateur } = useAuth()
  const { enLigne } = useConnection()
  const dirty = useRef(true)
  const dernierUid = useRef(null)

  useEffect(() => {
    dirty.current = true
  }, [groups])

  useEffect(() => {
    if (!firebaseConfigure() || !enLigne) return
    const uid = utilisateur ? utilisateur.uid : null
    if (!uid) return
    if (uid === dernierUid.current && !dirty.current) return
    dernierUid.current = uid
    dirty.current = false
    sauvegarderCompte(uid)
  }, [enLigne, utilisateur])

  useEffect(() => {
    if (!firebaseConfigure() || !enLigne) return
    const timer = setInterval(() => {
      if (!dirty.current) return
      const uid = utilisateur ? utilisateur.uid : null
      if (!uid) return
      dirty.current = false
      sauvegarderCompte(uid)
    }, 5 * 60 * 1000)
    return () => clearInterval(timer)
  }, [enLigne, utilisateur])
}
