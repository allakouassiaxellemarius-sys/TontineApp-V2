import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  ArrowLeft, BellRing, BellOff, CheckCheck, Trash2, CalendarClock,
  CloudLightning, Wallet, ShieldAlert, MessageSquareText, Inbox,
} from 'lucide-react'
import { useInbox } from '../hooks/useInbox'
import { groupePourNotification } from '../lib/inbox'
import { useAuth } from '../context/AuthContext'
import { useToast } from '../context/ToastContext'
import { pushDisponible, activerNotifications, desactiverNotifications } from '../lib/push'
import EmptyState from '../components/EmptyState'
import Modal from '../components/Modal'

const ICONES = {
  push: CloudLightning,
  message: MessageSquareText,
  rappel_tour: CalendarClock,
  rappel_retard: ShieldAlert,
  recap_journalier: BellRing,
  rappel_local: CalendarClock,
  test: BellRing,
  SMS: MessageSquareText,
  sms: MessageSquareText,
}

function heureRelative(ts) {
  const d = new Date(ts)
  const diff = Date.now() - ts
  if (diff < 60000) return "à l'instant"
  if (diff < 3600000) return `il y a ${Math.floor(diff / 60000)} min`
  if (diff < 86400000) return `il y a ${Math.floor(diff / 3600000)} h`
  return d.toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })
}

function PushCloud() {
  const { utilisateur } = useAuth()
  const toast = useToast()
  const [etat, setEtat] = useState('inconnu') // 'actif' | 'inactif' | 'indispo'

  useEffect(() => {
    if (!pushDisponible()) { setEtat('indispo'); return }
    if (typeof Notification !== 'undefined' && Notification.permission === 'granted') setEtat('actif')
    else setEtat('inactif')
  }, [])

  if (etat === 'indispo') return null

  const basculer = async () => {
    const uid = utilisateur && utilisateur.uid
    if (!uid) { toast.error('Connectez-vous pour activer les notifications.'); return }
    if (etat === 'actif') {
      await desactiverNotifications(uid)
      setEtat('inactif')
      toast.info('Notifications push désactivées')
    } else {
      const r = await activerNotifications(uid)
      if (r.ok) { setEtat('actif'); toast.success('Notifications push activées') }
      else { setEtat('inactif'); toast.error(r.raison || 'Activation impossible') }
    }
  }

  return (
    <div className="card mb-4 flex items-center justify-between p-4">
      <div className="pr-3">
        <p className="text-sm font-bold text-gray-800">Notifications push (cloud)</p>
        <p className="text-xs text-gray-500">
          Recevez messages et rappels même hors de l'application.
        </p>
      </div>
      <button
        className={`btn shrink-0 ${etat === 'actif' ? 'btn-secondary' : 'btn-primary'}`}
        onClick={basculer}
      >
        {etat === 'actif' ? 'Désactiver' : 'Activer'}
      </button>
    </div>
  )
}

