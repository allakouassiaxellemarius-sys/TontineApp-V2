import { createContext, useContext, useEffect, useState, useCallback, useRef } from 'react'
import { Capacitor } from '@capacitor/core'
import { GoogleAuth } from '@codetrix-studio/capacitor-google-auth'
import { authGoogle, authRegister, authLogin, authForgot, authReset, setSyncUser } from '../lib/cloudApi'
import { activerNotifications, desactiverNotifications, pushDisponible } from '../lib/push'
import { t, getLangue } from '../lib/i18n'

const AuthContext = createContext(null)
const SESSION_KEY = 'tontine_session'
const SESSION_TS_KEY = 'tontine_session_ts'
const DUREE_SESSION = 720 * 60 * 60 * 1000

const GOOGLE_CLIENT_ID_WEB = '793106571941-co6ftihch6vi1r5s9589bu8pl9thshud.apps.googleusercontent.com'

// Messages du Worker traduits dans la langue active.
const MESSAGES_ERREURS = {
  fr: {
    'Email invalide': 'Adresse email invalide.',
    'Le mot de passe doit faire au moins 6 caractères': 'Le mot de passe doit contenir au moins 6 caractères.',
    'Cet email est déjà utilisé': 'Cet email est déjà utilisé par un autre compte.',
    'Email ou mot de passe incorrect': 'Email ou mot de passe incorrect.',
    'Aucun compte pour cet email': 'Aucun compte associé à cette adresse email.',
    'Lien invalide': 'Lien de réinitialisation invalide.',
    'Lien expiré': 'Lien de réinitialisation expiré.',
    'Non autorisé': 'Session expirée, reconnectez-vous.',
    'Compte Google déjà lié à un autre compte': 'Ce compte Google est déjà lié à un autre compte.',
    'Vérifiez votre identité': 'Veuillez vérifier votre identité pour lier ce compte.',
    'Trop de tentatives, réessayez dans une minute': 'Trop de tentatives. Réessayez dans une minute.',
  },
  en: {
    'Email invalide': 'Invalid email address.',
    'Le mot de passe doit faire au moins 6 caractères': 'The password must contain at least 6 characters.',
    'Cet email est déjà utilisé': 'This email is already used by another account.',
    'Email ou mot de passe incorrect': 'Incorrect email or password.',
    'Aucun compte pour cet email': 'No account associated with this email address.',
    'Lien invalide': 'Invalid reset link.',
    'Lien expiré': 'Expired reset link.',
    'Non autorisé': 'Session expired, please sign in again.',
    'Compte Google déjà lié à un autre compte': 'This Google account is already linked to another account.',
    'Vérifiez votre identité': 'Please verify your identity to link this account.',
    'Trop de tentatives, réessayez dans une minute': 'Too many attempts. Please try again in a minute.',
  },
}

function normaliserErreur(e) {
  const m = e && e.message ? e.message : ''
  const langue = getLangue() === 'en' ? 'en' : 'fr'
  return MESSAGES_ERREURS[langue][m] || m || t('auth.erreurGenerique')
}

function toucherSession() {
  try { localStorage.setItem(SESSION_TS_KEY, String(Date.now())) } catch {}
}

function sessionExpiree() {
  try {
    const ts = parseInt(localStorage.getItem(SESSION_TS_KEY) || '0', 10)
    return ts ? Date.now() - ts > DUREE_SESSION : false
  } catch {
    return false
  }
}

function effacerSessionTs() {
  try { localStorage.removeItem(SESSION_TS_KEY) } catch {}
}

// Le jeton est stocké en clair : on ne restaure que si la forme est complète.
function sessionValide() {
  try {
    const raw = localStorage.getItem(SESSION_KEY)
    if (!raw) return true
    const s = JSON.parse(raw)
    return !!(s && s.token && s.user && s.user.uid && s.user.email)
  } catch {
    return false
  }
}

function construireUtilisateur(session) {
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

  useEffect(() => {
    try {
      const raw = localStorage.getItem(SESSION_KEY)
      if (raw) {
        const session = JSON.parse(raw)
        if (session && session.token && session.user && sessionValide()) {
          if (sessionExpiree()) {
            localStorage.removeItem(SESSION_KEY)
            effacerSessionTs()
          } else {
            setUtilisateur(construireUtilisateur(session))
            toucherSession()
          }
        }
      }
    } catch {}
    setPret(true)
  }, [])

  useEffect(() => {
    if (Capacitor.isNativePlatform()) {
      GoogleAuth.initialize().catch(() => {})
    } else {
      GoogleAuth.initialize({ clientId: GOOGLE_CLIENT_ID_WEB, scopes: ['profile', 'email'], grantOfflineAccess: false })
        .catch(() => {})
    }
  }, [])

  useEffect(() => {
    setSyncUser(utilisateur)
  }, [utilisateur])

  // Le token FCM n'est enregistré qu'en natif, ou sur web si la permission est déjà accordée.
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
    toucherSession()
    setUtilisateur(construireUtilisateur(session))
  }, [])

  const connecter = useCallback(async () => {
    setErreur('')
    try {
      const google = await GoogleAuth.signIn()
      const idToken = google.idToken || (google.authentication && google.authentication.idToken)
      if (!idToken) throw new Error('Token Google introuvable')
      const session = await authGoogle(idToken)
      sauvegarderSession(session)
      return session
    } catch (e) {
      const msg = e && e.message ? e.message : ''
      console.error('[google] échec signIn/authGoogle :', e)
      if (msg.includes('Failed to fetch') || msg.includes('NetworkError')) setErreur(t('auth.serveurInaccessible'))
      else if (msg === 'Token Google introuvable') setErreur(t('auth.tokenIntrouvable'))
      else setErreur((e && e.code ? e.code + ' · ' : '') + normaliserErreur(e))
      return false
    }
  }, [sauvegarderSession])

  const deconnecter = useCallback(async () => {
    try {
      if (Capacitor.isNativePlatform()) await GoogleAuth.signOut()
    } catch {}
    try { localStorage.removeItem(SESSION_KEY) } catch {}
    effacerSessionTs()
    setUtilisateur(null)
  }, [])

  const inscriptionEmail = useCallback(async (email, mdp, nom) => {
    setErreur('')
    try {
      const session = await authRegister(email, mdp, nom)
      sauvegarderSession(session)
      return session
    } catch (e) {
      setErreur(normaliserErreur(e))
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
      setErreur(normaliserErreur(e))
      return false
    }
  }, [sauvegarderSession])

  const envoyerLienReset = useCallback(async (email) => {
    setErreur('')
    try {
      await authForgot(email)
      return true
    } catch (e) {
      setErreur(normaliserErreur(e))
      return false
    }
  }, [])

  const confirmerReset = useCallback(async (email, token, mdp) => {
    setErreur('')
    try {
      const session = await authReset(email, mdp, token)
      sauvegarderSession(session)
      return session
    } catch (e) {
      setErreur(normaliserErreur(e))
      return false
    }
  }, [sauvegarderSession])

  const effacerErreur = useCallback(() => setErreur(''), [])

  return (
    <AuthContext.Provider
      value={{ utilisateur, pret, erreur, effacerErreur, connecter, deconnecter, inscriptionEmail, connexionEmail, envoyerLienReset, confirmerReset }}
    >
      {children}
    </AuthContext.Provider>
  )
}

export const useAuth = () => useContext(AuthContext)
export { AuthContext }
