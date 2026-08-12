# Politique de confidentialité — Tontine Manager

Dernière mise à jour : 11 août 2026

## 1. Qui sommes-nous ?

L'application **Tontine Manager** (« l'Application ») est éditée par :

> [À COMPLÉTER — nom de l'éditeur / nom commercial]
> [À COMPLÉTER — adresse]
> [À COMPLÉTER — email de contact] — pour toute question sur la présente politique, contactez-nous à cette adresse.

## 2. Données collectées

### 2.1 Compte utilisateur
Pour utiliser les fonctions de synchronisation et de notifications, un compte est créé via **Firebase Authentication (Google)**, fourni par Google LLC. Les données de compte sont :
- l'identifiant technique du compte (uid Firebase) ;
- l'adresse email utilisée pour la connexion ;
- le nom et la photo de profil (si vous vous connectez avec Google).

La connexion par **email et mot de passe** est également possible : dans ce cas, seule l'adresse email est traitée. Le mot de passe n'est jamais stocké par nous ; il est géré par le service d'authentification.

### 2.2 Données de gestion de tontines
Vous saisissez librement des données de gestion : groupes, membres, tours de cotisation, montants, pénalités, prêts, historique et messages de discussion.

- **Par défaut, ces données sont stockées UNIQUEMENT sur votre appareil** (stockage local) et ne quittent jamais votre terminal.
- Si vous **activez la synchronisation** d'une tontine (fonctionnalité facultative), une copie de cette tontine est publiée sur **Firebase Realtime Database** (Google LLC, hébergement aux États-Unis et dans d'autres régions), et devient accessible par les personnes qui connaissent le **code d'invitation** que vous leur partagez. Les membres invités peuvent la consulter et y participer (messages, inscription).

### 2.3 Notifications
Si vous activez les notifications, l'Application enregistre un **jeton technique de notification (FCM)** associé à votre compte. Ce jeton sert uniquement à vous envoyer des notifications de nouveaux messages et de rappels.

### 2.4 Données de fonctionnement
L'Application ne contient **aucune publicité, aucun traceur publicitaire, aucun outil d'analyse comportementale de tiers**. Nous ne collectons pas de données de localisation.

## 3. Destinataires des données

Vos données sont accessibles :
- à **vous-même** et, pour les tontines synchronisées, aux **membres que vous invitez** via le code d'invitation ;
- aux **hébergeurs techniques** qui exécutent l'Application :
  - **Google LLC** — Firebase Authentication, Firebase Realtime Database, Firebase Cloud Messaging (notifications) ;
  - **Cloudflare, Inc.** — hébergement du service « worker » utilisé pour l'envoi des notifications et la livraison des mises à jour de l'Application.

Ces hébergeurs agissent en qualité de sous-traitants techniques. Vos données ne sont **ni vendues, ni louées, ni transmises à des tiers publicitaires**.

## 4. Durée de conservation

- Données locales : conservées sur votre appareil jusqu'à leur suppression dans l'Application ou la désinstallation de celle-ci.
- Données de synchronisation : conservées tant que la synchronisation est active. Désactiver la synchronisation d'un groupe, ou supprimer le groupe, supprime sa copie cloud.
- Compte et jeton de notification : conservés jusqu'à la suppression du compte.

## 5. Vos droits (RGPD)

Vous disposez des droits suivants, dans la mesure applicable :
- **accès** et **portabilité** de vos données (l'Application permet l'export PDF, Excel et JSON) ;
- **rectification** ;
- **effacement** (suppression du compte et des données de synchronisation) ;
- **opposition** au traitement ;
- **retrait du consentement** à tout moment (désactivation des notifications, de la synchronisation).

Pour exercer ces droits, contactez-nous à l'adresse indiquée à la section 1. Vous pouvez également introduire une réclamation auprès de l'autorité de contrôle compétente de votre pays.

## 6. Sécurité

L'accès aux données synchronisées est protégé par des règles d'accès restreintes aux utilisateurs authentifiés et, pour l'écriture d'une tontine, au responsable de celle-ci. Les communications avec les serveurs sont chiffrées (HTTPS). Aucune mesure n'est infaillible : nous vous invitons à ne pas partager votre code d'invitation ni votre mot de passe avec des tiers.

## 7. Mineurs

L'Application est destinée aux personnes majeures capables de gérer une activité financière de groupe. Nous ne collectons pas volontairement de données d'enfants.

## 8. Modifications

La présente politique peut être mise à jour. La date figurant en tête du document indique la dernière révision. Les utilisateurs en sont informés dans l'Application lors d'une mise à jour notable.

## 9. Contact

Pour toute question relative à la présente politique : [À COMPLÉTER — email de contact].
