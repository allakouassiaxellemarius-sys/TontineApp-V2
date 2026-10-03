import { createPortal } from 'react-dom'
import { X } from 'lucide-react'

// Portail vers <body> : la page est animée (filter/transform), ce qui fait
// d'elle le conteneur bloquant du `position: fixed`. Sans portail, l'endroit
// plein écran s'étend sur toute la hauteur du document et le panneau, calé
// en bas, se retrouve peint hors champ — une modale « ouverte » invisible.
export default function Modal({ open, onClose, title, children, footer }) {
  if (!open) return null
  return createPortal(
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 backdrop-blur-sm sm:items-center animate-fade-up" onClick={onClose}>
      <div
        className="w-full max-w-lg max-h-[90vh] overflow-y-auto rounded-t-3xl bg-surface p-5 shadow-2xl sm:rounded-3xl"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label={title}
      >
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-lg font-bold text-gray-800">{title}</h3>
          <button className="rounded-full p-2 text-gray-400 hover:bg-gray-100" onClick={onClose} aria-label="Fermer">
            <X size={18} />
          </button>
        </div>
        {children}
        {footer && <div className="mt-5 flex justify-end gap-2">{footer}</div>}
      </div>
    </div>,
    document.body,
  )
}
