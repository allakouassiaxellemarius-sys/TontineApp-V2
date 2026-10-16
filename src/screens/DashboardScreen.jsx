import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import {
  Plus, Users, Trash2, UserPlus, Share2, FileDown, Settings,
  MoreHorizontal, Search, X, Sparkles, BarChart3,
} from 'lucide-react'
import { useData } from '../context/DataContext'
import { useConnection } from '../context/ConnectionContext'
import { useInbox } from '../hooks/useInbox'
import { getMembres, getBilan, getTours, getTourProchain, getHistorique, terminerGroup, getPaiementMembre } from '../lib/db'
import { supprimerGroupeComplet, activerSynchro } from '../lib/syncEngine'
import { exporterBilanPDF } from '../lib/export'
import { creerTontineDemo } from '../lib/demo'
import { useAuth } from '../context/AuthContext'
import { useToast } from '../context/ToastContext'
import { haptic } from '../lib/haptique'
import { formatMontant, formatDate } from '../lib/format'
import { useActions } from '../context/ActionsContext'
import { t, useLangue } from '../lib/i18n'
import Modal from '../components/Modal'
import ConfirmationRenforcee from '../components/ConfirmationRenforcee'
import Logo from '../components/Logo'
import Avatar from '../components/Avatar'
import Menu from '../components/ui/Menu'

// ── Repères recopiés de la maquette « accueil-ameliore.html » ────────────────
// Les couleurs sont littérales : ce sont celles validées à l'écran, et les
// pastilles restent lisibles quelle que soit la thème (elles sont opaques).
const NEUTRE = '#5F6E7A'
const PILL = {
  ok: { fond: '#E6F4ED', texte: '#1E8E5A' },
  attente: { fond: '#FDF1E3', texte: '#9C620F' },
  retard: { fond: '#FDEDE2', texte: '#C2410C' },
}
// Le bleu, l'ocre et le vert portent successivement l'avatar et le liseré de
// chaque carte, comme dans la maquette : la couleur identifie la tontine, le
// statut reste dans la pastille.
const TEINTES = [
  { bar: '#0D6EB8', ava: 'linear-gradient(135deg, #0D6EB8, #0A5A98)' },
  { bar: '#D98324', ava: 'linear-gradient(135deg, #D98324, #C06E12)' },
  { bar: '#1E8E5A', ava: 'linear-gradient(135deg, #1E8E5A, #157048)' },
]
const OMBRE_CARTE = '0 1px 2px rgba(15,42,68,0.06), 0 8px 24px rgba(15,42,68,0.08)'

const nombre = (v) => Number(v || 0).toLocaleString('fr-FR', { maximumFractionDigits: 0 })

