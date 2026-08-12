import { Wallet, TrendingUp, Coins, CalendarClock, Users, BellRing, ArrowRight, ShieldCheck, HandCoins } from 'lucide-react'
import { getBilan, getToursAvecMembre, getMembres, getPrets, etatPret, resteAPayer } from '../../lib/db'
import { formatMontant, formatDate } from '../../lib/format'
import StatCard from '../../components/StatCard'
import EmptyState from '../../components/EmptyState'

export default function OverviewTab({ group, onGoTo, readOnly }) {
  const bilan = getBilan(group.id)
  const tours = getToursAvecMembre(group.id)
  const membres = getMembres(group.id)
  const prochain = tours.find((t) => t.statut === 'en_attente')
  const enRetard = tours.filter((t) => t.statut === 'en_attente' && t.datePrevue < new Date().toISOString().slice(0, 10))
  const prets = getPrets(group.id)
  const pretsActifs = prets.filter((p) => etatPret(p) !== 'rembourse')
  const pretsEnRetard = pretsActifs.filter((p) => etatPret(p) === 'en_retard')
  const restantPrets = pretsActifs.reduce((s, p) => s + resteAPayer(p), 0)

  return (
    <div className="space-y-4">
      {readOnly ? (
        <div className="flex items-start gap-2 rounded-2xl border border-info-200 bg-info-50 p-3">
          <ShieldCheck size={16} className="mt-0.5 shrink-0 text-info-500" />
          <p className="text-xs text-info-700">Groupe invité : planning et membres visibles, montants masqués.</p>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3">
          <StatCard icon={Wallet} label="Total cotisé" value={formatMontant(bilan.totalCotis, group)} color="text-success-600 bg-success-50" />
          <StatCard icon={TrendingUp} label="Total reçu" value={formatMontant(bilan.totalRecu, group)} color="text-info-600 bg-info-50" />
          <StatCard
            icon={Coins}
            label="Solde groupe"
            value={formatMontant(bilan.soldeGroupe, group)}
            color={bilan.soldeGroupe >= 0 ? 'text-brand-600 bg-brand-50' : 'text-danger-600 bg-danger-50'}
          />
          <StatCard
            icon={Users}
            label="Membres"
            value={membres.length}
            sub={bilan.totalPenalites ? `${formatMontant(bilan.totalPenalites, group)} de pénalités` : ''}
            color="text-warning-600 bg-warning-50"
          />
        </div>
      )}

      {prochain ? (
        <div className="card overflow-hidden">
          <div className="flex items-center justify-between bg-gradient-to-r from-brand-600 to-brand-700 px-4 py-3 text-white">
            <div className="flex items-center gap-2">
              <CalendarClock size={16} />
              <span className="text-sm font-semibold">Prochain tour</span>
            </div>
            {enRetard.length > 0 && (
              <span className="badge bg-danger-500 text-white">{enRetard.length} en retard</span>
            )}
          </div>
          <div className="p-4">
            <p className="text-lg font-bold text-gray-800">Tour #{prochain.numero}</p>
            <p className="text-sm text-gray-400">
              Bénéficiaire : <span className="font-semibold text-gray-600">{prochain.membre?.nom || '—'}</span>
            </p>
            <div className="mt-3 flex items-center justify-between rounded-xl bg-gray-50 px-3 py-2.5">
              <div>
                <p className="text-xs text-gray-400">Date prévue</p>
                <p className="text-sm font-semibold text-gray-600">{formatDate(prochain.datePrevue)}</p>
              </div>
              {!readOnly && (
                <div className="text-right">
                  <p className="text-xs text-gray-400">Pot à recevoir</p>
                  <p className="text-sm font-bold text-brand-600">{formatMontant(prochain.montantPot, group)}</p>
                </div>
              )}
            </div>
            {!readOnly && (
              <button className="btn btn-primary mt-3 w-full" onClick={() => onGoTo('paiements')}>
                <Wallet size={16} /> Enregistrer les cotisations
              </button>
            )}
          </div>
        </div>
      ) : tours.length ? (
        <div className="card p-4 text-center">
          <p className="text-sm text-gray-400">Tous les tours sont terminés 🎉</p>
        </div>
      ) : (
        <EmptyState
          icon={CalendarClock}
          title="Planning à générer"
          description={readOnly ? "Le planning sera disponible quand le responsable l'aura généré." : "Ajoutez des membres puis générez le planning des tours."}
          action={!readOnly && <button className="btn btn-primary" onClick={() => onGoTo('membres')}><Users size={16} /> Ajouter des membres</button>}
        />
      )}

      <div className="card p-4">
        <div className="mb-3 flex items-center justify-between">
          <p className="text-sm font-bold text-gray-600">Prochains tours</p>
          <button className="flex items-center gap-1 text-xs font-semibold text-brand-600" onClick={() => onGoTo('tours')}>
            Tout voir <ArrowRight size={13} />
          </button>
        </div>
        {tours.filter((t) => t.statut === 'en_attente').length === 0 ? (
          <p className="text-sm text-gray-400">Aucun tour en attente.</p>
        ) : (
          <div className="space-y-2">
            {tours
              .filter((t) => t.statut === 'en_attente')
              .slice(0, 4)
              .map((t) => (
                <div key={t.id} className="flex items-center justify-between rounded-xl bg-gray-50 px-3 py-2">
                  <div className="flex items-center gap-3">
                    <span className="badge bg-surface text-gray-600 border border-gray-200">#{t.numero}</span>
                    <div>
                      <p className="text-sm font-semibold text-gray-600">{t.membre?.nom || '—'}</p>
                      <p className="text-[11px] text-gray-400">{formatDate(t.datePrevue)}</p>
                    </div>
                  </div>
                  {!readOnly && <p className="text-sm font-bold text-gray-600">{formatMontant(t.montantPot, group)}</p>}
                </div>
              ))}
          </div>
        )}
      </div>

      {!readOnly && pretsActifs.length > 0 && (
        <button
          className="card flex w-full items-center justify-between p-4 text-left"
          onClick={() => onGoTo('prets')}
        >
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-warning-50 text-warning-600">
              <HandCoins size={20} />
            </span>
            <div>
              <p className="text-sm font-bold text-gray-800">
                {pretsActifs.length} prêt{pretsActifs.length > 1 ? 's' : ''} en cours
              </p>
              <p className="text-xs text-gray-400">
                {formatMontant(restantPrets, group)} à percevoir
                {pretsEnRetard.length > 0 && <span className="font-semibold text-danger-500"> · {pretsEnRetard.length} en retard</span>}
              </p>
            </div>
          </div>
          <ArrowRight size={18} className="text-gray-300" />
        </button>
      )}

      {!readOnly && membres.length > 0 && (
        <button
          className="flex w-full items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-brand-200 bg-brand-50/50 px-4 py-3 text-sm font-semibold text-brand-700"
          onClick={() => onGoTo('rappels')}
        >
          <BellRing size={16} /> Envoyer des rappels
        </button>
      )}
    </div>
  )
}
