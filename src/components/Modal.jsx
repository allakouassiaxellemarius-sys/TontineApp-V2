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
        className="flex max-h-[90vh] w-full max-w-lg flex-col overflow-hidden rounded-t-3xl bg-surface shadow-2xl sm:rounded-3xl"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label={title}
      >
        <div className="flex shrink-0 items-center justify-between gap-3 px-5 pt-5 pb-4">
          <h3 className="text-lg font-bold text-gray-800">{title}</h3>
          <button className="btn-icon shrink-0" onClick={onClose} aria-label="Fermer">
            <X size={18} />
          </button>
        </div>
        {/* Le pied hors zone défilante : l'action principale reste atteignable
            quelle que soit la longueur du formulaire (design system §11). */}
        <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-5">{children}</div>
        {footer && (
          <div
            className="shrink-0 border-t border-gray-200/60 px-5 pt-3"
            style={{ paddingBottom: 'max(1.25rem, env(safe-area-inset-bottom, 0px))' }}
          >
            <div className="flex flex-wrap justify-end gap-2">{footer}</div>
          </div>
        )}
      </div>
    </div>,
    document.body,
  )
}
