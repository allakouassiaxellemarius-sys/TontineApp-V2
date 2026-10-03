import { useState } from 'react'
import { getBilan, getToursAvecMembre } from '../../lib/db'
import { getPaiementsTour, enregistrerPaiement } from '../../lib/paiements'
import { todayStr } from '../../lib/storage'
import { formatMontant, formatDate } from '../../lib/format'
import { HandCoins, Wallet, Users, ShieldCheck, CheckCircle2, AlertCircle } from 'lucide-react'
import { haptic } from '../../lib/haptique'

// Dashboard « banque » : 1 seul KPI (Cagnotte Totale), 1 carte Prochain Tour,
// 1 action principale (Confirmer les paiements du tour).
export default function OverviewTab({ group, onGoTo, readOnly }) {
  const [tick, setTick] = useState(0)
  const [msg, setMsg] = useState('')
  const [msgErreur, setMsgErreur] = useState(false)

  const bilan = getBilan(group.id)
  const tours = getToursAvecMembre(group.id)
  const prochain = tours.find((t) => t.statut === 'en_attente')

  const totalTours = tours.length
  const tourActuel = prochain ? prochain.numero : totalTours
  const progression = totalTours ? Math.round((tourActuel / totalTours) * 100) : 0

  const cagnotteActuelle = Number(bilan.totalRecu) || 0
  const cagnotteTotale = tours.reduce((s, t) => s + (Number(t.montantPot) || 0), 0)
  const solde = Math.max(0, cagnotteTotale - cagnotteActuelle)

  const lignes = prochain ? getPaiementsTour(group, prochain) : []

  const confirmer = () => {
    if (!prochain) return
    const aConfirmer = lignes.filter((l) => l.statut !== 'paye')
    if (aConfirmer.length === 0) {
      setMsgErreur(false)
      setMsg('Tous les paiements sont déjà confirmés')
      return
    }
    const payesAvant = lignes.filter((l) => l.statut === 'paye').length
    aConfirmer.forEach(({ membre }) => {
      enregistrerPaiement(
        group,
        prochain,
        membre,
        Number(group.montantCotisation) || 0,
        todayStr(),
        'Espèces',
        {}
      )
    })
    // enregistrerPaiement échoue en silence (groupe invité ou hors ligne) :
    // on mesure les écritures réelles avant d'annoncer un nombre.
    const ecrits =
      getPaiementsTour(group, prochain).filter((l) => l.statut === 'paye').length - payesAvant
    setTick((t) => t + 1)
    if (ecrits <= 0) {
      setMsgErreur(true)
      setMsg('Enregistrement impossible (groupe en lecture seule ou hors ligne).')
      return
    }
    setMsgErreur(false)
    setMsg(`${ecrits} paiement(s) confirmé(s) — Tour #${prochain.numero}`)
    haptic.success()
  }

  const statutBadge = (statut) => {
    if (statut === 'paye') return { label: 'Payé', cls: 'bg-success-100 text-success-700' }
    if (statut === 'signale') return { label: 'Signalé', cls: 'bg-warning-100 text-warning-700' }
    return { label: 'En attente', cls: 'bg-gray-100 text-gray-400' }
  }

  if (totalTours === 0) {
    return (
      <div className="space-y-3">
        <div className="card p-6 text-center">
          <p className="text-sm text-gray-400">Aucun tour généré pour ce groupe.</p>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-4" key={tick}>
      {readOnly && (
        <div className="flex items-start gap-2 rounded-2xl border border-info-200 bg-info-50 p-3">
          <ShieldCheck size={16} className="mt-0.5 shrink-0 text-info-500" />
          <p className="text-xs text-info-700">
            Groupe invité : planning et membres visibles, montants masqués.
          </p>
        </div>
      )}

      {/* 1 KPI PRINCIPAL — Cagnotte Totale */}
      <div className="card p-5">
        <p className="text-[11px] font-semibold uppercase tracking-widest text-gray-400">
          Cagnotte Totale
        </p>
        <p className="mt-2 text-[42px] font-extrabold leading-none text-gray-900">
          {formatMontant(cagnotteActuelle, group)}
          <span className="ml-1 text-2xl font-bold text-gray-300">
            / {formatMontant(cagnotteTotale, group)}
          </span>
        </p>
        <div className="mt-4 flex gap-8">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-400">
              Total reçu
            </p>
            <p className="text-sm font-bold text-gray-700">
              {formatMontant(cagnotteActuelle, group)}
            </p>
          </div>
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-400">
              Solde
            </p>
            <p className="text-sm font-bold text-gray-700">
              {formatMontant(solde, group)}
            </p>
          </div>
        </div>
      </div>

      {/* PROGRESSION GLOBALE */}
      <div className="card p-4">
        <div className="flex items-center justify-between">
          <p className="text-sm font-bold text-gray-800">
            Tour {tourActuel} sur {totalTours}
          </p>
          <p className="text-xs font-semibold text-gray-400">Progression {progression}%</p>
        </div>
        <div className="mt-2 h-2 overflow-hidden rounded-full bg-track">
          <div
            className="h-full rounded-full bg-brand-500 transition-all"
            style={{ width: `${progression}%` }}
          />
        </div>
        {prochain && (
          <p className="mt-2 text-xs text-gray-400">
            Prochain : {formatDate(prochain.datePrevue)}
          </p>
        )}
      </div>

      {/* PROCHAIN TOUR + ACTION PRINCIPALE */}
      {prochain ? (
        <div className="card p-4">
          <div className="flex items-center gap-2">
            <Wallet size={18} className="text-brand-600" />
            <p className="text-sm font-bold text-gray-800">
              Prochain Tour - {formatDate(prochain.datePrevue)}
            </p>
          </div>

          <div className="mt-3 flex items-baseline justify-between">
            <p className="text-lg font-extrabold text-gray-900">
              {prochain.membre?.nom || '—'}
            </p>
            <p className="text-base font-bold text-gray-400">
              - {formatMontant(Number(prochain.montantPot) || 0, group)}
            </p>
          </div>

          {/* Statut par membre */}
          <div className="mt-3 space-y-1">
            {lignes.map(({ membre, statut }) => {
              const b = statutBadge(statut)
              return (
                <div
                  key={membre.id}
                  className="flex items-center justify-between rounded-lg bg-gray-50 px-3 py-2"
                >
                  <p className="truncate text-xs text-gray-600">{membre.nom}</p>
                  <span className={`badge ${b.cls}`}>{b.label}</span>
                </div>
              )
            })}
          </div>

          {msg && (
            <div
              className={`mt-3 flex items-center gap-2 rounded-xl px-3 py-2 ${
                msgErreur ? 'bg-danger-50' : 'bg-success-50'
              }`}
            >
              {msgErreur ? (
                <AlertCircle size={14} className="text-danger-600" />
              ) : (
                <CheckCircle2 size={14} className="text-success-600" />
              )}
              <p className={`text-xs font-medium ${msgErreur ? 'text-danger-700' : 'text-success-700'}`}>
                {msg}
              </p>
            </div>
          )}

          {/* 1 ACTION PRINCIPALE */}
          {!readOnly && (
            <button className="btn btn-primary mt-3 w-full !py-3 text-base" onClick={confirmer}>
              <HandCoins size={18} /> Confirmer les paiements du tour
            </button>
          )}
        </div>
      ) : (
        <div className="card p-6 text-center">
          <CheckCircle2 size={28} className="mx-auto text-success-500" />
          <p className="mt-2 text-sm font-bold text-gray-800">Tous les tours sont terminés</p>
          <p className="text-xs text-gray-400">La cagnotte a été entièrement distribuée.</p>
        </div>
      )}

      {/* LIEN SECONDAIRE */}
      <button className="btn btn-ghost w-full" onClick={() => onGoTo('membres')}>
        <Users size={16} /> Voir les membres
      </button>
    </div>
  )
}
