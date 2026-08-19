import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import {
  Plus, Users, Wallet, CalendarClock, Lock, Trash2, UserPlus, Bell,
} from 'lucide-react'
import { useData } from '../context/DataContext'
import { usePin } from '../context/PinContext'
import { useConnection } from '../context/ConnectionContext'
import { useInbox } from '../hooks/useInbox'
import { getMembres, getBilan, getTourProchain, terminerGroup, getPaiementMembre } from '../lib/db'
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

  const premierId = groups[0]?.id

  const synthese = useMemo(() => {
    let cagnotte = 0
    let retard = 0
    let prochainDate = null
    const auj = new Date(); auj.setHours(0, 0, 0, 0)
    for (const g of groups) {
      cagnotte += getBilan(g.id).totalCotis
      const t = getTourProchain(g.id)
      if (t) {
        const d = new Date(t.datePrevue); d.setHours(0, 0, 0, 0)
        if (!prochainDate || d < prochainDate) prochainDate = d
        const ms = getMembres(g.id)
        const paye = ms.filter((m) => getPaiementMembre(t.id, m.id)).length
        if (paye < ms.length && d <= auj) retard += (ms.length - paye)
      }
    }
    return { cagnotte, retard, prochainDate }
  }, [groups])

  return (
    <div className="mx-auto min-h-screen max-w-lg bg-white px-4 pb-24 pt-6 pt-safe">
      <div className="mb-5 flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2.5">
          <Logo size={32} />
          <div className="min-w-0">
            <h1 className="truncate text-lg font-extrabold uppercase leading-tight text-gray-900">{t('dash.mesTontines')}</h1>
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

      <div className="grid grid-cols-3 gap-3">
        <div className="card p-3 text-center">
          <p className="text-[11px] font-bold uppercase text-gray-400">Prochain tour</p>
          <p className="mt-1 text-base font-extrabold text-gray-900">{synthese.prochainDate ? formatDate(synthese.prochainDate) : '—'}</p>
        </div>
        <div className="card p-3 text-center" style={{ borderColor: '#00C85333', background: '#00C8530A' }}>
          <p className="text-[11px] font-bold uppercase" style={{ color: '#00C853' }}>Cagnotte</p>
          <p className="mt-1 text-lg font-extrabold" style={{ color: '#00C853' }}>{formatMontant(synthese.cagnotte, settings)}</p>
        </div>
        <div className="card p-3 text-center" style={{ borderColor: '#FF3B301A', background: '#FF3B300A' }}>
          <p className="text-[11px] font-bold uppercase" style={{ color: '#FF3B30' }}>En retard</p>
          <p className="mt-1 text-lg font-extrabold" style={{ color: '#FF3B30' }}>{synthese.retard}</p>
        </div>
      </div>

      <div className="mt-3 grid grid-cols-3 gap-2">
        <button className="btn btn-primary !py-2.5 text-xs" onClick={ouvrirNouvelle} disabled={modeHorsLigne}>
          <Plus size={16} /> Inviter
        </button>
        <button className="btn !py-2.5 text-xs border bg-white" style={{ borderColor: '#FF3B30', color: '#FF3B30' }} onClick={() => premierId && navigate(`/groupe/${premierId}`)} disabled={!premierId}>
          Qui doit ?
        </button>
        <button className="btn !py-2.5 text-xs border bg-white" style={{ borderColor: '#00C853', color: '#00C853' }} onClick={() => premierId && navigate(`/groupe/${premierId}`)} disabled={!premierId}>
          Lancer le tour
        </button>
      </div>

      {groups.length === 0 ? (
        <div className="card p-6">
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
        </div>
      ) : (
        <div className="mt-4 space-y-2.5">
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
  const prochain = getTourProchain(g.id)
  const aPlanifie = !!prochain
  const s = g

  const parseLocale = (d) => {
    if (!d) return null
    const p = String(d).split('T')[0]
    const [y, m, j] = p.split('-').map(Number)
    return new Date(y, m - 1, j)
  }

  const nbTotal = membres.length
  const payes = prochain ? membres.filter((mm) => getPaiementMembre(prochain.id, mm.id)).length : 0
  const collecte = prochain
    ? membres.reduce((acc, mm) => acc + (getPaiementMembre(prochain.id, mm.id)?.montant || 0), 0)
    : 0
  const montantAttendu = prochain ? prochain.montantPot : g.montantCotisation * nbTotal

  const auj = new Date(); auj.setHours(0, 0, 0, 0)
  const dateTour = parseLocale(prochain?.datePrevue)
  const diffJours = dateTour ? Math.round((dateTour - auj) / 86400000) : null

  const termine = g.statut === 'terminee' || (aPlanifie && nbTotal > 0 && payes === nbTotal)
  const urgent = aPlanifie && diffJours !== null && diffJours <= 0 && payes < nbTotal

  let badge, badgeCouleur, texteDate, alerte, alerteCouleur, boutonPrincipal, boutonUrgent
  if (termine) {
    badge = 'TERMINÉ ✅'; badgeCouleur = '#34C759'
    texteDate = '📅 Collecte clôturée'
    alerte = `Total collecté : ${formatMontant(collecte || montantAttendu, s)} FCFA`
    alerteCouleur = '#34C759'
    boutonPrincipal = 'Voir reçu'; boutonUrgent = false
  } else if (!aPlanifie) {
    badge = 'À VENIR'; badgeCouleur = '#8E8E93'
    texteDate = '📅 Aucun tour planifié'
    alerte = `Prochaine cotisation : ${formatMontant(g.montantCotisation, s)} FCFA`
    alerteCouleur = '#8E8E93'
    boutonPrincipal = 'Générer le planning'; boutonUrgent = false
  } else if (urgent) {
    badge = 'ACTIF'; badgeCouleur = '#34C759'
    texteDate = diffJours === 0 ? '📅 Aujourd’hui ⚠️' : `📅 En retard de ${Math.abs(diffJours)}j`
    const manque = Math.max((g.montantCotisation * nbTotal) - collecte, 0)
    alerte = `Manque : ${formatMontant(manque, s)} FCFA`
    alerteCouleur = '#FF3B30'
    boutonPrincipal = `Payer ${formatMontant(g.montantCotisation, s)} FCFA`; boutonUrgent = true
  } else {
    badge = 'À VENIR'; badgeCouleur = '#8E8E93'
    texteDate = `📅 Dans ${diffJours} jour${diffJours > 1 ? 's' : ''}`
    alerte = `Prochaine cotisation : ${formatMontant(g.montantCotisation, s)} FCFA`
    alerteCouleur = '#8E8E93'
    boutonPrincipal = 'Voir détails'; boutonUrgent = false
  }

  const liseré = termine ? '#34C759' : urgent ? '#FF3B30' : '#8E8E93'
  const pct = montantAttendu > 0 ? Math.min(Math.round((collecte / montantAttendu) * 100), 100) : 0
  const allerGroupe = () => navigate(`/groupe/${g.id}`)

  return (
    <div className="relative animate-fade-up overflow-hidden rounded-[20px] border border-[rgb(var(--border))] bg-surface shadow-[0_8px_28px_rgba(0,0,0,0.10)]">
      <span className="pointer-events-none absolute inset-y-0 left-0 w-1.5 rounded-l-[20px]" style={{ backgroundColor: liseré }} />
      <button className="w-full p-3 pl-4 text-left" onClick={allerGroupe}>
        <div className="flex items-start justify-between gap-2">
          <div className="flex min-w-0 items-center gap-2.5">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl text-[18px]" style={{ backgroundColor: '#007AFF14' }}>💰</div>
            <div className="min-w-0">
              <h3 className="truncate text-sm font-bold text-gray-800">{g.nom}</h3>
              <p className="text-[11px] text-gray-400">{nbTotal} membre(s) · {formatMontant(g.montantCotisation, s)} / tour</p>
            </div>
          </div>
          <div className="flex shrink-0 flex-col items-end gap-1">
            <span className="rounded-full px-2 py-0.5 text-[10px] font-extrabold uppercase tracking-wide" style={{ backgroundColor: badgeCouleur + '1A', color: badgeCouleur }}>{badge}</span>
            {g.rejoint && <span className="badge bg-black/5 text-gray-400">{t('dash.rejoint')}</span>}
          </div>
        </div>

        <p className="mt-2 text-[13px] text-gray-600">{texteDate}</p>

        <div className="mt-2">
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-gray-100">
            <div className="h-full rounded-full" style={{ width: pct + '%', backgroundColor: '#34C759' }} />
          </div>
          <p className="mt-1 text-[11px] text-gray-400">{payes}/{nbTotal} payé · {formatMontant(collecte, s)}/{formatMontant(montantAttendu, s)} FCFA</p>
        </div>

        <p className="mt-2 text-[12px] font-bold" style={{ color: alerteCouleur }}>{alerte}</p>
      </button>

      <button
        className={`w-full py-2.5 text-sm font-extrabold text-white disabled:opacity-40 ${boutonUrgent ? '' : 'bg-brand-500'}`}
        style={boutonUrgent ? { backgroundColor: '#FF3B30' } : undefined}
        onClick={allerGroupe}
        disabled={modeHorsLigne}
      >
        {boutonPrincipal}
      </button>

      <div className="flex items-stretch border-t border-gray-100">
        <button className="flex-1 py-2 text-[11px] font-bold text-gray-500 hover:underline" onClick={allerGroupe}>Détails</button>
        {g.statut === 'active' && aPlanifie && (
          <button
            className="flex-1 border-l border-gray-100 py-2 text-[11px] font-bold text-gray-500 hover:underline disabled:opacity-40"
            onClick={() => { terminerGroup(g.id); refresh() }}
            disabled={modeHorsLigne}
          >Terminer</button>
        )}
        <button
          className="flex-1 border-l border-gray-100 py-2 text-[11px] font-bold text-danger-500 hover:underline disabled:opacity-40"
          onClick={onDelete}
          disabled={modeHorsLigne}
        >Supprimer</button>
      </div>
    </div>
  )
}

