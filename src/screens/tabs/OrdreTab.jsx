import { useState } from 'react'
import { GripVertical, AlertTriangle, Check, ArrowUp, ArrowDown, Pencil, ListOrdered } from 'lucide-react'
import { useData } from '../../context/DataContext'
import { useToast } from '../../context/ToastContext'
import { haptic } from '../../lib/haptique'
import { getMembres, updateGroup } from '../../lib/db'
import Modal from '../../components/Modal'
import Avatar from '../../components/Avatar'

const fmtDateTime = (iso) => {
  if (!iso) return '—'
  const d = new Date(iso)
  if (isNaN(d)) return '—'
  return d.toLocaleString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}

export default function OrdreTab({ group, readOnly }) {
  const { refresh } = useData()
  const toast = useToast()
  const membres = getMembres(group.id).filter((m) => !m.bloque)

  const ordreBase = (Array.isArray(group.ordreTire) ? group.ordreTire : []).map(Number).filter((id) => membres.some((m) => m.id === id))
  const restants = membres.filter((m) => !ordreBase.includes(m.id))
  const ordreInitial = [...ordreBase, ...restants.map((m) => m.id)]

  const [items, setItems] = useState(ordreInitial)
  const [editing, setEditing] = useState(false)
  const [confirm1, setConfirm1] = useState(false)
  const [confirm2, setConfirm2] = useState(false)
  const [dragIndex, setDragIndex] = useState(null)

  const membreDe = (id) => membres.find((m) => m.id === id)

  const demarrerEdition = () => {
    setConfirm1(false)
    setItems(ordreInitial)
    setEditing(true)
    haptic.tap()
  }

  const deplacer = (from, to) => {
    if (to < 0 || to >= items.length) return
    const next = [...items]
    const [m] = next.splice(from, 1)
    next.splice(to, 0, m)
    setItems(next)
    haptic.tap()
  }

  const valider = () => {
    setConfirm2(false)
    setEditing(false)
    updateGroup(group.id, { ordreTire: items, dateTirage: new Date().toISOString() })
    refresh()
    haptic.success()
    toast.success('Ordre de passage enregistré')
  }

  const onDrop = (to) => {
    if (dragIndex === null || dragIndex === to) return
    const next = [...items]
    const [m] = next.splice(dragIndex, 1)
    next.splice(to, 0, m)
    setItems(next)
    setDragIndex(null)
    haptic.tap()
  }

  return (
    <div>
      {/* TRANSPARENCE : date et heure du tirage */}
      <div className="card mb-4 flex items-center gap-3 p-4">
        <ListOrdered size={20} className="shrink-0 text-brand-600" />
        <div className="flex-1">
          <p className="text-[11px] font-bold uppercase tracking-wide text-gray-400">Tirage effectué le</p>
          <p className="text-sm font-semibold text-gray-800">{fmtDateTime(group.dateTirage)}</p>
        </div>
      </div>

      {readOnly ? (
        <p className="rounded-2xl bg-gray-50 p-4 text-center text-sm text-gray-400">
          Vous êtes en lecture seule sur ce groupe.
        </p>
      ) : (
        <div className="mb-3 flex items-center justify-end">
          {!editing ? (
            <button
              className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold text-gray-600 hover:bg-gray-100"
              onClick={() => setConfirm1(true)}
            >
              <Pencil size={14} /> Modifier l'ordre
            </button>
          ) : (
            <button className="btn btn-primary" onClick={() => setConfirm2(true)}>
              <Check size={16} /> Enregistrer
            </button>
          )}
        </div>
      )}

      {/* LISTE VERTICALE DRAG & DROP */}
      <div className="space-y-2">
        {items.map((id, idx) => {
          const m = membreDe(id)
          if (!m) return null
          return (
            <div
              key={id}
              draggable={editing}
              onDragStart={() => setDragIndex(idx)}
              onDragOver={(e) => editing && e.preventDefault()}
              onDrop={() => editing && onDrop(idx)}
              className={`card flex items-center gap-3 p-4 ${editing ? 'border-brand-300 bg-brand-50/40' : ''}`}
            >
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-brand-100 text-sm font-extrabold text-brand-700">
                {idx + 1}
              </span>
              <Avatar src={m.photo} nom={m.nom} size={36} className="shrink-0" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold text-gray-800">{m.nom}</p>
                <p className="text-xs text-gray-400">{m.role === 'gerant' ? 'Responsable' : m.role === 'co-responsable' ? 'Co-responsable' : 'Membre'}</p>
              </div>
              {editing && (
                <div className="flex items-center gap-1">
                  <button
                    className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 disabled:opacity-30"
                    disabled={idx === 0}
                    onClick={() => deplacer(idx, idx - 1)}
                    aria-label="Monter"
                  >
                    <ArrowUp size={16} />
                  </button>
                  <button
                    className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 disabled:opacity-30"
                    disabled={idx === items.length - 1}
                    onClick={() => deplacer(idx, idx + 1)}
                    aria-label="Descendre"
                  >
                    <ArrowDown size={16} />
                  </button>
                  <GripVertical size={18} className="text-gray-300" />
                </div>
              )}
            </div>
          )
        })}
      </div>

      {/* DOUBLE CONFIRMATION */}
      <Modal
        open={confirm1}
        onClose={() => setConfirm1(false)}
        title="Modifier l'ordre de passage ?"
        footer={
          <>
            <button className="btn btn-secondary" onClick={() => setConfirm1(false)}>Annuler</button>
            <button className="btn btn-primary" onClick={demarrerEdition}>Continuer</button>
          </>
        }
      >
        <p className="flex items-start gap-2 text-sm text-gray-600">
          <AlertTriangle size={16} className="mt-0.5 shrink-0 text-warning-500" />
          L'ordre de passage définit qui reçoit le pot et quand. Toute modification doit être validée par le groupe.
        </p>
      </Modal>

      <Modal
        open={confirm2}
        onClose={() => setConfirm2(false)}
        title="Confirmer définitivement ?"
        footer={
          <>
            <button className="btn btn-secondary" onClick={() => setConfirm2(false)}>Revoir l'ordre</button>
            <button className="btn btn-danger" onClick={valider}>Confirmer définitivement</button>
          </>
        }
      >
        <p className="flex items-start gap-2 text-sm text-gray-600">
          <AlertTriangle size={16} className="mt-0.5 shrink-0 text-danger-500" />
          Cette action redéfinit l'ordre de passage pour tous les membres et met à jour la date du tirage. Action irréversible.
        </p>
      </Modal>
    </div>
  )
}
