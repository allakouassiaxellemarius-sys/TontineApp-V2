# Tontine Manager — Guide d'utilisation

Application Android/iOS de gestion de tontines (version 1.19.21). Hors ligne : en lecture seule jusqu'au retour de la connexion.

## Architecture (backend)

- Le backend est un **Cloudflare Worker `tontine-sync`** (dossier `cloudflare-worker/`), 100 % Cloudflare (D1 + KV), sans Firebase.
  - **Auth** : JWT (HS256) délivré par le worker (`/auth2/google`, `/auth2/register`, `/auth2/login`, `/auth2/reset`, `/auth2/forgot`). Le jeton est conservé localement (`localStorage`).
  - **Stockage** : miroir relationnel D1 + clé/valeur KV.
  - **Notifications** : FCM (v1) envoyées par le worker.
  - **Webhook Flutterwave** : `/flutterwave/webhook` (réconciliation des paiements).
  - **Assistant IA** : endpoint `/assistant` (Workers AI ou LLM externe).
- Plus aucune dépendance Firebase (RTDB, Cloud Functions et `google-services.json` supprimés).

## Notifications push (FCM)

- **Réglages → Notifications → Activer** : demande l'autorisation et enregistre le token de l'appareil via le worker. Chaque matin à 08h00 (heure d'Abidjan), un rappel est envoyé si un tour est prévu **aujourd'hui ou demain**.
- Toucher la notification ouvre la tontine concernée.
- **Prérequis serveur (une seule fois)** : déployer le worker `tontine-sync` avec le secret **`FCM_SERVICE_ACCOUNT`** (JSON du compte de service FCM) — ou, à défaut, **`FCM_SERVER_KEY`** (legacy). Le worker envoie les notifications « nouveau message » en FCM v1.
- Les rappels de tour quotidiens sont **locaux** (aucun serveur requis).

## Compte (sauvegarde cloud)

- **Réglages → Compte → « Se connecter avec Google »** ou **email/mot de passe** : associe l'appareil à un compte géré par le worker Cloudflare (plus de Firebase Auth).
- Une fois connecté, vos **tontines synchronisées sont sauvegardées** dans le cloud sous votre compte.
- **Sauvegarder** : force la sauvegarde manuelle de toutes vos tontines synchronisées.
- **Se déconnecter** : arrête la sauvegarde automatique sur cet appareil.
- Sur un nouvel appareil : connectez-vous au même compte → vos tontines sont **restaurées automatiquement** (groupe personnel éditable).
- Le **code d'invitation** reste public : les invités consultent la tontine en direct sans compte. L'envoi d'un message ou l'inscription d'un invité exige un compte (connexion Google ou email), pour protéger la tontine contre les écritures anonymes.

## Compte de cotisation (virement / Flutterwave)

- Dans un groupe, l'onglet **Argent → Compte de cotisation** affiche les coordonnées de virement. Le responsable saisit ses coordonnées bancaires (banque, numéro de compte, titulaire) dans l'onglet **Trésorerie**.
- Chaque membre reçoit une **référence unique** (`REF-…`) à indiquer dans le libellé du virement (générée de façon déterministe côté worker et client).
- **Paiement** : le membre effectue le virement, puis signale « J'ai payé » (onglet **Paiements**) ; le responsable valide après réception.
- **Webhook Flutterwave** : si un compte virtuel Flutterwave est associé au groupe (`PUT comptes/{numero}`), les dépôts entrants sont réconciliés automatiquement par le worker. L'endpoint `/flutterwave/webhook` vérifie l'en-tête `verif-hash` contre le secret **`FLW_WEBHOOK_SECRET`** (configuré dans le dashboard Flutterwave → Settings → Webhooks).

## Ouverture

- **Premier lancement** : tutoriel animé. Bouton `Passer` pour sauter, `Continuer` / `Commencer` pour avancer. À revoir dans **Réglages → Découverte → Revoir le tutoriel**.
- **Verrouillage** : si un code PIN est défini, il est demandé à l'ouverture.

## Tableau de bord (accueil)

- **Créer une tontine** : nom + montant optionnel → le groupe apparaît dans la liste.
- **Rejoindre une tontine** : entrer l'identifiant partagé par le responsable (synchronisation en ligne).
- Cartes de groupe : toucher pour ouvrir ; icônes **Terminer** (archiver) et **Supprimer** (effacer).

## Écran groupe

- **Ajouter des membres** avec le bouton `+`.
- **Collecter les cotisations** : cocher les membres qui ont payé pour le tour en cours ; les soldes se mettent à jour.
- **Tirer l'ordre au sort** : lancer la roue ; elle pioche un membre sans répéter ceux déjà tirés. Les membres supprimés sont ignorés.
- **Bloquer / réactiver** un membre si nécessaire.
- **Onglets** : Aperçu, Membres, Tours, **Argent** (compte de cotisation + paiements), Rappels, Historique, Journal, Discussion, **Ordre** (tirage), Réglages.
- Mode hors ligne : tous les boutons de modification sont désactivés.

## Réglages

- **Sécurité** : activer ou changer le **code PIN**, bouton « Verrouiller maintenant ».
- **Compte** : connexion/sauvegarde cloud (voir plus haut).
- **Notifications** : activer les rappels push FCM (voir plus haut).
- **Synchronisation** : bouton pour rafraîchir/forcer la synchro avec le worker Cloudflare (`tontine-sync`).
- **Découverte** : « Revoir le tutoriel ».

## Hors ligne

- À la perte de connexion, une modale propose **« Continuer hors ligne »** ou **« Rester actif »** (la question revient à chaque perte de connexion).
- L'application passe alors en **lecture seule** jusqu'au retour du réseau (seul « Rejoindre une tontine » reste bloqué tant qu'on est hors ligne).

## Déploiement du worker (serveur)

Depuis `cloudflare-worker/` :

```bash
wrangler login            # ou : $env:CLOUDFLARE_API_TOKEN / CLOUDFLARE_ACCOUNT_ID
wrangler d1 migrations apply tontine-db --remote
wrangler secret put JWT_SECRET          # HMAC >= 32 caractères (jetons de session)
wrangler secret put FLW_WEBHOOK_SECRET  # secret hash du webhook Flutterwave
wrangler secret put FLW_SECRET_KEY      # clé API Flutterwave (sk_live_...)
wrangler secret put FCM_SERVICE_ACCOUNT # JSON du compte de service FCM
wrangler secret put RESEND_API_KEY     # optionnel (emails de reset)
wrangler deploy
```

Puis dans le dashboard Flutterwave : webhook → `https://tontine-sync.tontine-manager.workers.dev/flutterwave/webhook`.
