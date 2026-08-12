import { useEffect, useRef } from 'react'
import { useData } from '../context/DataContext'
import { useAuth } from '../context/AuthContext'
import { abonnerGroupe, abonnerDemandes, abonnerMessagesInvites, supprimerMessageInvite } from '../lib/sync'
import { appliquerSynchro, integrerMessage } from '../lib/db'
import { publierSnapshot, traiterDemande } from '../lib/syncEngine'
import { firebaseConfigure } from '../lib/firebaseConfig'

// Responsable : publie chaque groupe synchronisé vers le cloud à chaque changement.
export function usePublierSynchro() {
  const { groups } = useData()
  const { utilisateur } = useAuth()
  useEffect(() => {
    const uid = utilisateur ? utilisateur.uid : null
    for (const g of groups) publierSnapshot(g, uid)
  }, [groups, utilisateur])
}

// Invité : s'abonne aux mises à jour du responsable (lecture seule).
export function useAbonnerGroupe(group) {
  const { refresh } = useData()
  useEffect(() => {
    if (!group || !group.rejoint || !group.synchronise || !group.codeUnique || !firebaseConfigure()) return () => {}
    return abonnerGroupe(
      group.codeUnique,
      (snap) => { if (appliquerSynchro(group.id, snap)) refresh() },
      () => {}
    )
  }, [group && group.id, group && group.codeUnique, group && group.synchronise])
}

// Responsable : enregistre automatiquement les invités qui rejoignent.
// Un abonnement est ouvert pour chaque groupe synchronisé ; chaque demande
// est ajoutée comme membre puis supprimée du cloud. Le groupe publié ensuite
// (usePublierSynchro) propage le nouveau membre à tous les invités.
export function useAbonnerDemandes() {
  const { groups, refresh } = useData()
  const enCours = useRef(new Set())
  useEffect(() => {
    if (!firebaseConfigure()) return () => {}
    const groupes = groups.filter((g) => !g.rejoint && g.synchronise && g.codeUnique)
    const unsubs = groupes.map((g) =>
      abonnerDemandes(
        g.codeUnique,
        async (demandes) => {
          if (!demandes) return
          let change = false
          for (const [id, demande] of Object.entries(demandes)) {
            const cle = g.id + '/' + id
            if (enCours.current.has(cle)) continue
            enCours.current.add(cle)
            if (await traiterDemande(g.id, id, demande)) change = true
          }
          if (change) refresh()
        },
        () => {}
      )
    )
    return () => unsubs.forEach((u) => u())
  }, [groups, refresh])
}

// Responsable : intègre les messages envoyés par les invités. Chaque message
// du canal messages_utilisateur est ajouté à la discussion puis supprimé du
// canal ; le snapshot re-publié (usePublierSynchro) les propage à tous.
export function useAbonnerMessagesInvites() {
  const { groups, refresh } = useData()
  const enCours = useRef(new Set())
  useEffect(() => {
    if (!firebaseConfigure()) return () => {}
    const groupes = groups.filter((g) => !g.rejoint && g.synchronise && g.codeUnique)
    const unsubs = groupes.map((g) =>
      abonnerMessagesInvites(
        g.codeUnique,
        (messages) => {
          if (!messages) return
          let change = false
          for (const [id, m] of Object.entries(messages)) {
            const cle = g.id + '/' + id
            if (enCours.current.has(cle)) continue
            enCours.current.add(cle)
            const resultat = integrerMessage(g.id, m)
            if (resultat === null) continue
            change = true
            supprimerMessageInvite(g.codeUnique, id).catch(() => {})
          }
          if (change) refresh()
        },
        () => {}
      )
    )
    return () => unsubs.forEach((u) => u())
  }, [groups, refresh])
}
