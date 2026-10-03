import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowLeft, BarChart3, TrendingUp, Wallet, AlertTriangle, Trophy } from 'lucide-react'
import { useData } from '../context/DataContext'
import { getBilan, getEpargnes, totalEpargne } from '../lib/db'
import { formatMontant, formatDate } from '../lib/format'
import { t, useLangue } from '../lib/i18n'
import EmptyState from '../components/EmptyState'

function Barre({ valeur, max, couleur }) {
  const pct = max > 0 ? Math.min(100, Math.round((valeur / max) * 100)) : 0
  return (
    <div className="h-2.5 w-full overflow-hidden rounded-full bg-track">
      <div className={`h-full rounded-full ${couleur}`} style={{ width: pct + '%' }} />
    </div>
  )
}

export default function StatsScreen() {
  const navigate = useNavigate()
  const { groups, settings } = useData()
  useLangue()
  const [groupeId, setGroupeId] = useState(null)

  const globaux = useMemo(() => {
    let groupes = 0
    let actifs = 0
    let totalCotis = 0
    let totalRecu = 0
    let penalites = 0
    let membres = 0
    for (const g of groups) {
      groupes++
      if (g.statut !== 'terminee') actifs++
      const b = getBilan(g.id)
      totalCotis += b.totalCotis
      totalRecu += b.totalRecu
      penalites += b.totalPenalites
      membres += b.membres.length
    }
    const epargnes = getEpargnes()
    const totalEpargnes = epargnes.reduce((s, e) => s + totalEpargne(e), 0)
    return { groupes, actifs, totalCotis, totalRecu, penalites, membres, totalEpargnes }
  }, [groups])

  const actif = useMemo(() => {
    const g = groups.find((x) => x.id === Number(groupeId))
    if (!g) return null
    return { groupe: g, bilan: getBilan(g.id) }
  }, [groups, groupeId])

  const classes =
    'flex shrink-0 items-center gap-2 rounded-full border px-3.5 py-1.5 text-xs font-semibold transition'

  return (
    <div className="mx-auto max-w-lg px-4 pb-24 pt-4 pt-safe">
      <div className="mb-5 flex items-center gap-3">
        <button className="btn btn-icon" onClick={() => navigate('/')} aria-label={t('commun.retour')}>
          <ArrowLeft size={18} />
        </button>
        <h1 className="text-xl font-bold text-gray-800">{t('stats.titre')}</h1>
      </div>

      {groups.length === 0 ? (
        <EmptyState icon={BarChart3} title={t('stats.aucuneDonnee')} description={t('stats.aucuneDonneeDesc')} />
      ) : (
        <>
          <div className="mb-5 grid grid-cols-2 gap-3">
            <div className="card p-3.5">
              <div className="flex items-center gap-2 text-brand-600">
                <TrendingUp size={16} />
                <p className="text-[11px] font-bold uppercase tracking-wide text-gray-400">{t('stats.totalCotise')}</p>
              </div>
              <p className="mt-1 text-lg font-extrabold text-brand-600">{formatMontant(globaux.totalCotis, settings)}</p>
              <p className="text-[11px] text-gray-400">{t('stats.nMembresGroupes', { m: globaux.membres, g: globaux.groupes })}</p>
            </div>
            <div className="card p-3.5">
              <div className="flex items-center gap-2 text-brand-600">
                <Wallet size={16} />
                <p className="text-[11px] font-bold uppercase tracking-wide text-gray-400">{t('stats.potRecu')}</p>
              </div>
              <p className="mt-1 text-lg font-extrabold text-gray-800">{formatMontant(globaux.totalRecu, settings)}</p>
              <p className="text-[11px] text-gray-400">{t('stats.penalitesMontant', { montant: formatMontant(globaux.penalites, settings) })}</p>
            </div>
          </div>

          <p className="mb-2 text-[11px] font-bold uppercase tracking-wide text-gray-400">{t('stats.choisir')}</p>
          <div className="mb-5 flex gap-2 overflow-x-auto pb-1">
            {groups.map((g) => (
              <button
                key={g.id}
                className={`${classes} ${Number(groupeId) === g.id || (!groupeId && !actif) ? 'border-brand-500 bg-brand-600 text-white' : 'border-gray-200 bg-surface text-gray-600'}`}
                onClick={() => setGroupeId(g.id)}
              >
                {g.nom}
              </button>
            ))}
          </div>

          {actif && (
            <GroupeStats groupe={actif.groupe} bilan={actif.bilan} settings={settings} />
          )}
        </>
      )}
    </div>
  )
}

