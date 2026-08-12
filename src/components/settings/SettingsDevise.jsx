import { Landmark } from 'lucide-react'
import { formatMontant } from '../../lib/format'
import SectionCard from './SectionCard'
import Field from '../Field'

export default function SettingsDevise({ s, set }) {
  return (
    <SectionCard icon={Landmark} title="Devise par défaut">
      <div className="grid grid-cols-2 gap-3">
        <Field label="Symbole">
          <input className="input" value={s.deviseSymbole} onChange={set('deviseSymbole')} />
        </Field>
        <Field label="Position">
          <select className="input" value={s.devisePosition} onChange={set('devisePosition')}>
            <option value="after">Après</option>
            <option value="before">Avant</option>
          </select>
        </Field>
      </div>
      <div className="rounded-xl bg-brand-50 px-3 py-2 text-center text-sm font-semibold text-brand-700">
        {formatMontant(12500, s)}
      </div>
      <p className="mt-2 text-xs text-gray-400">Chaque tontine peut aussi définir sa propre devise dans ses réglages.</p>
    </SectionCard>
  )
}
