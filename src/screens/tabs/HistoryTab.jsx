import { History, ArrowDownCircle, ArrowUpCircle, Coins, UserCheck, AlertTriangle } from 'lucide-react'
import { getBilan, getHistorique } from '../../lib/db'
import { formatMontant, formatDate } from '../../lib/format'
import EmptyState from '../../components/EmptyState'

export default function HistoryTab({ group }) {
  const bilan = getBilan(group.id)
  const histo = getHistorique(group.id)

  const statMini = 'card p-3 text-center'
  const statMiniIcon = 'mb-1 flex justify-center'

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-3">
        <div className={statMini}>
          <div className={statMiniIcon}><Coins size={16} color="#10b981" /></div>
          <p className="text-sm font-bold text-gray-800">{formatMontant(bilan.totalCotis, group)}</p>
          <p className="text-[10px] text-gray-400">Cotisé</p>
        </div>
        <div className={statMini}>
          <div className={statMiniIcon}><ArrowDownCircle size={16} color="#3b82f6" /></div>
          <p className="text-sm font-bold text-gray-800">{formatMontant(bilan.totalRecu, group)}</p>
          <p className="text-[10px] text-gray-400">Reçu</p>
        </div>
        <div className={statMini}>
          <div className={statMiniIcon}><UserCheck size={16} color="#f59e0b" /></div>
          <p className="text-sm font-bold text-gray-800">{formatMontant(bilan.totalPenalites, group)}</p>
          <p className="text-[10px] text-gray-400">Pénalités</p>
        </div>
      </div>

      <div className={`rounded-2xl p-4 text-center ${bilan.soldeGroupe === 0 ? 'bg-success-50' : 'bg-brand-50'}`}>
        <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">Solde du groupe</p>
        <p className={`mt-1 text-xl font-bold ${bilan.soldeGroupe === 0 ? 'text-success-600' : bilan.soldeGroupe > 0 ? 'text-brand-800' : 'text-danger-500'}`}>
          {formatMontant(bilan.soldeGroupe, group)}
        </p>
        <p className="mt-1 text-xs text-gray-400">
          {bilan.soldeGroupe === 0
            ? 'La caisse est équilibrée'
            : bilan.soldeGroupe > 0
              ? 'Montant non encore distribué'
              : 'Montant distribué en avance'}
        </p>
      </div>

      {bilan.totalPenalitesEnCours > 0 && (
        <div className="flex items-start gap-2 rounded-2xl border border-warning-200 bg-warning-50 p-3">
          <AlertTriangle size={16} className="mt-0.5 shrink-0 text-warning-500" />
          <p className="text-xs text-warning-700">
            Pénalités en cours : <span className="font-semibold">{formatMontant(bilan.totalPenalitesEnCours, group)}</span> — s'accumulent chaque jour tant que les tours en retard ne sont pas réglés.
          </p>
        </div>
      )}

      <div className="card p-4">
        <p className="mb-3 text-sm font-bold text-gray-600">Solde par membre</p>
        {bilan.parMembre.length === 0 ? (
          <p className="text-sm text-gray-400">Aucun membre.</p>
        ) : (
          <div className="space-y-2">
            {bilan.parMembre.map((p) => (
              <div key={p.membre.id} className="flex items-center justify-between rounded-xl bg-gray-50 px-3 py-2">
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-gray-600">{p.membre.nom}</p>
                  <p className="text-[11px] text-gray-400">
                    Cotisé {formatMontant(p.cotise, group)} · Reçu {formatMontant(p.recu, group)}
                    {p.penalites > 0 && <> · Pénalités {formatMontant(p.penalites, group)}</>}
                  </p>
                  {p.penalitesEnCours > 0 && (
                    <p className="text-[11px] font-semibold text-warning-600">
                      + {formatMontant(p.penalitesEnCours, group)} de pénalités en cours ({p.nbEnRetard} tour{p.nbEnRetard > 1 ? 's' : ''} en retard)
                    </p>
                  )}
                </div>
                <p className={`shrink-0 text-sm font-bold ${p.solde >= 0 ? 'text-success-600' : 'text-danger-500'}`}>
                  {p.solde >= 0 ? '+' : ''}{formatMontant(p.solde, group)}
                </p>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="card p-4">
        <p className="mb-3 text-sm font-bold text-gray-600">Historique des mouvements</p>
        {histo.length === 0 ? (
          <EmptyState icon={History} title="Aucun mouvement" description="Les paiements et réceptions apparaîtront ici." />
        ) : (
          <div className="flex flex-col gap-1">
            {histo.map((e, i) => (
              <div key={i} className="flex items-start gap-3 rounded-xl px-2 py-2 hover:bg-gray-50">
                <div
                  className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${
                    e.type === 'paiement' ? 'bg-success-100 text-success-600' : 'bg-info-100 text-info-600'
                  }`}
                >
                  {e.type === 'paiement' ? <ArrowUpCircle size={16} /> : <ArrowDownCircle size={16} />}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm text-gray-600">{e.libelle}</p>
                  <p className="text-[11px] text-gray-400">
                    {formatDate(e.date)}
                    {e.type === 'paiement' && e.moyenPaiement && <> · via {e.moyenPaiement}</>}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-sm font-bold text-gray-600">{formatMontant(e.montant, group)}</p>
                  {e.penalite > 0 && <p className="text-[11px] font-semibold text-danger-500">+{formatMontant(e.penalite, group)}</p>}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
