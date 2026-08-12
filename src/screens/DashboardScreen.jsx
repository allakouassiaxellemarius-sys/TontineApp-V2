import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import {
  Plus, Users, Wallet, CalendarClock, Lock, ArrowRight, Trash2, UserPlus, Cloud, Bell,
} from 'lucide-react'
import { useData } from '../context/DataContext'
import { usePin } from '../context/PinContext'
import { useConnection } from '../context/ConnectionContext'
import { useInbox } from '../hooks/useInbox'
import { getMembres, getBilan, getTourProchain, terminerGroup } from '../lib/db'
import { supprimerGroupeComplet } from '../lib/syncEngine'
import { useAuth } from '../context/AuthContext'
import { useToast } from '../context/ToastContext'
import { haptic } from '../lib/haptique'
import { formatMontant, formatDate } from '../lib/format'
import { useActions } from '../context/ActionsContext'
import { t, useLangue } from '../lib/i18n'
import Modal from '../components/Modal'
import EmptyState from '../components/EmptyState'
import Logo from '../components/Logo'

export default function DashboardScreen() {
  const { groups, refresh, settings } = useData()
  const { verrouiller } = usePin()
  const { enLigne, modeHorsLigne } = useConnection()
  const { utilisateur } = useAuth()
  const inbox = useInbox()
  const navigate = useNavigate()
  const toast = useToast()
  const { ouvrirNouvelle, ouvrirRejoindre } = useActions()
  useLangue()
  const [confirmDelete, setConfirmDelete] = useState(null)

  // Recharger les groupes à chaque affichage de l'accueil.
  useEffect(() => { refresh() }, [refresh])

  const stats = useMemo(() => {
    let groupes = 0
    let membres = 0
    let totalCotis = 0
    for (const g of groups) {
      groupes++
      membres += getMembres(g.id).length
      totalCotis += getBilan(g.id).totalCotis
    }
    return { groupes, membres, totalCotis }
  }, [groups])

  return (
    <div className="mx-auto max-w-lg px-4 pb-24 pt-6 pt-safe">
      <div className="mb-6 flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2.5">
          <Logo size={32} />
          <div className="min-w-0">
            <h1 className="truncate text-lg font-extrabold uppercase leading-tight text-gray-800">{t('dash.mesTontines')}</h1>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          <button className="btn btn-icon" onClick={verrouiller} aria-label={t('dash.verrouiller')}>
            <Lock size={18} />
          </button>
          <Link to="/notifications" className="btn btn-icon relative" aria-label={t('dash.notifications')}>
            <Bell size={18} />
            {inbox.nonLues > 0 && (
              <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-danger-500 px-1 text-[10px] font-bold text-white">
                {inbox.nonLues > 99 ? '99+' : inbox.nonLues}
              </span>
            )}
          </Link>
        </div>
      </div>

      {stats.groupes > 0 && (
        <div className="mb-5 grid grid-cols-3 gap-3">
          <div className="card p-3 text-center">
            <p className="text-lg font-bold text-gray-800">{stats.groupes}</p>
            <p className="text-[11px] text-gray-400">{t('dash.groupes')}</p>
          </div>
          <div className="card p-3 text-center">
            <p className="text-lg font-bold text-gray-800">{stats.membres}</p>
            <p className="text-[11px] text-gray-400">{t('dash.membres')}</p>
          </div>
          <div className="card p-3 text-center">
            <p className="text-base font-bold text-brand-600">{formatMontant(stats.totalCotis, settings)}</p>
            <p className="text-[11px] text-gray-400">{t('dash.cotise')}</p>
          </div>
        </div>
      )}

      {!utilisateur && stats.groupes > 0 && enLigne && (
        <Link to="/parametres" className="mb-5 flex items-center gap-3 rounded-2xl border border-brand-200 bg-brand-50 px-4 py-3">
          <Cloud size={18} className="shrink-0 text-brand-600" />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-bold text-brand-700">{t('dash.sauvegardezTitre')}</p>
            <p className="text-xs text-brand-600">{t('dash.sauvegardezTexte')}</p>
          </div>
          <ArrowRight size={16} className="shrink-0 text-brand-500" />
        </Link>
      )}

      {groups.length === 0 ? (
        <EmptyState
          icon={Users}
          title={t('dash.aucuneTontine')}
          description={t('dash.aucuneTontineDesc')}
          action={
            <div className="flex flex-col gap-2">
              <button className="btn btn-primary" onClick={ouvrirNouvelle} disabled={modeHorsLigne}>
                <Plus size={18} /> {t('dash.creerTontine')}
              </button>
              <button className="btn btn-secondary" onClick={ouvrirRejoindre} disabled={modeHorsLigne}>
                <UserPlus size={18} /> {t('dash.rejoindreGroupe')}
              </button>
            </div>
          }
        />
      ) : (
        <div className="space-y-3">
          {groups.map((g) => (
            <GroupCard key={g.id} group={g} settings={settings} onDelete={() => setConfirmDelete(g)} refresh={refresh} />
          ))}
        </div>
      )}

      <Modal
        open={!!confirmDelete}
        onClose={() => setConfirmDelete(null)}
        title={t('dash.supprimerTitre')}
        footer={
          <>
            <button className="btn btn-secondary" onClick={() => setConfirmDelete(null)}>{t('commun.annuler')}</button>
            <button
              className="btn btn-danger"
              onClick={() => {
                supprimerGroupeComplet(confirmDelete.id, utilisateur ? utilisateur.uid : null)
                setConfirmDelete(null)
                refresh()
                haptic.warning()
                toast.info(t('dash.supprimee', { nom: confirmDelete.nom }))
              }}
            >
              <Trash2 size={16} /> {t('commun.supprimer')}
            </button>
          </>
        }
      >
        <p className="text-sm text-gray-600">
          {confirmDelete?.rejoint ? (
            <>
            {t('dash.supprimerDescRejoint')}
          </>
        ) : (
          <>{t('dash.supprimerDesc', { nom: confirmDelete?.nom })}</>
          )}
        </p>
      </Modal>
    </div>
  )
}

