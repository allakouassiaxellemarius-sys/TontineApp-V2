// ═══════════════════════════════════════════════════════════════
// Secrets Flutterwave — stockés dans Google Secret Manager, JAMAIS
// dans le code, le client ou le dépôt. Déployés via :
//   firebase functions:secrets:set FLW_SECRET_KEY
//   firebase functions:secrets:set FLW_PUBLIC_KEY
//   firebase functions:secrets:set FLW_ENCRYPTION_KEY
//   firebase functions:secrets:set FLW_WEBHOOK_SECRET
//   firebase functions:secrets:set FLW_TRANSFER_SECRET   (optionnel)
//   firebase functions:secrets:set FLW_MODE               (sandbox|live)
// En local (emulateur), un fichier .env à la racine de functions/ est lu.
// ═══════════════════════════════════════════════════════════════
const { defineSecret } = require('firebase-functions/params')

const FLW_SECRET_KEY = defineSecret('FLW_SECRET_KEY')
const FLW_PUBLIC_KEY = defineSecret('FLW_PUBLIC_KEY')
const FLW_ENCRYPTION_KEY = defineSecret('FLW_ENCRYPTION_KEY')
const FLW_WEBHOOK_SECRET = defineSecret('FLW_WEBHOOK_SECRET')
const FLW_TRANSFER_SECRET = defineSecret('FLW_TRANSFER_SECRET')
const FLW_MODE = defineSecret('FLW_MODE')

// Seuil (en devise du groupe) au-delà duquel un retrait exige une double
// validation (Responsable + Trésorier). Configurable ici (ou via secret).
const RETRAIT_SEUIL_DOUBLE = Number(process.env.FLW_RETRAIT_SEUIL || 500000)

module.exports = {
  FLW_SECRET_KEY,
  FLW_PUBLIC_KEY,
  FLW_ENCRYPTION_KEY,
  FLW_WEBHOOK_SECRET,
  FLW_TRANSFER_SECRET,
  FLW_MODE,
  RETRAIT_SEUIL_DOUBLE,
}