const initiales = (nom) => {
  const mots = String(nom || '').trim().split(/\s+/).filter(Boolean)
  if (!mots.length) return '•'
  return (mots[0][0] + (mots.length > 1 ? mots[1][0] : '')).toUpperCase()
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
  const [recherche, setRecherche] = useState('')

  useEffect(() => {
    const minuteur = setTimeout(() => setChargement(false), 700)
    return () => clearTimeout(minuteur)
  }, [])

  useEffect(() => { refresh() }, [refresh])

  // Les actives d'abord, la collecte la plus proche en tête : c'est l'ordre
  // dans lequel une cotisation réclame une décision.
  const groupesAffiches = useMemo(() => {
    const q = recherche.trim().toLowerCase()
    const r = q ? groups.filter((g) => (g.nom || '').toLowerCase().includes(q)) : groups.slice()
    const echeance = (g) => {
      const t = getTourProchain(g.id)
      return t ? new Date(t.datePrevue).getTime() : Number.MAX_SAFE_INTEGER
    }
    return r.sort((a, b) =>
      (a.statut === 'terminee' ? 1 : 0) - (b.statut === 'terminee' ? 1 : 0)
      || echeance(a) - echeance(b)
      || (a.nom || '').localeCompare(b.nom || ''))
  }, [groups, recherche])

  const prenom = (utilisateur?.displayName || utilisateur?.email || '').toString().split(/[\s@._-]/)[0] || ''

  const synthese = useMemo(() => {
    let cagnotte = 0
    let actifs = 0
    let retard = 0
    let prochainDate = null
    let variationMois = 0
    const auj = new Date(); auj.setHours(0, 0, 0, 0)
    const debutMois = new Date(auj.getFullYear(), auj.getMonth(), 1)
    for (const g of groups) {
      cagnotte += getBilan(g.id).totalCotis
      if (g.statut !== 'terminee') actifs += 1
      for (const ev of getHistorique(g.id)) {
        if (ev.type === 'paiement' && ev.date && new Date(ev.date) >= debutMois) {
          variationMois += Number(ev.montant || 0)
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
    return { cagnotte, actifs, retard, prochainDate, variationMois }
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
    <div className="app-shell mx-auto min-h-screen max-w-lg pb-[176px]">
      <header
        className="relative overflow-hidden rounded-b-3xl px-5 pb-[22px] text-white"
        style={{ background: 'linear-gradient(135deg, #0D6EB8 0%, #0A5A98 100%)', paddingTop: 'calc(env(safe-area-inset-top, 0px) + 14px)' }}
      >
        <div className="flex items-start gap-2.5 pr-[52px]">
          <span className="animate-logo-pop inline-flex shrink-0"><Logo size={32} /></span>
          <div className="min-w-0">
            <p className="text-[13px] opacity-90">{prenom ? 'Bonjour 👋' : 'Tontine Manager'}</p>
            <p className="mt-0.5 truncate text-[20px] font-bold leading-tight">
              {prenom || t('dash.mesTontines')}
            </p>
          </div>
        </div>
        <Link
          to="/profil"
          aria-label={t('nav.profil')}
          className="absolute right-5 grid h-10 w-10 place-items-center overflow-hidden rounded-full bg-white/20 text-[15px] font-bold active:scale-95"
          style={{ top: 'calc(env(safe-area-inset-top, 0px) + 10px)' }}
        >
          <Avatar src={utilisateur?.photoURL} nom={utilisateur?.displayName || utilisateur?.email || ''} size={40} />
        </Link>

        <div className="animate-fade-up mt-[18px]">
          <p className="text-[12px] tracking-[0.3px] opacity-85">Solde total de vos tontines</p>
          <p className="mt-0.5 text-[32px] font-extrabold leading-tight tracking-[-0.5px] tabular-nums">
            {settings.devisePosition === 'before' && (
              <span className="mr-1 text-[16px] font-semibold opacity-85">{settings.deviseSymbole}</span>
            )}
            {nombre(synthese.cagnotte)}
            {settings.devisePosition !== 'before' && (
              <span className="ml-1 text-[16px] font-semibold opacity-85">{settings.deviseSymbole}</span>
            )}
          </p>
          <p className="mt-1.5 flex flex-wrap gap-x-3.5 gap-y-1 text-[12px] opacity-85">
            {synthese.variationMois > 0 && (
              <span className="font-semibold text-[#BFEAD2]">▲ {nombre(synthese.variationMois)} ce mois</span>
            )}
            <span className="tabular-nums">{synthese.actifs} groupe{synthese.actifs > 1 ? 's' : ''} actif{synthese.actifs > 1 ? 's' : ''}</span>
          </p>
        </div>

        <button
          className="absolute bottom-[18px] right-5 grid h-9 w-9 place-items-center rounded-full bg-white/20 text-white active:scale-90"
          onClick={partagerRecap}
          aria-label="Partager le récapitulatif"
        >
          <Share2 size={16} />
        </button>
      </header>

      {groups.length > 0 && (
        <div className="px-4 pt-4">
          <label
            className="flex h-12 items-center gap-2.5 rounded-xl border border-[var(--border)] bg-[var(--bg-card)] px-3.5 transition-[border-color,box-shadow] duration-200 focus-within:border-[var(--accent)] focus-within:shadow-[0_0_0_3px_#E8F1F8]"
            style={{ boxShadow: OMBRE_CARTE }}
          >
            <Search size={18} strokeWidth={2} className="shrink-0" style={{ color: NEUTRE }} />
            <input
              type="search"
              inputMode="search"
              autoComplete="off"
              autoCapitalize="off"
              value={recherche}
              onChange={(e) => setRecherche(e.target.value)}
              placeholder="Rechercher une tontine…"
              aria-label="Rechercher une tontine"
              className="w-full border-0 bg-transparent text-[15px] text-[var(--text)] outline-none placeholder:text-[#5F6E7A]"
            />
            {recherche && (
              <button onClick={() => setRecherche('')} aria-label="Effacer la recherche" className="shrink-0" style={{ color: NEUTRE }}>
                <X size={16} />
              </button>
            )}
          </label>
        </div>
      )}

      <div className="flex items-baseline justify-between px-4 pb-2.5 pt-5">
        <h2 className="text-[15px] font-bold text-[var(--text)]">{t('dash.mesTontines')}</h2>
        <button
          className="text-[13px] font-semibold text-[var(--accent)] active:opacity-70"
          onClick={() => navigate('/explorer')}
        >
          Tout voir
        </button>
      </div>

      {groups.length === 0 ? (
        <div className="mx-4 rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] p-4" style={{ boxShadow: OMBRE_CARTE }}>
          <h3 className="text-[15px] font-bold text-[var(--text)]">Créez votre première tontine</h3>
          <p className="mt-1 text-[13px] leading-relaxed" style={{ color: NEUTRE }}>
            Ajoutez les membres et le montant, puis suivez les tours depuis cet écran.
          </p>
          <button className="btn btn-secondary mt-3 w-full !py-2.5 text-sm" onClick={ouvrirRejoindre} disabled={modeHorsLigne}>
            <UserPlus size={17} />Rejoindre avec un code
          </button>
          <button
            className="btn btn-ghost mt-1 w-full text-xs"
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
      ) : groupesAffiches.length === 0 ? (
        <div className="mx-4 rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] p-5 text-center" style={{ boxShadow: OMBRE_CARTE }}>
          <p className="text-[13px]" style={{ color: NEUTRE }}>Aucune tontine ne correspond à « {recherche} ».</p>
          <button className="btn btn-secondary mt-3" onClick={() => setRecherche('')}>Effacer la recherche</button>
        </div>
      ) : (
        <div className="flex flex-col gap-3 px-4">
          {chargement
            ? Array.from({ length: 3 }, (_, i) => <CarteSkeleton key={i} index={i} />)
            : groupesAffiches.map((g, i) => (
                <CarteGroupe
                  key={g.id}
                  groupe={g}
                  index={i}
                  settings={settings}
                  refresh={refresh}
                  onDelete={() => setConfirmDelete(g)}
                />
              ))}
        </div>
      )}

      {groups.length > 0 && (
        <div className="mt-4 flex items-center justify-center gap-5 px-4">
          <button
            className="flex items-center gap-1.5 text-[13px] font-semibold active:opacity-70"
            style={{ color: NEUTRE }}
            onClick={ouvrirRejoindre}
            disabled={modeHorsLigne}
          >
            <UserPlus size={15} /> Rejoindre avec un code
          </button>
          <button
            className="flex items-center gap-1.5 text-[13px] font-semibold active:opacity-70"
            style={{ color: NEUTRE }}
            onClick={() => navigate('/stats')}
          >
            <BarChart3 size={15} /> Statistiques
          </button>
        </div>
      )}

      {/* Bouton primaire unique de la maquette. Il reste le seul accès à la
          création, mais « Rejoindre » et « Tout voir » sont conservés : sans
          eux, la saisie d'un code et l'exploration des groupes publiés
          n'existeraient nulle part dans l'app. */}
      {groups.length > 0 && (
        <button className="mq-fab" onClick={ouvrirNouvelle} disabled={modeHorsLigne}>
          <Plus size={18} strokeWidth={2.4} />
          Nouvelle tontine
        </button>
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

const CarteSkeleton = ({ index }) => (
  <div
    className="animate-card-in relative flex items-center gap-[13px] overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] p-3.5"
    style={{ boxShadow: OMBRE_CARTE, animationDelay: Math.min(index, 6) * 80 + 'ms' }}
    aria-hidden="true"
  >
    <span className="absolute inset-y-0 left-0 w-1" style={{ background: TEINTES[index % TEINTES.length].bar }} />
    <span className="skeleton-block grid h-[46px] w-[46px] shrink-0 place-items-center rounded-[13px]" />
    <div className="min-w-0 flex-1 space-y-2">
      <span className="skeleton-block block h-[15px] w-3/5 rounded" />
      <span className="skeleton-block block h-[12px] w-2/5 rounded" />
    </div>
    <span className="skeleton-block h-[16px] w-16 shrink-0 rounded" />
  </div>
)

const CarteGroupe = ({ groupe: g, index, settings, refresh, onDelete }) => {
  const navigate = useNavigate()
  const { modeHorsLigne } = useConnection()
  const toast = useToast()
  const { utilisateur } = useAuth()
  useLangue()

  const membres = getMembres(g.id)
  const tours = getTours(g.id)
  const prochain = getTourProchain(g.id)
  const nbTotal = membres.length
  const payes = prochain ? membres.filter((m) => getPaiementMembre(prochain.id, m.id)).length : 0
  const attendus = Math.max(nbTotal - payes, 0)
  const collecte = getBilan(g.id).totalCotis

  const auj = new Date(); auj.setHours(0, 0, 0, 0)
  const dateTour = prochain ? new Date(prochain.datePrevue) : null
  const retard = !!dateTour && dateTour.getTime() <= auj.getTime()
  const termine = g.statut === 'terminee'
  const teinte = TEINTES[index % TEINTES.length]

  let pill
  if (termine) pill = { label: 'Terminé', ...PILL.ok }
  else if (!prochain) pill = { label: 'À planifier', ...PILL.attente }
  else if (attendus === 0) pill = { label: 'À jour', ...PILL.ok }
  else if (retard) pill = { label: `${attendus} retard${attendus > 1 ? 's' : ''}`, ...PILL.retard }
  else pill = { label: `${attendus} en attente`, ...PILL.attente }

  // La carte tout entière mène au groupe ; le menu « ⋮ » est le seul endroit de
  // l'app où l'on peut clore une collecte et supprimer une tontine.
  const ouvrir = () => navigate(`/groupe/${g.id}`)

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
    <div
      className="animate-card-in relative flex cursor-pointer items-center gap-[13px] overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] p-3.5 transition-transform duration-200 active:scale-[0.98]"
      style={{ boxShadow: OMBRE_CARTE, animationDelay: Math.min(index, 6) * 80 + 'ms' }}
      onClick={ouvrir}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); ouvrir() } }}
    >
      <span className="pointer-events-none absolute inset-y-0 left-0 w-1" style={{ background: teinte.bar }} />
      <span
        className="grid h-[46px] w-[46px] shrink-0 place-items-center rounded-[13px] text-[16px] font-extrabold text-white"
        style={{ background: teinte.ava }}
      >
        {initiales(g.nom)}
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-[15px] font-bold text-[var(--text)]">{g.nom}</p>
        <p className="mt-[3px] flex items-center gap-1.5 text-[12px]" style={{ color: NEUTRE }}>
          <span
            className="shrink-0 rounded-full px-2 py-0.5 text-[11px] font-bold"
            style={{ background: pill.fond, color: pill.texte }}
          >
            {pill.label}
          </span>
          {prochain && (
            <span className="shrink-0 tabular-nums">Tour {prochain.numero} / {tours.length}</span>
          )}
        </p>
      </div>
      <div className="shrink-0 text-right">
        <p className="text-[16px] font-extrabold tabular-nums text-[var(--text)]">{nombre(collecte)}</p>
        <p className="mt-0.5 text-[11px]" style={{ color: NEUTRE }}>{g.deviseSymbole || settings.deviseSymbole}</p>
      </div>
      <div className="shrink-0">
        <Menu
          icon={MoreHorizontal}
          ariaLabel="Actions de la tontine"
          items={[
            { label: 'Ouvrir', icon: Users, onClick: ouvrir },
            ...(g.statut === 'active' && prochain && attendus === 0
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
  )
}
