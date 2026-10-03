import { createContext, useContext, useEffect, useState, useCallback, useRef } from 'react'
import { Capacitor } from '@capacitor/core'
import { GoogleAuth } from '@codetrix-studio/capacitor-google-auth'
import { authGoogle, authRegister, authLogin, authForgot, authReset, setSyncUser } from '../lib/cloudApi'
import { activerNotifications, desactiverNotifications, pushDisponible } from '../lib/push'
import { t, getLangue } from '../lib/i18n'
import { enregistrerJeton, lireJeton, effacerJeton } from '../lib/securiteSession'

const AuthContext = createContext(null)
const SESSION_KEY = 'tontine_session'
const SESSION_TS_KEY = 'tontine_session_ts'
const DUREE_SESSION = 720 * 60 * 60 * 1000

const GOOGLE_CLIENT_ID_WEB = '793106571941-tva6kieobdac95diafgcl2ot2q9ucap5.apps.googleusercontent.com'

// `requestIdToken()` exige un client OAuth « web » : le plugin Capacitor se
// servait de `androidClientId` (type 1), que Google refuse comme audience — d'où
// « l'écran Google s'ouvre puis échoue » (ApiException 12500) une fois le compte
// choisi. Le client web est aussi celui accepté par le Worker.
const GOOGLE_OPTIONS = { clientId: GOOGLE_CLIENT_ID_WEB, scopes: ['profile', 'email'], grantOfflineAccess: false }

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

// Codes GoogleSignInStatusCodes / ConnectionResult renvoyés par le plugin natif,
// qui ne transmet qu'un numéro brut sinon.
const ERREURS_GOOGLE = {
  fr: {
    2: 'Service Google Play désactivé sur cet appareil.',
    3: 'Service Google Play indisponible sur cet appareil.',
    5: 'Compte Google introuvable sur cet appareil.',
    10: "Configuration Google incorrecte : l'empreinte de signature de l'application ne correspond à aucun client OAuth du projet.",
    12500: 'Google a refusé la connexion. Réessayez ou connectez-vous avec votre email.',
    12502: 'Une connexion Google est déjà en cours.',
  },
  en: {
    2: 'Google Play services is disabled on this device.',
    3: 'Google Play services are unavailable on this device.',
    5: 'No Google account found on this device.',
    10: "Invalid Google configuration: this app's signing certificate matches no OAuth client in the project.",
    12500: 'Google refused the sign-in. Try again or sign in with your email.',
    12502: 'A Google sign-in is already in progress.',
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

// La partie publique de la session doit avoir une forme complète ; le jeton,
// lui, est lu dans le stockage chiffré.
function sessionValide() {
  try {
    const raw = localStorage.getItem(SESSION_KEY)
    if (!raw) return true
    const s = JSON.parse(raw)
    return !!(s && s.user && s.user.uid && s.user.email)
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
    // Le jeton vit dans le stockage chiffré ; sa lecture est asynchrone.
    ;(async () => {
      try {
        const raw = localStorage.getItem(SESSION_KEY)
        if (raw) {
          const session = JSON.parse(raw)
          if (session && session.user && sessionValide()) {
            if (sessionExpiree()) {
              localStorage.removeItem(SESSION_KEY)
              effacerSessionTs()
              effacerJeton().catch(() => {})
            } else {
              const token = session.token || (await lireJeton())
              if (token) {
                setUtilisateur(construireUtilisateur({ ...session, token }))
                toucherSession()
                // Migration : une session v1 gardait le jeton en clair.
                try {
                  await enregistrerJeton(token)
                  localStorage.setItem(SESSION_KEY, JSON.stringify({ user: session.user }))
                } catch {
                  try { localStorage.setItem(SESSION_KEY, JSON.stringify({ ...session, token })) } catch {}
                }
              } else {
                localStorage.removeItem(SESSION_KEY)
                effacerSessionTs()
              }
            }
          }
        }
      } catch {}
      setPret(true)
    })()
  }, [])

  useEffect(() => {
    // initialize() doit avoir réussi avant signIn() : le plugin garde son
    // GoogleSignInClient en mémoire d'instance.
    GoogleAuth.initialize(GOOGLE_OPTIONS).catch((e) => console.warn('[google] initialize :', e))
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
    // Seule la partie non sensible du compte reste dans localStorage
    // (lib/db.js s'en sert pour cléfier les données locales).
    try { localStorage.setItem(SESSION_KEY, JSON.stringify({ user: session.user })) } catch {}
    toucherSession()
    setUtilisateur(construireUtilisateur(session))
    enregistrerJeton(session.token).catch(() => {
      // WebCrypto/IndexedDB indisponibles : repli en clair, la connexion
      // prime sur le confort de chiffrement.
      try { localStorage.setItem(SESSION_KEY, JSON.stringify(session)) } catch {}
    })
  }, [])

  const connecter = useCallback(async () => {
    setErreur('')
    try {
      // initialize() a pu échouer au démarrage (Google Play Services pas encore
      // prêt) : sans client, signIn() lèverait une erreur incompréhensible.
      await GoogleAuth.initialize(GOOGLE_OPTIONS)
      const google = await GoogleAuth.signIn()
      const idToken = google.idToken || (google.authentication && google.authentication.idToken)
      if (!idToken) throw new Error('Token Google introuvable')
      const session = await authGoogle(idToken)
      sauvegarderSession(session)
      return session
    } catch (e) {
      const msg = e && e.message ? e.message : ''
      const code = e && e.code != null ? String(e.code) : ''
      const langue = getLangue() === 'en' ? 'en' : 'fr'
      console.error('[google] échec signIn/authGoogle :', e)
      if (ERREURS_GOOGLE[langue][code]) setErreur(ERREURS_GOOGLE[langue][code] + ' (' + code + ')')
      else if (msg.includes('Failed to fetch') || msg.includes('NetworkError')) setErreur(t('auth.serveurInaccessible'))
      else if (msg === 'Token Google introuvable') setErreur(t('auth.tokenIntrouvable'))
      else setErreur((code ? code + ' · ' : '') + normaliserErreur(e))
      return false
    }
  }, [sauvegarderSession])

  const deconnecter = useCallback(async () => {
    try {
      if (Capacitor.isNativePlatform()) await GoogleAuth.signOut()
    } catch {}
    try { localStorage.removeItem(SESSION_KEY) } catch {}
    effacerJeton().catch(() => {})
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
