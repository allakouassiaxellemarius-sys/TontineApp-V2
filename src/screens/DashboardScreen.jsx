import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import {
  Plus, Users, Trash2, UserPlus, Eye, BarChart3,
  MoreHorizontal, Share2, FileDown, Settings, SlidersHorizontal,
  Compass, Search, X, ChevronDown, Sparkles, PiggyBank,
} from 'lucide-react'
import { useData } from '../context/DataContext'
import { useConnection } from '../context/ConnectionContext'
import { useInbox } from '../hooks/useInbox'
import { getMembres, getBilan, getTourProchain, getHistorique, terminerGroup, getPaiementMembre, getEpargnes, totalEpargne } from '../lib/db'
import { supprimerGroupeComplet, activerSynchro } from '../lib/syncEngine'
import { exporterBilanPDF } from '../lib/export'
import { creerTontineDemo } from '../lib/demo'
import { useAuth } from '../context/AuthContext'
import { useToast } from '../context/ToastContext'
import { haptic } from '../lib/haptique'
import { formatMontant, formatDate } from '../lib/format'
import { VERSION_APP } from '../lib/version'
import { useActions } from '../context/ActionsContext'
import { t, useLangue } from '../lib/i18n'
import Modal from '../components/Modal'
import ConfirmationRenforcee from '../components/ConfirmationRenforcee'
import EmptyState from '../components/EmptyState'
import Logo from '../components/Logo'
import Avatar from '../components/Avatar'
import Menu from '../components/ui/Menu'

const ONGLETS = [
  { id: 'apercu', label: 'Aperçu', icon: Eye },
  { id: 'tontines', label: 'Tontines', icon: Users },
]

function lireOnglet() {
  try {
    const v = localStorage.getItem('tontine_accueil_onglet')
    // 'epargne' y figurait encore : un onglet mémorisé qui n'existe plus dans
    // ONGLETS laisse l'accueil sans contenu (ni aperçu ni tontines).
    return ['apercu', 'tontines'].includes(v) ? v : 'apercu'
  } catch {
    return 'apercu'
  }
}

