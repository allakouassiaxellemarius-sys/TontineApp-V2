import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { surNotificationTapee } from '../lib/push'
import { surRappelLocalTape } from '../lib/rappelLocal'
import { getGroups } from '../lib/db'

// Écoute le tap sur une notification (push FCM ou rappel local) et ouvre
// le groupe concerné, recherché par son code d'invitation. Pour un message
// de discussion, on ouvre directement la conversation.
export function usePushNavigation() {
  const navigate = useNavigate()
  useEffect(() => {
    const ouvrir = (data) => {
      const code = (data && data.code) || null
      if (!code) return
      const groupe = getGroups().find((g) => g.codeUnique && g.codeUnique === code)
      if (!groupe) return navigate('/')
      navigate(data.type === 'message' ? `/groupe/${groupe.id}?tab=discussion` : `/groupe/${groupe.id}`)
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
