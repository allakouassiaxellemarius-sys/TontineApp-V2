import { useEffect, useState, useCallback, useRef } from 'react'
import { RefreshCw, DownloadCloud, Zap } from 'lucide-react'
import Modal from '../components/Modal'
import {
  majDisponibles, verifierMiseAJour, installerMiseAJour, annoncerAppPrete,
  versionBundleActuelle, urlManifest, MAJ_URL_DEFAUT,
  programmerRappelMiseAJour, annulerRappelMiseAJour,
} from '../lib/miseAJour'

// Vérifie périodiquement la présence d'une mise à jour Netlify et propose
// à l'utilisateur de l'installer (téléchargement + activation + reload).
// Aucune réinstallation d'APK nécessaire pour les mises à jour du bundle web.
export function useMiseAJour() {
  const [maj, setMaj] = useState(null) // { version, url } disponible
  const [etat, setEtat] = useState('idle') // 'idle' | 'checking' | 'ready' | 'installing' | 'error'
  const [etape, setEtape] = useState('') // 'connexion' | 'telechargement' | 'installation'
  const [erreur, setErreur] = useState('')
  const [info, setInfo] = useState('')
  // 'idle' : rien de proposé, on peut re-vérifier ; 'propose' : une mise à
  // jour est affichée ou en cours ; 'ignore' : l'utilisateur l'a repoussée.
  const statut = useRef('idle')

  const verifier = useCallback(async (manuelle) => {
    if (!majDisponibles()) return
    if (!manuelle && statut.current !== 'idle') return
    statut.current = 'idle'
    setEtat('checking')
    setErreur('')
    setInfo('')
    try {
      const dispo = await verifierMiseAJour()
      if (dispo) {
        statut.current = 'propose'
        setMaj(dispo)
        setEtat('ready')
        // Rappel quotidien à 10h00 tant que la mise à jour n'est pas installée.
        programmerRappelMiseAJour(dispo.version)
      } else {
        annulerRappelMiseAJour()
        setMaj(null)
        setEtat('idle')
        if (manuelle) setInfo('À jour — aucune mise à jour à installer.')
      }
    } catch (e) {
      statut.current = 'idle'
      setEtat('idle')
      setErreur((e && e.message) || 'Impossible de vérifier les mises à jour.')
    }
  }, [])

  useEffect(() => {
    if (!majDisponibles()) return
    // Préviens le plugin que le bundle actuel est sain (évite le rollback).
    annoncerAppPrete()
    // Premier contrôle ~8 s après le lancement (laisse le temps à l'app de se stabiliser).
    const t = setTimeout(() => verifier(false), 8000)
    // Re-contrôle périodique : si le premier check échoue (réseau, cache
    // CDN…) ou si l'utilisateur ignore la mise à jour, on réessaie jusqu'à
    // ce que la version soit à jour.
    const i = setInterval(() => verifier(false), 60000)
    return () => {
      clearTimeout(t)
      clearInterval(i)
    }
  }, [verifier])

  const installer = async () => {
    if (!maj) return
    statut.current = 'propose'
    setEtat('installing')
    setEtape('connexion')
    setErreur('')
    setInfo('')
    // Annulation du rappel quotidien en tâche de fond : un appel natif
    // (LocalNotifications.cancel) peut rester sans réponse sur certains
    // systèmes et ne doit jamais bloquer le flux de mise à jour.
    annulerRappelMiseAJour()
    try {
      await installerMiseAJour(maj, setEtape)
      // reload() redémarre l'app sur le nouveau bundle : on n'atteint jamais la suite.
    } catch (e) {
      statut.current = 'idle'
      setEtat('ready')
      setEtape('')
      setErreur((e && e.message) || 'Échec de l’installation. Réessayez plus tard.')
    }
  }

  const ignorer = () => {
    statut.current = 'ignore'
    setMaj(null)
    setEtat('idle')
    setEtape('')
    setErreur('')
    setInfo('')
  }

  const LIBELLES_ETAPE = {
    connexion: 'Connexion au serveur de mise à jour…',
    telechargement: 'Téléchargement de la mise à jour…',
    installation: 'Installation de la mise à jour…',
  }

  const modal = maj && (
    <Modal
      open={etat === 'ready' || etat === 'installing'}
      onClose={etat === 'installing' ? () => {} : ignorer}
      title="Mise à jour disponible"
    >
      <div className="mb-4 flex items-start gap-3 rounded-2xl border border-brand-200 bg-brand-50 p-4">
        <Zap size={20} className="mt-0.5 shrink-0 text-brand-600" />
        <div>
          <p className="text-sm font-bold text-brand-800">
            Nouvelle version v{maj.version}
          </p>
          <p className="mt-1 text-xs text-brand-700">
            Votre application est en v{versionBundleActuelle()}. Téléchargez et
            installez la mise à jour — aucune réinstallation de l'APK n'est
            nécessaire, l'application se mettra à jour toute seule.
          </p>
        </div>
      </div>
      {erreur && <p className="mb-3 text-center text-xs font-semibold text-danger-600">{erreur}</p>}
      {etat === 'installing' && (
        <p className="mb-3 text-center text-xs font-medium text-gray-500">
          {LIBELLES_ETAPE[etape] || 'Mise à jour en cours…'}
        </p>
      )}
      <div className="flex justify-end gap-2">
        <button className="btn btn-secondary" onClick={ignorer} disabled={etat === 'installing'}>
          Plus tard
        </button>
        <button className="btn btn-primary" onClick={installer} disabled={etat === 'installing'}>
          {etat === 'installing' ? (
            <><RefreshCw size={16} /> Installation…</>
          ) : (
            <><DownloadCloud size={16} /> Mettre à jour</>
          )}
        </button>
      </div>
    </Modal>
  )

  return { maj, etat, erreur, info, verifier: () => verifier(true), installer, ignorer, modal }
}
