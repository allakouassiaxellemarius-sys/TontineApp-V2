# Tontine Manager — Guide d'utilisation

Application Android/iOS de gestion de tontines (version 1.19.17). Hors ligne : en lecture seule jusqu'au retour de la connexion.

## Notifications push (FCM)

- **Réglages → Notifications → Activer** : demande l'autorisation et enregistre l'appareil. Chaque matin à 08h00 (heure d'Abidjan), un rappel est envoyé si un tour est prévu **aujourd'hui ou demain**.
- Toucher la notification ouvre la tontine concernée.
- **Prérequis serveur (une seule fois)** :
  1. **`google-services.json`** : console Firebase → paramètres du projet → app Android `com.tontine.manager` → télécharger le fichier → le placer dans `android/app/` → rebuilder l'APK.
  2. **Déployer le worker Cloudflare** (dossier `cloudflare-worker/`) : `wrangler deploy` (après `wrangler secret put NOTIF_TOKEN` et `wrangler secret put SERVICE_ACCOUNT`). Ce worker envoie les notifications « nouveau message » (FCM HTTP v1) et exige un en-tête `X-Notif-Token`.
- Les rappels de tour quotidiens sont locaux (aucun serveur requis).

## Compte Google (sauvegarde cloud)

- **Réglages → Compte Google → « Se connecter avec Google »** : associe l'appareil à un compte Google (Firebase Auth).
- Une fois connecté, vos **tontines synchronisées sont sauvegardées** dans le cloud sous votre compte (`users/{uid}`).
- **Sauvegarder** : force la sauvegarde manuelle de toutes vos tontines synchronisées.
- **Se déconnecter** : arrête la sauvegarde automatique sur cet appareil.
- Sur un nouvel appareil : connectez-vous au même compte → vos tontines sont **restaurées automatiquement** (groupe personnel éditable).
- Le **code d'invitation** reste public : les invités consultent la tontine en direct sans compte Google. Depuis la version 1.19.17, l'envoi d'un message ou l'inscription d'un invité exige un compte (connexion Google ou email), pour protéger la tontine contre les écritures anonymes.
- Note : le bouton Google reste inactif tant que le « Web client ID » n'est pas renseigné dans `capacitor.config.json` (plugins → GoogleAuth). Le SHA-1 Android doit être déclaré dans la console Firebase (Auth → Google).

## Ouverture

- **Premier lancement** : tutoriel animé en 5 diapos. Bouton `Passer` pour sauter, `Continuer` / `Commencer` pour avancer. On peut le revoir à tout moment dans **Réglages → Découverte → Revoir le tutoriel**.
- **Verrouillage** : si un code PIN est défini, il est demandé à l'ouverture.

## Tableau de bord (accueil)

- **Créer une tontine** : nom + montant optionnel → le groupe apparaît dans la liste.
- **Rejoindre une tontine** : entrer l'identifiant partagé par le responsable pour suivre sa tontine (synchronisation en ligne).
- Cartes de groupe : toucher pour ouvrir ; icônes **Terminer** (archiver) et **Supprimer** (effacer).

## Écran groupe

- **Ajouter des membres** avec le bouton `+`.
- **Collecter les cotisations** : cocher les membres qui ont payé pour le tour en cours ; les soldes se mettent à jour.
- **Tirer l'ordre au sort** : lancer la roue ; elle pioche un membre sans répéter ceux déjà tirés. Les membres supprimés sont ignorés.
- **Bloquer / réactiver** un membre si nécessaire.
- Mode hors ligne : tous les boutons de modification sont désactivés.

## Réglages

- **Sécurité** : activer ou changer le **code PIN**, bouton « Verrouiller maintenant ».
- **Compte Google** : connexion/sauvegarde cloud (voir plus haut).
- **Notifications** : activer les rappels push FCM (voir plus haut).
- **Synchronisation** : bouton pour rafraîchir/forcer la synchro avec Firebase.
- **Découverte** : « Revoir le tutoriel ».

## Hors ligne

- À la perte de connexion, une modale propose **« Continuer hors ligne »** ou **« Rester actif »** (la question revient à chaque perte de connexion).
- L'application passe alors en **lecture seule** jusqu'au retour du réseau (seul « Rejoindre une tontine » reste bloqué tant qu'on est hors ligne).
