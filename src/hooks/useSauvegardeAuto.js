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

  // Publication différée (debounce) dès qu'on est connecté et que les données
  // ont changé : les groupes personnels (même non synchronisés) sont poussés
  // vers le compte Firebase rapidement, donc récupérables sur un autre
  // appareil sans attendre le timer de 5 min ni une déconnexion/reconnexion.
  useEffect(() => {
    if (!firebaseConfigure() || !enLigne || !utilisateur) return
    if (!dirty.current) return
    const uid = utilisateur.uid
    dirty.current = false
    const t = setTimeout(() => sauvegarderCompte(uid), 1200)
    return () => clearTimeout(t)
  }, [groups, enLigne, utilisateur])

  // Publication immédiate au 1er changement de compte / reconnexion.
  useEffect(() => {
    if (!firebaseConfigure() || !enLigne || !utilisateur) return
    const uid = utilisateur.uid
    if (uid === dernierUid.current) return
    dernierUid.current = uid
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
