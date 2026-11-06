import { HashRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom'
import { useState, useRef, useEffect, lazy, Suspense } from 'react'
import { App as CapacitorApp } from '@capacitor/app'
import { t } from './lib/i18n'
import { getBackOverride } from './lib/backButton'
import { PinProvider, usePin } from './context/PinContext'
import { DataProvider, useData } from './context/DataContext'
import { ConnectionProvider } from './context/ConnectionContext'
import { TutorielProvider, useTutoriel } from './context/TutorielContext'
import { AuthProvider, useAuth } from './context/AuthContext'
import { ThemeProvider } from './context/ThemeContext'
import { WeatherThemeProvider } from './context/WeatherContext'
import { ToastProvider, useToast } from './context/ToastContext'
import { surNotificationPremierPlan } from './lib/push'
import { usePublierSynchro, useAbonnerDemandes, useAbonnerMessagesInvites, useAbonnerPaiementsInvites } from './hooks/useSync'
import { usePushNavigation } from './hooks/usePushNavigation'
import { useRappelsLocaux } from './hooks/useRappelsLocaux'
import { useSauvegardeAuto } from './hooks/useSauvegardeAuto'
import { useDetecterConflits } from './hooks/useConflits'
import { useMiseAJour } from './hooks/useMiseAJour.jsx'
import { surveillerClavier } from './lib/clavier'
import { restaurerCompte, restaurerMesGroupes } from './lib/syncEngine'
import HorsLigneBanner from './components/HorsLigneBanner'
import ConnexionModal from './components/ConnexionModal'
import AppOpening from './components/AppOpening'
import Onboarding from './components/Onboarding'
import LockScreen from './screens/LockScreen'
import DashboardScreen from './screens/DashboardScreen'
import ConnexionScreen from './screens/ConnexionScreen'
// Écrans secondaires : chargés à la demande pour alléger le bundle de
// démarrage (le shell est servi depuis les assets locales, le coût est nul
// une fois l'app ouverte).
const GroupScreen = lazy(() => import('./screens/GroupScreen'))
const AssistantScreen = lazy(() => import('./screens/AssistantScreen'))
const DiscussionScreen = lazy(() => import('./screens/DiscussionScreen'))
const SettingsScreen = lazy(() => import('./screens/SettingsScreen'))
const NotificationsScreen = lazy(() => import('./screens/NotificationsScreen'))
const AideScreen = lazy(() => import('./screens/AideScreen'))
const EpargneScreen = lazy(() => import('./screens/EpargneScreen'))
const StatsScreen = lazy(() => import('./screens/StatsScreen'))
const ResetPasswordScreen = lazy(() => import('./screens/ResetPasswordScreen'))
const CalendrierScreen = lazy(() => import('./screens/CalendrierScreen'))
const ProfilScreen = lazy(() => import('./screens/ProfilScreen'))
const ExplorerScreen = lazy(() => import('./screens/ExplorerScreen'))
const ConfidentialiteScreen = lazy(() => import('./screens/ConfidentialiteScreen'))
import GlobalActions from './components/GlobalActions'
import BottomNav from './components/BottomNav'
import ErrorBoundary from './components/ErrorBoundary'
import './index.css'

function ChargementEcran() {
  return (
    <div className="flex min-h-[60vh] items-center justify-center" role="status" aria-live="polite">
      <span className="h-8 w-8 animate-spin rounded-full border-2 border-[color:rgb(var(--accent)/0.25)] border-t-[color:rgb(var(--accent))]" />
      <span className="sr-only">Chargement…</span>
    </div>
  )
}

function Shell() {
  const { ready } = usePin()
  const { relance, resetRelance } = useTutoriel()
  const [boot, setBoot] = useState(true)
  const [tutorielVu, setTutorielVu] = useState(() => localStorage.getItem('tontine_tutoriel') === '1')
  const pageRef = useRef(null)
  const location = useLocation()
  // Publie la hauteur masquée par le clavier en `--clavier` sur <html> : sans
  // cela, champs et boutons de modale restent sous le clavier sur Android.
  useEffect(() => surveillerClavier(), [])
  // Re-joue l'animation d'entrée à chaque changement d'écran.
  useEffect(() => {
    const el = pageRef.current
    if (!el) return
    el.classList.remove('anim-page')
    void el.offsetWidth
    el.classList.add('anim-page')
  }, [location.pathname])
  // Le responsable publie automatiquement ses groupes synchronisés.
  usePublierSynchro()
  // Le responsable enregistre automatiquement les invités qui rejoignent.
  useAbonnerDemandes()
  // Le responsable intègre les messages envoyés par les invités.
  useAbonnerMessagesInvites()
  // Le responsable intègre les paiements signalés par les membres (SasPay).
  useAbonnerPaiementsInvites()
  // Ouvre le groupe correspondant quand on tape une notification push.
  usePushNavigation()
  // Reprogramme les rappels locaux (échéances de tours) à chaque changement.
  useRappelsLocaux()
  // Sauvegarde cloud automatique (toutes les 5 min et au retour de connexion).
  useSauvegardeAuto()
  // Détection des conflits multi-appareils sur les groupes personnels.
  useDetecterConflits()
  // Mise à jour à distance (manifeste update.json hébergé gratuitement).
  const maj = useMiseAJour()
  // Notifications push FCM reçues en premier plan (app ouverte) -> toast.
  const toast = useToast()
  useEffect(() => {
    // L'abonnement est asynchrone : retourner directement sa Promise à React
    // la stockerait comme fonction de nettoyage, qui serait appelée telle
    // quelle au prochain changement de dépendance — « TypeError: c is not a
    // function » et écran cassé. On garde le désabonnement dans une variable.
    let desab = null
    let annule = false
    surNotificationPremierPlan((p) => {
      if (p && p.titre) toast.info((p.titre || 'Tontine') + (p.corps ? ' — ' + p.corps : ''))
    }).then((u) => {
      if (annule) { u && u() } else { desab = u }
    }).catch(() => {})
    return () => { annule = true; desab && desab() }
  }, [toast])

  // Retour matériel Android : ferme d'abord une éventuelle modale capturée,
  // sinon revient dans l'historique SPA, sinon quitte l'application après une
  // seconde pression. Une sortie au premier appui est vécue comme un plantage,
  // la navigation par gestes déclenchant « retour » sans intention de fermer.
  useEffect(() => {
    let sub
    let dernierRetour = 0
    CapacitorApp.addListener('backButton', ({ canGoBack }) => {
      const override = getBackOverride()
      if (override) {
        override()
        return
      }
      if (canGoBack) {
        window.history.back()
        return
      }
      const maintenant = Date.now()
      if (maintenant - dernierRetour < 2000) {
        CapacitorApp.exitApp()
        return
      }
      dernierRetour = maintenant
      toast.info(t('commun.retourQuitter'))
    }).then((s) => {
      sub = s
    })
    return () => {
      if (sub) sub.remove()
    }
  }, [toast])

  // Restauration des données liées au compte Google : dès que l'utilisateur
  // est authentifié (connexion via l'écran OU auth déjà persistée au relancement
  // de l'app), on récupère ses groupes depuis Firebase. Idempotent (dédoublé
  // par uid) : peut cohabiter avec la restauration déclenchée par l'écran de
  // connexion et garantit la récupération sur un autre appareil.
  const { utilisateur } = useAuth()
  const { refresh } = useData()
  const restaureUid = useRef(null)
  useEffect(() => {
    if (!utilisateur) {
      restaureUid.current = null
      return
    }
    if (restaureUid.current === utilisateur.uid) return
    restaureUid.current = utilisateur.uid
    Promise.all([restaurerCompte(utilisateur.uid), restaurerMesGroupes(utilisateur.uid)])
      .then(() => refresh())
      .catch(() => {})
  }, [utilisateur, refresh])

  const montrerTutoriel = !tutorielVu || relance
  const terminerTutoriel = () => {
    setTutorielVu(true)
    resetRelance()
  }

  return (
    <>
      {boot && <AppOpening onFinish={() => setBoot(false)} />}
      <ConnexionModal />
      <HorsLigneBanner />
      {maj.modal}
      {montrerTutoriel ? (
        <Onboarding onFinish={terminerTutoriel} />
      ) : !ready ? (
        <LockScreen />
      ) : !utilisateur ? (
        // Écrans accessibles sans compte : le lien reçu par e-mail pour
        // réinitialiser le mot de passe, et la politique de confidentialité
        // que l'on doit pouvoir lire avant de consentir.
        <Suspense fallback={<ChargementEcran />}>
          <Routes>
            <Route path="/confidentialite" element={<ConfidentialiteScreen />} />
            <Route path="/reset" element={<ResetPasswordScreen />} />
            <Route path="*" element={<ConnexionScreen />} />
          </Routes>
        </Suspense>
      ) : (
        <GlobalActions>
          <div ref={pageRef} className="anim-page">
          <Suspense fallback={<ChargementEcran />}>
          <Routes>
            <Route path="/" element={<DashboardScreen />} />
            <Route path="/groupe/:id" element={<GroupScreen />} />
            <Route path="/groupe/:id/assistant" element={<AssistantScreen />} />
            <Route path="/groupe/:id/discussion" element={<DiscussionScreen />} />
            <Route path="/parametres" element={<SettingsScreen maj={maj} />} />
            <Route path="/notifications" element={<NotificationsScreen />} />
            <Route path="/aide" element={<AideScreen />} />
            <Route path="/epargne" element={<EpargneScreen />} />
            <Route path="/stats" element={<StatsScreen />} />
            <Route path="/calendrier" element={<CalendrierScreen />} />
            <Route path="/profil" element={<ProfilScreen />} />
            <Route path="/explorer" element={<ExplorerScreen />} />
            <Route path="/connexion" element={<ConnexionScreen />} />
            <Route path="/reset" element={<ResetPasswordScreen />} />
            <Route path="/confidentialite" element={<ConfidentialiteScreen />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
          </Suspense>
          </div>
          <BottomNav />
        </GlobalActions>
      )}
    </>
  )
}

function AuroraBackground() {
  return (
    <div className="aurora-bg" aria-hidden="true">
      <div
        className="aurora-blob animate-aurora"
        style={{ width: '60vw', height: '60vw', top: '-18vw', left: '-12vw', background: 'radial-gradient(circle, rgb(var(--accent) / 0.12) 0%, transparent 70%)' }}
      />
      <div
        className="aurora-blob animate-aurora"
        style={{ width: '55vw', height: '55vw', top: '12vh', right: '-16vw', background: 'radial-gradient(circle, rgb(var(--bg-card) / 0.3) 0%, transparent 70%)', animationDelay: '-6s' }}
      />
      <div
        className="aurora-blob animate-aurora"
        style={{ width: '48vw', height: '48vw', bottom: '-14vw', left: '20vw', background: 'radial-gradient(circle, rgb(var(--accent-light) / 0.08) 0%, transparent 70%)', animationDelay: '-11s' }}
      />
    </div>
  )
}

export default function App() {
  return (
    <ThemeProvider>
      <WeatherThemeProvider>
      <ToastProvider>
        <ConnectionProvider>
        <HashRouter>
          <TutorielProvider>
            <AuthProvider>
              <DataProvider>
                <PinProvider>
                  <AuroraBackground />
                  <ErrorBoundary>
                    <Shell />
                  </ErrorBoundary>
                </PinProvider>
              </DataProvider>
            </AuthProvider>
          </TutorielProvider>
        </HashRouter>
      </ConnectionProvider>
      </ToastProvider>
      </WeatherThemeProvider>
    </ThemeProvider>
  )
}
