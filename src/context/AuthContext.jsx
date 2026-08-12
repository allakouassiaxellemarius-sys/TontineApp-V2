import { createContext, useContext, useEffect, useState, useCallback } from 'react'
import { Capacitor } from '@capacitor/core'
import { GoogleAuth } from '@codetrix-studio/capacitor-google-auth'
import { initializeApp, getApps, getApp } from 'firebase/app'
import {
  getAuth,
  onAuthStateChanged,
  signInWithCredential,
  GoogleAuthProvider,
  signInWithPopup,
  signOut as fbSignOut,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  sendPasswordResetEmail,
} from 'firebase/auth'
import { firebaseConfig, firebaseConfigure } from '../lib/firebaseConfig'

const AuthContext = createContext(null)

// Traduction des codes d'erreur Firebase Auth en messages français.
const MESSAGES_ERREURS_FR = {
  'auth/email-already-in-use': 'Cet email est déjà utilisé par un autre compte.',
  'auth/invalid-email': 'Adresse email invalide.',
  'auth/user-not-found': 'Aucun compte associé à cette adresse email.',
  'auth/wrong-password': 'Mot de passe incorrect.',
  'auth/invalid-credential': 'Email ou mot de passe incorrect.',
  'auth/user-disabled': 'Ce compte a été désactivé.',
  'auth/weak-password': 'Le mot de passe doit contenir au moins 6 caractères.',
  'auth/too-many-requests': 'Trop de tentatives. Réessayez dans quelques minutes.',
  'auth/operation-not-allowed':
    'Cette méthode de connexion n\u2019est pas activée : activez « Email / Mot de passe » dans Firebase → Authentication → Sign-in method.',
  'auth/network-request-failed': 'Problème de réseau. Vérifiez votre connexion Internet.',
  'auth/invalid-action-code': 'Le lien de réinitialisation est invalide ou a expiré.',
  'auth/missing-email': 'Veuillez saisir une adresse email.',
  'auth/internal-error': 'Une erreur interne est survenue. Réessayez.',
}

function messageErreurFR(e) {
  if (!e) return 'Une erreur est survenue.'
  return MESSAGES_ERREURS_FR[e.code] || MESSAGES_ERREURS_FR[e.message] || (e.message ? e.message : 'Une erreur est survenue.')
}

let firebaseApp = null
function app() {
  if (!firebaseApp) firebaseApp = getApps().length ? getApp() : initializeApp(firebaseConfig)
  return firebaseApp
}
let authInstance = null
function auth() {
  if (!authInstance) authInstance = getAuth(app())
  return authInstance
}

export function AuthProvider({ children }) {
  const [utilisateur, setUtilisateur] = useState(null)
  const [pret, setPret] = useState(false)
  const [erreur, setErreur] = useState('')

  useEffect(() => {
    if (!firebaseConfigure()) {
      setPret(true)
      return () => {}
    }
    let unsub = () => {}
    try {
      unsub = onAuthStateChanged(auth(), (u) => {
        setUtilisateur(u)
        setPret(true)
      })
    } catch {
      // Environnement sans support (tests, WebView incomplet) : pas de session.
      setPret(true)
    }
    return () => { unsub() }
  }, [])

  const connecter = useCallback(async () => {
    setErreur('')
    if (!firebaseConfigure()) {
      setErreur('Connexion Google indisponible : Firebase n\u2019est pas configuré.')
      return false
    }
    try {
      let utilisateurFirebase
      if (Capacitor.isNativePlatform()) {
        await GoogleAuth.initialize()
        const google = await GoogleAuth.signIn()
        const cred = GoogleAuthProvider.credential(google.idToken || google.accessToken)
        utilisateurFirebase = await signInWithCredential(auth(), cred)
      } else {
        const res = await signInWithPopup(auth(), new GoogleAuthProvider())
        utilisateurFirebase = res.user
      }
      setUtilisateur(utilisateurFirebase)
      return utilisateurFirebase
    } catch (e) {
      setErreur(e && e.message ? e.message : 'Connexion Google annulée ou impossible.')
      return false
    }
  }, [])

  const deconnecter = useCallback(async () => {
    try {
      if (Capacitor.isNativePlatform()) {
        await GoogleAuth.initialize()
        await GoogleAuth.signOut()
      }
      await fbSignOut(auth())
    } catch {}
    setUtilisateur(null)
  }, [])

  const inscriptionEmail = useCallback(async (email, mdp) => {
    setErreur('')
    if (!firebaseConfigure()) {
      setErreur('Inscription indisponible : Firebase n\u2019est pas configuré.')
      return false
    }
    try {
      const res = await createUserWithEmailAndPassword(auth(), email, mdp)
      setUtilisateur(res.user)
      return res.user
    } catch (e) {
      setErreur(messageErreurFR(e))
      return false
    }
  }, [])

  const connexionEmail = useCallback(async (email, mdp) => {
    setErreur('')
    if (!firebaseConfigure()) {
      setErreur('Connexion indisponible : Firebase n\u2019est pas configuré.')
      return false
    }
    try {
      const res = await signInWithEmailAndPassword(auth(), email, mdp)
      setUtilisateur(res.user)
      return res.user
    } catch (e) {
      setErreur(messageErreurFR(e))
      return false
    }
  }, [])

  const resetMotDePasse = useCallback(async (email) => {
    setErreur('')
    if (!firebaseConfigure()) {
      setErreur('Réinitialisation indisponible : Firebase n\u2019est pas configuré.')
      return false
    }
    try {
      await sendPasswordResetEmail(auth(), email)
      return true
    } catch (e) {
      setErreur(messageErreurFR(e))
      return false
    }
  }, [])

  return (
    <AuthContext.Provider
      value={{ utilisateur, pret, erreur, connecter, deconnecter, inscriptionEmail, connexionEmail, resetMotDePasse }}
    >
      {children}
    </AuthContext.Provider>
  )
}

export const useAuth = () => useContext(AuthContext)
export { AuthContext }
