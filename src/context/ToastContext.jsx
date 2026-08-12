import { createContext, useContext, useState, useCallback, useRef } from 'react'
import { CheckCircle2, XCircle, Info, AlertTriangle } from 'lucide-react'

const ToastContext = createContext(null)

const ICONES = {
  success: CheckCircle2,
  error: XCircle,
  info: Info,
  warning: AlertTriangle,
}

const STYLES = {
  success: 'bg-success-600',
  error: 'bg-danger-600',
  info: 'bg-info-600',
  warning: 'bg-warning-600',
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

  return (
    <ToastContext.Provider value={{ montrer, success, error, info, warning }}>
      {children}
      <div className="pointer-events-none fixed inset-x-0 top-4 z-[90] flex flex-col items-center gap-2 px-4">
        {toasts.map((t) => {
          const Icon = ICONES[t.type]
          return (
            <div
              key={t.id}
              role="status"
              className={`flex w-full max-w-sm items-center gap-2.5 rounded-2xl px-4 py-3 text-sm font-bold text-white shadow-lg animate-slide-in ${STYLES[t.type]}`}
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
