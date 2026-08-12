import { MessageSquareText } from 'lucide-react'
import SectionCard from './SectionCard'
import Field from '../Field'

export default function SettingsSms({ s, set }) {
  return (
    <SectionCard icon={MessageSquareText} title="Rappels SMS (Twilio)">
      <p className="mb-3 text-xs text-gray-400">
        Optionnel. Sans configuration, les rappels passent par WhatsApp ou l'appli SMS du téléphone.
      </p>
      <div className="mb-4 rounded-xl border border-brand-200 bg-brand-50 p-3">
        <p className="text-xs font-bold text-brand-700">Recommandé : SMS via Apps Script (sécurisé)</p>
        <p className="mt-1 text-xs text-brand-600">
          Votre téléphone n'envoie que le numéro et le message ; les identifiants Twilio restent côté serveur.
          Collez l'URL de votre Web App Apps Script (voir <code>functions/apps-script.gs</code>).
        </p>
      </div>
      <Field label="URL du serveur SMS (Web App Apps Script)">
        <input className="input" value={s.smsServerUrl} onChange={set('smsServerUrl')} placeholder="https://script.google.com/macros/s/..." />
      </Field>
      <p className="my-3 text-center text-[11px] font-bold uppercase tracking-wide text-gray-300">ou (ancien mode, client)</p>
      <Field label="Nom du trésorier (signature des messages)">
        <input className="input" value={s.nomTresorier} onChange={set('nomTresorier')} />
      </Field>
      <Field label="SID Twilio">
        <input className="input" value={s.twilioSid} onChange={set('twilioSid')} placeholder="AC..." />
      </Field>
      <Field label="Token Twilio">
        <input className="input" type="password" value={s.twilioToken} onChange={set('twilioToken')} placeholder="••••" />
      </Field>
      <Field label="Numéro d'envoi (From)">
        <input className="input" value={s.twilioFrom} onChange={set('twilioFrom')} placeholder="+225..." />
      </Field>
      <Field label="URL de l'API d'envoi" hint="Endpoint qui relaie vers Twilio. Ex. https://api.example.com">
        <input className="input" value={s.smsApiUrl} onChange={set('smsApiUrl')} placeholder="https://..." />
      </Field>
    </SectionCard>
  )
}