export default function NotificationsScreen() {
  const navigate = useNavigate()
  const inbox = useInbox()
  const [confirmVider, setConfirmVider] = useState(false)
  const [filtre, setFiltre] = useState('toutes') // 'toutes' | 'nonLues'

  const liste = filtre === 'nonLues'
    ? inbox.notifications.filter((n) => !n.lu)
    : inbox.notifications

  const ouvrir = (n) => {
    const groupe = groupePourNotification(n)
    if (groupe) {
      inbox.marquerLue(n.cleId)
      navigate(n.type === 'message' ? `/groupe/${groupe.id}?tab=discussion` : `/groupe/${groupe.id}`)
    }
  }

  return (
    <div className="mx-auto max-w-lg px-4 pb-24 pt-4 pt-safe">
      <div className="mb-5 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button className="btn btn-icon" onClick={() => navigate('/')} aria-label="Retour">
            <ArrowLeft size={18} />
          </button>
          <h1 className="text-xl font-bold text-gray-800">Notifications</h1>
          {inbox.nonLues > 0 && (
            <span className="badge bg-brand-600 text-white">{inbox.nonLues} non lue{inbox.nonLues > 1 ? 's' : ''}</span>
          )}
        </div>
        <div className="flex gap-2">
          {inbox.notifications.length > 0 && (
            <>
              <button className="btn btn-icon" onClick={inbox.marquerToutesLues} aria-label="Tout marquer lu" title="Tout marquer comme lu">
                <CheckCheck size={18} />
              </button>
              <button className="btn btn-icon" onClick={() => setConfirmVider(true)} aria-label="Vider" title="Vider la boîte">
                <Trash2 size={18} />
              </button>
            </>
          )}
        </div>
      </div>

      <PushCloud />

      {inbox.notifications.length > 0 && (
        <div className="mb-3 flex items-center gap-2" role="tablist" aria-label="Filtrer les notifications">
          <button
            role="tab"
            aria-selected={filtre === 'toutes'}
            onClick={() => setFiltre('toutes')}
            className={`rounded-full px-3.5 py-1.5 text-xs font-bold ${
              filtre === 'toutes'
                ? 'bg-brand-600 text-white shadow-sm'
                : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
            }`}
          >
            Toutes ({inbox.notifications.length})
          </button>
          <button
            role="tab"
            aria-selected={filtre === 'nonLues'}
            onClick={() => setFiltre('nonLues')}
            className={`rounded-full px-3.5 py-1.5 text-xs font-bold ${
              filtre === 'nonLues'
                ? 'bg-brand-600 text-white shadow-sm'
                : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
            }`}
          >
            Non lues ({inbox.nonLues})
          </button>
        </div>
      )}

      {liste.length === 0 ? (
        <EmptyState
          icon={Inbox}
          title={filtre === 'nonLues' && inbox.notifications.length > 0 ? 'Aucune notification non lue' : 'Aucune notification'}
          description={
            filtre === 'nonLues' && inbox.notifications.length > 0
              ? 'Tout est à jour ! Les nouvelles notifications apparaîtront ici.'
              : "Les notifications reçues sur cet appareil (rappels de tour, récap du matin, alertes de retard…) apparaîtront ici."
          }
        />
      ) : (
        <div className="space-y-2">
          {liste.map((n) => {
            const Ic = ICONES[n.type] || BellRing
            const groupe = groupePourNotification(n)
            return (
              <div
                key={n.cleId}
                role="button"
                tabIndex={0}
                onClick={() => ouvrir(n)}
                onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); ouvrir(n) } }}
                className={`flex w-full items-start gap-3 rounded-2xl border p-3.5 text-left focus:outline-none focus:ring-2 focus:ring-brand-500 ${
                  n.lu ? 'border-gray-100 bg-surface' : 'border-l-4 border-l-brand-600 border-brand-200 bg-brand-50'
                }`}
              >
                <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${n.lu ? 'bg-gray-100 text-gray-400' : 'bg-brand-600 text-white'}`}>
                  <Ic size={18} />
                </div>
                <div className="min-w-0 flex-1">
                  <p className={`text-sm ${n.lu ? 'font-medium text-gray-600' : 'font-bold text-gray-800'}`}>{n.titre}</p>
                  {n.corps && <p className={`mt-0.5 text-xs ${n.lu ? 'text-gray-400' : 'text-gray-600'}`}>{n.corps}</p>}
                  <div className="mt-1 flex items-center gap-2">
                    {groupe && <span className="text-[11px] font-semibold text-brand-600">{groupe.nom}</span>}
                    {n.code && !groupe && <span className="font-mono text-[11px] text-gray-400">{n.code}</span>}
                    <span className={`text-[11px] ${n.lu ? 'text-gray-300' : 'text-gray-400'}`}>{heureRelative(n.date)}</span>
                  </div>
                </div>
                <button
                  className="shrink-0 rounded-full p-1.5 text-gray-300 hover:bg-gray-100 hover:text-danger-500"
                  onClick={(e) => { e.stopPropagation(); inbox.supprimer(n.cleId) }}
                  aria-label="Supprimer"
                >
                  <Trash2 size={15} />
                </button>
              </div>
            )
          })}
        </div>
      )}

      <div className="mt-6 flex items-center justify-center gap-2 text-[11px] text-gray-400">
        <BellOff size={13} />
        Les notifications marquées « non lues » restent visibles tant que vous ne les ouvrez pas.
      </div>

      <Modal
        open={confirmVider}
        onClose={() => setConfirmVider(false)}
        title="Vider la boîte de réception ?"
        footer={
          <>
            <button className="btn btn-secondary" onClick={() => setConfirmVider(false)}>Annuler</button>
            <button className="btn btn-danger" onClick={() => { inbox.vider(); setConfirmVider(false); }}>
              <Trash2 size={16} /> Vider
            </button>
          </>
        }
      >
        <p className="text-sm text-gray-600">Toutes les notifications de cet appareil seront supprimées définitivement.</p>
      </Modal>
    </div>
  )
}
