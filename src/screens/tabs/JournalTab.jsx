import { useState } from 'react'
import {
  Activity, UserPlus, UserMinus, Ban, CheckCircle2, CalendarDays, Wallet,
  Undo2, Gift, ShieldCheck, Megaphone, Sparkles, Plus, Trash2,
} from 'lucide-react'
import { useData } from '../../context/DataContext'
import { useAuth } from '../../context/AuthContext'
import { useToast } from '../../context/ToastContext'
import { haptic } from '../../lib/haptique'
import { publierAnnonce, supprimerAnnonce } from '../../lib/db'
import Modal from '../../components/Modal'
import EmptyState from '../../components/EmptyState'

const ICONES = {
  creation: Sparkles,
  membre_ajoute: UserPlus,
  membre_supprime: UserMinus,
  membre_bloque: Ban,
  membre_debloque: CheckCircle2,
  planning: CalendarDays,
  paiement: Wallet,
  paiement_retire: Undo2,
  reception: Gift,
  role: ShieldCheck,
  annonce: Megaphone,
}

function heureIso(iso) {
  try {
    const d = new Date(iso)
    return d.toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' }) +
      ' · ' + d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })
  } catch {
    return String(iso || '')
  }
}

export default function JournalTab({ group, readOnly }) {
  const { refresh } = useData()
  const { utilisateur } = useAuth()
  const toast = useToast()
  const [annonceOpen, setAnnonceOpen] = useState(false)
  const [texte, setTexte] = useState('')
  const [confirmDel, setConfirmDel] = useState(null)

  const annonces = group.annonces || []
  const journal = (group.journal || []).slice().reverse()

  const poster = () => {
    if (!texte.trim()) return
    const nom = (utilisateur && (utilisateur.displayName || utilisateur.email)) || 'Responsable'
    publierAnnonce(group.id, texte.trim(), nom)
    setTexte('')
    setAnnonceOpen(false)
    refresh()
    haptic.success()
    toast.success('Annonce publiée')
  }

  const nomAuteur = (a) => {
    if (a === 'Responsable' || !a) return 'Responsable'
    if (utilisateur && a === utilisateur.email) return 'Vous'
    return a
  }

  return (
    <div className="space-y-4">
      <div className="card p-4">
        <div className="mb-2 flex items-center justify-between">
          <p className="flex items-center gap-2 text-sm font-extrabold text-gray-800">
            <Megaphone size={16} className="text-brand-600" /> Annonces
          </p>
          {!readOnly && (
            <button className="btn btn-primary !py-1.5 text-xs" onClick={() => setAnnonceOpen(true)}>
              <Plus size={14} /> Publier
            </button>
          )}
        </div>
        {annonces.length === 0 ? (
          <p className="text-sm text-gray-500">
            Aucune annonce. {!readOnly && 'Partagez une information importante aux membres.'}
          </p>
        ) : (
          <div className="space-y-2">
            {annonces.map((a) => (
              <div key={a.id} className="rounded-2xl border border-brand-200 bg-brand-50 p-3.5">
                <p className="text-sm font-semibold leading-relaxed text-gray-800">{a.texte}</p>
                <div className="mt-1.5 flex items-center justify-between">
                  <p className="text-[11px] text-gray-500">
                    {nomAuteur(a.auteur)} · {heureIso(a.date)}
                  </p>
                  {!readOnly && (
                    <button
                      className="rounded-lg p-1 text-danger-400 hover:bg-danger-50"
                      onClick={() => setConfirmDel(a)}
                      aria-label="Supprimer l'annonce"
                    >
                      <Trash2 size={14} />
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="card p-4">
        <p className="mb-3 flex items-center gap-2 text-sm font-extrabold text-gray-800">
          <Activity size={16} className="text-brand-600" /> Activité récente
        </p>
        {journal.length === 0 ? (
          <EmptyState
            icon={Activity}
            title="Aucune activité"
            description="Les actions du groupe (ajouts, paiements, réceptions de pot…) apparaîtront ici."
          />
        ) : (
          <ol className="space-y-0">
            {journal.map((e, i) => {
              const Icon = ICONES[e.action] || Activity
              return (
                <li key={e.id} className="flex gap-3 pb-3">
                  <div className="flex flex-col items-center">
                    <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-brand-50 text-brand-600">
                      <Icon size={15} />
                    </span>
                    {i < journal.length - 1 && <span className="mt-1 w-px flex-1 bg-gray-200" />}
                  </div>
                  <div className="min-w-0 flex-1 pt-1">
                    <p className="text-sm leading-snug text-gray-700">{e.libelle}</p>
                    <p className="text-[11px] text-gray-400">{heureIso(e.date)}</p>
                  </div>
                </li>
              )
            })}
          </ol>
        )}
      </div>

      <Modal
        open={annonceOpen}
        onClose={() => setAnnonceOpen(false)}
        title="Publier une annonce"
        footer={
          <>
            <button className="btn btn-secondary" onClick={() => setAnnonceOpen(false)}>Annuler</button>
            <button className="btn btn-primary" onClick={poster} disabled={!texte.trim()}>
              <Megaphone size={16} /> Publier
            </button>
          </>
        }
      >
        <textarea
          className="input min-h-24"
          placeholder="Votre annonce (visible par tous les membres)…"
          value={texte}
          onChange={(e) => setTexte(e.target.value)}
        />
      </Modal>

      <Modal
        open={!!confirmDel}
        onClose={() => setConfirmDel(null)}
        title="Supprimer l'annonce ?"
        footer={
          <>
            <button className="btn btn-secondary" onClick={() => setConfirmDel(null)}>Annuler</button>
            <button
              className="btn btn-danger"
              onClick={() => {
                supprimerAnnonce(group.id, confirmDel.id)
                setConfirmDel(null)
                refresh()
                haptic.warning()
                toast.info('Annonce supprimée')
              }}
            >
              <Trash2 size={16} /> Supprimer
            </button>
          </>
        }
      >
        <p className="text-sm text-gray-600">« {confirmDel?.texte} »</p>
      </Modal>
    </div>
  )
}
