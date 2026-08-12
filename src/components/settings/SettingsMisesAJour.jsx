import { useState } from 'react'
import { RefreshCw } from 'lucide-react'
import { majDisponibles } from '../../lib/miseAJour'
import { VERSION_APP } from '../../lib/version'
import SectionCard from './SectionCard'

export default function SettingsMisesAJour({ maj }) {
  const [manuelle, setManuelle] = useState(null)

  const verifier = async () => {
    setManuelle(true)
    await maj.verifier()
  }

  return (
    <SectionCard icon={RefreshCw} title="Mises à jour">
      {!majDisponibles() ? (
        <p className="text-xs text-gray-400">
          Les mises à jour à distance fonctionnent sur l'application mobile (Android), pas dans un navigateur.
        </p>
      ) : (
        <>
          <p className="mb-3 text-xs text-gray-400">
            L'application vérifie automatiquement au lancement et installe toute nouvelle version
            sans réinstaller l'APK. Version actuelle :{' '}
            <span className="font-semibold text-gray-700">v{VERSION_APP}</span>.
          </p>
          <button
            className="btn btn-secondary !px-3 !py-2 text-xs"
            onClick={verifier}
            disabled={maj.etat === 'checking' || maj.etat === 'installing'}
          >
            <RefreshCw size={14} className={maj.etat === 'checking' ? 'animate-spin' : ''} />
            {manuelle ? 'Vérifier à nouveau' : 'Vérifier les mises à jour'}
          </button>
          {maj.etat === 'checking' && <p className="mt-2 text-xs text-gray-400">Vérification…</p>}
          {maj.info && <p className="mt-2 text-xs text-success-600">{maj.info}</p>}
        </>
      )}
    </SectionCard>
  )
}
