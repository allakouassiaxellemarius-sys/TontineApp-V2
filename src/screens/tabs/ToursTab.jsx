import { useState } from 'react'
import { CalendarDays, Wand2, CheckCircle2, XCircle, Trash2, Pencil, AlertTriangle, Users } from 'lucide-react'
import { useData } from '../../context/DataContext'
import { useToast } from '../../context/ToastContext'
import { haptic } from '../../lib/haptique'
import { getToursAvecMembre, getMembres, generateTours, updateTour, marquerTourRecu, annulerTour, supprimerTour, membreSansTour, updateGroup } from '../../lib/db'
import { formatMontant, formatDate } from '../../lib/format'
import Modal from '../../components/Modal'
import Field from '../../components/Field'
import EmptyState from '../../components/EmptyState'
import WheelSpinner from '../../components/WheelSpinner'

export default function ToursTab({ group, readOnly, onGoTo }) {
  const { refresh } = useData()
  const toast = useToast()
  const [confirmGen, setConfirmGen] = useState(false)
  const [editDate, setEditDate] = useState(null)
  const [newDate, setNewDate] = useState('')
  const [dateErr, setDateErr] = useState('')
  const [confirmRecu, setConfirmRecu] = useState(null)
  const [confirmAnnule, setConfirmAnnule] = useState(null)
  const [confirmDel, setConfirmDel] = useState(null)

  const tours = getToursAvecMembre(group.id)
  const membres = getMembres(group.id)
  const sansTour = membreSansTour(membres, tours)

  const generer = () => {
    generateTours(group.id)
    setConfirmGen(false)
    refresh()
    haptic.success()
    toast.success('Planning généré')
  }

  const statutBadge = (t) => {
    if (t.statut === 'recu') return <span className="badge bg-success-100 text-success-600">Reçu</span>
    if (t.statut === 'annule') return <span className="badge bg-gray-100 text-gray-500">Annulé</span>
    if (t.datePrevue < new Date().toISOString().slice(0, 10))
      return <span className="badge bg-danger-100 text-danger-600">En retard</span>
    return <span className="badge bg-warning-100 text-warning-600">En attente</span>
  }

  return (
    <div>
      {membres.filter((m) => !m.bloque).length >= 2 && (
        <WheelSpinner
          membres={membres}
          ordre={group.ordreTire}
          onDraw={(ids) => {
            if (readOnly) return
            updateGroup(group.id, { ordreTire: ids })
            refresh()
          }}
        />
      )}

      {sansTour.length > 0 && (
        <div className="mb-4 flex items-start gap-3 rounded-2xl border border-warning-200 bg-warning-50 p-3.5">
          <AlertTriangle size={18} className="mt-0.5 shrink-0 text-warning-500" />
          <div className="flex-1">
            <p className="text-sm font-semibold text-warning-700">
              {sansTour.length} membre{sansTour.length > 1 ? 's' : ''} sans tour : {sansTour.map((m) => m.nom).join(', ')}
            </p>
            {!readOnly && (
              <button
                className="mt-2 rounded-lg bg-warning-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-warning-700"
                onClick={() => setConfirmGen(true)}
              >
                <Wand2 size={14} /> Générer le planning
              </button>
            )}
          </div>
        </div>
      )}

      {tours.length === 0 && sansTour.length === 0 && (
        <EmptyState
          icon={CalendarDays}
          title="Aucun tour"
          description="Ajoutez des membres dans l'onglet Membres, puis générez le planning des tours."
          action={!readOnly && (
            <button className="btn btn-primary" onClick={() => onGoTo('membres')}>
              <Users size={16} /> Ajouter des membres
            </button>
          )}
        />
      )}

      {tours.length > 0 && (
        <div className="space-y-2">
          {tours.map((t) => (
            <div key={t.id} className={`card p-4 ${t.statut === 'annule' ? 'opacity-60' : ''}`}>
              <div className="flex items-start gap-3">
                <span className={`badge ${t.statut === 'recu' ? 'bg-success-100 text-success-600' : t.statut === 'annule' ? 'bg-gray-100 text-gray-500' : 'bg-brand-100 text-brand-700'}`}>
                  #{t.numero}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-sm font-semibold text-gray-800">{t.membre?.nom || '—'}</p>
                    {statutBadge(t)}
                  </div>
                  <p className="text-xs text-gray-400">Échéance : {formatDate(t.datePrevue)}</p>
                  {t.statut === 'recu' && <p className="text-xs text-success-600">Reçu le {formatDate(t.dateReception)}</p>}
                  {!readOnly && <p className="mt-1 text-sm font-bold text-brand-600">{formatMontant(t.montantPot, group)}</p>}
                </div>
                <div className="flex shrink-0 flex-col gap-1">
                  {!readOnly && t.statut === 'en_attente' && (
                    <>
                      <button className="flex items-center justify-center gap-1 rounded-lg px-2 py-1 text-[11px] font-semibold text-success-600 hover:bg-success-50" onClick={() => setConfirmRecu(t)}>
                        <CheckCircle2 size={14} /> Reçu
                      </button>
                      <button className="flex items-center justify-center gap-1 rounded-lg px-2 py-1 text-[11px] font-semibold text-danger-600 hover:bg-danger-50" onClick={() => setConfirmAnnule(t)}>
                        <XCircle size={14} /> Annuler
                      </button>
                    </>
                  )}
                  {!readOnly && (
                    <div className="flex gap-1">
                      <button className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100" onClick={() => { setEditDate(t); setNewDate(t.datePrevue); setDateErr(''); }} aria-label="Modifier la date">
                        <Pencil size={14} />
                      </button>
                      <button className="rounded-lg p-1.5 text-danger-400 hover:bg-danger-50" onClick={() => setConfirmDel(t)} aria-label="Supprimer">
                        <Trash2 size={14} />
                      </button>
                    </div>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      <Modal
        open={confirmGen}
        onClose={() => setConfirmGen(false)}
        title="Générer le planning"
        footer={
          <>
            <button className="btn btn-secondary" onClick={() => setConfirmGen(false)}>Annuler</button>
            <button className="btn btn-primary" onClick={generer}><Wand2 size={16} /> Générer</button>
          </>
        }
      >
        <p className="text-sm text-gray-600">
          Un tour sera créé pour chaque membre sans tour, espacé de {group.periodeJours} jour(s) à partir de la dernière échéance.
        </p>
      </Modal>

      <Modal
        open={!!editDate}
        onClose={() => setEditDate(null)}
        title={`Modifier la date du tour #${editDate?.numero}`}
        footer={
          <>
            <button className="btn btn-secondary" onClick={() => setEditDate(null)}>Annuler</button>
            <button className="btn btn-primary" onClick={() => { const r = updateTour(editDate.id, { datePrevue: newDate }); if (r) { setEditDate(null); setDateErr(''); refresh(); haptic.tap(); toast.success('Date mise à jour'); } else { setDateErr('Enregistrement impossible : ce groupe est en lecture seule.'); } }}>
              Enregistrer
            </button>
          </>
        }
      >
        <Field label="Nouvelle échéance">
          <input className="input" type="date" value={newDate} onChange={(e) => { setNewDate(e.target.value); setDateErr(''); }} />
        </Field>
        {dateErr && (
          <p className="mt-3 flex items-center gap-2 rounded-xl bg-danger-50 px-3 py-2 text-xs font-semibold text-danger-600">
            <AlertTriangle size={14} /> {dateErr}
          </p>
        )}
      </Modal>

      <Modal
        open={!!confirmRecu}
        onClose={() => setConfirmRecu(null)}
        title="Marquer le pot comme reçu ?"
        footer={
          <>
            <button className="btn btn-secondary" onClick={() => setConfirmRecu(null)}>Annuler</button>
            <button className="btn btn-primary" onClick={() => { marquerTourRecu(confirmRecu.id); setConfirmRecu(null); refresh(); haptic.success(); toast.success(`Pot reçu par ${confirmRecu?.membre?.nom}`); }}>
              <CheckCircle2 size={16} /> Confirmer la réception
            </button>
          </>
        }
      >
        <p className="text-sm text-gray-600">
          « {confirmRecu?.membre?.nom} » a reçu <span className="font-semibold">{formatMontant(confirmRecu?.montantPot, group)}</span> au tour #{confirmRecu?.numero}.
        </p>
      </Modal>

      <Modal
        open={!!confirmAnnule}
        onClose={() => setConfirmAnnule(null)}
        title="Annuler ce tour ?"
        footer={
          <>
            <button className="btn btn-secondary" onClick={() => setConfirmAnnule(null)}>Annuler</button>
            <button className="btn btn-danger" onClick={() => { annulerTour(confirmAnnule.id); setConfirmAnnule(null); refresh(); haptic.warning(); toast.info(`Tour #${confirmAnnule?.numero} annulé`); }}>
              <XCircle size={16} /> Annuler le tour
            </button>
          </>
        }
      >
        <p className="text-sm text-gray-600">Le tour #{confirmAnnule?.numero} sera marqué comme annulé (les cotisations restent enregistrées).</p>
      </Modal>

      <Modal
        open={!!confirmDel}
        onClose={() => setConfirmDel(null)}
        title="Supprimer le tour ?"
        footer={
          <>
            <button className="btn btn-secondary" onClick={() => setConfirmDel(null)}>Annuler</button>
            <button className="btn btn-danger" onClick={() => { supprimerTour(confirmDel.id); setConfirmDel(null); refresh(); haptic.warning(); toast.info(`Tour #${confirmDel?.numero} supprimé`); }}>
              <Trash2 size={16} /> Supprimer
            </button>
          </>
        }
      >
        <p className="text-sm text-gray-600">Le tour et toutes ses cotisations seront supprimés.</p>
      </Modal>
    </div>
  )
}
