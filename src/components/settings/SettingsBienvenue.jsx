import { BellRing } from 'lucide-react'
import SectionCard from './SectionCard'
import ToggleRow from './ToggleRow'
import Field from '../Field'

export default function SettingsBienvenue({ s, setS }) {
  return (
    <SectionCard icon={BellRing} title="Message de bienvenue">
      <p className="mb-3 text-xs text-gray-400">
        Envoyez automatiquement un message au membre dès qu'il est ajouté à une tontine.
      </p>
      <ToggleRow
        title="Envoi automatique"
        subtitle={s.bienvenueActif ? 'Actif — SMS si Twilio est configuré, sinon WhatsApp pré-rempli' : 'Inactif'}
        checked={s.bienvenueActif}
        onChange={() => setS((prev) => ({ ...prev, bienvenueActif: !prev.bienvenueActif }))}
      />
      <div className="mt-3">
        <Field label="Texte du message" hint="Variables : {nom} (nom du membre) et {groupe} (nom de la tontine).">
          <textarea className="input min-h-20" autoCapitalize="sentences" spellCheck={false} value={s.bienvenueMessage} onChange={(e) => setS((prev) => ({ ...prev, bienvenueMessage: e.target.value }))} />
        </Field>
      </div>
    </SectionCard>
  )
}
