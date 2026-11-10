import { createContext, useContext, useState, useCallback, useMemo, useRef } from 'react'
import { CheckCircle2, XCircle, Info, AlertTriangle } from 'lucide-react'

const ToastContext = createContext(null)

const ICONES = {
  success: CheckCircle2,
  error: XCircle,
  info: Info,
  warning: AlertTriangle,
}

// Les toasts portent du texte blanc : les quatre fonds sont donc fixés sur des
// couleurs assez sombres dans les deux thèmes (les rampes sémantiques
// s'inversent en mode sombre et le blanc y tombait sous 2:1). Blanc sur
// #0D7A50 = 5,36:1 · #C62828 = 4,9:1 · #1C2721 = 13:1 · #6A3808 = 8,9:1.
const STYLES = {
  success: 'bg-[#0D7A50]',
  error: 'bg-[#C62828]',
  info: 'bg-[#1C2721]',
  warning: 'bg-[#6A3808]',
}

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([])
  const compteur = useRef(0)

  const montrer = useCallback((message, type = 'info', duree = 2600) => {
    const id = ++compteur.current
    setToasts((t) => [...t, { id, message, type }])
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), duree)
  }, [])

  const success = useCallback((m, d) => montrer(m, 'success', d), [montrer])
  const error = useCallback((m, d) => montrer(m, 'error', d), [montrer])
  const info = useCallback((m, d) => montrer(m, 'info', d), [montrer])
  const warning = useCallback((m, d) => montrer(m, 'warning', d), [montrer])

  // Sans mémoïsation, chaque toast émis recrée l'objet du contexte : tous les
  // consommateurs se re-rendent et surtout les `useEffect(..., [toast])` se
  // relancent — donc se nettoient — alors que rien d'autre n'a changé.
  const value = useMemo(() => ({ montrer, success, error, info, warning }), [montrer, success, error, info, warning])

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="pointer-events-none fixed inset-x-0 top-4 z-[90] flex flex-col items-center gap-2 px-4">
        {toasts.map((t) => {
          const Icon = ICONES[t.type]
          return (
            <div
              key={t.id}
              role="status"
              className={`flex w-full max-w-sm items-center gap-2.5 rounded-2xl px-4 py-3 text-sm font-bold text-white shadow-lg ${STYLES[t.type]}`}
            >
              <Icon size={18} className="shrink-0" />
              <span className="min-w-0">{t.message}</span>
            </div>
          )
        })}
      </div>
    </ToastContext.Provider>
  )
}

export function useToast() {
  const ctx = useContext(ToastContext)
  if (!ctx) throw new Error('useToast doit être utilisé dans ToastProvider')
  return ctx
}
