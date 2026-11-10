import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import {
  Plus, Users, Trash2, UserPlus, Share2, FileDown, Settings,
  MoreHorizontal, Sparkles, Bell, Clock, BarChart3,
} from 'lucide-react'
import { useData } from '../context/DataContext'
import { useConnection } from '../context/ConnectionContext'
import { useInbox } from '../hooks/useInbox'
import {
  getMembres, getBilan, getTours, getTourProchain, terminerGroup, getPaiementMembre,
  generateTours, getEpargnes, totalEpargne,
} from '../lib/db'
import { supprimerGroupeComplet, activerSynchro } from '../lib/syncEngine'
import { exporterBilanPDF } from '../lib/export'
import { creerTontineDemo } from '../lib/demo'
import { todayStr } from '../lib/storage'
import { useAuth } from '../context/AuthContext'
import { useToast } from '../context/ToastContext'
import { haptic } from '../lib/haptique'
import { formatMontant } from '../lib/format'
import { useActions } from '../context/ActionsContext'
import { t, useLangue } from '../lib/i18n'
import { HEX } from '../lib/charte'
import Modal from '../components/Modal'
import ConfirmationRenforcee from '../components/ConfirmationRenforcee'
import Menu from '../components/ui/Menu'

// ── Repères de la maquette « Accueil.pdf » (9 nov.) ──────────────────────────
// Une seule source de vérité : `src/lib/charte.js` (les hex) + `src/index.css`
// (les mêmes en triplets RVB, comparés par le harnais). Cet écran garde ses hex
// littéraux : il reste clair même en thème sombre, c'est la palette du design.
const {
  creme: CREME, vert: VERT, vertPale: VERT_PALE, vertLabel: VERT_LABEL,
  vertTile: VERT_TILE, vertLien: VERT_LIEN, encre: ENCRE, encreTitre: ENCRE_TITRE,
  encreDouce: ENCRE_DOUCE, encreCarte: ENCRE_CARTE, encreForte: ENCRE_FORTE,
  grisCarte: GRIS_CARTE, grisLeger: GRIS_LEGER, blanc: BLANC, lisere: LISERE,
  piste: PISTE, ambre: AMBRE, ambreEncre: AMBRE_ENCRE, avaFond: AVA_FOND,
  avaEncre: AVA_ENCRE, orange: ORANGE, orangeEncre: ORANGE_ENCRE,
} = HEX

const nombre = (v) => Number(v || 0).toLocaleString('fr-FR', { maximumFractionDigits: 0 })

const initiales = (nom) => {
  const mots = String(nom || '').trim().split(/\s+/).filter(Boolean)
  if (!mots.length) return '•'
  return (mots[0][0] + (mots.length > 1 ? mots[1][0] : '')).toUpperCase()
}

// Une tontine peut porter sa propre devise ; les deux cartes qui affichent un
// montant partagent donc la même lecture du groupe.
const deviseGroupe = (g, settings) => ({
  ...settings,
  deviseSymbole: g.deviseSymbole || settings.deviseSymbole,
  devisePosition: g.devisePosition || settings.devisePosition,
})

// « 13 nov. » : la maquette abrège les dates au jour + mois, sans l'année.
const jourCourt = (d) => {
  const dt = new Date(String(d || '') + 'T12:00:00')
  if (isNaN(dt.getTime())) return '—'
  return dt.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })
}

