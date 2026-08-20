import { HashRouter, Routes, Route, Navigate } from 'react-router-dom'
import { useState, useRef, useEffect } from 'react'
import { App as CapacitorApp } from '@capacitor/app'
import { getBackOverride } from './lib/backButton'
import { PinProvider, usePin } from './context/PinContext'
import { DataProvider, useData } from './context/DataContext'
import { ConnectionProvider } from './context/ConnectionContext'
import { TutorielProvider, useTutoriel } from './context/TutorielContext'
import { AuthProvider, useAuth } from './context/AuthContext'
import { ThemeProvider } from './context/ThemeContext'
import { ToastProvider, useToast } from './context/ToastContext'
import { surNotificationPremierPlan } from './lib/push'
import { usePublierSynchro, useAbonnerDemandes, useAbonnerMessagesInvites, useAbonnerPaiements, useAbonnerPaiementsInvites } from './hooks/useSync'
import { usePushNavigation } from './hooks/usePushNavigation'
import { useRappelsLocaux } from './hooks/useRappelsLocaux'
import { useSauvegardeAuto } from './hooks/useSauvegardeAuto'
import { useDetecterConflits } from './hooks/useConflits'
import { useMiseAJour } from './hooks/useMiseAJour.jsx'
import { restaurerCompte, restaurerMesGroupes } from './lib/syncEngine'
import HorsLigneBanner from './components/HorsLigneBanner'
import ConnexionModal from './components/ConnexionModal'
import AppOpening from './components/AppOpening'
import Onboarding from './components/Onboarding'
import LockScreen from './screens/LockScreen'
import DashboardScreen from './screens/DashboardScreen'
import GroupScreen from './screens/GroupScreen'
import AssistantScreen from './screens/AssistantScreen'
import SettingsScreen from './screens/SettingsScreen'
import NotificationsScreen from './screens/NotificationsScreen'
import AideScreen from './screens/AideScreen'
import EpargneScreen from './screens/EpargneScreen'
import StatsScreen from './screens/StatsScreen'
import ConnexionScreen from './screens/ConnexionScreen'
import ResetPasswordScreen from './screens/ResetPasswordScreen'
import GlobalActions from './components/GlobalActions'
import BottomNav from './components/BottomNav'
import './index.css'

function Shell() {
  const { ready } = usePin()
  const { relance, resetRelance } = useTutoriel()
  const [boot, setBoot] = useState(true)
  const [tutorielVu, setTutorielVu] = useState(() => localStorage.getItem('tontine_tutoriel') === '1')
  // Le responsable publie automatiquement ses groupes synchronisés.
  usePublierSynchro()
  // Le responsable enregistre automatiquement les invités qui rejoignent.
  useAbonnerDemandes()
  // Le responsable intègre les messages envoyés par les invités.
  useAbonnerMessagesInvites()
  // Le responsable intègre les paiements en ligne confirmés (PayDunya).
  useAbonnerPaiements()
  // Le responsable intègre les paiements signalés par les membres (Mobile Money).
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
    const desab = surNotificationPremierPlan((p) => {
      if (p && p.titre) toast.info((p.titre || 'Tontine') + (p.corps ? ' — ' + p.corps : ''))
    })
    return desab
  }, [toast])

  // Retour matériel Android : ferme d'abord une éventuelle modale capturée,
  // sinon revient dans l'historique SPA, sinon quitte l'application.
  useEffect(() => {
    let sub
    CapacitorApp.addListener('backButton', ({ canGoBack }) => {
      const override = getBackOverride()
      if (override) {
        override()
        return
      }
      if (canGoBack) window.history.back()
      else CapacitorApp.exitApp()
    }).then((s) => {
      sub = s
    })
    return () => {
      if (sub) sub.remove()
    }
  }, [])

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
        <ConnexionScreen />
      ) : (
        <GlobalActions>
          <Routes>
            <Route path="/" element={<DashboardScreen />} />
            <Route path="/groupe/:id" element={<GroupScreen />} />
            <Route path="/groupe/:id/assistant" element={<AssistantScreen />} />
            <Route path="/parametres" element={<SettingsScreen maj={maj} />} />
            <Route path="/notifications" element={<NotificationsScreen />} />
            <Route path="/aide" element={<AideScreen />} />
            <Route path="/epargne" element={<EpargneScreen />} />
            <Route path="/stats" element={<StatsScreen />} />
            <Route path="/connexion" element={<ConnexionScreen />} />
            <Route path="/reset" element={<ResetPasswordScreen />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
          <BottomNav />
        </GlobalActions>
      )}
    </>
  )
}

export default function App() {
  return (
    <ThemeProvider>
      <ToastProvider>
        <ConnectionProvider>
        <HashRouter>
          <TutorielProvider>
            <AuthProvider>
              <DataProvider>
                <PinProvider>
                  <Shell />
                </PinProvider>
              </DataProvider>
            </AuthProvider>
          </TutorielProvider>
        </HashRouter>
      </ConnectionProvider>
      </ToastProvider>
    </ThemeProvider>
  )
}