export default function DashboardScreen() {
  const { groups, refresh, settings } = useData()
  const { modeHorsLigne } = useConnection()
  const { utilisateur } = useAuth()
  // Hub d'abonnement des notifications (push FCM + rappels locaux) : l'appeler
  // ici maintient la réception au premier plan sur tout l'écran d'accueil.
  useInbox()
  const navigate = useNavigate()
  const toast = useToast()
  const { ouvrirNouvelle, ouvrirRejoindre } = useActions()
  useLangue()
  const [confirmDelete, setConfirmDelete] = useState(null)
  const [confirmCodeDelete, setConfirmCodeDelete] = useState(null)
  const [chargement, setChargement] = useState(true)
  const [tri, setTri] = useState('nom')
  const [filtre, setFiltre] = useState('toutes')
  const [recherche, setRecherche] = useState('')
  const [onglet, setOnglet] = useState(lireOnglet)

  useEffect(() => {
    const minuteur = setTimeout(() => setChargement(false), 700)
    return () => clearTimeout(minuteur)
  }, [])

  const changerOnglet = (id) => {
    if (id === onglet) return
    haptic.tap()
    setOnglet(id)
    try {
      localStorage.setItem('tontine_accueil_onglet', id)
    } catch {
      // stockage indisponible
    }
  }

  const dateTri = (g) => {
    const tr = getTourProchain(g.id)
    return tr ? new Date(tr.datePrevue) : new Date(0)
  }

  const groupesAffiches = useMemo(() => {
    let r = groups
    if (filtre === 'actives') r = r.filter((g) => g.statut !== 'terminee')
    else if (filtre === 'terminees') r = r.filter((g) => g.statut === 'terminee')
    else if (filtre === 'rejointes') r = r.filter((g) => g.rejoint)
    const q = recherche.trim().toLowerCase()
    if (q) r = r.filter((g) => (g.nom || '').toLowerCase().includes(q))
    return r.slice().sort((a, b) => {
      if (tri === 'nom') return (a.nom || '').localeCompare(b.nom || '')
      if (tri === 'echeance') return dateTri(a) - dateTri(b)
      if (tri === 'montant') return getBilan(b.id).totalCotis - getBilan(a.id).totalCotis
      if (tri === 'statut') return (a.statut === 'terminee' ? 1 : 0) - (b.statut === 'terminee' ? 1 : 0)
      return 0
    })
  }, [groups, tri, filtre, recherche])

  useEffect(() => { refresh() }, [refresh])

  const premierId = groups[0]?.id
  const prenom = (utilisateur?.displayName || utilisateur?.email || '').toString().split(/[\s@._-]/)[0] || ''
  const epargneTotale = getEpargnes().reduce((s, e) => s + totalEpargne(e), 0)

  const ouvrirAssistant = (prefill) => {
    if (!premierId) { ouvrirNouvelle(); return }
    navigate(`/groupe/${premierId}/assistant`, prefill ? { state: { prefill } } : undefined)
  }

  const synthese = useMemo(() => {
    let cagnotte = 0
    let retard = 0
    let prochainDate = null
    let variationSemaine = 0
    const auj = new Date(); auj.setHours(0, 0, 0, 0)
    const ilYA7Jours = Date.now() - 7 * 86400000
    for (const g of groups) {
      cagnotte += getBilan(g.id).totalCotis
      for (const ev of getHistorique(g.id)) {
        if (ev.type === 'paiement' && ev.date && new Date(ev.date).getTime() >= ilYA7Jours) {
          variationSemaine += Number(ev.montant || 0)
        }
      }
      const t = getTourProchain(g.id)
      if (t) {
        const d = new Date(t.datePrevue); d.setHours(0, 0, 0, 0)
        if (!prochainDate || d < prochainDate) prochainDate = d
        const ms = getMembres(g.id)
        const paye = ms.filter((m) => getPaiementMembre(t.id, m.id)).length
        if (paye < ms.length && d <= auj) retard += (ms.length - paye)
      }
    }
    return { cagnotte, retard, prochainDate, variationSemaine }
  }, [groups])

  // Récap partageable (feuille de route WhatsApp / partage natif Android).
  const partagerRecap = async () => {
    const texte = [
      '📊 Récap de mes tontines — Tontine Manager',
      `• Tontines suivies : ${groups.length}`,
      `• Cagnotte totale : ${formatMontant(synthese.cagnotte, settings)}`,
      `• Cotisations attendues : ${synthese.retard}`,
      synthese.prochainDate ? `• Prochaine collecte : ${formatDate(synthese.prochainDate)}` : null,
    ].filter(Boolean).join('\n')
    try {
      if (navigator.share) {
        await navigator.share({ title: 'Tontine Manager', text: texte })
        return
      }
      throw new Error('share indisponible')
    } catch (e) {
      if (e && e.name === 'AbortError') return
      try {
        await navigator.clipboard.writeText(texte)
        toast.success('Récap copié — collez-le dans WhatsApp')
      } catch {
        toast.error('Partage impossible sur cet appareil')
      }
    }
  }

  return (
    <div className="app-shell relative mx-auto min-h-screen max-w-lg px-4 pb-28 pt-6 pt-safe">
      <div className="mb-5 flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2.5">
          <span className="animate-logo-pop inline-flex"><Logo size={36} /></span>
          <div className="min-w-0">
            <h1 className="truncate font-serif text-lg font-bold leading-tight text-[var(--text)]">
              {prenom ? 'Bonjour ' + prenom : t('dash.mesTontines')}
            </h1>
            <p className="text-[11px] font-medium text-[var(--text-muted)]">Tontine Manager</p>
          </div>
        </div>
        <Link
          to="/profil"
          aria-label={t('nav.profil')}
          className="inline-flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-full ring-2 ring-[var(--border)]"
        >
          <Avatar src={utilisateur?.photoURL} nom={utilisateur?.displayName || utilisateur?.email || ''} size={34} />
        </Link>
      </div>

      <div className="mb-3 flex items-center justify-between gap-2 rounded-2xl border border-[var(--border)] bg-[var(--bg-card)]/90 px-3 py-2 shadow-sm">
        <div className="flex items-center gap-2">
          <span className="inline-flex items-center rounded-full border border-[var(--border)] bg-[rgba(108,106,147,0.08)] px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--text-muted)]">
            v{VERSION_APP}
          </span>
          <span className="text-[11px] text-[var(--text-dim)]">{modeHorsLigne ? 'Hors ligne' : 'En ligne'}</span>
        </div>
      </div>

      <div className="sticky top-0 z-20 -mx-4 mb-3 bg-[var(--bg)]/85 px-4 pb-2 pt-1 backdrop-blur-xl">
        <div className="grid grid-cols-2 gap-1 rounded-2xl bg-[rgba(108,106,147,0.1)] p-1 ring-1 ring-[var(--border)]">
          {ONGLETS.map((o) => {
            const actif = onglet === o.id
            const Ic = o.icon
            const badge = o.id === 'apercu'
              ? (synthese.retard > 0 ? String(synthese.retard) : null)
              : (groups.length > 0 ? String(groups.length) : null)
            const urgence = o.id === 'apercu' && badge
            return (
              <button
                key={o.id}
                role="tab"
                aria-selected={actif}
                onClick={() => changerOnglet(o.id)}
                className={`flex items-center justify-center gap-1.5 rounded-xl py-2 text-xs transition-all ${actif ? 'bg-[var(--bg-card)] font-bold text-[var(--accent)] shadow-sm' : 'font-medium text-[var(--text-muted)] active:scale-95'}`}
              >
                <Ic size={15} />
                {o.label}
                {badge && (
                  <span
                    className="rounded-full px-1.5 text-[10px] font-bold"
                    style={urgence
                      ? { backgroundColor: 'rgb(var(--error))', color: '#fff' }
                      : actif
                        ? { backgroundColor: 'rgb(var(--accent))', color: 'rgb(var(--bg))' }
                        : { backgroundColor: 'rgba(108,106,147,0.18)', color: 'rgb(var(--text-muted))' }}
                  >
                    {badge}
                  </span>
                )}
              </button>
            )
          })}
        </div>
      </div>

      {onglet === 'apercu' && (
        <>
          <div className="hero-wallet relative rounded-[26px] p-4 ring-1 ring-[var(--border)]">
            <button
              className="absolute right-2.5 top-2.5 z-10 rounded-full bg-white/20 p-1.5 text-white transition active:scale-90"
              onClick={partagerRecap}
              aria-label="Partager le récapitulatif"
            >
              <Share2 size={15} />
            </button>
            <div className="grid grid-cols-3 gap-2 text-center">
              <div>
                <p className="text-[11px] font-medium text-[var(--text-dim)]">Cagnotte</p>
                <p className="font-serif mt-1 text-lg font-bold text-[var(--success)]">{formatMontant(synthese.cagnotte, settings)}</p>
                <p
                  className={`mt-0.5 text-[10px] ${synthese.variationSemaine > 0 ? 'font-semibold' : ''}`}
                  style={{ color: synthese.variationSemaine > 0 ? 'rgb(var(--success))' : 'rgb(var(--text-muted))' }}
                >
                  {synthese.variationSemaine > 0 ? `+${formatMontant(synthese.variationSemaine, settings)} cette semaine` : 'Pas de mouvement cette semaine'}
                </p>
              </div>
              <div>
                <p className="text-[11px] font-medium text-[var(--text-dim)]">En retard</p>
                <p className="font-serif mt-1 text-lg font-bold text-[var(--error)]">{synthese.retard}</p>
                <p className="mt-0.5 text-[10px] text-[var(--text-muted)]">
                  {synthese.retard > 0 ? 'cotisation(s) attendue(s)' : 'tout est à jour'}
                </p>
              </div>
              <div>
                <p className="text-[11px] font-medium text-[var(--text-dim)]">Prochain tour</p>
                <p className="font-serif mt-1 text-sm font-bold leading-5 text-[var(--text)]">
                  {synthese.prochainDate ? formatDate(synthese.prochainDate) : '—'}
                </p>
                <p className="mt-0.5 text-[10px] text-[var(--text-muted)]">date de collecte</p>
              </div>
            </div>
          </div>

          {groups.length === 0 && (
            <div className="mt-3 rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] p-4 shadow-sm">
              <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--text-dim)]">Démarrage</p>
              <h3 className="mt-2 text-base font-bold text-[var(--text)]">Créez votre première tontine</h3>
              <p className="mt-1 text-sm leading-relaxed text-[var(--text-muted)]">
                Ajoutez les membres, définissez le montant, puis suivez les tours et les cotisations depuis un seul tableau de bord.
              </p>
              <div className="mt-4 grid grid-cols-2 gap-2">
                <button className="btn btn-primary !py-3 text-sm" onClick={ouvrirNouvelle} disabled={modeHorsLigne}>
                  <Plus size={18} />Nouvelle tontine
                </button>
                <button className="btn btn-secondary !py-3 text-sm" onClick={ouvrirRejoindre} disabled={modeHorsLigne}>
                  <UserPlus size={18} />Rejoindre
                </button>
              </div>
              <button
                className="btn btn-ghost mt-2 w-full text-xs"
                onClick={() => {
                  const g = creerTontineDemo()
                  if (!g) { toast.error('Démonstration indisponible (hors ligne)'); return }
                  haptic.success()
                  toast.success('Tontine de démonstration créée — explorez librement !')
                  refresh()
                }}
                disabled={modeHorsLigne}
              >
                <Sparkles size={14} className="mr-1 inline" /> Essayer avec une tontine de démonstration
              </button>
            </div>
          )}

          <AssistantHero onOpen={ouvrirAssistant} disabled={!premierId} retards={synthese.retard} />

          <button className="card glass-strong mt-3 flex w-full items-center gap-3 p-3.5 text-left transition-transform active:scale-[0.99]" onClick={() => navigate('/epargne')}>
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl bg-[rgba(166,164,196,0.1)] text-[var(--text-dim)]">
              <PiggyBank size={20} />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-bold text-[var(--text)]">Épargne personnelle</span>
              <span className="block text-[12px] text-[var(--text-dim)]">
                {epargneTotale > 0
                  ? `${formatMontant(epargneTotale, settings)} de côté · objectifs et retraits`
                  : 'Objectifs, versements et retraits, hors tontine'}
              </span>
            </span>
            <span className="text-[var(--text-muted)]">›</span>
          </button>

          <button className="card glass-strong mt-3 flex w-full items-center gap-3 p-3.5 text-left transition-transform active:scale-[0.99]" onClick={() => navigate('/stats')}>
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl bg-[rgba(166,164,196,0.1)] text-[var(--text-dim)]">
              <BarChart3 size={20} />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-bold text-[var(--text)]">Statistiques &amp; historique</span>
              <span className="block text-[12px] text-[var(--text-dim)]">Graphiques de collecte, retards, évolution</span>
            </span>
            <span className="text-[var(--text-muted)]">›</span>
          </button>

          <button className="card glass-strong mt-2 flex w-full items-center gap-3 p-3.5 text-left transition-transform active:scale-[0.99]" onClick={() => changerOnglet('tontines')}>
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl bg-brand-500/10 text-[var(--accent)]">
              <Users size={20} />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-bold text-[var(--text)]">Mes tontines</span>
              <span className="block text-[12px] text-[var(--text-dim)]">
                {groups.length === 0
                  ? 'Créez ou rejoignez votre première tontine'
                  : `${groups.length} tontine${groups.length > 1 ? 's' : ''} · gérer les membres et tours`}
              </span>
            </span>
            <span className="text-[var(--text-muted)]">›</span>
          </button>
        </>
      )}

      {onglet === 'tontines' && (
        <>
          <div className="grid grid-cols-2 gap-2">
            <button className="btn btn-primary !py-3 text-sm" onClick={ouvrirNouvelle} disabled={modeHorsLigne}>
              <Plus size={18} />Nouvelle tontine
            </button>
            <button className="btn btn-secondary !py-3 text-sm" onClick={ouvrirRejoindre} disabled={modeHorsLigne}>
              <UserPlus size={18} />Rejoindre
            </button>
          </div>
          <button className="btn btn-secondary !py-3 text-sm mt-3 w-full" onClick={() => navigate('/explorer')} disabled={modeHorsLigne}>
            <Compass size={18} />Explorer les groupes
          </button>

          {groups.length > 3 && (
            <div className="relative mt-3">
              <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)]" />
              <input className="input !pl-9" type="search" inputMode="search" autoComplete="off" autoCapitalize="off" value={recherche} onChange={(e) => setRecherche(e.target.value)} placeholder="Rechercher une tontine…" />
              {recherche && (
                <button onClick={() => setRecherche('')} aria-label="Effacer la recherche" className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[var(--text-muted)]">
                  <X size={14} />
                </button>
              )}
            </div>
          )}

          <div className="mt-5">
            <div className="mb-2.5 flex items-center justify-between px-1">
              <h2 className="flex items-center gap-1.5 font-serif text-sm font-bold text-[var(--text)]">
                <Users size={16} className="text-[var(--accent)]" /> Mes tontines
              </h2>
              <div className="flex items-center gap-2">
                {groups.length > 0 && <span className="font-mono text-xs font-bold text-[var(--text-muted)]">{groupesAffiches.length}</span>}
                {groups.length > 0 && (
                  <Menu
                    icon={SlidersHorizontal}
                    ariaLabel="Trier et filtrer"
                    items={[
                      { label: 'Nom (A→Z)', active: tri === 'nom', onClick: () => setTri('nom') },
                      { label: 'Prochaine échéance', active: tri === 'echeance', onClick: () => setTri('echeance') },
                      { label: 'Montant collecté', active: tri === 'montant', onClick: () => setTri('montant') },
                      { label: 'Statut', active: tri === 'statut', onClick: () => setTri('statut') },
                      { sep: true },
                      { label: 'Toutes', active: filtre === 'toutes', onClick: () => setFiltre('toutes') },
                      { label: 'Actives', active: filtre === 'actives', onClick: () => setFiltre('actives') },
                      { label: 'Terminées', active: filtre === 'terminees', onClick: () => setFiltre('terminees') },
                      { label: 'Rejointes', active: filtre === 'rejointes', onClick: () => setFiltre('rejointes') },
                    ]}
                  />
                )}
              </div>
            </div>
            {groups.length === 0 ? (
              <div className="rounded-2xl bg-[var(--bg-card)] p-6 ring-1 ring-[var(--border)]">
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
            ) : groupesAffiches.length === 0 ? (
              <div className="rounded-2xl bg-[var(--bg-card)] p-6 text-center ring-1 ring-[var(--border)]">
                <p className="text-sm text-[var(--text-muted)]">
                  {recherche ? 'Aucune tontine ne correspond à cette recherche.' : 'Aucune tontine ne correspond à ce filtre.'}
                </p>
                <button className="btn btn-secondary mt-3" onClick={() => { setRecherche(''); setFiltre('toutes') }}>
                  Réinitialiser
                </button>
              </div>
            ) : (
              <div className="space-y-2.5">
                {chargement
                  ? Array.from({ length: 3 }, (_, i) => <GroupCardSkeleton key={i} />)
                  : groupesAffiches.map((g) => (
                      <GroupCard key={g.id} group={g} settings={settings} onDelete={() => setConfirmDelete(g)} refresh={refresh} />
                    ))}
              </div>
            )}
          </div>
        </>
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
              onClick={() => { setConfirmCodeDelete(confirmDelete); setConfirmDelete(null) }}
            >
              <Trash2 size={16} /> {t('commun.supprimer')}
            </button>
          </>
        }
      >
        <p className="text-sm text-[var(--text-dim)]">
          {confirmDelete?.rejoint ? (
            <>{t('dash.supprimerDescRejoint')}</>
          ) : (
            <>{t('dash.supprimerDesc', { nom: confirmDelete?.nom })}</>
          )}
        </p>
      </Modal>

      <ConfirmationRenforcee
        open={!!confirmCodeDelete}
        titre="Vérification de la suppression"
        message={`Confirmer la suppression définitive de la tontine « ${confirmCodeDelete?.nom} » et de toutes ses données ?`}
        onFermer={() => setConfirmCodeDelete(null)}
        onConfirmer={() => {
          if (!confirmCodeDelete) return
          supprimerGroupeComplet(confirmCodeDelete.id, utilisateur ? utilisateur.uid : null)
          setConfirmCodeDelete(null)
          refresh()
          haptic.warning()
          toast.info(t('dash.supprimee', { nom: confirmCodeDelete.nom }))
        }}
      />
    </div>
  )
}

