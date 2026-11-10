import { useState, useRef, useEffect } from 'react'
import { MoreHorizontal, Check } from 'lucide-react'

// Menu déroulant contextuel (overflow). Ferme sur clic extérieur / scroll.
// items : [{ label, icon?, onClick?, danger?, disabled?, sep?, active? }]
export default function Menu({ items, align = 'right', icon: Icon = MoreHorizontal, className = '', ariaLabel = 'Menu' }) {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)

  useEffect(() => {
    if (!open) return
    const onDoc = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false) }
    const onScroll = () => setOpen(false)
    document.addEventListener('mousedown', onDoc)
    window.addEventListener('scroll', onScroll, true)
    return () => {
      document.removeEventListener('mousedown', onDoc)
      window.removeEventListener('scroll', onScroll, true)
    }
  }, [open])

  return (
    <div className={`relative inline-block ${className}`} ref={ref}>
      <button
        type="button"
        className="btn-icon !h-9 !w-9"
        onClick={(e) => { e.stopPropagation(); setOpen((o) => !o) }}
        aria-label={ariaLabel}
        aria-haspopup="menu"
        aria-expanded={open}
      >
        <Icon size={18} />
      </button>
      {open && (
        <div
          role="menu"
          className={`absolute z-50 mt-1 min-w-[200px] overflow-hidden rounded-2xl border border-white/10 bg-[rgb(var(--surface))] p-1 shadow-[0_18px_44px_-12px_rgba(0,0,0,0.55)] ${align === 'right' ? 'right-0' : 'left-0'}`}
        >
          {items.map((it, i) =>
            it.sep ? (
              <div key={i} className="my-1 h-px bg-white/10" />
            ) : (
              <button
                key={i}
                role="menuitem"
                disabled={it.disabled}
                onClick={() => {
                  setOpen(false)
                  try {
                    it.onClick && it.onClick()
                  } catch (e) {
                    // eslint-disable-next-line no-console
                    console.error('Erreur dans une action de menu :', e)
                  }
                }}
                className={`flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-left text-sm font-semibold ${
                  it.danger ? 'text-danger-500 hover:bg-danger-500/10' : 'text-[rgb(var(--text))] hover:bg-white/5'
                } disabled:opacity-40`}
              >
                {it.icon && <it.icon size={16} className={it.danger ? '' : 'text-[rgb(var(--text-dim))]'} />}
                <span className="flex-1">{it.label}</span>
                {it.active && <Check size={16} className="text-brand-700" />}
              </button>
            )
          )}
        </div>
      )}
    </div>
  )
}
