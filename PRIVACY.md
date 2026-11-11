# Politique de confidentialité — Tontine Manager

Dernière mise à jour : 11 novembre 2026 (révision 3)
Version de l'application couverte : 2.3.18

## 1. Qui sommes-nous ?

L'application **Tontine Manager** (« l'Application ») est éditée par un
développeur indépendant, publiée sous le compte développeur **Tontine Manager**
sur APKPure.

> Contact (email) : **tontine.manager.app@gmail.com**
> Adresse postale : communiquée sur simple demande par email.
> Responsable du traitement : l'éditeur de l'Application.

## 2. Données collectées

### 2.1 Compte utilisateur
L'authentification est fournie par **Firebase Authentication (Google LLC)** :
connexion avec un compte Google, ou avec une adresse email et un mot de passe.
Nous recevons et conservons :
- l'identifiant technique du compte (`uid`) ;
- l'adresse email de connexion ;
- le nom d'affichage et la photo de profil fournis par Google (si vous utilisez Google).

Le mot de passe n'est **jamais** stocké par l'Application ni par ses serveurs : il
est traité uniquement par le service d'authentification.

Vous pouvez aussi utiliser l'Application **sans compte** : toutes les fonctions de
gestion restent disponibles en local, la synchronisation et les notifications
nécessitent seules un compte.

### 2.2 Données de gestion de tontines
Vous saisissez librement des données de gestion : groupes, membres (noms,
numéros de téléphone), tours de cotisation, montants, pénalités, prêts,
historique de paiements, messages de discussion et photos partagées dans la
discussion, objectifs d'épargne.

- **Par défaut, ces données sont stockées UNIQUEMENT sur votre appareil** ; elles
  ne sont transmises à aucun serveur tant que vous n'activez pas la
  synchronisation (ci-dessous) ou les rappels WhatsApp par le serveur (§ 2.5).
- Si vous **activez la synchronisation** d'une tontine (facultatif), une copie de
  cette tontine est publiée sur **Cloudflare Workers (D1 / Key-Value)**, hébergés
  aux États-Unis et dans les régions Cloudflare choisies. Elle devient accessible
  aux personnes qui connaissent le **code d'invitation** que vous partagez : les
  membres invités peuvent la consulter et y participer (messages, inscriptions,
  signalements de paiement).
- **Photos de la discussion** : compressées sur votre appareil, puis stockées en
  base sur Cloudflare D1, lisibles uniquement par les participants du groupe.
- **Accusés de lecture** : pour chaque participant d'un groupe synchronisé est
  conservé un pointeur technique `{ uid, nom, dernier message lu, date }`, utilisé
  uniquement pour afficher « vu par ».

### 2.3 Notifications
Si vous activez les notifications, l'Application enregistre un **jeton technique
de notification (Firebase Cloud Messaging)** associé à votre compte, utilisé
uniquement pour vous envoyer les rappels de cotisation et les nouveaux messages.

### 2.4 Paiements et collecte (facultatif)
Lorsqu'un lien de collecte de la plateforme est configuré, le membre peut être
redirigé vers une **page de paiement externe** (actuellement Money Fusion) pour
effectuer sa cotisation. Le paiement est réalisé auprès de ce prestataire externe ;
l'Application ne collecte ni ne stocke de numéro de carte, de code PIN Mobile Money
ou de secret d'API de paiement. Dans l'Application, le membre **signale** son
paiement et le responsable/l'administrateur habilité le confirme après
vérification : seules les informations de suivi nécessaires au rapprochement
(montant, tour, référence/libellé de signalement, statut) sont enregistrées dans
les données du groupe.

### 2.5 Rappels WhatsApp envoyés par le serveur (facultatif)
Dans une tontine synchronisée, le responsable peut activer l'envoi automatique
des rappels de cotisation via **WhatsApp Business (Meta Platforms)** : le message
part du numéro professionnel de la tontine, sans passer par le téléphone du
responsable. Sont alors transmis à Meta, pour ce seul envoi : les **numéros de
téléphone des membres à relancer**, leur nom, ainsi que le contenu type du
rappel (nom du groupe, montant, échéance). L'envoi est déclenché par le
responsable (ou un co-gérant), après confirmation dans l'Application, et une
réponse « STOP » d'un membre supprime ce numéro de toute relance future. Les
rappels envoyés depuis le téléphone du responsable (WhatsApp ou application SMS)
ne passent pas par nos serveurs.

