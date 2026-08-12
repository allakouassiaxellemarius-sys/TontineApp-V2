import { useEffect, useState } from 'react'
import { BellRing, BellOff } from 'lucide-react'
import { useAuth } from '../../context/AuthContext'
import { activerNotifications, desactiverNotifications } from '../../lib/push'
import {
  rappelsLocauxDisponibles, statutPermissionLocal, demanderPermissionLocal,
  programmerRappelsLocaux, annulerRappelsLocaux, testerRappelLocal,
} from '../../lib/rappelLocal'
import SectionCard from './SectionCard'
import ActionRow from './ActionRow'

export default function SettingsNotifications({ enLigne }) {
  const { utilisateur } = useAuth()
  const [notifMsg, setNotifMsg] = useState('')
  const [notifErreur, setNotifErreur] = useState(false)
  const [notifBusy, setNotifBusy] = useState(false)
  const [notifActive, setNotifActive] = useState(false)
  const [notifPerm, setNotifPerm] = useState('prompt')
  const [pushActif, setPushActif] = useState(false)

  useEffect(() => {
    if (!rappelsLocauxDisponibles()) return
    statutPermissionLocal().then(setNotifPerm)
    programmerRappelsLocaux()
  }, [])

  const activerLocal = async () => {
    setNotifBusy(true)
    setNotifMsg('')
    setNotifErreur(false)
    const perm = await demanderPermissionLocal()
    if (perm !== 'granted') {
      setNotifPerm('denied')
      setNotifErreur(true)
      setNotifMsg('Autorisation refusée : activez les notifications pour Tontine Manager dans les réglages du téléphone (Paramètres → Applications → Tontine Manager → Notifications).')
    } else {
      setNotifPerm('granted')
      setNotifActive(true)
      await programmerRappelsLocaux()
      setNotifMsg('Rappels locaux activés ✓ — chaque matin à 08h00 quand un tour échoit.')
    }
    setNotifBusy(false)
    setTimeout(() => setNotifMsg(''), 6000)
  }

  const desactiverLocal = async () => {
    setNotifBusy(true)
    setNotifMsg('')
    setNotifErreur(false)
    await annulerRappelsLocaux()
    setNotifBusy(false)
    setNotifActive(false)
    setNotifMsg('Rappels locaux désactivés.')
    setTimeout(() => setNotifMsg(''), 2500)
  }

  const testerLocal = async () => {
    setNotifBusy(true)
    setNotifMsg('')
    setNotifErreur(false)
    const r = await testerRappelLocal()
    setNotifBusy(false)
    if (r.ok) {
      setNotifActive(true)
      setNotifPerm('granted')
      setNotifMsg(r.detail || 'Notification de test envoyée.')
    } else {
      setNotifErreur(true)
      setNotifMsg(r.raison)
    }
    setTimeout(() => setNotifMsg(''), 8000)
  }

  const activerPush = async () => {
    setNotifBusy(true)
    setNotifMsg('')
    setNotifErreur(false)
    const r = await activerNotifications(utilisateur ? utilisateur.uid : null)
    setNotifBusy(false)
    if (r.ok) {
      setPushActif(true)
      setNotifMsg('Push activé ✓ — rappels envoyés depuis le serveur chaque matin.')
    } else {
      setNotifErreur(true)
      setNotifMsg(r.raison)
    }
    setTimeout(() => setNotifMsg(''), 4000)
  }

  const desactiverPush = async () => {
    setNotifBusy(true)
    setNotifMsg('')
    setNotifErreur(false)
    await desactiverNotifications(utilisateur ? utilisateur.uid : null)
    setNotifBusy(false)
    setPushActif(false)
    setNotifMsg('Push désactivé. Les rappels locaux restent actifs.')
    setTimeout(() => setNotifMsg(''), 2500)
  }

  return (
    <SectionCard icon={BellRing} title="Notifications">
      {!rappelsLocauxDisponibles() ? (
        <p className="text-xs text-gray-400">
          Les notifications fonctionnent sur l'application mobile (Android/iOS), pas dans un navigateur.
        </p>
      ) : (
        <>
          <div className="space-y-2">
            <ActionRow
              title="Rappels locaux"
              subtitle={
                notifActive
                  ? 'Actifs — échéance d’un tour notifiée chaque matin à 08h00'
                  : notifPerm === 'denied'
                    ? 'Autorisation refusée dans les réglages du téléphone'
                    : 'Rappel sur cet appareil sans compte ni serveur'
              }
            >
              {notifActive ? (
                <button className="btn btn-secondary !py-2 text-xs" onClick={desactiverLocal} disabled={notifBusy}>
                  <BellOff size={14} /> Désactiver
                </button>
              ) : (
                <button className="btn btn-primary !py-2 text-xs" onClick={activerLocal} disabled={notifBusy}>
                  <BellRing size={14} /> {notifBusy ? '…' : 'Activer'}
                </button>
              )}
            </ActionRow>

            <ActionRow
              title="Test rapide"
              subtitle="Envoie une notification dans 2 s pour vérifier que tout fonctionne"
            >
              <button className="btn btn-secondary !py-2 text-xs" onClick={testerLocal} disabled={notifBusy}>
                <BellRing size={14} /> {notifBusy ? '…' : 'Tester'}
              </button>
            </ActionRow>

            <ActionRow
              title="Push serveur (FCM)"
              subtitle={
                pushActif
                  ? 'Actif — rappels envoyés depuis le serveur chaque matin'
                  : !utilisateur
                    ? 'Optionnel — nécessite le compte Google'
                    : 'Optionnel — rappels envoyés depuis le serveur'
              }
            >
              {pushActif ? (
                <button className="btn btn-secondary !py-2 text-xs" onClick={desactiverPush} disabled={notifBusy}>
                  <BellOff size={14} /> Désactiver
                </button>
              ) : (
                <button className="btn btn-secondary !py-2 text-xs" onClick={activerPush} disabled={notifBusy || !enLigne || !utilisateur}>
                  <BellRing size={14} /> {notifBusy ? '…' : 'Activer'}
                </button>
              )}
            </ActionRow>
          </div>

          {notifMsg && (
            <p className={`mt-3 text-center text-xs font-semibold ${notifErreur ? 'text-danger-600' : 'text-success-600'}`}>{notifMsg}</p>
          )}
        </>
      )}
    </SectionCard>
  )
}