function GroupCard({ group: g, settings, onDelete, refresh }) {
  const navigate = useNavigate()
  const { modeHorsLigne } = useConnection()
  useLangue()
  const membres = getMembres(g.id)
  const bilan = getBilan(g.id)
  const prochain = getTourProchain(g.id)
  const s = g

  return (
    <div className="card overflow-hidden">
      <button className="w-full p-4 text-left" onClick={() => navigate(`/groupe/${g.id}`)}>
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-brand-50 text-brand-600">
              <Wallet size={22} />
            </div>
            <div>
              <h3 className="font-bold text-gray-800">{g.nom}</h3>
              <p className="text-xs text-gray-400">
                {t('dash.nMembres', { n: membres.length })} · {formatMontant(g.montantCotisation, s)} {t('dash.parTour')}
              </p>
            </div>
          </div>
          {g.statut === 'terminee' && <span className="badge bg-gray-100 text-gray-500">{t('dash.terminee')}</span>}
          {g.rejoint && <span className="badge bg-info-50 text-info-600">{t('dash.rejoint')}</span>}
        </div>

        <div className="mt-4 flex items-center justify-between rounded-xl bg-gray-50 px-3 py-2.5">
          <div className="flex items-center gap-2 text-sm text-gray-600">
            <CalendarClock size={16} className="text-brand-500" />
            {prochain ? (
              <span>
                {t('dash.tourNum', { num: prochain.numero })} · <span className="font-semibold">{formatDate(prochain.datePrevue)}</span>
              </span>
            ) : (
              <span className="text-gray-400">{t('dash.planning')}</span>
            )}
          </div>
          <span className={`text-sm font-semibold ${bilan.soldeGroupe >= 0 ? 'text-success-600' : 'text-danger-600'}`}>
            {formatMontant(bilan.soldeGroupe, s)}
          </span>
        </div>
      </button>

      <div className="flex border-t border-gray-100">
        {g.statut === 'active' && (
          <button className="flex flex-1 items-center justify-center py-2.5 text-xs font-semibold text-gray-500 hover:bg-gray-50 disabled:opacity-40" onClick={() => { terminerGroup(g.id); refresh(); }} disabled={modeHorsLigne}>
            {t('dash.terminer')}
          </button>
        )}
        {g.statut === 'terminee' && (
          <button className="flex flex-1 items-center justify-center py-2.5 text-xs font-semibold text-brand-600 hover:bg-brand-50 disabled:opacity-40" onClick={() => { terminerGroup(g.id, false); refresh(); }} disabled={modeHorsLigne}>
            {t('dash.reactiver')}
          </button>
        )}
        <button className="flex flex-1 items-center justify-center gap-1 py-2.5 text-xs font-semibold text-danger-500 hover:bg-danger-50 disabled:opacity-40" onClick={onDelete} disabled={modeHorsLigne}>
          <Trash2 size={14} /> {t('commun.supprimer')}
        </button>
      </div>
    </div>
  )
}

