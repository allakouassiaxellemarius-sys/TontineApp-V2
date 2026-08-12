import { WifiOff } from 'lucide-react'
import { useConnection } from '../context/ConnectionContext'

export default function HorsLigneBanner() {
  const { modeHorsLigne } = useConnection()
  if (!modeHorsLigne) return null
  return (
    <div className="above-nav fixed left-0 right-0 z-40 flex items-center justify-center gap-2 bg-danger-600 px-4 py-2 text-center text-xs font-bold text-white shadow-[0_-2px_0_rgba(0,0,0,0.15)]">
      <WifiOff size={14} className="shrink-0" /> Hors ligne — lecture seule. Connectez-vous pour modifier vos tontines.
    </div>
  )
}
