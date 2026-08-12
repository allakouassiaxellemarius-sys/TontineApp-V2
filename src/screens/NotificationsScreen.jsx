import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  ArrowLeft, BellRing, BellOff, CheckCheck, Trash2, CalendarClock,
  CloudLightning, Wallet, ShieldAlert, MessageSquareText, Inbox,
} from 'lucide-react'
import { useInbox } from '../hooks/useInbox'
import { groupePourNotification } from '../lib/inbox'
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

export default function NotificationsScreen() {
  const navigate = useNavigate()
  const inbox = useInbox()
  const [confirmVider, setConfirmVider] = useState(false)

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

      {inbox.notifications.length === 0 ? (
        <EmptyState
          icon={Inbox}
          title="Aucune notification"
          description="Les notifications reçues sur cet appareil (rappels de tour, récap du matin, alertes de retard…) apparaîtront ici."
        />
      ) : (
        <div className="space-y-2">
          {inbox.notifications.map((n) => {
            const Ic = ICONES[n.type] || BellRing
            const groupe = groupePourNotification(n)
            return (
              <div
                key={n.cleId}
                role="button"
                tabIndex={0}
                onClick={() => ouvrir(n)}
                onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); ouvrir(n) } }}
                className={`flex w-full items-start gap-3 rounded-2xl border p-3.5 text-left transition focus:outline-none focus:ring-2 focus:ring-brand-500 ${
                  n.lu ? 'border-gray-100 bg-surface' : 'border-brand-200 bg-brand-50'
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
