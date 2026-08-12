import { useMemo, useState } from 'react'
import { CheckCircle2, AlertTriangle, CalendarDays, ReceiptText } from 'lucide-react'
import { useData } from '../../context/DataContext'
import { useToast } from '../../context/ToastContext'
import { haptic } from '../../lib/haptique'
import { getToursAvecMembre, getMembres, getCotisationsByTour, payerCotisation, enleverPaiement, marquerTourRecu, getPaiementMembre } from '../../lib/db'
import { formatMontant, formatDate } from '../../lib/format'
import { penaliteEstimee } from '../../lib/penalty'
import { exporterRecuPDF } from '../../lib/export'
import Modal from '../../components/Modal'
import EmptyState from '../../components/EmptyState'

export default function PaymentsTab({ group, readOnly }) {
  const { refresh } = useData()
  const toast = useToast()
  const tours = getToursAvecMembre(group.id)
  const membres = getMembres(group.id)
  const actifs = tours.filter((t) => t.statut === 'en_attente' || t.statut === 'recu')

  const [tourId, setTourId] = useState(() => actifs[0]?.id || null)
  const [datePaiement, setDatePaiement] = useState(() => new Date().toISOString().slice(0, 10))
  const [confirmPot, setConfirmPot] = useState(false)
  const [paiementModal, setPaiementModal] = useState(null)
  const [moyenChoisi, setMoyenChoisi] = useState('')

  const moyens = group.moyensPaiement?.length ? group.moyensPaiement : ['Espèces']

  const tour = actifs.find((t) => t.id === Number(tourId)) || null
  const cotisations = tour ? getCotisationsByTour(tour.id) : []

  const lignes = useMemo(() => {
    if (!tour) return []
    const liste = group.leReceveurCotonise ? membres : membres.filter((m) => m.id !== tour.membreId)
    return liste.map((m) => ({ membre: m, paiement: getPaiementMembre(tour.id, m.id) }))
  }, [tour, membres, tourId, cotisations])

  const payes = cotisations.filter((c) => c.statut === 'paye')
  const totalPot = tour?.montantPot || 0

  const ouvrirPaiement = (m) => {
    setMoyenChoisi(moyens[0] || 'Espèces')
    setPaiementModal({ membre: m })
  }

  const confirmerPaiement = () => {
    payerCotisation(group.id, tour.id, paiementModal.membre.id, group.montantCotisation, datePaiement, moyenChoisi)
    setPaiementModal(null)
    refresh()
    haptic.success()
    toast.success(`Cotisation de ${paiementModal.membre.nom} enregistrée`)
  }

  const retirerPaiement = (m) => {
    const existing = getPaiementMembre(tour.id, m.id)
    if (existing) {
      enleverPaiement(existing.id)
      refresh()
      haptic.tap()
      toast.info(`Paiement de ${m.nom} retiré`)
    }
  }

  if (tours.length === 0) {
    return (
      <EmptyState
        icon={CalendarDays}
        title="Aucun tour"
        description="Générez le planning dans l'onglet Tours pour commencer à enregistrer les cotisations."
      />
    )
  }

  return (
    <div>
      {readOnly && (
        <div className="mb-4 flex items-start gap-2 rounded-2xl border border-info-200 bg-info-50 p-3">
          <AlertTriangle size={16} className="mt-0.5 shrink-0 text-info-500" />
          <p className="text-xs text-info-700">Lecture seule : cotisations gérées par le responsable.</p>
        </div>
      )}
      <div className="card mb-4 p-4">
        <label className="label">Tour à régler</label>
        <select className="input" value={tourId || ''} onChange={(e) => setTourId(e.target.value)}>
          {actifs.map((t) => (
            <option key={t.id} value={t.id}>
              Tour #{t.numero} — {t.membre?.nom} ({t.statut === 'recu' ? 'reçu' : formatDate(t.datePrevue)})
            </option>
          ))}
        </select>

        {tour && (
          <>
            <div className="mt-3 grid grid-cols-2 gap-3">
              <div className="rounded-xl bg-brand-50 p-3">
                <p className="text-[11px] font-semibold text-brand-500">Bénéficiaire</p>
                <p className="text-sm font-bold text-brand-800">{tour.membre?.nom}</p>
              </div>
              <div className="rounded-xl bg-success-50 p-3">
                <p className="text-[11px] font-semibold text-success-500">Pot à recevoir</p>
                <p className="text-sm font-bold text-success-700">{formatMontant(totalPot, group)}</p>
              </div>
            </div>
            <div className="mt-3">
              <label className="label">Date de paiement</label>
              <input className="input" type="date" value={datePaiement} onChange={(e) => setDatePaiement(e.target.value)} disabled={readOnly} />
            </div>
            <div className="mt-3 flex items-center justify-between rounded-xl bg-gray-50 px-3 py-2.5">
              <p className="text-sm font-semibold text-gray-600">
                {payes.length} / {lignes.length} cotisations payées
              </p>
              <p className={`text-sm font-bold ${payes.length >= lignes.length ? 'text-success-600' : 'text-warning-600'}`}>
                {formatMontant(payes.reduce((s, c) => s + Number(c.montant || 0), 0), group)}
              </p>
            </div>
            {!readOnly && payes.length >= lignes.length && tour.statut === 'en_attente' && (
              <button className="btn btn-primary mt-3 w-full" onClick={() => setConfirmPot(true)}>
                <CheckCircle2 size={16} /> Pot complet — marquer reçu
              </button>
            )}
          </>
        )}
      </div>

      <div className="space-y-2">
        {lignes.map(({ membre, paiement }) => {
          const enRetard = !paiement && tour.datePrevue < datePaiement
          const penalite = paiement?.penalite ?? (enRetard ? penaliteEstimee(group, tour) : 0)
          return (
            <div
              key={membre.id}
              className={`card flex items-center gap-2 p-3.5 ${paiement ? 'border-success-200 bg-success-50/50' : ''}`}
            >
              <button
                className="flex min-w-0 flex-1 items-center gap-3 text-left"
                onClick={() => { if (!readOnly) paiement ? retirerPaiement(membre) : ouvrirPaiement(membre) }}
                aria-label={paiement ? `Retirer le paiement de ${membre.nom}` : `Enregistrer la cotisation de ${membre.nom}`}
              >
                <span
                  className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full border-2 ${
                    paiement ? 'border-success-500 bg-success-500 text-white' : 'border-gray-300 bg-surface text-transparent'
                  }`}
                >
                  <CheckCircle2 size={16} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className={`block truncate text-sm font-semibold ${paiement ? 'text-success-700' : 'text-gray-600'}`}>{membre.nom}</span>
                  <span className="block text-xs text-gray-400">
                    {paiement ? (
                      <>
                        Payé le {formatDate(paiement.datePaiement)}
                        {paiement.moyenPaiement && <> · <span className="font-medium text-success-600">{paiement.moyenPaiement}</span></>}
                      </>
                    ) : (
                      'En attente de paiement'
                    )}
                  </span>
                </span>
                <span className="shrink-0 text-right">
                  <span className="block text-sm font-bold text-gray-600">{formatMontant(group.montantCotisation, group)}</span>
                  {penalite > 0 && (
                    <span className="flex items-center justify-end gap-1 text-xs font-semibold text-danger-500">
                      <AlertTriangle size={11} /> +{formatMontant(penalite, group)} pénalité
                    </span>
                  )}
                </span>
              </button>
              {paiement && (
                <button
                  className="shrink-0 rounded-lg p-1.5 text-brand-600 hover:bg-brand-50"
                  onClick={() => exporterRecuPDF(group.id, paiement.id)}
                  aria-label={`Reçu de paiement de ${membre.nom}`}
                  title="Reçu PDF"
                >
                  <ReceiptText size={18} />
                </button>
              )}
            </div>
          )
        })}
      </div>

      <Modal
        open={confirmPot}
        onClose={() => setConfirmPot(false)}
        title="Marquer le pot comme reçu ?"
        footer={
          <>
            <button className="btn btn-secondary" onClick={() => setConfirmPot(false)}>Annuler</button>
            <button
              className="btn btn-primary"
              onClick={() => {
                marquerTourRecu(tour.id, datePaiement)
                setConfirmPot(false)
                refresh()
                haptic.success()
                toast.success(`Pot du tour #${tour.numero} reçu par ${tour.membre?.nom}`)
              }}
            >
              <CheckCircle2 size={16} /> Confirmer
            </button>
          </>
        }
      >
        <p className="text-sm text-gray-600">
          Toutes les cotisations du tour #{tour.numero} sont payées. « {tour.membre?.nom} » reçoit{' '}
          <span className="font-semibold">{formatMontant(totalPot, group)}</span>.
        </p>
      </Modal>

      <Modal
        open={!!paiementModal}
        onClose={() => setPaiementModal(null)}
        title="Enregistrer la cotisation"
        footer={
          <>
            <button className="btn btn-secondary" onClick={() => setPaiementModal(null)}>Annuler</button>
            <button className="btn btn-primary" onClick={confirmerPaiement}>
              <CheckCircle2 size={16} /> Valider
            </button>
          </>
        }
      >
        {paiementModal && (
          <div className="space-y-3">
            <div className="rounded-xl bg-brand-50 p-3 text-center">
              <p className="text-sm font-bold text-brand-800">{paiementModal.membre.nom}</p>
              <p className="mt-1 text-lg font-extrabold text-brand-700">{formatMontant(group.montantCotisation, group)}</p>
            </div>
            <div>
              <label className="label">Moyen de paiement</label>
              <select className="input" value={moyenChoisi} onChange={(e) => setMoyenChoisi(e.target.value)}>
                {moyens.map((m) => (
                  <option key={m} value={m}>{m}</option>
                ))}
              </select>
            </div>
          </div>
        )}
      </Modal>
    </div>
  )
}
