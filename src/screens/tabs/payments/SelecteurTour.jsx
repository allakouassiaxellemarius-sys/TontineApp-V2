import { formatDate } from '../../../lib/format'

// Le <select> natif cachait le tour en cours et obligeait à ouvrir une liste
// pour savoir où on en était ; les pastilles horizontales les montrent d'emblée.
export default function SelecteurTour({ tours, tourId, onChange, libelle = 'Tour' }) {
  if (!tours.length) return null
  return (
    <div className="card mb-4 p-3">
      <p className="label mb-2">{libelle}</p>
      <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
        {tours.map((t) => {
          const actif = Number(t.id) === Number(tourId)
          return (
            <button
              key={t.id}
              type="button"
              aria-pressed={actif}
              onClick={() => onChange(t.id)}
              className={`shrink-0 rounded-full border px-3.5 py-2 text-xs font-bold transition ${
                actif
                  ? 'border-brand-600 bg-brand-600 text-white'
                  : 'border-gray-200 bg-gray-50 text-gray-600 hover:border-brand-300'
              }`}
            >
              #{t.numero} · {t.membre?.nom || '—'}
              <span className={`ml-1.5 font-medium ${actif ? 'text-white/80' : 'text-gray-400'}`}>
                {t.statut === 'recu' ? 'pot reçu' : formatDate(t.datePrevue)}
              </span>
            </button>
          )
        })}
      </div>
    </div>
  )
}
