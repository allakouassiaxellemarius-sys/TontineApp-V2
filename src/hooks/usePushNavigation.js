import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { surNotificationTapee } from '../lib/push'
import { surRappelLocalTape } from '../lib/rappelLocal'
import { getGroups } from '../lib/db'

// Les rappels locaux sont planifiés avec `groupeId` et `code: null`
// (rappelLocal.js:201/221/239) : sans fallback sur groupeId, le tap d'un
// rappel de tour restait sans effet.
const TAB_PAR_TYPE = {
  rappel_tour: 'argent',
  rappel_avance: 'argent',
  rappel_retard: 'argent',
  rappel_pret: 'argent',
  message: 'discussion',
}

// Écoute le tap sur une notification (push FCM ou rappel local) et ouvre
// l'onglet voulu du groupe. Un rappel de tour mène sur « Argent », où le
// membre trouve « Payer ma cotisation » déjà calé sur le tour dû.
export function usePushNavigation() {
  const navigate = useNavigate()
  useEffect(() => {
    const ouvrir = (data) => {
      const code = (data && data.code) || null
      const groupeId = data && data.groupeId ? Number(data.groupeId) : null
      if (!code && !groupeId) return
      const groupe = getGroups().find((g) =>
        (code && g.codeUnique === code) || (groupeId && Number(g.id) === groupeId)
      )
      if (!groupe) return navigate('/')
      const tab = TAB_PAR_TYPE[(data && data.type) || '']
      navigate(tab ? `/groupe/${groupe.id}?tab=${tab}` : `/groupe/${groupe.id}`)
    }
    let a = () => {}
    let b = () => {}
    surNotificationTapee((action) => ouvrir((action && action.notification && action.notification.data) || {}))
      .then((u) => { a = u })
    surRappelLocalTape((action) => ouvrir((action && action.notification && action.notification.data) || {}))
      .then((u) => { b = u })
    return () => { a(); b() }
  }, [navigate])
}