### 2.6 Assistant IA (facultatif)
L'assistant répond à partir des données de **votre** tontine : un résumé
structurel (nom du groupe, membres, montants, statut des paiements) est transmis
au service d'IA pour calculer la réponse. Les adresses email et les numéros de
téléphone des **membres** sont retirés du contexte envoyé avant l'appel ; seul le
numéro du **responsable** est conservé, afin que l'assistant puisse rédiger les
instructions de paiement (*144\*4\*6\*…#, lien Wave). Les images que vous lui
soumettez ne servent qu'à la réponse en cours. L'éditeur de l'IA traite ces
informations pour le seul calcul de la réponse, sans profilage publicitaire.

### 2.7 Données de fonctionnement
L'Application ne contient **aucune publicité, aucun traceur publicitaire, aucun
outil d'analyse comportementale de tiers**. Elle ne collecte **aucune donnée de
localisation**.

## 3. Destinataires des données

- **Vous-même** et, pour les tontines synchronisées, **les membres que vous
  invitez** via le code d'invitation.
- Les **hébergeurs techniques** qui exécutent l'Application :
  - **Google LLC** — Firebase Authentication et Firebase Cloud Messaging ;
  - **Cloudflare, Inc.** — workers, base D1 et Key-Value qui portent la
    synchronisation, les photos de discussion, les accusés de lecture, l'envoi des
    notifications et les mises à jour de l'Application ;
  - **Prestataire de paiement externe** (actuellement Money Fusion) — uniquement si
    vous ouvrez le lien de collecte pour payer ; le paiement se déroule sur sa page,
    selon ses propres conditions et politique de confidentialité ;
  - **Meta Platforms (WhatsApp Business)** — uniquement si le responsable active
    les rappels par le serveur : numéros des membres relancés, leur nom, ainsi
    que le montant et l'échéance du rappel, pour ce seul envoi ;
  - **Resend** — email de réinitialisation du mot de passe ;
  - **GitHub** — manifeste et paquet des mises à jour de l'Application. Le
    moteur de mise à jour (bibliothèque CapacitorUpdater) s'exécute localement,
    sans télémétrie.

Ces hébergeurs agissent en qualité de sous-traitants techniques. Vos données ne
sont **ni vendues, ni louées, ni transmises à des tiers publicitaires**.

## 4. Durée de conservation

- **Données locales** : sur votre appareil, jusqu'à leur suppression dans
  l'Application ou la désinstallation.
- **Données synchronisées** : tant que la synchronisation du groupe est active.
  Désactiver la synchronisation, ou supprimer le groupe, supprime sa copie cloud
  (messages, photos, accusés de lecture, signalements de paiement).
- **Compte et jeton de notification** : jusqu'à la suppression du compte
  (section 5.2).

## 5. Vos droits (RGPD et lois africaines sur la protection des données)

### 5.1 Accès, rectification, portabilité
L'Application permet d'exporter vos tontines en **PDF, Excel et JSON**
(Statistiques & historique → Export). La rectification se fait directement dans
l'Application.

### 5.2 Effacement — suppression de compte
Deux moyens, au choix :
1. **Dans l'Application** : Profil → Sécurité → **Supprimer mon compte**. Cette
   action supprime immédiatement votre compte, vos groupes synchronisés, leurs
   messages, photos, accusés de lecture et jetons de notification côté serveur.
2. **Par email** : écrivez à **tontine.manager.app@gmail.com** depuis l'adresse
   liée à votre compte, en précisant « suppression de données ». La demande est
   traitée sous 30 jours.

Page web de demande de suppression :
**https://tontine-sync.tontine-manager.workers.dev/suppression**

### 5.3 Opposition, retrait du consentement, réclamation
Vous pouvez à tout moment désactiver les notifications, la synchronisation d'un
groupe ou l'assistant IA, sans que cela n'affecte le reste de l'Application.
Vous pouvez introduire une réclamation auprès de l'autorité de contrôle compétente
de votre pays (par exemple la ARTDP, en Côte d'Ivoire).

## 6. Sécurité

- Communications avec les serveurs **chiffrées en HTTPS** ; le trafic en clair est
  désactivé dans l'Application.
- Accès aux données synchronisées **restreint aux utilisateurs authentifiés**, et
  à l'écriture réservé au responsable du groupe (et à ses co-gérants).
- Les photos et les accusés de lecture ne sont consultables que par les
  participants du groupe.
- La session est conservée dans un stockage chiffré de l'appareil ; l'ouverture de
  l'Application peut être protégée par code PIN ou biométrie, et toute action
  financière (distribution du pot, changement du compte de collecte, suppression
  d'un groupe) exige cette confirmation.
- **Limite assumée** : les tontines non synchronisées restent dans le stockage
  local de l'appareil, protégé par le système Android mais non chiffré par
  l'Application. Ne confiez votre appareil à personne et supprimez vos groupes
  avant de le céder.

Aucune mesure n'est infaillible : ne partagez pas votre code d'invitation, votre
code PIN ni votre mot de passe.

## 7. Mineurs

L'Application est destinée aux personnes majeures capables de gérer une activité
financière de groupe. Nous ne collectons pas volontairement de données d'enfants.

## 8. Transferts hors Union européenne

Les données synchronisées sont hébergées par Cloudflare et Google, et les
rappels envoyés par le serveur transitent par Meta Platforms (WhatsApp) ; les
serveurs de ces prestataires peuvent être situés hors de l'UE. L'éditeur
s'appuie sur les clauses contractuelles types de ces hébergeurs pour ces
transferts.

## 9. Modifications

La présente politique peut être mise à jour. La date en tête de document indique
la dernière révision ; les utilisateurs en sont informés dans l'Application lors
d'une mise à jour notable.

## 10. Contact

Pour toute question relative à la présente politique, ou pour exercer vos droits :
**tontine.manager.app@gmail.com**