function AssistantHero({ onOpen, disabled, retards = 0 }) {
  const suggestions = retards > 0
    ? [`Relancer les ${retards} retardataire${retards > 1 ? 's' : ''}`, 'Qui doit payer cette semaine ?']
    : ['Qui doit payer cette semaine ?', 'Fais un résumé de la collecte']
  return (
    <section className="card mt-3 rounded-2xl bg-[var(--bg-card)] p-4 ring-1 ring-[var(--border)]">
      <div className="flex items-center gap-3">
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-brand-500/10 text-[var(--accent)]">
          <Sparkles size={20} />
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="font-serif text-sm font-bold text-[var(--text)]">Assistant</h2>
          <p className="text-[12px] text-[var(--text-dim)]">
            {retards > 0 ? `${retards} paiement(s) en attente — l'IA peut relancer pour vous.` : 'Posez une question ou demandez une action.'}
          </p>
        </div>
        <button
          className="shrink-0 rounded-xl bg-[var(--accent)] px-3.5 py-2 text-xs font-semibold text-[var(--bg)] active:scale-95"
          onClick={() => onOpen()}
          disabled={disabled}
        >
          Ouvrir
        </button>
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        {suggestions.map((s, i) => (
          <button
            key={i}
            className="rounded-full border border-[var(--border)] px-3 py-1.5 text-xs font-medium text-[var(--text-dim)] transition-transform active:scale-95"
            onClick={() => onOpen(s)}
            disabled={disabled}
          >
            {s}
          </button>
        ))}
      </div>
    </section>
  )
}