function GroupeStats({ groupe: g, bilan, settings }) {
  useLangue()
  const totalTours = bilan.tours.filter((t) => t.statut !== 'annule').length
  const recus = bilan.tours.filter((t) => t.statut === 'recu').length
  const enAttente = bilan.tours.filter((t) => t.statut === 'en_attente').length
  const pctProgression = totalTours ? Math.round((recus / totalTours) * 100) : 0

  const parCotise = [...bilan.parMembre].sort((a, b) => b.cotise - a.cotise)
  const maxCotise = Math.max(1, ...parCotise.map((p) => p.cotise))
  const enRetard = bilan.parMembre.filter((p) => p.nbEnRetard > 0)

  const prochain = bilan.tours
    .filter((t) => t.statut === 'en_attente' && t.datePrevue)
    .sort((a, b) => String(a.datePrevue).localeCompare(String(b.datePrevue)))[0]

  return (
    <div className="space-y-4">
      <div className="card p-4">
        <div className="mb-2 flex items-center justify-between">
          <p className="text-sm font-bold text-gray-800">{g.nom}</p>
          {g.statut === 'terminee' && <span className="badge bg-gray-100 text-gray-500">{t('commun.terminee')}</span>}
        </div>
        <div className="mb-2 flex items-center justify-between text-xs text-gray-500">
          <span>{t('stats.progressionTours', { recus, total: totalTours })}</span>
          <span className="font-bold text-brand-600">{pctProgression}%</span>
        </div>
        <Barre valeur={recus} max={totalTours} couleur="bg-brand-600" />
        {prochain && (
          <p className="mt-3 text-xs text-gray-500">
            {t('stats.prochainTour', { num: prochain.numero, date: formatDate(prochain.datePrevue) })}
            {enAttente > 1 ? ` · ${t('stats.enAttente', { n: enAttente })}` : ''}
          </p>
        )}
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="card p-3.5 text-center">
          <p className="text-base font-extrabold text-success-600">{formatMontant(bilan.totalCotis, g)}</p>
          <p className="text-[11px] text-gray-400">{t('stats.cotise')}</p>
        </div>
        <div className="card p-3.5 text-center">
          <p className="text-base font-extrabold text-danger-500">{formatMontant(bilan.totalPenalites, g)}</p>
          <p className="text-[11px] text-gray-400">{t('stats.penalites')}</p>
        </div>
        <div className="card p-3.5 text-center">
          <p className="text-base font-extrabold text-brand-600">{formatMontant(bilan.totalRecu, g)}</p>
          <p className="text-[11px] text-gray-400">{t('stats.potRecu')}</p>
        </div>
        <div className="card p-3.5 text-center">
          <p className={`text-base font-extrabold ${bilan.soldeGroupe >= 0 ? 'text-gray-800' : 'text-danger-600'}`}>
            {formatMontant(bilan.soldeGroupe, g)}
          </p>
          <p className="text-[11px] text-gray-400">{t('stats.soldeGroupe')}</p>
        </div>
      </div>

      <div className="card p-4">
        <div className="mb-3 flex items-center gap-2">
          <Trophy size={16} className="text-brand-600" />
          <p className="text-sm font-bold text-gray-800">{t('stats.repartition')}</p>
        </div>
        <div className="space-y-3">
          {parCotise.length === 0 && <p className="text-xs text-gray-400">{t('stats.aucuneCotisation')}</p>}
          {parCotise.map((p, idx) => (
            <div key={p.membre.id}>
              <div className="mb-1 flex items-center justify-between text-xs">
                <span className="flex items-center gap-1.5 font-semibold text-gray-700">
                  <span className="grid h-5 w-5 place-items-center rounded-full bg-brand-50 text-[10px] font-bold text-brand-600">
                    {idx + 1}
                  </span>
                  {p.membre.nom}
                </span>
                <span className="font-bold text-gray-800">{formatMontant(p.cotise, g)}</span>
              </div>
              <Barre valeur={p.cotise} max={maxCotise} couleur="bg-success-500" />
            </div>
          ))}
        </div>
      </div>

      {enRetard.length > 0 && (
        <div className="card border-danger-200 bg-danger-50 p-4">
          <div className="mb-2 flex items-center gap-2">
            <AlertTriangle size={16} className="text-danger-600" />
            <p className="text-sm font-bold text-danger-700">{t('stats.membresEnRetard')}</p>
          </div>
          <div className="space-y-1.5">
            {enRetard.map((p) => (
              <div key={p.membre.id} className="flex items-center justify-between text-xs text-danger-700">
                <span className="font-semibold">{p.membre.nom}</span>
                <span>{t('stats.nToursEncours', { n: p.nbEnRetard, montant: formatMontant(p.penalitesEnCours, g) })}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
