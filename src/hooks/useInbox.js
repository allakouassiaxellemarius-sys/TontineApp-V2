import { useEffect, useState, useCallback } from 'react'
import { surNotificationRecue, surNotificationTapee } from '../lib/push'
import { surRappelLocalTape, surRappelLocalRecu, afficherNotificationImmediate } from '../lib/rappelLocal'
import {
  lireInbox, ajouterNotification, marquerLue, marquerToutesLues,
  supprimerNotification, viderInbox, depuisNotificationSysteme,
} from '../lib/inbox'

// Abonne la boîte de réception à tous les canaux de notifications :
// push FCM reçues (app au premier plan), push tapées, rappels locaux
// tapés. Fournit l'état de l'inbox et ses actions.
export function useInbox() {
  const [notifications, setNotifications] = useState(() => lireInbox())
  const refresh = useCallback(() => setNotifications(lireInbox()), [])

  useEffect(() => {
    let a = () => {}
    let b = () => {}
    let c = () => {}
    let d = () => {}

    const ajouter = (n, type) => {
      const entree = depuisNotificationSysteme(n, type)
      if (entree) {
        ajouterNotification(entree)
        refresh()
      }
      // Push de discussion reçue pendant que l'app est au premier plan :
      // Android ne l'affiche pas dans la barre système (les messages
      // "notification" FCM n'arrivent en JS que si l'app est visible), on
      // la reprogramme en notification locale pour qu'elle s'affiche.
      const data = (n && n.data) || {}
      if (data.type === 'message' && typeof document !== 'undefined' && document.visibilityState === 'visible') {
        afficherNotificationImmediate(entree ? entree.titre : 'Nouveau message', entree ? entree.corps : '', data).catch(() => {})
      }
    }

    surNotificationRecue((n) => ajouter(n, 'push'))
      .then((u) => { a = u })
      .catch(() => {})

    surNotificationTapee((action) => {
      const n = action && action.notification
      const data = (n && n.data) || {}
      // Une push tapée arrive aussi comme "reçue" sur Android : on
      // déduplique côté inbox (cleId stable), il faut donc forcer un
      // id exploitable. Le champ data.type sert de type.
      const entree = depuisNotificationSysteme(n, data.type || 'push')
      if (entree) {
        // Le tap doit marquer l'entrée comme lue et pointer vers le groupe.
        ajouterNotification({ ...entree, lu: true })
        refresh()
      }
    }).then((u) => { b = u }).catch(() => {})

    surRappelLocalTape((action) => {
      const n = action && action.notification
      const data = (n && n.data) || {}
      const entree = depuisNotificationSysteme(n, data.type || 'rappel_local')
      if (entree) {
        ajouterNotification({ ...entree, lu: true })
        refresh()
      }
    }).then((u) => { c = u }).catch(() => {})

    surRappelLocalRecu((n) => {
      const data = (n && n.data) || {}
      // Notification de discussion reprogrammée pour l'affichage au premier
      // plan : déjà ajoutée à l'inbox à la réception du push, on ignore.
      if (data.type === 'message') return
      ajouter(n, data.type || 'rappel_local')
    }).then((u) => { d = u }).catch(() => {})

    return () => { a(); b(); c(); d() }
  }, [refresh])

  return {
    notifications,
    nonLues: notifications.filter((n) => !n.lu).length,
    marquerLue: (cleId) => { marquerLue(cleId); refresh() },
    marquerToutesLues: () => { marquerToutesLues(); refresh() },
    supprimer: (cleId) => { supprimerNotification(cleId); refresh() },
    vider: () => { viderInbox(); refresh() },
    refresh,
  }
}
