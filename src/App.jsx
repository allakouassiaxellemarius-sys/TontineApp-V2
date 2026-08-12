import { HashRouter, Routes, Route, Navigate } from 'react-router-dom'
import { useState } from 'react'
import { PinProvider, usePin } from './context/PinContext'
import { DataProvider } from './context/DataContext'
import { ConnectionProvider } from './context/ConnectionContext'
import { TutorielProvider, useTutoriel } from './context/TutorielContext'
import { AuthProvider } from './context/AuthContext'
import { ThemeProvider } from './context/ThemeContext'
import { ToastProvider } from './context/ToastContext'
import { usePublierSynchro, useAbonnerDemandes, useAbonnerMessagesInvites } from './hooks/useSync'
import { usePushNavigation } from './hooks/usePushNavigation'
import { useRappelsLocaux } from './hooks/useRappelsLocaux'
import { useSauvegardeAuto } from './hooks/useSauvegardeAuto'
import { useMiseAJour } from './hooks/useMiseAJour.jsx'
import HorsLigneBanner from './components/HorsLigneBanner'
import ConnexionModal from './components/ConnexionModal'
import AppOpening from './components/AppOpening'
import Onboarding from './components/Onboarding'
import LockScreen from './screens/LockScreen'
import DashboardScreen from './screens/DashboardScreen'
import GroupScreen from './screens/GroupScreen'
import SettingsScreen from './screens/SettingsScreen'
import NotificationsScreen from './screens/NotificationsScreen'
import AideScreen from './screens/AideScreen'
import EpargneScreen from './screens/EpargneScreen'
import StatsScreen from './screens/StatsScreen'
import ConnexionScreen from './screens/ConnexionScreen'
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
  // Ouvre le groupe correspondant quand on tape une notification push.
  usePushNavigation()
  // Reprogramme les rappels locaux (échéances de tours) à chaque changement.
  useRappelsLocaux()
  // Sauvegarde cloud automatique (toutes les 5 min et au retour de connexion).
  useSauvegardeAuto()
  // Mise à jour à distance (manifeste update.json hébergé gratuitement).
  const maj = useMiseAJour()

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
      ) : (
        <GlobalActions>
          <Routes>
            <Route path="/" element={<DashboardScreen />} />
            <Route path="/groupe/:id" element={<GroupScreen />} />
            <Route path="/parametres" element={<SettingsScreen maj={maj} />} />
            <Route path="/notifications" element={<NotificationsScreen />} />
            <Route path="/aide" element={<AideScreen />} />
            <Route path="/epargne" element={<EpargneScreen />} />
            <Route path="/stats" element={<StatsScreen />} />
            <Route path="/connexion" element={<ConnexionScreen />} />
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
