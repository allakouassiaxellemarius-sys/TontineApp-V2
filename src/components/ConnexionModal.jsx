import { WifiOff, BookOpen, Power } from 'lucide-react'
import { useConnection } from '../context/ConnectionContext'

export default function ConnexionModal() {
  const { demandeHorsLigne, confirmerHorsLigne, resterActif } = useConnection()
  if (!demandeHorsLigne) return null
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-5 backdrop-blur-sm">
      <div className="w-full max-w-md rounded-3xl bg-surface p-5 shadow-2xl">
        <div className="mb-3 flex items-center gap-2">
          <WifiOff size={18} className="text-danger-500" />
          <h3 className="text-lg font-bold text-gray-800">Pas de connexion</h3>
        </div>
        <p className="text-sm text-gray-600">
          Voulez-vous passer en <span className="font-semibold">mode hors ligne (lecture seule)</span> ?
          Les modifications seront désactivées jusqu'au retour de la connexion.
        </p>
        <p className="mt-2 text-xs text-gray-400">
          Si vous restez actif, les modifications ne pourront pas être enregistrées sans connexion.
        </p>
        <div className="mt-5 flex flex-col gap-2">
          <button className="btn btn-primary w-full" onClick={confirmerHorsLigne}>
            <BookOpen size={16} /> Continuer hors ligne
          </button>
          <button className="btn btn-secondary w-full" onClick={resterActif}>
            <Power size={16} /> Rester actif
          </button>
        </div>
      </div>
    </div>
  )
}
