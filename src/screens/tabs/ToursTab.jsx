import { useState } from 'react'
import { CalendarDays, Wand2, AlertTriangle, Users, Phone, FileImage, XCircle, RotateCcw } from 'lucide-react'
import { useData } from '../../context/DataContext'
import { useToast } from '../../context/ToastContext'
import { haptic } from '../../lib/haptique'
import { ajouterAuJournal, annulerTour, updateTour } from '../../lib/db'
import { todayStr } from '../../lib/storage'
import useGenerationPlanning from '../../hooks/useGenerationPlanning'
import { telephoneValide, lienAppel, ouvrirLien } from '../../lib/remind'
import { formatMontant, formatDate } from '../../lib/format'
import Modal from '../../components/Modal'
import EmptyState from '../../components/EmptyState'
import Avatar from '../../components/Avatar'

const fmtDateTime = (iso) => {
  if (!iso) return '—'
  const d = new Date(iso)
  if (isNaN(d)) return '—'
  return d.toLocaleString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}

export default function ToursTab({ group, readOnly, onGoTo }) {
  const { refresh } = useData()
  const toast = useToast()
  const [annulation, setAnnulation] = useState(null)
  const { tours, membres, sansTour, confirmGen, demanderGeneration, annulerGeneration, generer } =
    useGenerationPlanning(group)
  const prochainTour = tours.filter((t) => t.statut === 'en_attente').sort((a, b) => a.datePrevue.localeCompare(b.datePrevue))[0] || null

  const totalPot = tours.reduce((s, t) => s + Number(t.montantPot || 0), 0)
  const totalRecu = tours.filter((t) => t.statut === 'recu').reduce((s, t) => s + Number(t.montantPot || 0), 0)
  const pctCagnotte = totalPot > 0 ? Math.round((totalRecu / totalPot) * 100) : 0

  const relancer = (t) => {
    const tel = (t.membre?.tel || '').replace(/\D/g, '')
    const msg = encodeURIComponent(
      `Bonjour ${t.membre?.nom || ''}, rappel TONTINE : c'est votre tour de recevoir le pot de ${formatMontant(
        t.montantPot,
        group
      )} (échéance ${formatDate(t.datePrevue)}). Merci de vous préparer.`
    )
    const url = tel ? `https://wa.me/${tel}?text=${msg}` : `https://wa.me/?text=${msg}`
    haptic.tap()
    ouvrirLien(url)
  }

  const statutBadge = (t) => {
    if (t.statut === 'recu') return { cls: 'bg-success-100 text-success-700', label: 'Reçu' }
    if (t.statut === 'annule') return { cls: 'bg-gray-100 text-gray-500', label: 'Annulé' }
    if (t.datePrevue < todayStr())
      return { cls: 'bg-danger-100 text-danger-700', label: 'En retard' }
    return { cls: 'bg-warning-100 text-warning-700', label: 'En attente' }
  }

  // Un tour annulé reste conservé (avec ses cotisations déjà saisies) : supprimer
  // effacerait la trace des paiements déjà reçus.
  const confirmerAnnulation = () => {
    const t = annulation
    setAnnulation(null)
    if (!t) return
    if (annulerTour(t.id) == null) {
      toast.error('Annulation impossible (groupe en lecture seule ou hors ligne).')
      return
    }
    ajouterAuJournal(group.id, 'tour_annule', `Tour #${t.numero} annulé (${t.membre?.nom || '—'})`)
    refresh()
    haptic.tap()
    toast.info(`Tour #${t.numero} annulé`)
  }

  const rouvrir = (t) => {
    if (updateTour(t.id, { statut: 'en_attente' }) == null) {
      toast.error('Réouverture impossible (groupe en lecture seule ou hors ligne).')
      return
    }
    ajouterAuJournal(group.id, 'tour_reouvert', `Tour #${t.numero} remis en attente (${t.membre?.nom || '—'})`)
    refresh()
    haptic.tap()
    toast.success(`Tour #${t.numero} remis en attente`)
  }

  return (
    <div>
      {/* CONFIANCE : date du tirage + progression cagnotte */}
      <div className="card mb-4 p-4">
        <div className="flex items-center justify-between">
          <p className="text-[11px] font-bold uppercase tracking-wide text-gray-400">Date du tirage</p>
          <p className="text-xs font-semibold text-gray-600">{fmtDateTime(group.dateTirage)}</p>
        </div>
        <div className="mt-3">
          <div className="flex items-center justify-between text-xs text-gray-500">
            <span>Cagnotte</span>
            <span className="font-semibold text-gray-700">
              {formatMontant(totalRecu, group)} / {formatMontant(totalPot, group)} · {pctCagnotte}%
            </span>
          </div>
          <div className="mt-1.5 h-2.5 w-full overflow-hidden rounded-full bg-track">
            <div className="h-full rounded-full bg-brand-600 transition-all" style={{ width: `${pctCagnotte}%` }} />
          </div>
        </div>
        {group.penalitePctParJour > 0 && (
          <p className="mt-3 flex items-center gap-1.5 text-[11px] font-semibold text-danger-600">
            <AlertTriangle size={13} /> Pénalité automatique : {group.penalitePctParJour}%/jour en cas de retard
          </p>
        )}
      </div>

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
                onClick={demanderGeneration}
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

      {prochainTour && !readOnly && (
        <div className="card mb-4 p-4 border-brand-200 bg-brand-50">
          <p className="text-[11px] font-bold uppercase tracking-wide text-brand-600">Prochain tour</p>
          <p className="mt-0.5 text-lg font-extrabold text-gray-900">#{prochainTour.numero} · {prochainTour.membre?.nom || '—'}</p>
          <p className="text-xs text-gray-400">Échéance : {formatDate(prochainTour.datePrevue)}</p>
          <button className="btn btn-primary mt-3 w-full" onClick={() => onGoTo('paiements')}>
            <CalendarDays size={16} /> Lancer le tour
          </button>
        </div>
      )}

      {/* 1 CARTE = 1 ACTION. Montant GROS en 1re info. */}
      {tours.length > 0 && (
        <div className="space-y-3">
          {tours.map((t) => {
            const badge = statutBadge(t)
            return (
              <div key={t.id} className={`card p-4 ${t.statut === 'annule' ? 'opacity-60' : ''}`}>
                <div className="flex items-center justify-between">
                  <p className="text-[11px] font-bold uppercase tracking-wide text-gray-400">Tour #{t.numero}</p>
                  <span className={`badge ${badge.cls}`}>{badge.label}</span>
                </div>

                <p className="mt-1 text-3xl font-extrabold leading-none text-gray-900">{formatMontant(t.montantPot, group)}</p>

                <div className="mt-2 flex items-center gap-3">
                  <Avatar src={t.membre?.photo} nom={t.membre?.nom} size={36} className="shrink-0" />
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-gray-800">{t.membre?.nom || '—'}</p>
                    <p className="text-xs text-gray-400">
                      {t.statut === 'recu'
                        ? `Reçu le ${formatDate(t.dateReception)}`
                        : `Échéance : ${formatDate(t.datePrevue)}`}
                    </p>
                    {t.statut === 'en_attente' && Number(t.penaliteAuto) > 0 && (
                      <p className="mt-1 text-xs font-semibold text-danger-600">Pénalité auto : {formatMontant(t.penaliteAuto, group)}</p>
                    )}
                  </div>
                </div>

                {/* ACTION PRINCIPALE UNIQUE */}
                {t.statut === 'en_attente' && (
                  <div className="mt-3">
                    <div className="flex gap-2">
                      <button className="btn btn-primary flex-1" onClick={() => relancer(t)}>
                        <Phone size={16} /> Relancer
                      </button>
                      {telephoneValide(t.membre?.telephone || t.membre?.tel) && (
                        <button
                          className="btn btn-secondary flex-1"
                          onClick={() => {
                            ouvrirLien(lienAppel(t.membre?.telephone || t.membre?.tel))
                            ajouterAuJournal(group.id, 'appel', `Le responsable a appelé ${t.membre?.nom || 'le membre'}`)
                            refresh()
                            haptic.tap()
                          }}
                        >
                          <Phone size={16} /> Appeler
                        </button>
                      )}
                    </div>
                    {!readOnly && (
                      <button
                        className="mt-2 w-full text-center text-xs font-semibold text-gray-400"
                        onClick={() => setAnnulation(t)}
                      >
                        Annuler ce tour
                      </button>
                    )}
                  </div>
                )}
                {t.statut === 'recu' && (
                  <button className="btn btn-secondary mt-3 w-full" onClick={() => onGoTo('paiements')}>
                    <FileImage size={16} /> Voir la preuve
                  </button>
                )}
                {t.statut === 'annule' && (
                  <div className="mt-3">
                    <p className="text-center text-xs text-gray-400">Tour annulé</p>
                    {!readOnly && (
                      <button className="btn btn-secondary mt-2 w-full" onClick={() => rouvrir(t)}>
                        <RotateCcw size={16} /> Remettre en attente
                      </button>
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      <Modal
        open={confirmGen}
        onClose={annulerGeneration}
        title="Générer le planning"
        footer={
          <>
            <button className="btn btn-secondary" onClick={annulerGeneration}>Annuler</button>
            <button className="btn btn-primary" onClick={generer}><Wand2 size={16} /> Générer</button>
          </>
        }
      >
        <p className="text-sm text-gray-600">
          Un tour sera créé pour chaque membre sans tour, espacé de {group.periodeJours} jour(s) à partir de la dernière échéance.
        </p>
      </Modal>

      <Modal
        open={!!annulation}
        onClose={() => setAnnulation(null)}
        title={`Annuler le tour #${annulation?.numero} ?`}
        footer={
          <>
            <button className="btn btn-secondary" onClick={() => setAnnulation(null)}>Revenir</button>
            <button className="btn btn-danger" onClick={confirmerAnnulation}><XCircle size={16} /> Annuler le tour</button>
          </>
        }
      >
        {annulation && (
          <p className="text-sm text-gray-600">
            Le tour de <span className="font-semibold">{annulation.membre?.nom || '—'}</span> disparaît du planning et
            des relances. Les cotisations déjà enregistrées pour ce tour sont conservées ; vous pouvez remettre le tour
            en attente plus tard.
          </p>
        )}
      </Modal>
    </div>
  )
}
