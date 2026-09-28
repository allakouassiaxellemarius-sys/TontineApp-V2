export const DEFAULT_SETTINGS = {
  langue: 'fr',
  deviseSymbole: 'FCFA',
  devisePosition: 'after',
  pinActive: false,
  pinHash: null,
  pinSalt: null,
  totpActive: false,
  totpSecret: null,
  biometrieActive: false,
  twilioSid: '',
  twilioToken: '',
  twilioFrom: '',
  smsApiUrl: '',
  smsServerUrl: '',
  rappelJoursAvant: 1,
  nomTresorier: '',
  bienvenueActif: true,
  bienvenueMessage: 'Bonjour {nom} 👋, bienvenue dans la tontine « {groupe} » ! Vous serez informé(e) des rappels de cotisation.',
  recapQuotidienActif: true,
  animationsReduites: false,
}

export function getSettings() {
  try {
    const raw = localStorage.getItem('tontine_settings')
    if (!raw) return { ...DEFAULT_SETTINGS }
    return { ...DEFAULT_SETTINGS, ...JSON.parse(raw) }
  } catch {
    return { ...DEFAULT_SETTINGS }
  }
}

export function saveSettings(patch) {
  const current = getSettings()
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return current
  const next = { ...current, ...patch }
  localStorage.setItem('tontine_settings', JSON.stringify(next))
  return next
}

// Enregistre les réglages locaux immédiatement, même hors ligne (devise,
// messages, automatisations…) : rien ne justifie d'exiger une connexion
// pour des préférences propres à l'appareil.
export function saveSettingsLocal(next) {
  try {
    localStorage.setItem('tontine_settings', JSON.stringify(next))
  } catch {}
  return next
}

export function formatMontant(montant, settings) {
  const s = settings || getSettings()
  const n = Number(montant || 0)
  const str = n.toLocaleString('fr-FR', { maximumFractionDigits: 0 })
  return s.devisePosition === 'before'
    ? `${s.deviseSymbole} ${str}`
    : `${str} ${s.deviseSymbole}`
}

export function formatDate(d) {
  if (!d) return '—'
  try {
    const dt = d instanceof Date ? d : new Date(d + 'T00:00:00')
    if (isNaN(dt.getTime())) return '—'
    return dt.toLocaleDateString('fr-FR', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    })
  } catch {
    return '—'
  }
}

export function joursEntre(debut, fin) {
  const a = new Date(debut + 'T00:00:00')
  const b = new Date(fin + 'T00:00:00')
  return Math.round((b - a) / 86400000)
}

export function joursDeRetard(dateEcheance) {
  const aujourdhui = new Date()
  const echeance = new Date(dateEcheance + 'T23:59:59')
  if (aujourdhui <= echeance) return 0
  return Math.ceil((aujourdhui - echeance) / 86400000)
}
