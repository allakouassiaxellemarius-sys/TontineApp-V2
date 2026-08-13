#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════
# Déploiement SANDBOX des Firebase Cloud Functions (Flutterwave).
# 1. Copiez .env.local.example en .env.local et remplissez VOS clés
#    SANDBOX Flutterwave (sk_test_…).
# 2. Lancez : bash scripts/deploy-sandbox.sh
# Le script : sélectionne le projet, injecte les secrets (Secret Manager),
# déploie les functions + les règles RTDB, et affiche l'URL du webhook.
# ═══════════════════════════════════════════════════════════════
set -e
cd "$(dirname "$0")/.."

if [ ! -f .env.local ]; then
  echo "❌ Créez .env.local à partir de .env.local.example et renseignez vos clés."
  exit 1
fi

PROJECT="tontine-manager-f3965"
firebase use "$PROJECT"

echo "▶ Injection des secrets (Secret Manager)…"
while IFS='=' read -r key value; do
  # ignore les lignes vides et commentaires
  [ -z "$key" ] && continue
  case "$key" in \#*) continue;; esac
  echo "  • $key"
  printf '%s' "$value" | firebase functions:secrets:set "$key" --project="$PROJECT"
done < .env.local

echo "▶ Déploiement des Cloud Functions…"
firebase deploy --only functions --project="$PROJECT"

echo "▶ Déploiement des règles RTDB…"
firebase deploy --only database --project="$PROJECT"

echo ""
echo "✅ Déployé. URL du webhook à renseigner dans Flutterwave (Settings → Webhooks) :"
echo "   https://us-central1-${PROJECT}.cloudfunctions.net/flutterwaveWebhook"
echo "   (Webhook Secret Hash = la valeur de FLW_WEBHOOK_SECRET)"
