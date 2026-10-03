import { useState, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { ArrowLeft, LayoutDashboard, Users, BellRing, Settings, GitMerge, Sparkles, MessageCircle, Landmark } from 'lucide-react'
import { useData } from '../context/DataContext'
import { useAuth } from '../context/AuthContext'
import { useConnection } from '../context/ConnectionContext'
import { haptic } from '../lib/haptique'
import { getGroup, updateGroup, ensureCodeUnique, appliquerPenalitesAuto } from '../lib/db'
import { useAbonnerGroupe } from '../hooks/useSync'
import { useConflits } from '../hooks/useConflits'
import OverviewTab from './tabs/OverviewTab'
import MembersTab from './tabs/MembersTab'
import ArgentTab from './tabs/ArgentTab'
import RemindersTab from './tabs/RemindersTab'
import DiscussionTab from './tabs/DiscussionTab'
import GroupSettingsTab from './tabs/GroupSettingsTab'
import Logo from '../components/Logo'
import Modal from '../components/Modal'

// Navigation unique et cohérente : une seule barre basse, sans feuille « Plus »
// redondante. L'onglet « Argent » consolide paiements, prêts, planning/ordre,
// historique et journal d'audit en sections claires.
const TABS = [
  { id: 'apercu', label: 'Accueil', icon: LayoutDashboard },
  { id: 'membres', label: 'Membres', icon: Users },
  { id: 'argent', label: 'Argent', icon: Landmark },
  { id: 'rappels', label: 'Rappels', icon: BellRing },
  { id: 'discussion', label: 'Discussion', icon: MessageCircle },
  { id: 'reglages', label: 'Réglages', icon: Settings },
]

// Onglets réservés au responsable : rappels (gestion des relances).
// L'onglet « Argent » (paiements + prêts consolidés) reste accessible à tous,
// y compris aux invités qui peuvent y signaler leurs cotisations.
const TABS_INVITE = TABS.filter((t) => !['rappels'].includes(t.id))

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
  const activeTab = tabs.some((t) => t.id === tab) ? tab : tabs[0].id
  const lectureSeule = group.rejoint || modeHorsLigne

  return (
    <div className="mx-auto max-w-lg px-4 pb-24 pt-0">
      <div className="sticky top-0 z-30 -mx-4 mb-3 flex items-center gap-3 border-b border-[rgba(120,120,140,0.18)] bg-[rgb(var(--surface))]/90 px-4 pb-3 pt-4 pt-safe backdrop-blur">
        <button className="btn btn-icon" onClick={() => navigate('/')} aria-label="Retour">
          <ArrowLeft size={18} />
        </button>
        <Logo size={34} className="shrink-0" />
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-lg font-extrabold uppercase tracking-wide text-[rgb(var(--text))]">{group.nom}</h1>
          <p className="text-xs text-[rgb(var(--text-dim))]">
            {group.statut === 'terminee' ? 'Terminée' : 'En cours'} · {group.deviseSymbole} ·{' '}
            {group.penalitePctParJour > 0 ? `${group.penalitePctParJour}% de pénalité/jour` : 'sans pénalité'}
          </p>
        </div>
        <button
          className="btn btn-icon shrink-0"
          onClick={() => { navigate(`/groupe/${group.id}/assistant`); haptic.tap() }}
          aria-label="Assistant IA"
        >
          <Sparkles size={18} />
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
      {activeTab === 'argent' && <ArgentTab group={group} readOnly={lectureSeule} onGoTo={setTab} />}
      {activeTab === 'rappels' && <RemindersTab group={group} readOnly={lectureSeule} />}
      {activeTab === 'discussion' && <DiscussionTab group={group} />}
      {activeTab === 'reglages' && <GroupSettingsTab group={group} onUpdate={update} readOnly={lectureSeule} />}

      {/* Portail vers <body> : la barre est `fixed`, et son ancêtre direct
          (.anim-page, animé en fill-mode) reste un conteneur bloquant — sans ce
          portail la barre s'ancre sur la page et suit le défilement. */}
      {createPortal(
        <nav
          className="fixed inset-x-0 bottom-0 z-30 px-3 pb-safe"
          aria-label="Onglets du groupe"
        >
          <div className="glass mx-auto flex h-[68px] max-w-lg items-stretch gap-1 rounded-[24px] border border-brand-200/70 px-1.5 shadow-[0_-4px_20px_rgba(15,23,42,0.08)]">
            {tabs.map((t) => {
              const actif = activeTab === t.id
              return (
                <button
                  key={t.id}
                  type="button"
                  aria-current={actif ? 'page' : undefined}
                  onClick={() => { setTab(t.id); haptic.tap() }}
                  className={`flex min-w-0 flex-1 flex-col items-center justify-center gap-1 rounded-2xl px-0.5 py-1.5 transition-colors duration-150 ${
                    actif ? 'bg-brand-500/10 text-brand-700' : 'text-gray-500 hover:text-gray-700'
                  }`}
                >
                  <t.icon size={20} strokeWidth={actif ? 2.3 : 1.8} />
                  <span className={`w-full truncate text-center text-[10px] leading-none ${actif ? 'font-bold' : 'font-medium'}`}>
                    {t.label}
                  </span>
                </button>
              )
            })}
          </div>
        </nav>,
        document.body
      )}
    </div>
  )
}
