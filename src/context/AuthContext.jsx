import { createContext, useContext, useEffect, useState, useCallback, useRef } from 'react'
import { Capacitor } from '@capacitor/core'
import { GoogleAuth } from '@codetrix-studio/capacitor-google-auth'
import { authGoogle, authRegister, authLogin, authForgot, authReset, setSyncUser } from '../lib/cloudApi'
import { activerNotifications, desactiverNotifications, pushDisponible } from '../lib/push'

const AuthContext = createContext(null)
const SESSION_KEY = 'tontine_session'

// Traduction des messages d'erreur du Worker.
const MESSAGES_ERREURS_FR = {
  'Email invalide': 'Adresse email invalide.',
  'Le mot de passe doit faire au moins 6 caractères': 'Le mot de passe doit contenir au moins 6 caractères.',
  'Cet email est déjà utilisé': 'Cet email est déjà utilisé par un autre compte.',
  'Email ou mot de passe incorrect': 'Email ou mot de passe incorrect.',
  'Aucun compte pour cet email': 'Aucun compte associé à cette adresse email.',
  'Lien invalide': 'Lien de réinitialisation invalide.',
  'Lien expiré': 'Lien de réinitialisation expiré.',
  'Non autorisé': 'Session expirée, reconnectez-vous.',
}

function messageErreurFR(e) {
  const m = e && e.message ? e.message : ''
  return MESSAGES_ERREURS_FR[m] || (m || 'Une erreur est survenue.')
}

function construireUtilisateur(session) {
  // session = { token, user: { uid, email, displayName } }
  const u = session.user || {}
  return {
    uid: u.uid,
    email: u.email || '',
    displayName: u.displayName || '',
    photoURL: u.photoURL || '',
    getIdToken: () => session.token,
  }
}

export function AuthProvider({ children }) {
  const [utilisateur, setUtilisateur] = useState(null)
  const [pret, setPret] = useState(false)
  const [erreur, setErreur] = useState('')

  // Restauration de la session locale.
  useEffect(() => {
    try {
      const raw = localStorage.getItem(SESSION_KEY)
      if (raw) {
        const session = JSON.parse(raw)
        if (session && session.token && session.user) {
          setUtilisateur(construireUtilisateur(session))
        }
      }
    } catch {}
    setPret(true)
  }, [])

  // Synchronise l'utilisateur avec le client cloud (Worker).
  useEffect(() => {
    setSyncUser(utilisateur)
  }, [utilisateur])

  // Enregistre/désenregistre le token FCM push selon la session.
  // Sur web : on n'active automatiquement que si l'autorisation est déjà accordée
  // (pas de demande de permission forcée au démarrage). Sur mobile natif : toujours.
  const prevUid = useRef(null)
  useEffect(() => {
    const uid = utilisateur && utilisateur.uid
    if (uid && uid !== prevUid.current) {
      const webAccorde = typeof Notification !== 'undefined' && Notification.permission === 'granted'
      if (pushDisponible() && (Capacitor.isNativePlatform() || webAccorde)) {
        activerNotifications(uid).catch(() => {})
      }
    } else if (!uid && prevUid.current) {
      desactiverNotifications(prevUid.current).catch(() => {})
    }
    prevUid.current = uid
  }, [utilisateur])

  const sauvegarderSession = useCallback((session) => {
    try { localStorage.setItem(SESSION_KEY, JSON.stringify(session)) } catch {}
    setUtilisateur(construireUtilisateur(session))
  }, [])

  const connecter = useCallback(async () => {
    setErreur('')
    try {
      if (Capacitor.isNativePlatform()) {
        await GoogleAuth.initialize()
      }
      const google = await GoogleAuth.signIn()
      const idToken = google.idToken || (google.authentication && google.authentication.idToken)
      if (!idToken) throw new Error('Token Google introuvable')
      const session = await authGoogle(idToken)
      sauvegarderSession(session)
      return session
    } catch (e) {
      setErreur(e && e.message ? e.message : 'Connexion Google annulée ou impossible.')
      return false
    }
  }, [sauvegarderSession])

  const deconnecter = useCallback(async () => {
    try {
      if (Capacitor.isNativePlatform()) {
        await GoogleAuth.initialize()
        await GoogleAuth.signOut()
      }
    } catch {}
    try { localStorage.removeItem(SESSION_KEY) } catch {}
    setUtilisateur(null)
  }, [])

  const inscriptionEmail = useCallback(async (email, mdp, nom) => {
    setErreur('')
    try {
      const session = await authRegister(email, mdp, nom)
      sauvegarderSession(session)
      return session
    } catch (e) {
      setErreur(messageErreurFR(e))
      return false
    }
  }, [sauvegarderSession])

  const connexionEmail = useCallback(async (email, mdp) => {
    setErreur('')
    try {
      const session = await authLogin(email, mdp)
      sauvegarderSession(session)
      return session
    } catch (e) {
      setErreur(messageErreurFR(e))
      return false
    }
  }, [sauvegarderSession])

  // Envoie le lien de réinitialisation par e-mail (endpoint public auth2/forgot).
  const envoyerLienReset = useCallback(async (email) => {
    setErreur('')
    try {
      await authForgot(email)
      return true
    } catch (e) {
      setErreur(messageErreurFR(e))
      return false
    }
  }, [])

  // Consomme le lien (token) et connecte l'utilisateur (endpoint auth2/reset).
  const confirmerReset = useCallback(async (email, token, mdp) => {
    setErreur('')
    try {
      const session = await authReset(email, mdp, token)
      sauvegarderSession(session)
      return session
    } catch (e) {
      setErreur(messageErreurFR(e))
      return false
    }
  }, [sauvegarderSession])

  return (
    <AuthContext.Provider
      value={{ utilisateur, pret, erreur, connecter, deconnecter, inscriptionEmail, connexionEmail, envoyerLienReset, confirmerReset }}
    >
      {children}
    </AuthContext.Provider>
  )
}

export const useAuth = () => useContext(AuthContext)
export { AuthContext }
