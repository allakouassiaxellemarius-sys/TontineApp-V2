import { Languages } from 'lucide-react'
import { LANGUES, getLangue, setLangue, t } from '../../lib/i18n'

export default function SettingsLangue() {
  const langue = getLangue()
  return (
    <div>
      <p className="mb-3 text-xs text-gray-400">{t('settings.langue.choisir')}</p>
      <div className="grid grid-cols-2 gap-2">
        {Object.entries(LANGUES).map(([id, label]) => (
          <button
            key={id}
            type="button"
            onClick={() => setLangue(id)}
            aria-pressed={langue === id}
            className={`flex items-center justify-center gap-2 rounded-2xl border-2 p-3 text-center transition ${
              langue === id ? 'border-brand-500 bg-brand-50' : 'border-gray-200 bg-surface hover:border-gray-300'
            }`}
          >
            <Languages size={18} className={langue === id ? 'text-brand-600' : 'text-gray-400'} />
            <span className={`text-sm font-bold ${langue === id ? 'text-brand-700' : 'text-gray-600'}`}>{label}</span>
          </button>
        ))}
      </div>
    </div>
  )
}
