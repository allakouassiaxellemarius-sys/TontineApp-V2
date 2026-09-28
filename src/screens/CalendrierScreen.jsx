import { useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowLeft, Calendar, CalendarDays, ChevronRight } from 'lucide-react'
import { useData } from '../context/DataContext'
import { getToursAvecMembre } from '../lib/db'
import { formatMontant, formatDate } from '../lib/format'
import { t, useLangue } from '../lib/i18n'
import EmptyState from '../components/EmptyState'

export default function CalendrierScreen() {
  const navigate = useNavigate()
  const { groups, settings } = useData()
  useLangue()

  const echeances = useMemo(
    () =>
      groups
        .flatMap((groupe) =>
          getToursAvecMembre(groupe.id)
            .filter((tour) => tour.datePrevue && tour.statut !== 'recu' && tour.statut !== 'annule')
            .map((tour) => ({ group: groupe, tour }))
        )
        .sort((a, b) => new Date(a.tour.datePrevue) - new Date(b.tour.datePrevue)),
    [groups]
  )

  return (
    <div className="app-shell mx-auto min-h-screen max-w-lg px-4 pb-24 pt-4 pt-safe">
      <div className="mb-5 flex items-center gap-3">
        <button className="btn btn-icon" onClick={() => navigate('/')} aria-label={t('calendrier.retour')}>
          <ArrowLeft size={18} />
        </button>
        <div>
          <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-[var(--success)]">
            {t('calendrier.eyebrow')}
          </p>
          <h1 className="font-serif text-xl font-bold text-[var(--text)]">{t('calendrier.titre')}</h1>
        </div>
      </div>

      <div className="hero-wallet mb-5 rounded-[26px] p-5">
        <div className="relative z-10 flex items-center gap-3">
          <div className="grid h-12 w-12 place-items-center rounded-2xl bg-white/20">
            <Calendar size={24} />
          </div>
          <div>
            <p className="text-sm font-bold">{t('calendrier.introTitre')}</p>
            <p className="mt-1 text-xs text-white/80">{t('calendrier.introTexte')}</p>
          </div>
        </div>
      </div>

      {echeances.length === 0 ? (
        <EmptyState
          icon={Calendar}
          title={t('calendrier.videTitre')}
          description={t('calendrier.videTexte')}
        />
      ) : (
        <div className="space-y-3">
          {echeances.map(({ group, tour }) => (
            <button
              key={`${group.id}-${tour.id}`}
              className="card flex w-full items-center gap-3 text-left"
              onClick={() => navigate(`/groupe/${group.id}?tab=apercu`)}
            >
              <div className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-[var(--bg)] text-[var(--success)]">
                <CalendarDays size={20} />
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-bold text-[var(--text)]">{group.nom}</p>
                <p className="mt-1 text-xs text-[var(--text-muted)]">
                  Tour #{tour.numero} · {formatDate(tour.datePrevue)}
                </p>
                <p className="mt-1 text-xs font-semibold text-[var(--success)]">
                  {(tour.membre && tour.membre.nom) || t('calendrier.beneficiaire')} · {formatMontant(tour.montantPot || 0, settings)}
                </p>
              </div>
              <ChevronRight size={18} className="shrink-0 text-[var(--text-muted)]" />
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
