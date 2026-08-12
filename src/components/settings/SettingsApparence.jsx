import { Sun, Moon, MonitorSmartphone } from 'lucide-react'
import { useTheme } from '../../context/ThemeContext'
import { t, useLangue } from '../../lib/i18n'

const OPTIONS = [
  { id: 'auto', labelKey: 'apparence.auto.label', descKey: 'apparence.auto.desc', icon: MonitorSmartphone },
  { id: 'clair', labelKey: 'apparence.clair.label', descKey: 'apparence.clair.desc', icon: Sun },
  { id: 'sombre', labelKey: 'apparence.sombre.label', descKey: 'apparence.sombre.desc', icon: Moon },
]

export default function SettingsApparence() {
  const { choix, setChoix } = useTheme()
  useLangue()
  return (
    <div className="grid grid-cols-3 gap-2">
      {OPTIONS.map(({ id, labelKey, descKey, icon: Icon }) => (
        <button
          key={id}
          type="button"
          onClick={() => setChoix(id)}
          aria-pressed={choix === id}
          className={`flex flex-col items-center gap-1.5 rounded-2xl border-2 p-3 text-center transition ${
            choix === id ? 'border-brand-500 bg-brand-50' : 'border-gray-200 bg-surface hover:border-gray-300'
          }`}
        >
          <Icon size={20} className={choix === id ? 'text-brand-600' : 'text-gray-400'} />
          <span className={`text-xs font-bold ${choix === id ? 'text-brand-700' : 'text-gray-600'}`}>{t(labelKey)}</span>
          <span className="text-[10px] leading-tight text-gray-400">{t(descKey)}</span>
        </button>
      ))}
    </div>
  )
}
