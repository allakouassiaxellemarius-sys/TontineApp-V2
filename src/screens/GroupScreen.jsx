import { useState, useEffect } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { ArrowLeft, LayoutDashboard, Users, CalendarDays, History, BellRing, Settings, MoreHorizontal, Activity, MessageCircle, GitMerge, Bot, ListOrdered, Landmark } from 'lucide-react'
import { useData } from '../context/DataContext'
import { setBackOverride } from '../lib/backButton'
import { useAuth } from '../context/AuthContext'
import { useConnection } from '../context/ConnectionContext'
import { haptic } from '../lib/haptique'
import { getGroup, updateGroup, ensureCodeUnique, appliquerPenalitesAuto } from '../lib/db'
import { useAbonnerGroupe } from '../hooks/useSync'
import { useConflits } from '../hooks/useConflits'
import OverviewTab from './tabs/OverviewTab'
import MembersTab from './tabs/MembersTab'
import ToursTab from './tabs/ToursTab'
import ArgentTab from './tabs/ArgentTab'
import RemindersTab from './tabs/RemindersTab'
import HistoryTab from './tabs/HistoryTab'
import JournalTab from './tabs/JournalTab'
import DiscussionTab from './tabs/DiscussionTab'
import GroupSettingsTab from './tabs/GroupSettingsTab'
import OrdreTab from './tabs/OrdreTab'
import Logo from '../components/Logo'
import Modal from '../components/Modal'

const TABS = [
  { id: 'apercu', label: 'Accueil', icon: LayoutDashboard },
  { id: 'membres', label: 'Membres', icon: Users },
  { id: 'argent', label: 'Argent', icon: Landmark },
  { id: 'tours', label: 'Tours', icon: CalendarDays },
  { id: 'ordre', label: 'Ordre', icon: ListOrdered },
  { id: 'rappels', label: 'Rappels', icon: BellRing },
  { id: 'historique', label: 'Historique', icon: History },
  { id: 'discussion', label: 'Discussion', icon: MessageCircle },
  { id: 'journal', label: 'Journal', icon: Activity },
  { id: 'reglages', label: 'Réglages', icon: Settings },
]

// Onglets réservés au responsable : rappels et historique (cotisations).
// L'onglet « Argent » (paiements + prêts consolidés) reste accessible à tous,
// y compris aux invités qui peuvent y signaler leurs cotisations.
const TABS_INVITE = TABS.filter((t) => !['rappels', 'historique'].includes(t.id))

// Barre de navigation basse : 3 onglets principaux (Accueil, Membres, Argent)
// + le bouton « Plus » qui regroupe le reste (Tours, Ordre, Paiements, etc.).
const BAR_PRINCIPALE = ['apercu', 'membres', 'argent']