const jourLong = (dt) => {
  const s = dt.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })
  return s.charAt(0).toUpperCase() + s.slice(1)
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

  useEffect(() => { refresh() }, [refresh])

  const uid = utilisateur ? utilisateur.uid : null

  // Les actives d'abord, la collecte la plus proche en tête.
  const groupesAffiches = useMemo(() => groups.slice().sort((a, b) =>
    (a.statut === 'terminee' ? 1 : 0) - (b.statut === 'terminee' ? 1 : 0)
    || String(getTourProchain(a.id)?.datePrevue || '9999').localeCompare(String(getTourProchain(b.id)?.datePrevue || '9999'))
    || (a.nom || '').localeCompare(b.nom || '')), [groups])

  // « Total épargné » = l'argent que j'ai moi-même mis de côté : mes cotisations
  // payées dans les tontines + le solde de mes épargnes personnelles. La cagnotte
  // d'un groupe n'est pas mon épargne, elle est celle de tous ses membres.
  const synthese = useMemo(() => {
    const debutMois = todayStr().slice(0, 8) + '01'
    let epargne = 0
    let epargneMois = 0
    for (const e of getEpargnes()) {
      epargne += totalEpargne(e)
      for (const v of (e.versements || [])) {
        if (String(v.date || '').slice(0, 10) >= debutMois) epargneMois += Number(v.montant || 0)
      }
    }
    let cotise = 0
    let cotiseMois = 0
    let actifs = 0
    let prochain = null
    for (const g of groups) {
      if (g.statut !== 'terminee') actifs += 1
      const moi = uid ? getMembres(g.id).find((m) => m.uid === uid) : null
      if (moi) {
        for (const c of getBilan(g.id).cotisations) {
          if (c.statut !== 'paye' || Number(c.membreId) !== Number(moi.id)) continue
          cotise += Number(c.montant || 0)
          if (String(c.datePaiement || '').slice(0, 10) >= debutMois) cotiseMois += Number(c.montant || 0)
        }
      }
      const t = getTourProchain(g.id)
      if (t && (!prochain || String(t.datePrevue) < String(prochain.datePrevue))) prochain = t
    }
    return {
      total: epargne + cotise,
      mois: epargneMois + cotiseMois,
      actifs,
      prochainDate: prochain ? prochain.datePrevue : null,
    }
  }, [groups, uid])

  // L'échéance qui réclame une décision : le prochain tour où je dois cotiser et
  // où mon paiement n'est pas encore enregistré.
  const aPayer = useMemo(() => {
    let meilleur = null
    for (const g of groups) {
      if (g.statut === 'terminee') continue
      const tour = getTourProchain(g.id)
      if (!tour || !tour.datePrevue) continue
      const moi = uid ? getMembres(g.id).find((m) => m.uid === uid) : null
      if (!moi) continue
      // Le receveur du tour ne cotise que si le groupe le prévoit.
      if (Number(tour.membreId) === Number(moi.id) && !g.leReceveurCotonise) continue
      if (getPaiementMembre(tour.id, moi.id)) continue
      if (!meilleur || String(tour.datePrevue) < String(meilleur.tour.datePrevue)) meilleur = { groupe: g, tour }
    }
    return meilleur
  }, [groups, uid])

  const prenom = (utilisateur?.displayName || utilisateur?.email || '').toString().split(/[\s@._-]/)[0] || ''
  const dateDuJour = useMemo(() => jourLong(new Date()), [])

  // Récap partageable (feuille de route WhatsApp / partage natif Android).
  const partagerRecap = async () => {
    const texte = [
      '📊 Récap de mes tontines — Tontine Manager',
      `• Tontines suivies : ${groups.length}`,
      `• Total épargné : ${formatMontant(synthese.total, settings)}`,
      `• Prochain tour : ${synthese.prochainDate ? jourCourt(synthese.prochainDate) : '—'}`,
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

  const avant = settings.devisePosition === 'before'
  const symbole = <span className="text-[16px] font-semibold" style={{ color: VERT_LABEL }}>{settings.deviseSymbole}</span>

  return (
    <div className="mx-auto min-h-screen max-w-lg pb-[136px]" style={{ background: CREME }}>
      <header
        className="flex items-start justify-between gap-3 px-5 pb-3"
        style={{ paddingTop: 'calc(env(safe-area-inset-top, 0px) + 16px)' }}
      >
        <div className="min-w-0">
          <p className="text-[14px]" style={{ color: ENCRE_DOUCE }}>{dateDuJour}</p>
          <h1 className="mt-1 truncate text-[27px] font-extrabold leading-tight" style={{ color: ENCRE }}>
            Bonjour{prenom ? ` ${prenom}` : ''}
          </h1>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          {/* Deux écarts assumés d'avec la maquette : partager le récapitulatif
              n'existe qu'ici, et la cloche mène aux notifications. */}
          <button
            onClick={partagerRecap}
            aria-label="Partager le récapitulatif"
            className="grid h-10 w-10 place-items-center rounded-full"
            style={{ background: BLANC, color: ENCRE_DOUCE }}
          >
            <Share2 size={18} />
          </button>
          <Link
            to="/notifications"
            aria-label={t('dash.notifications')}
            className="grid h-10 w-10 place-items-center rounded-full"
            style={{ background: BLANC, color: ENCRE_DOUCE }}
          >
            <Bell size={18} />
          </Link>
        </div>
      </header>

      <section className="mx-5 rounded-[24px] p-5" style={{ background: VERT }}>
        <div className="flex items-start justify-between gap-3">
          <p className="pt-1 text-[14px]" style={{ color: VERT_LABEL }}>Total épargné</p>
          {synthese.mois !== 0 && (
            <span
              className="shrink-0 rounded-full px-2.5 py-1 text-[12px] font-semibold whitespace-nowrap text-white"
              style={{ background: 'rgba(255,255,255,0.16)' }}
            >
              {synthese.mois > 0 ? '+' : '−'}{nombre(Math.abs(synthese.mois))} ce mois-ci
            </span>
          )}
        </div>
        <p className="mt-1 flex items-baseline gap-1.5 text-[41px] font-extrabold leading-none tabular-nums text-white">
          {avant && symbole}
          <span>{nombre(synthese.total)}</span>
          {!avant && symbole}
        </p>

        <div className="mt-5 grid grid-cols-2 gap-2.5">
          <div className="rounded-[14px] p-3" style={{ background: VERT_PALE }}>
            <p className="text-[12px]" style={{ color: VERT_TILE }}>Tontines actives</p>
            <p className="mt-[3px] text-[19px] font-bold leading-tight tabular-nums text-white">{synthese.actifs}</p>
          </div>
          <div className="rounded-[14px] p-3" style={{ background: VERT_PALE }}>
            <p className="text-[12px]" style={{ color: VERT_TILE }}>Prochain tour</p>
            <p className="mt-[3px] truncate text-[18px] font-bold leading-tight text-white">
              {synthese.prochainDate ? jourCourt(synthese.prochainDate) : '—'}
            </p>
          </div>
        </div>
      </section>

      {aPayer && (
        <section
          className="mx-5 mt-4 flex items-center gap-3.5 rounded-[20px] border p-[15px]"
          style={{ background: BLANC, borderColor: LISERE }}
        >
          <span className="grid h-11 w-11 shrink-0 place-items-center rounded-[14px]" style={{ background: AMBRE }}>
            <Clock size={20} style={{ color: AMBRE_ENCRE }} />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-[12px] leading-snug" style={{ color: GRIS_CARTE }}>
              {String(aPayer.tour.datePrevue) < todayStr() ? 'Cotisation en retard depuis le' : 'Cotisation à payer avant le'}{' '}
              {jourCourt(aPayer.tour.datePrevue)}
            </p>
            <p className="mt-[2px] truncate text-[15px] font-bold" style={{ color: ENCRE_FORTE }}>
              {aPayer.groupe.nom} · {formatMontant(aPayer.groupe.montantCotisation, deviseGroupe(aPayer.groupe, settings))}
            </p>
          </div>
          <button
            onClick={() => navigate(`/groupe/${aPayer.groupe.id}?tab=argent`)}
            className="h-11 shrink-0 rounded-[14px] px-4 text-[14px] font-bold text-white"
            style={{ background: VERT }}
          >
            Payer
          </button>
        </section>
      )}

      <div className="mt-5 flex items-baseline justify-between px-5 pb-2.5">
        <h2 className="text-[19px] font-bold" style={{ color: ENCRE_TITRE }}>{t('dash.mesTontines')}</h2>
        <button
          className="text-[15px] font-semibold active:opacity-70"
          style={{ color: VERT_LIEN }}
          onClick={() => navigate('/explorer')}
        >
          Tout voir
        </button>
      </div>

      {groups.length === 0 ? (
        <div className="mx-5 rounded-[20px] border p-4" style={{ background: BLANC, borderColor: LISERE }}>
          <h3 className="text-[15px] font-bold" style={{ color: ENCRE_CARTE }}>Créez votre première tontine</h3>
          <p className="mt-1 text-[13px] leading-relaxed" style={{ color: GRIS_CARTE }}>
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
      ) : (
        <div className="flex flex-col gap-2.5 px-5">
          {groupesAffiches.map((g) => (
            <CarteGroupe
              key={g.id}
              groupe={g}
              settings={settings}
              refresh={refresh}
              onDelete={() => setConfirmDelete(g)}
            />
          ))}
        </div>
      )}

      {groups.length > 0 && (
        <div className="mt-4 flex items-center justify-center gap-5 px-5">
          <button
            className="flex items-center gap-1.5 text-[13px] font-semibold active:opacity-70"
            style={{ color: ENCRE_DOUCE }}
            onClick={ouvrirRejoindre}
            disabled={modeHorsLigne}
          >
            <UserPlus size={15} /> Rejoindre avec un code
          </button>
          <button
            className="flex items-center gap-1.5 text-[13px] font-semibold active:opacity-70"
            style={{ color: ENCRE_DOUCE }}
            onClick={() => navigate('/stats')}
          >
            <BarChart3 size={15} /> Statistiques
          </button>
        </div>
      )}

      {/* FAB de la maquette : pastille ronde ocre. Elle reste ancrée à droite —
          centrée, elle couvrirait l'onglet « Notifications » de la barre basse,
          qui garde ses cinq entrées. */}
      <button
        onClick={ouvrirNouvelle}
        disabled={modeHorsLigne}
        aria-label={t('nav.ariaNouvelle')}
        className="fixed z-40 grid h-12 w-12 place-items-center rounded-full disabled:opacity-50"
        style={{
          right: 20,
          bottom: 'calc(68px + env(safe-area-inset-bottom, 0px) + 18px)',
          background: ORANGE,
          color: ORANGE_ENCRE,
          boxShadow: '0 8px 22px rgba(232,137,44,0.42)',
        }}
      >
        <Plus size={22} strokeWidth={2.5} />
      </button>

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

const CarteGroupe = ({ groupe: g, settings, refresh, onDelete }) => {
  const navigate = useNavigate()
  const toast = useToast()
  const { utilisateur } = useAuth()
  useLangue()

  const membres = getMembres(g.id)
  const tours = getTours(g.id)
  const prochain = getTourProchain(g.id)
  const termine = g.statut === 'terminee'
  const tousPayes = !!prochain && membres.length > 0 && membres.every((m) => getPaiementMembre(prochain.id, m.id))
  const progression = termine || !prochain ? 1 : Math.min(1, Math.max(0, Number(prochain.numero) / Math.max(tours.length, 1)))

  const ouvrir = () => navigate(`/groupe/${g.id}`)

  // Le menu « ⋮ » n'est pas dans la maquette : c'est le seul endroit de l'app où
  // l'on clore une collecte, où l'on invite, et où l'on supprime une tontine.
  const partager = () => {
    let code = g.codeUnique
    // Un code hors synchronisation est mort : partager l'invitation est l'acte
    // explicite du responsable → on active la synchro à ce moment-là.
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

  const genererPlanning = (e) => {
    e.stopPropagation()
    const avant = getTours(g.id).length
    const apres = generateTours(g.id).length
    refresh()
    if (apres > avant) {
      haptic.success()
      toast.success(`Planning généré : ${apres - avant} tour${apres - avant > 1 ? 's' : ''}`)
    } else if (apres) {
      toast.info('Le planning est déjà complet')
    } else {
      toast.info('Planning indisponible (groupe rejoint ou hors ligne)')
    }
  }

  return (
    <div
      className="relative flex cursor-pointer items-center gap-2.5 rounded-[20px] border px-3.5 pt-4 pb-[21px]"
      style={{ background: BLANC, borderColor: LISERE }}
      onClick={ouvrir}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); ouvrir() } }}
    >
      <span
        className="grid h-11 w-11 shrink-0 place-items-center rounded-full text-[14px] font-bold"
        style={{ background: AVA_FOND, color: AVA_ENCRE }}
      >
        {initiales(g.nom)}
      </span>

      <div className="min-w-0 flex-1">
        <p className="truncate text-[15px] font-bold" style={{ color: ENCRE_CARTE }}>{g.nom}</p>
        <p className="mt-[2px] truncate text-[12px]" style={{ color: GRIS_CARTE }}>
          {formatMontant(g.montantCotisation, deviseGroupe(g, settings))} par tour
          <span className="ml-1.5" style={{ color: GRIS_LEGER }}>· {membres.length} membre{membres.length > 1 ? 's' : ''}</span>
        </p>
      </div>

      {tours.length === 0 ? (
        <button
          onClick={genererPlanning}
          className="h-[35px] shrink-0 rounded-[12px] px-3 text-[12px] font-bold"
          style={{ background: AMBRE, color: AMBRE_ENCRE }}
        >
          {t('dash.genererPlanning')}
        </button>
      ) : (
        <div className="shrink-0 text-right">
          <p className="text-[13px] font-semibold tabular-nums" style={{ color: ENCRE_CARTE }}>
            Tour {prochain ? prochain.numero : tours.length} / {tours.length}
          </p>
          {termine && (
            <p className="mt-0.5 text-[11px] font-semibold" style={{ color: VERT }}>{t('dash.terminee')}</p>
          )}
        </div>
      )}

      <div className="shrink-0">
        <Menu
          icon={MoreHorizontal}
          ariaLabel="Actions de la tontine"
          items={[
            { label: 'Ouvrir', icon: Users, onClick: ouvrir },
            ...(g.statut === 'active' && prochain && tousPayes
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

      {tours.length > 0 && (
        <div className="absolute bottom-3 left-3.5 right-3.5 h-[6px] overflow-hidden rounded-full" style={{ background: PISTE }}>
          <div className="h-full rounded-full" style={{ width: `${Math.round(progression * 100)}%`, background: VERT }} />
        </div>
      )}
    </div>
  )
}
