import { useEffect, useRef, useState } from 'react'
import { useData } from '../context/DataContext'
import { useAuth } from '../context/AuthContext'
import { useConnection } from '../context/ConnectionContext'
import { chargerGroupe } from '../lib/sync'
import { detecterConflit, reinitialiserSynchro } from '../lib/syncEngine'
import { enregistrerConflit, retirerConflit, viderConflits, getConflits } from '../lib/conflits'
import { adopterVersionCloud, fusionnerVersionCloud } from '../lib/db'
import { syncDisponible } from '../lib/cloudApi'

// Détection périodique des conflits multi-appareils : pour chaque groupe
// personnel synchronisé, compare la version cloud (majLe/base) à l'état local
// (dernière publication réussie). Un conflit est enregistré dans conflits.js
// dès que le cloud a avancé pendant que l'appareil gardait des changements
// non publiés. La détection relance à chaque retour en ligne, à chaque
// changement de groupe et toutes les 30 secondes.
export function useDetecterConflits() {
  const { groups } = useData()
  const utilisateur = (useAuth() || {}).utilisateur
  const { enLigne } = useConnection()
  const enCours = useRef(false)

  const maj = () => {
    if (enCours.current) return
    const uid = utilisateur ? utilisateur.uid : null
    if (!syncDisponible() || !enLigne || !uid) return
    const cibles = groups.filter(
      (g) => !g.rejoint && g.synchronise && g.codeUnique && g.proprietaire === uid
    )
    enCours.current = true
    Promise.all(
      cibles.map(async (g) => {
        try {
          const snap = await chargerGroupe(g.codeUnique)
          if (detecterConflit(g.id, snap, uid)) enregistrerConflit(g.id, snap)
          else retirerConflit(g.id)
        } catch {
          /* hors ligne : on garde l'état courant */
        }
      })
    ).then(() => {
      enCours.current = false
    })
  }

  useEffect(() => {
    if (!syncDisponible()) return () => {}
    maj()
    const timer = setInterval(maj, 30 * 1000)
    return () => clearInterval(timer)
  }, [groups, enLigne, utilisateur])

  useEffect(() => {
    const onRetour = () => setTimeout(maj, 1500)
    window.addEventListener('online', onRetour)
    return () => window.removeEventListener('online', onRetour)
  }, [groups, enLigne, utilisateur])
}

// Expose les conflits détectés + les actions de résolution.
// mode : 'adopter' (version cloud intégrale) | 'fusionner' (union, plus récent
// gagne) | 'garder' (on re-publie la version locale).
export function useConflits() {
  const { refresh } = useData()
  const utilisateur = (useAuth() || {}).utilisateur
  const [liste, setListe] = useState(() => getConflits())

  useEffect(() => {
    const t = setInterval(() => setListe({ ...getConflits() }), 1000)
    return () => clearInterval(t)
  }, [])

  const resoudreConflit = (groupeId, mode, snapshot) => {
    const uid = utilisateur ? utilisateur.uid : null
    if (mode === 'adopter' || mode === 'fusionner') {
      const ok = mode === 'adopter'
        ? adopterVersionCloud(groupeId, snapshot)
        : fusionnerVersionCloud(groupeId, snapshot)
      if (!ok) return false
    }
    retirerConflit(groupeId)
    if (mode === 'garder' || mode === 'fusionner') {
      reinitialiserSynchro(groupeId)
    }
    refresh()
    return true
  }

  const ignorerTous = () => {
    viderConflits()
    setListe({})
  }

  return { conflits: liste, resoudreConflit, ignorerTous }
}