function GroupCardSkeleton() {
  return (
    <div className="rounded-2xl bg-[var(--bg-card)] p-3.5 ring-1 ring-[var(--border)]">
      <div className="skeleton-block h-16 rounded-xl" />
      <div className="mt-3 space-y-2">
        <div className="skeleton-block h-4 w-2/3 rounded" />
        <div className="skeleton-block h-4 w-1/2 rounded" />
        <div className="skeleton-block h-3 w-3/4 rounded" />
      </div>
    </div>
  )
}

const GroupCard = ({ group: g, settings, onDelete, refresh }) => {
  const navigate = useNavigate()
  const { modeHorsLigne } = useConnection()
  const toast = useToast()
  const { utilisateur } = useAuth()
  useLangue()
  const [ouvert, setOuvert] = useState(false)
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

  let badge, badgeCouleur, badgeFond, texteDate, alerte, alerteCouleur, boutonPrincipal, boutonUrgent
  if (termine) {
    badge = 'Terminé'; badgeCouleur = 'rgb(var(--success))'; badgeFond = 'rgba(var(--success), 0.1)'
    texteDate = 'Collecte clôturée'
    alerte = `Total collecté : ${formatMontant(collecte || montantAttendu, s)}`
    alerteCouleur = 'rgb(var(--success))'
    boutonPrincipal = 'Voir reçu'; boutonUrgent = false
  } else if (!aPlanifie) {
    badge = 'À venir'; badgeCouleur = 'rgb(var(--text-muted))'; badgeFond = 'rgba(var(--text-muted), 0.1)'
    texteDate = 'Aucun tour planifié'
    alerte = `Prochaine cotisation : ${formatMontant(g.montantCotisation, s)}`
    alerteCouleur = 'rgb(var(--text-muted))'
    boutonPrincipal = 'Générer le planning'; boutonUrgent = false
  } else if (urgent) {
    badge = 'En retard'; badgeCouleur = 'rgb(var(--error))'; badgeFond = 'rgba(var(--error), 0.1)'
    texteDate = diffJours === 0 ? "Échéance aujourd'hui" : `En retard de ${Math.abs(diffJours)} j`
    const manque = Math.max((g.montantCotisation * nbTotal) - collecte, 0)
    alerte = `Manque : ${formatMontant(manque, s)}`
    alerteCouleur = 'rgb(var(--error))'
    boutonPrincipal = `Payer ${formatMontant(g.montantCotisation, s)}`; boutonUrgent = true
  } else {
    badge = 'À venir'; badgeCouleur = 'rgb(var(--text-muted))'; badgeFond = 'rgba(var(--text-muted), 0.1)'
    texteDate = `Dans ${diffJours} jour${diffJours > 1 ? 's' : ''}`
    alerte = `Prochaine cotisation : ${formatMontant(g.montantCotisation, s)}`
    alerteCouleur = 'rgb(var(--text-muted))'
    boutonPrincipal = 'Voir détails'; boutonUrgent = false
  }

  const liseré = termine ? 'rgb(var(--success))' : urgent ? 'rgb(var(--error))' : 'rgb(var(--accent))'
  const pct = montantAttendu > 0 ? Math.min(Math.round((collecte / montantAttendu) * 100), 100) : 0
  const allerGroupe = () => navigate(`/groupe/${g.id}`)
  const allerAction = () => {
    typeof boutonPrincipal === 'string' && boutonPrincipal.startsWith('Payer') ? navigate(`/groupe/${g.id}?tab=argent`) : allerGroupe()
  }

  const partager = () => {
    let code = g.codeUnique
    // Un code hors synchronisation est mort : personne ne peut le télécharger,
    // et les demandes d'inscription ne remontent pas. Partager l'invitation est
    // l'acte explicite du responsable → on active la synchro à ce moment-là.
    if (!g.rejoint) {
      const res = activerSynchro(g.id, utilisateur ? utilisateur.uid : null)
      if (!res.ok) {
        toast.error(res.raison)
        return
      }
      code = res.code
      refresh()
    }
    const texte = code ? `Rejoins ma tontine « ${g.nom} » avec le code ${code} sur Tontine Manager` : ''
    if (navigator.share) {
      navigator.share({ title: 'Tontine Manager', text: texte }).catch(() => {})
      return
    }
    if (code && navigator.clipboard) {
      navigator.clipboard.writeText(texte).then(
        () => { toast.success(`Invitation copiée (code ${code})`); haptic.tap() },
        () => toast.info(`Code d'invitation : ${code}`)
      )
    } else {
      toast.info(`Code d'invitation : ${code || '—'}`)
    }
  }

  return (
    <div className="card relative animate-fade-up overflow-hidden rounded-2xl bg-[var(--bg-card)] ring-1 ring-[var(--border)]">
      <span className="pointer-events-none absolute inset-y-0 left-0 w-1" style={{ backgroundColor: liseré }} />
      <div
        className="flex w-full cursor-pointer items-center gap-2.5 p-3.5 pl-4 text-left"
        onClick={() => setOuvert((v) => !v)}
        role="button"
        tabIndex={0}
        aria-expanded={ouvert}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setOuvert((v) => !v) } }}
      >
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-brand-500/10 text-[var(--accent)]">
          <Users size={18} />
        </div>
        <div className="min-w-0 flex-1">
          <h3 className="truncate font-serif text-sm font-bold text-[var(--text)]">{g.nom}</h3>
          <p className="truncate text-[11px] text-[var(--text-dim)]">
            {nbTotal} membre(s) · <span className="font-mono">{formatMontant(g.montantCotisation, s)}</span>/ tour
            {!ouvert && texteDate ? ` · ${texteDate}` : ''}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <span className="rounded-full px-2 py-0.5 text-[10px] font-semibold" style={{ backgroundColor: badgeFond, color: badgeCouleur }}>{badge}</span>
          <ChevronDown size={16} className={`text-[var(--text-muted)] transition-transform ${ouvert ? 'rotate-180' : ''}`} />
          <Menu
            icon={MoreHorizontal}
            ariaLabel="Actions de la tontine"
            items={[
              { label: 'Ouvrir', icon: Users, onClick: allerGroupe },
              ...(g.statut === 'active' && aPlanifie && !termine
                ? [{ label: 'Marquer la collecte terminée', onClick: () => { terminerGroup(g.id); refresh() } }]
                : []),
              { label: 'Partager / Inviter', icon: Share2, onClick: partager },
              { label: 'Exporter le bilan (PDF)', icon: FileDown, onClick: () => exporterBilanPDF(g.id) },
              { label: 'Réglages', icon: Settings, onClick: () => navigate(`/groupe/${g.id}?tab=reglages`) },
              { sep: true },
              { label: 'Supprimer', icon: Trash2, danger: true, onClick: onDelete },
            ]}
          />
        </div>
      </div>
      {ouvert && (
        <>
          {g.rejoint && (
            <p className="-mt-1 px-4 pl-5">
              <span className="badge bg-[rgba(108,106,147,0.1)] text-[var(--text-muted)]">{t('dash.rejoint')}</span>
            </p>
          )}
          <div className="px-4 pb-3.5 pl-5">
            <p className="font-serif mt-1 text-[13px] font-medium text-[var(--text)]">{texteDate}</p>
            <div className="mt-2">
              <div className="h-1.5 w-full overflow-hidden rounded-full bg-[rgba(108,106,147,0.18)]">
                <div
                  className="h-full rounded-full"
                  style={{ width: pct + '%', background: termine ? 'rgb(var(--success))' : urgent ? 'rgb(var(--error))' : 'linear-gradient(90deg, rgb(var(--accent)), rgb(var(--accent-light)))' }}
                />
              </div>
              <p className="mt-1 font-mono text-[11px] text-[var(--text-muted)]">
                {payes}/{nbTotal} payé · {formatMontant(collecte, s)}/{formatMontant(montantAttendu, s)}
              </p>
            </div>
            <p className="mt-2 text-[12px] font-semibold" style={{ color: alerteCouleur }}>{alerte}</p>
            <button
              className={`btn mt-3 w-full !py-2.5 text-sm ${boutonUrgent ? 'bg-[var(--error)] !text-white' : 'btn-secondary'}`}
              onClick={allerAction}
              disabled={modeHorsLigne}
            >
              {boutonPrincipal}
            </button>
          </div>
        </>
      )}
    </div>
  )
}