export default function GroupScreen() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const { refresh } = useData()
  const { utilisateur } = useAuth()
  const { modeHorsLigne } = useConnection()
  const { conflits, resoudreConflit } = useConflits()
  const [feedback, setFeedback] = useState('')
  const [tab, setTab] = useState(() => {
    const t = searchParams.get('tab')
    return TABS.some((x) => x.id === t) ? t : 'apercu'
  })
  const [plusOpen, setPlusOpen] = useState(false)
  const group = getGroup(id)

  // Ouvre l'onglet demandé dans l'URL (ex. ?tab=discussion depuis une notification).
  useEffect(() => {
    const t = searchParams.get('tab')
    setTab(TABS.some((x) => x.id === t) ? t : 'apercu')
  }, [searchParams])

    // Garantit un codeUnique local (nécessaire à l'onglet Paiements et aux
    // références de transfert), même hors ligne ou pour un groupe jamais synchronisé.
    useEffect(() => {
      if (group && group.id) ensureCodeUnique(group.id)
    }, [group?.id])

    // Automatisation : pénalité auto appliquée dès l'ouverture du groupe.
    useEffect(() => {
      if (group && group.id) {
        try { appliquerPenalitesAuto(group.id) } catch (e) {}
      }
    }, [group?.id])

    // Le bouton retour matériel ferme la feuille « Plus » plutôt que de
    // quitter l'écran du groupe.
    useEffect(() => {
      if (!plusOpen) return
      setBackOverride(() => setPlusOpen(false))
      return () => setBackOverride(null)
    }, [plusOpen])

  // Invité : s'abonne aux mises à jour du responsable (lecture seule).
  useAbonnerGroupe(group)

  if (!group) {
    return (
      <div className="mx-auto max-w-lg px-4 py-16 text-center">
        <p className="text-gray-500">Groupe introuvable.</p>
        <button className="btn btn-primary mt-4" onClick={() => navigate('/')}>Retour</button>
      </div>
    )
  }

  const update = (patch) => {
    if (group.rejoint || modeHorsLigne) return
    updateGroup(group.id, patch)
    refresh()
  }

  const uid = utilisateur ? utilisateur.uid : null
  // Un groupe non invité (rejoint:false) est, par conception, celui de
  // l'utilisateur sur cet appareil : il en est le responsable. Un groupe
  // invité (rejoint:true) applique la règle stricte (proprietaire/co-gérants).
  const estGerant = group.rejoint
    ? (!!uid && (group.proprietaire === uid || !!(group.coGerants && group.coGerants[uid])))
    : true
  const baseTabs = group.rejoint ? TABS_INVITE : TABS
  // Le réglage du groupe (onglet « Réglages ») est réservé au responsable.
  const tabs = estGerant ? baseTabs : baseTabs.filter((t) => t.id !== 'reglages')
  const compacte = group.rejoint
  const activeTab = tabs.some((t) => t.id === tab) ? tab : tabs[0].id
  const lectureSeule = group.rejoint || modeHorsLigne
  const barItems = tabs.filter((t) => BAR_PRINCIPALE.includes(t.id))
  const plusItems = tabs.filter((t) => !BAR_PRINCIPALE.includes(t.id))
  const actifDansPlus = plusItems.some((t) => t.id === activeTab)

  return (
    <div className="mx-auto max-w-lg px-4 pb-24 pt-0">
      <div className="sticky top-0 z-30 -mx-4 mb-3 flex items-center gap-3 border-b border-gray-100 bg-white px-4 pb-3 pt-4 pt-safe">
        <button className="btn btn-icon" onClick={() => navigate('/')} aria-label="Retour">
          <ArrowLeft size={18} />
        </button>
        <Logo size={34} className="shrink-0" />
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-lg font-extrabold uppercase tracking-wide text-gray-800">{group.nom}</h1>
          <p className="text-xs text-gray-400">
            {group.statut === 'terminee' ? 'Terminée' : 'En cours'} · {group.deviseSymbole} ·{' '}
            {group.penalitePctParJour > 0 ? `${group.penalitePctParJour}% de pénalité/jour` : 'sans pénalité'}
          </p>
        </div>
        <button className="btn btn-icon" onClick={() => navigate(`/groupe/${group.id}/assistant`)} aria-label="Assistant IA">
          <Bot size={20} />
        </button>
      </div>

      {group.rejoint && (
        <div className="mb-3 rounded-2xl border border-info-200 bg-info-50 px-3 py-2 text-xs font-semibold text-info-700">
          Groupe invité : consultation en lecture seule (sauf la discussion).
        </div>
      )}

      {conflits[group.id] && !group.rejoint && (
        <div className="mb-3 rounded-2xl border border-warning-200 bg-warning-50 p-3">
          <div className="flex items-start gap-2">
            <GitMerge size={16} className="mt-0.5 shrink-0 text-warning-600" />
            <div className="min-w-0">
              <p className="text-sm font-bold text-warning-800">Modifications en conflit</p>
              <p className="mt-0.5 text-xs text-warning-700">
                Ce groupe a été modifié sur un autre appareil pendant que vous n'étiez pas connecté.
                Choisissez comment réconcilier les deux versions.
              </p>
              <div className="mt-2.5 flex flex-wrap gap-1.5">
                <button
                  className="rounded-lg bg-brand-600 px-2.5 py-1.5 text-xs font-bold text-white"
                  onClick={() => {
                    if (resoudreConflit(group.id, 'adopter', conflits[group.id])) setFeedback('Version cloud adoptée')
                  }}
                >
                  Adopter la version cloud
                </button>
                <button
                  className="rounded-lg bg-warning-600 px-2.5 py-1.5 text-xs font-bold text-white"
                  onClick={() => {
                    if (resoudreConflit(group.id, 'fusionner', conflits[group.id])) setFeedback('Versions fusionnées')
                  }}
                >
                  Fusionner
                </button>
                <button
                  className="rounded-lg bg-surface px-2.5 py-1.5 text-xs font-bold text-gray-700 ring-1 ring-warning-300"
                  onClick={() => {
                    if (resoudreConflit(group.id, 'garder', conflits[group.id])) setFeedback('Version locale conservée')
                  }}
                >
                  Garder la version locale
                </button>
              </div>
              {feedback && <p className="mt-2 text-xs font-bold text-warning-800">{feedback}</p>}
            </div>
          </div>
        </div>
      )}

      {activeTab === 'apercu' && <OverviewTab group={group} onGoTo={setTab} readOnly={lectureSeule} />}
      {activeTab === 'membres' && <MembersTab group={group} readOnly={lectureSeule} />}
        {activeTab === 'tours' && <ToursTab group={group} readOnly={lectureSeule} onGoTo={setTab} />}
        {activeTab === 'ordre' && <OrdreTab group={group} readOnly={lectureSeule} />}
      {activeTab === 'argent' && <ArgentTab group={group} readOnly={lectureSeule} />}
      {activeTab === 'rappels' && <RemindersTab group={group} />}
      {activeTab === 'historique' && <HistoryTab group={group} />}
      {activeTab === 'journal' && <JournalTab group={group} readOnly={lectureSeule} />}
      {activeTab === 'discussion' && <DiscussionTab group={group} readOnly={modeHorsLigne} />}
      {activeTab === 'reglages' && <GroupSettingsTab group={group} onUpdate={update} readOnly={lectureSeule} />}

      <nav
        className="fixed inset-x-0 bottom-0 z-20 border-t border-[rgb(var(--border))] bg-surface/95 pb-safe backdrop-blur"
        aria-label="Onglets du groupe"
      >
        <div className="mx-auto flex max-w-lg items-stretch justify-between gap-1 px-1 pt-1">
          {barItems.map((t) => {
            const actif = activeTab === t.id
            return (
              <button
                key={t.id}
                className={`relative flex min-w-0 flex-1 flex-col items-center gap-0.5 overflow-hidden py-1.5 pb-2 ${compacte ? 'text-[8px]' : 'text-[10px]'} font-extrabold uppercase tracking-wide transition ${
                  actif ? 'text-brand-600' : 'text-gray-400 hover:text-gray-600'
                }`}
                onClick={() => { setTab(t.id); haptic.tap() }}
              >
                <t.icon size={20} strokeWidth={actif ? 2.4 : 2} />
                <span className={`block w-full px-0.5 ${compacte ? 'break-words leading-tight' : 'truncate leading-none'}`}>{t.label}</span>
                {actif && <span className="absolute left-1/2 top-0 h-1 w-6 -translate-x-1/2 rounded-full bg-brand-600" />}
              </button>
            )
          })}
          {plusItems.length > 0 && (
            <button
              className={`relative flex min-w-0 flex-1 flex-col items-center gap-0.5 overflow-hidden py-1.5 pb-2 text-[10px] font-extrabold uppercase tracking-wide transition ${
                actifDansPlus ? 'text-brand-600' : 'text-gray-400 hover:text-gray-600'
              }`}
              onClick={() => { setPlusOpen(true); haptic.tap() }}
            >
              <MoreHorizontal size={20} strokeWidth={actifDansPlus ? 2.4 : 2} />
              <span className="block w-full truncate px-0.5 leading-none">Plus</span>
              {actifDansPlus && <span className="absolute left-1/2 top-0 h-1 w-6 -translate-x-1/2 rounded-full bg-brand-600" />}
            </button>
          )}
        </div>
      </nav>

      <Modal open={plusOpen} onClose={() => setPlusOpen(false)} title="Tous les onglets">
        <div className="grid grid-cols-3 gap-2">
          {plusItems.map((t) => (
            <button
              key={t.id}
              className={`flex flex-col items-center gap-1.5 rounded-2xl border-2 py-3.5 text-xs font-bold transition ${
                activeTab === t.id
                  ? 'border-brand-500 bg-brand-50 text-brand-700'
                  : 'border-[rgb(var(--border-strong))] bg-surface text-gray-600 hover:bg-gray-100'
              }`}
              onClick={() => { setTab(t.id); setPlusOpen(false); haptic.tap() }}
            >
              <t.icon size={20} />
              {t.label}
            </button>
          ))}
        </div>
      </Modal>
    </div>
  )
}
