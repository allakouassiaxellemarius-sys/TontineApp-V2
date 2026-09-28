# Changelog

Toutes les modifications notables du projet Tontine Manager sont documentées ici.

Le format s'inspire de [Keep a Changelog](https://keepachangelog.com/fr/1.1.0/).
Les versions suivent le [SemVer](https://semver.org/lang/fr/). Chaque entrée précise si
la mise à jour est **OTA** (web uniquement, Capgo/Netlify) ou **native** (nécessite un APK).

## [Non publié]

### Corrections (paiements des cotisations)
- **Réconciliation Flutterwave réparée** : le webhook écrivait les paiements sans
  `statut` (héritage PayDunya) et avec `tourId = membreId` — la cotisation n'était
  jamais enregistrée puis le record était effacé du cloud. Le webhook écrit
  désormais `statut: 'paye'`, le **tour actif** réel (premier tour en_attente du
  snapshot publié) et l'opérateur « Virement » au lieu de la devise.
- **Aucun paiement perdu en silence** : l'app du responsable ne supprime une
  transaction du cloud que si elle a été intégrée ('ok') ou déjà payée ('deja') ;
  `integrerPaiement` renvoie un verdict ('ok'/'deja'/'attente'/'invalide').
- **Files de rétention** : les transactions sans groupe reconnu sont archivées
  (`paiements_inconnus/`) et celles rattachées à un groupe mais non attribuables
  (pas de REF en narration, pas de tour actif) sont mises en file
  (`reconciliation/{code}/`) au lieu d'être rejetées.

## [2.2.0] - 2026-09-20

### Nouvelles fonctionnalités
- **Calendrier** : affichage des prochains tours, bénéficiaires, dates et montants.
- **Profil** : accès rapide au compte, aux réglages, à la sécurité et à la déconnexion.
- **Navigation mobile réorganisée** : Accueil, Calendrier, création, Alertes, Profil et Plus.

### Design
- Nouvelle identité Tontine Plus : logo vert, surfaces claires, contrastes renforcés et ouverture animée.
- Dashboard et écrans de connexion harmonisés pour une utilisation plus simple.

### Technique
- Synchronisation D1 des paiements rendue idempotente avec une contrainte unique sur les transactions.
- Initialisation Google Auth corrigée pour le Web et Android.

## [1.19.20] - 2026-08-12

### Nouvelles fonctionnalités
- **Paiement intégré Mobile Money / Wave via PayDunya** (OTA + native).
  - Bouton « Payer par Mobile Money » dans l'onglet Paiements (visible quand le
    groupe est synchronisé et dispose d'un code unique) : le responsable lance
    une transaction PayDunya (API PAR, mobile money UEMOA hors carte), ouverte
    dans le navigateur.
  - **Mode démo intégré** : sans clés marchand configurées sur le worker, le
    paiement est simulé (modale « Mode démo » avec choix réussi/échoué) pour
    tester tout le flux sans compte marchand.
  - **Réconciliation automatique** : les paiements confirmés (IPN PayDunya,
    vérification du statut ou simulation) sont stockés dans `paiements/{code}`
    (hors snapshot, donc non écrasés par la republication) ; l'app du responsable
    les intègre en cotisation (statut `paye`, journal, moyen « Wave »/opérateur/
    numéro/référence) puis supprime la transaction.
  - IPN PayDunya authentifié : le hash renvoyé (SHA-512 de la master key) est
    vérifié, refus 401 si invalide. Le statut des transactions « en attente »
    est aussi réconcilié avec l'API `checkout-invoice/confirm/{token}`.
  - Endpoints worker : `POST /payment/init`, `GET/POST /payment/status`,
    `POST /payment/demo`, `POST /payment/notify` (webhook exempté du jeton,
    authentifié par le hash PayDunya).

### Corrections
- **Crash de l'onglet Paiements quand le tour sélectionné n'existe plus** :
  les enfants JSX de la modale « Marquer le pot comme reçu ? » étaient évalués à
  chaque rendu, même modale fermée — `tour` null plantait toute la page. La modale
  est désormais conditionnée à `confirmPot && !!tour` et son contenu est gardé.

### Technique
- Worker `tontine-notifier` : nouveau module `paiement.js` + `firebaseUtil.js`
  partagé (accès Realtime Database / FCM via token Service Account).
- Secrets worker : `PAYDUNYA_MASTER_KEY`, `PAYDUNYA_PRIVATE_KEY`,
  `PAYDUNYA_TOKEN`, `PAYDUNYA_MODE` (sandbox/live), `NOTIF_TOKEN`,
  `NOTIFIER_BASE_URL` (URL de l'IPN).
- Règles Realtime Database : nœud `paiements/{code}` (lecture connecté, écriture
  propriétaire / co-gérant ; le worker écrit en admin de service).
- Tests : suite business étendue (réconciliation, +5) ; smoke UI couvre le flux
  de paiement en ligne (init démo → modale → simulation réussie).

## [1.19.17] - 2026-08-11

### Sécurité
- **Règles Realtime Database durcies et déployées** : fin de l'écriture publique.
  - `tontines/{code}` : lecture publique par code (invitation), mais écriture
    réservée au responsable — le snapshot doit porter `groupe.proprietaire`
    (son uid Firebase Auth) et celui-ci est figé : un autre compte ne peut ni
    écraser, ni supprimer une tontine existante.
  - `demandes/{code}` et `messages_utilisateur/{code}` : lecture et écriture
    réservées aux utilisateurs connectés ; l'ajout (demande / message d'invité)
    est ouvert à tout utilisateur authentifié, la suppression reste réservée au
    responsable (vérifiée via la tontine correspondante).
  - `users/{uid}` : lecture/écriture privées (inchangé).
  - Vérifié avec de vrais jetons Firebase Auth (16/16 scénarios) : création/
    mise à jour/suppression par le responsable OK, non-responsable et anonyme
    refusés.

### Corrigé
- **Activation de la synchronisation** (`GroupSettingsTab`) : le uid de l'utilisateur
  connecté est désormais transmis à `activerSynchro`/`desactiverSynchro`. Auparavant
  le snapshot publié pouvait avoir `groupe.proprietaire = null`, ce qui empêchait
  la restauration en « groupe personnel » sur un autre appareil et bloquerait les
  nouvelles règles.

## [1.19.16] - 2026-08-11

### Sécurité / maintenance
- **Le worker de notification n'accepte plus les appels anonymes** : il exige
  désormais un jeton partagé (`X-Notif-Token`, secret `NOTIF_TOKEN` côté
  Cloudflare), transmis par l'app. Les accès RTDB du worker passent par un
  en-tête `Authorization: Bearer` (fini le jeton dans l'URL).
- **Déduplication des notifications** : quand plusieurs appareils du groupe
  observent le snapshot, un seul push est envoyé par message (fenêtre de 60 s).
- **Debug web désactivé sur Android** (`webContentsDebuggingEnabled: false`) :
  le WebView de production ne peut plus être inspecté à distance.
- `scripts/package-update.ps1` : publie désormais par défaut dans le dépôt
  GitHub OTA (zip + `update.json`, URL `raw.githubusercontent.com`), avec le
  mode Netlify conservé en option (`-Mode netlify`).

## [1.19.15] - 2026-08-11

### Ajouté
- **Les invités peuvent désormais écrire dans la discussion** d'une tontine
  qu'ils ont rejoints. Jusqu'ici ces groupes étaient en lecture seule stricte :
  l'envoi était désactivé. Un invité poste son message via un canal dédié
  (`messages_utilisateur/{code}`), il s'affiche immédiatement sur son appareil
  (« envoi… »), puis le responsable l'intègre à la discussion et le re-partage
  à tous les membres via la synchronisation existante (notifications FCM incluses).

### Technique
- `src/lib/sync.js` : canal `messages_utilisateur` (push / abonnement / suppression).
- `src/lib/db.js` : `envoyerMessageInvite` (envoi optimiste + en attente),
  `integrerMessage` (côté responsable, id conservé pour l'accusé), réconciliation
  des `pendingMessages` dans `appliquerSynchro`.
- `src/hooks/useSync.js` : `useAbonnerMessagesInvites` (le responsable relaie les messages).
- `src/screens/tabs/DiscussionTab.jsx` : zone d'écriture active pour les invités
  (lecture seule uniquement hors connexion), indicateur « envoi… ».
- `src/screens/GroupScreen.jsx` : la discussion n'est plus en lecture seule pour les invités.
- `database.rules.json` : nœud `messages_utilisateur` ouvert (comme `demandes`).

## [1.19.14] - 2026-08-11

### Corrigé
- **Le tap sur une notification de discussion ouvre désormais la conversation** :
  jusqu'ici le clic ouvrait le groupe sur l'onglet « Aperçu ». Un message de
  discussion (push FCM ou entrée de la boîte de réception) dirige maintenant
  directement vers l'onglet Discussion (`/groupe/:id?tab=discussion`).

### Technique
- `src/hooks/usePushNavigation.js` : navigation vers l'onglet discussion pour `type=message`.
- `src/screens/GroupScreen.jsx` : ouvre l'onglet demandé via `?tab=` dans l'URL.
- `src/lib/inbox.js` : le type du push (`message`) est conservé dans les entrées.
- `src/screens/NotificationsScreen.jsx` : ouverture de la discussion depuis la boîte de réception.

## [1.19.13] - 2026-08-11

### Corrigé
- **Manifeste de mise à jour lu directement sur raw.githubusercontent.com** :
  le CDN jsDelivr servait un manifeste périmé en cache (1.19.10) malgré les
  purges, ce qui bloquait toutes les mises à jour. L'app lit désormais le
  manifeste sur raw GitHub (cache 5 min, invalidé à chaque push) et rejette
  les anciennes URLs jsDelivr mémorisées.

### Technique
- `src/lib/miseAJour.js` : `MAJ_URL_DEFAUT` → raw GitHub ; migration qui
  retombe sur le défaut si une URL `cdn.jsdelivr.net` est mémorisée.

## [1.19.12] - 2026-08-11

### Corrigé
- **Notifications de message via Cloudflare Worker** : l'URL réelle du worker
  `tontine-notifier` remplace le placeholder. Les push FCM sont maintenant
  envoyés par `https://tontine-notifier.tontine-manager.workers.dev`
  (gratuit, sans plan Blaze), qui lit la tontine en REST admin et envoie les
  notifications FCM v1. La Cloud Function reste en secours (indisponible sur
  plan Spark).

### Technique
- `cloudflare-worker/` : worker déployé ; token OAuth service account avec
  scopes `userinfo.email` + `firebase.database` + `firebase.messaging`
  (requis pour la RTDB en REST et FCM v1).
- `src/lib/notifierMessage.js` : `NOTIFIER_URL` défini sur le worker réel.

## [1.19.11] - 2026-08-11

### Ajouté
- **Notifications de nouveau message dans la discussion** : quand un membre
  envoie un message dans la tontine, les autres membres reçoivent une
  notification push (titre « Nouveau message — <nom de la tontine> », corps
  « <auteur> : <texte> »). Le tap ouvre directement la tontine concernée.
  En avant-plan, la notification s'affiche immédiatement ; en arrière-plan
  elle arrive via FCM (Cloud Function `notifierNouveauMessage`, déclenchée
  sur toute écriture dans `tontines/{code}`).

### Technique
- `functions/index.js` : nouvelle fonction v2 `notifierNouveauMessage`
  (`onValueWritten('tontines/{code}')`) qui calcule la diff des messages et
  envoie un FCM à chaque membre hors auteur ; helpers `tokenMembre`/`estAuteur`.
- `src/lib/db.js` : `envoyerMessage` signe chaque message avec `uid`/`email`
  de l'auteur (permet l'exclusion de l'expéditeur côté serveur).
- `src/screens/tabs/DiscussionTab.jsx` : `poster()` transmet `uid`/`email` ;
  `estMoi` compare aussi `m.uid` pour aligner la bulle du bon côté.
- `src/lib/rappelLocal.js` : `afficherNotificationImmediate` (notification
  locale immédiate à l'arrivée d'un push de message en avant-plan).
- `src/hooks/useInbox.js` : un push `type:'message'` affiché en avant-plan
  devient une notification locale + entrée inbox (pas de doublon au tap).
- `scripts/test.mjs` : tests pour `envoyerMessage` (uid/email, persistance,
  message vide refusé).

## [1.19.10] - 2026-08-11

### Corrigé
- **Boutons d'action hors écran dans Réglages → Sécurité** : dans les lignes
  avec libellé long (ex. « Code PIN — Actif — l'app est verrouillée au
  démarrage »), la paire de boutons « Changer / Désactiver » ne tenait pas à
  droite du texte et le deuxième bouton sortait de l'écran (débordement de
  ~27 px sur 343 px de large). Le composant partagé `ActionRow` accepte
  désormais une colonne de texte en `flex-wrap` : quand les boutons ne tiennent
  pas sur la ligne du libellé, ils passent à la ligne suivante, alignés à
  droite, sans déborder.

### Technique
- `src/components/ui/ActionRow.jsx` : `flex flex-wrap items-center justify-between`,
  bloc texte `min-w-0 flex-1`, boutons dans `ml-auto flex shrink-0 items-center gap-2`.

## [1.19.9] - 2026-08-11

### Ajouté
- **Discussion repensée façon WhatsApp** : les messages s'affichent en bulles
  (les miennes à droite, celles des autres à gauche), séparées par des
  indicateurs de jour (« Aujourd'hui », « Hier » ou date), avec avatars à
  initiale, nom de l'auteur, horodatage (heure) et coche d'envoi sur mes
  messages. Les bulles consécutives d'un même auteur sont regroupées (collées
  entre elles, coin arrondi côté opposé), et la zone de saisie est une barre
  arrondie fixée en bas de la discussion avec bouton d'envoi. La suppression
  reste disponible sur chaque message.

### Corrigé
- **Interface « trop zoomée » sur grand écran** (natif, APK) : la WebView
  Android suivait la taille de police / le zoom d'affichage du téléphone, ce
  qui agrandissait toute l'interface (≈1,25× sur certains appareils, plus
  encore sur grand écran). `MainActivity` force désormais `textZoom = 100` et
  désactive le zoom utilisateur : le rendu reste toujours à l'échelle 1:1 du
  CSS. Nécessite la réinstallation de l'APK v1.19.9 (versionCode 39).

### Technique
- `src/screens/tabs/DiscussionTab.jsx` réécrit : calcul de lignes (séparateurs
  de jour + début/fin de groupe par auteur, fenêtre de 10 min), helpers de date
  et de couleur d'avatar, barre de saisie en lecture seule en mode invité.
- `android/.../MainActivity.java` : `setTextZoom(100)`, zoom désactivé.

## [1.19.8] - 2026-08-11

### Corrigé
- **Libellés des 6 onglets invités non plus tronqués** : avec le correctif
  d'espacement (1.19.7), les onglets ne se chevauchaient plus, mais sur la
  barre à 6 onglets du mode invité (Aperçu, Membres, Tours, Discussion,
  Journal, Réglages) certains libellés étaient coupés (« Discussion » →
  « Discu… ») faute de place (~52 px par onglet sur un écran 360 dp). Correctif :
  en mode invité, la police des onglets passe à `8px` et les libellés
  s'affichent sur **deux lignes au maximum** (`break-words`) au lieu d'être
  tronqués. Les 4 onglets + « Plus » du mode responsable restent en `10px`
  avec troncature simple (assez de place).

## [1.19.7] - 2026-08-11

### Corrigé
- **Espacement des libellés dans les barres d'onglets** : les textes (Aperçu,
  Membres, Tours, Discussion, Journal, Réglages / Accueil, Épargne, Stats,
  Réglages) pouvaient se coller les uns aux autres quand l'échelle de police
  système était augmentée (zoom) ou avec 6 onglets en mode invité. Les boutons
  `flex-1` ne pouvaient pas rétrécir sous la largeur de leur contenu
  (`min-width:auto`), d'où le débordement du texte sur le voisin. Correctif :
  `min-w-0` + `overflow-hidden` sur les boutons, libellés dans un `<span>`
  `truncate`/`leading-none`, et `gap-1` entre les onglets. Les icônes gardent
  leur espacement.

## [1.19.6] - 2026-08-11

### Corrigé
- **Fixe définitif du blocage « Installation… »** : le capteur venait de
  `await annulerRappelMiseAJour()` (`LocalNotifications.cancel` reste muet sur
  MIUI et ne résolvait pas sa promesse). L'annulation du rappel est désormais
  lancée en tâche de fond, sans bloquer le flux d'installation.
- **Manifeste OTA migré sur jsDelivr** (`cdn.jsdelivr.net/gh/...`) : le cache
  CDN régional de `raw.githubusercontent.com` servait un manifeste périmé sur
  certains réseaux. `urlManifest()` abandonne automatiquement toute URL
  `raw.githubusercontent.com` ou `tontine-manager.netlify.app`. Le zip du
  bundle, lui, continue d'être servi par `raw.githubusercontent.com` (propagé
  plus vite que le manifeste). Après chaque push OTA, purger
  `https://purge.jsdelivr.net/gh/<repo>@main/update.json`.

### Ajouté
- **Re-vérification périodique de la mise à jour** : re-check automatique
  toutes les 60 s (au lieu d'une seule vérification au lancement).
- Livraison native : `versionCode` 36, `versionName` 1.19.6 (APK final à
  distribuer).

## [1.19.5] - 2026-08-11

### Corrigé
- Version de validation intermédiaire du flux OTA (re-check périodique et
  préparation de la migration jsDelivr). Aucune modification fonctionnelle
  côté utilisateur.

## [1.19.4] - 2026-08-11

### Corrigé
- Version de validation du flux OTA complet (téléchargement → activation →
  rechargement) sur appareil. Aucune modification fonctionnelle.

## [1.19.3] - 2026-08-11

### Corrigé
- **Mise à jour OTA bloquée à « Installation… »** : après le téléchargement,
  l'app appelait `set()` puis `reload()`, mais `set()` déclenche déjà le
  rechargement interne (le plugin attend que le nouveau bundle signale son
  bon démarrage via `notifyAppReady`). Le `reload()` supplémentaire n'avait
  plus aucun signal d'apprêt à attendre → délai dépassé et échec. Le
  `reload()` redondant est supprimé ; la version du bundle n'est mémorisée
  qu'après succès de l'activation.

## [1.19.2] - 2026-08-11

### Corrigé
- Version de validation du correctif de mise à jour OTA (1.19.1) : serveur de
  mise à jour re-basculé sur cette version pour valider le téléchargement
  OTA de bout en bout sur les appareils.

## [1.19.1] - 2026-08-11

### Corrigé
- **Téléchargement OTA qui se bloquait sur certains réseaux** : le test réseau
  (HEAD) et le téléchargement du bundle n'avaient aucun délai maximal ; sur un
  réseau lent ou un serveur injoignable, l'app restait indéfiniment sur
  « Installation… ». Ajout de timeouts (15 s pour le serveur, 90 s pour le
  téléchargement, 30 s pour l'activation) et affichage de l'étape en cours
  (Connexion / Téléchargement / Installation). En cas d'échec, le message
  distingue désormais « serveur injoignable » (et conseille de changer l'URL
  de mise à jour dans les réglages) des autres erreurs.

## [1.19.0] - 2026-08-11

### Ajouté
- **Internationalisation (i18n) FR/EN** : infrastructure de traduction
  (`src/lib/i18n.js`, dictionnaire FR/EN, `t()` avec interpolation, `useLangue()`
  réactif) et réglage « Langue » dans `Paramètres` (Français / English).
  Écrans traduits : accueil, épargnes, statistiques, verrouillage (PIN), tutoriel
  d'accueil, navigation, création/rejoindre, connexion email/Google, et les
  en-têtes des sections de Paramètres. Les autres écrans restent en français
  pour l'instant (traduction progressive).
- Livraison **OTA** (bundle web) et **native** (APK).

## [1.18.0] - 2026-08-11

### Ajouté
- **Export Excel réel (.xlsx)** : classeur multi-feuilles par tontine
  (Synthèse, Membres, Tours, Paiements, Historique, Prêts) via la lib `xlsx`
  (SheetJS). Bouton « Excel complet » dans `Paramètres → Export` de la tontine
  (remplace le trio CSV : une seule feuille de calcul, les CSV restent dispo).
- **Export Excel global** : `Paramètres → Sauvegarde locale → Excel global` —
  un classeur avec une feuille récapitulative « Toutes les tontines » + une
  feuille par tontine (synthèse, membres, tours, prêts).
- **Sauvegarde JSON complète** : les **prêts** sont désormais inclus dans
  l'export/import de sauvegarde locale (`CLES_DONNEES`), au même titre que
  les groupes, membres, tours, cotisations et épargnes.
- Livraison **OTA** (bundle web) et **native** (APK).

## [1.17.1] - 2026-08-11

### Corrigé
- **Fausse alerte de mise à jour après installation d'un APK récent** : si l'APK
  embarquait une version ≥ à la dernière mise à jour OTA mémorisée (ex. APK 1.17.0
  avec un `tontine_bundle_version` resté à 1.16.0), l'app reproposait la même
  mise à jour et pouvait rester bloquée sur « Installation… ». Le bundle embarqué
  prime désormais sur la version OTA stockée (`lib/miseAJour.js`,
  `versionBundleActuelle`). Livraison **native** (APK 1.17.1) et **OTA** (1.17.1).

## [1.17.0] - 2026-08-11

### Ajouté
- **Déverrouillage biométrique** : empreinte ou reconnaissance faciale pour déverrouiller
  l'application au lieu de saisir le code PIN. Bascule dans `Paramètres → Sécurité`
  (visible uniquement si le code PIN est actif et que l'appareil est compatible) et
  bouton « Déverrouiller avec l'empreinte/le visage » sur l'écran de verrouillage.
  Livraison **native** (APK requis, l'OTA web affiche « Non disponible sur cet appareil »).

## [1.16.0] - 2026-08-11

### Ajouté
- **Connexion par email / mot de passe** : nouveau mode de compte en plus de Google. Écran dédié
  (`/connexion`) avec connexion, inscription (nom + confirmation) et « mot de passe oublié »
  (envoi d'un lien de réinitialisation). Accessible depuis la modale « Connexion requise »
  (création de tontine sans compte) et depuis Paramètres → Compte Google.
- **Messages d'erreur en français** : les codes d'erreur Firebase Auth sont traduits
  (email déjà utilisé, mot de passe incorrect, réseau, lien invalide, méthode non activée…).
- **Restauration automatique** : après une connexion par email, les tontines liées au compte
  sont restaurées puis l'écran revient à l'accueil.

## [1.15.0] - 2026-08-11

### Ajouté
- **Prêts entre membres** : nouvel onglet « Prêts » dans chaque groupe. Enregistrez un prêt
  (emprunteur, montant, taux d'intérêt simple optionnel, échéance, note), suivez le statut
  (En cours / En retard / Remboursé), encaissez les remboursements partiels et consultez
  l'historique des versements.
- **Résumé dans l'aperçu** : une carte « X prêts en cours » apparaît sur l'écran d'accueil du
  groupe (reste à percevoir, nombre en retard), avec accès direct à l'onglet.
- **Rappels d'échéance de prêt** : notification locale le jour même et la veille de l'échéance
  d'un prêt non soldé, intégrée au récap quotidien du matin.
- **Synchronisation** : les prêts voyagent dans le snapshot cloud (visible en lecture seule
  chez les invités, gérés par le responsable).

> OTA

## [1.14.6] - 2026-08-11

### Nettoyé (écran d'accueil)
- **Cartes de groupe** : le bouton « Gérer » en doublon de la carte cliquable est supprimé —
  on ouvre le groupe en touchant la carte.
- **Suppression de groupe** : fin de la double confirmation en cascade (deux fenêtres
  identiques à la suite) — une seule confirmation.
- **En-tête épuré** : l'engrenage « Paramètres » en doublon de l'onglet « Réglages » de la
  barre de navigation est retiré (verrou et cloche conservés).

> OTA

## [1.14.5] - 2026-08-11

### Ajouté
- **Notification de mise à jour** : dès qu'une nouvelle version est détectée au lancement,
  l'app programme un rappel quotidien (10h00) qui prévient l'utilisateur tant qu'il n'a pas
  installé la mise à jour — il reçoit donc la notification même sans rouvrir l'application.
  Le rappel s'annule automatiquement dès que la mise à jour est installée.

> OTA

## [1.14.4] - 2026-08-11

### Amélioré (expérience Paramètres)
- **Enregistrement immédiat des préférences locales** : devise, messages SMS, message de
  bienvenue et récap quotidien sont sauvegardés sur l'appareil dès la modification, même hors
  ligne. Le bouton global « Enregistrer les paramètres » et l'exigence de connexion sont supprimés.
- **Section Mises à jour nettoyée** : le champ technique « URL du manifeste » est retiré
  (l'app utilise le manifeste GitHub par défaut), la mention Netlify disparaît et la section
  « Mises à jour » est déplacée en bas des réglages, renommée avec version et vérification manuelle.
- **Libellés simplifiés** : le jargon « plan Blaze de Firebase » des notifications push est remplacé.

> OTA

## [1.14.2] - 2026-08-11

### Modifié
- **Barre d'onglets élargie et aérée** : passage à un bouton `+` central. La barre affiche
  désormais 4 onglets (Accueil · Épargne · Stats · Réglages) et un bouton circulaire `+`
  surélevé qui ouvre un menu « Nouvelle tontine » / « Rejoindre un groupe ». La barre est
  plus haute (64 px) pour un confort de visée.
- **Oubli automatique de l'ancienne URL Netlify** : si une ancienne adresse
  `tontine-manager.netlify.app` était mémorisée (localStorage), l'app la réinitialise et
  bascule sur le manifeste GitHub par défaut.

> OTA

## [1.14.1] - 2026-08-10

### Ajouté
- **Barre d'onglets inférieure** : navigation à 6 éléments (Accueil · Épargne · Nouvelle ·
  Rejoindre · Stats · Réglages). « Nouvelle tontine » et « Rejoindre un groupe » sont
  accessibles depuis n'importe quel écran ; les modales correspondantes ont été déplacées
  au niveau global de l'application. Les plaques en pointillés du tableau de bord sont
  supprimées.
- **Hébergement OTA gratuit** : le manifeste `update.json` et le zip sont désormais servis
  depuis GitHub raw (CORS `*`), plus aucune dépendance à Netlify. L'URL par défaut de mise à
  jour pointe vers `allakouassiaxellemarius-sys/tontine-manager-ota`.

> OTA

## [1.14.0] - 2026-08-10

### Ajouté (Phase 5)
- **Sauvegarde locale complète** : Réglages → « Sauvegarde locale » — exporte toutes les
  données (groupes, membres, tours, cotisations, épargnes, paramètres) dans un fichier JSON,
  et import/restauration depuis un fichier (avec confirmation avant remplacement). Le PIN/2FA
  sont réinitialisés à l'import.
- **Statistiques** : nouvel écran accessible depuis l'accueil — total cotisé/reçu global,
  sélection d'une tontine, progression (tours reçus / total avec barre), bilan complet
  (cotisé, pénalités, reçu, solde), répartition par membre (classement + barres) et
  membres en retard.
- **SMS côté serveur (sécurisé)** : nouveau champ « URL du serveur SMS (Apps Script) » dans
  Réglages → Messages. Le téléphone n'envoie plus que le numéro et le message ; les
  identifiants Twilio restent dans les Script properties d'Apps Script (fonctions
  `doPost`/`envoyerSMSTwilio` ajoutées dans `functions/apps-script.gs`). L'ancien mode client
  reste disponible.
- **Rappels locaux** : déjà présents (échéance de tour, retards, récap matin) — aucun changement.

### Remarque
- La sauvegarde cloud (compte Google) reste disponible ; la sauvegarde locale la complète
  pour un transfert manuel d'appareil.

> OTA

## [1.13.4] - 2026-08-10

### Sécurité (revue d'audit)
- **Code PIN durci** : le hash passe à 10 000 itérations de SHA-256 (ralentit le brute-force
  hors ligne d'un code à 4-6 chiffres). Anciens codes PIN toujours acceptés (rétro-compatible).
- **`allowBackup=false`** (Android) : les données (PIN, 2FA, groupes) ne sont plus extractibles
  via la sauvegarde système. *Native — nécessite un nouvel APK.*
- **`allowMixedContent=false`** : plus aucune ressource HTTP en clair dans la WebView. *Native —
  nécessite un nouvel APK.*
- **`.gitignore`** : exclusion des secrets (keystore, `.env`, `*.jks`, etc.).
- **`database.rules.json`** versionné : règles RTDB à republier dans la console Firebase.

### Non couvert par l'OTA
- Les 2 changements *native* (`allowBackup`, `allowMixedContent`) ne s'appliquent qu'à la
  prochaine installation d'un APK reconstruit.

> OTA

## [1.13.3] - 2026-08-10

### Ajouté
- **Double authentification (2FA/TOTP)** : après le code PIN, l'app demande en plus un code à
  6 chiffres généré par une application d'authentification (Google Authenticator, Authy, etc.).
  Activation dans Réglages → Sécurité : un QR code à scanner + code à confirmer.
  Désactivation protégée par un code valide.

### Sécurité
- **Clé privée Firebase retirée du code** (`functions/apps-script.gs`) : plus aucun secret en
  clair. La clé doit désormais être fournie via les « Script properties » de Google Apps Script
  (`SERVICE_ACCOUNT_PRIVATE_KEY`). ⚠️ **Action requise : révoquez l'ancienne clé** dans Firebase
  → Project settings → Comptes de service, car elle avait été exposée dans le code source.
- Nouvelle fonction `verifierCompteService()` dans Apps Script pour contrôler la présence de la clé.

> OTA

## [1.13.2] - 2026-08-10

### Ajouté
- **Discussion de groupe** : nouvel onglet « Discussion » avec messages, auteur, date et
  suppression. Tout le monde peut participer ; le responsable partage les messages avec les
  membres synchronisés (limite de 200 messages). Envoi au clavier (Entrée).
- **Épargne personnelle** : écran « Mon épargne » accessible depuis l'accueil — créer une
  cagnotte (nom, objectif optionnel), verser un montant daté, suivre la progression (barre +
  pourcentage), retirer un versement par erreur ou supprimer l'épargne. Enregistré localement
  sur l'appareil, indépendamment des tontines.

> OTA

## [1.13.1] - 2026-08-10

### Ajouté
- **Rôles dans le groupe** : chaque membre peut être désigné **Trésorier** ou **Co-responsable**
  (modification du membre depuis l'onglet Membres). Les badges « Trésorier » et « Co-responsable »
  apparaissent dans la liste, et chaque nomination est tracée dans le journal d'activité.
- **Profil & historique de participation** : en touchant l'icône profil d'un membre, on ouvre
  son dossier complet — total cotisé, pots reçus, retards en cours, taux de participation, et la
  liste détaillée de ses versements (tour, date, moyen de paiement, pénalités).
- **Mon profil** (Réglages → Compte Google) : quand vous êtes connecté et présent dans une tontine,
  vos statistiques agrégées s'affichent — nombre de tontines, total cotisé, versements, retards
  et pots reçus sur l'ensemble de vos groupes.

### Corrigé
- Le journal de rôle gère maintenant les trois rôles (membre / trésorier / co-responsable).

> OTA

## [1.13.0] - 2026-08-10

### Ajouté
- **Onglet « Journal »** : annonces de l'administrateur (publier, supprimer, visibles par
  tous les membres) et journal d'activité complet du groupe (création, ajouts/suppressions
  de membres, blocages, planning généré, paiements, retraits, réceptions de pot).
- **Statut de chaque membre** dans l'onglet Membres : « À jour », « N tour(s) en retard »
  avec pénalités estimées en cours, ou « Aucun tour » ; le rôle trésorier est affiché.
- **Reçu de paiement PDF** : bouton reçu sur chaque cotisation payée (onglet Paiements),
  avec détails (membre, tour, montant, date, moyen, pénalité) et total.
- **QR code d'invitation** : génération d'un QR contenant le message d'invitation
  (lien WhatsApp ou code court), partageable directement depuis les réglages du groupe.
- **Limites de taille du groupe** : champs membres minimum et maximum dans les réglages,
  avec blocage de l'ajout au-delà du maximum (compteur « X / Y » dans l'onglet Membres).
- **Journalisation** : chaque action importante est tracée dans le journal (limité à 120
  entrées), synchronisée avec les membres.

### Corrigé
- Le plafond de membres dans `addMembre` comptait tous les membres de toutes les tontines :
  il ne compare plus que les membres du groupe concerné.

> OTA

## [1.12.7] - 2026-08-10

### Corrigé
- **Tous les textes secondaires peu lisibles** (dates, libellés de cartes, sous-titres,
  indications, montants de statistiques…) : la couleur `gray-400` est assombrie en mode
  clair et éclaircie en mode sombre. L'ensemble des petites mentions grises de l'app
  ressort maintenant nettement sur l'arrière-plan, sans casser la hiérarchie visuelle.

> OTA

## [1.12.6] - 2026-08-10

### Corrigé
- **Textes des états vides peu lisibles** (« Ajoutez un membre… », « Générez le planning
  des tours… ») : le titre passe en `gray-900` et la description en `gray-600` (plus sombre
  en clair, plus lumineuse en sombre), et l'icône de l'état vide gagne un meilleur contraste
  sur son fond vert. Ces textes ressortent maintenant nettement sur l'arrière-plan.

> OTA

## [1.12.5] - 2026-08-10

### Modifié
- **Navigation basse du groupe** : les onglets (Aperçu, Membres, Tours, Paiements…) ne
  sont plus des pastilles en haut d'écran mais une barre de navigation fixée en bas,
  à la manière d'une app native. Les onglets les plus utilisés restent toujours
  accessibles ; Rappels, Historique et Réglages sont regroupés derrière le bouton
  « Plus » qui ouvre une feuille en bas d'écran (toujours 1 à 2 appuis max).
- La barre d'enregistrement des Réglages du groupe n'est plus collée en bas
  (elle passait sous la nouvelle navigation).

> OTA

## [1.12.4] - 2026-08-09

### Corrigé
- **Barre d'onglets du groupe peu visible** (Aperçu, Membres, Tours, Paiements, Rappels,
  Historique, Réglages) : les pastilles inactives étaient quasi indiscernables de
  l'arrière-plan. Elles ont maintenant une bordure nette, un meilleur contraste de texte
  (`text-gray-600`) et la barre est séparée du contenu par un filet. L'onglet actif
  conserve son accent vert.

> OTA

## [1.12.3] - 2026-08-09

### Corrigé
- **Cartes peu visibles en mode sombre** : les blocs teintés (`bg-brand-50`,
  `bg-success-50`, etc.) étaient quasi noirs (ex. vert `18 32 19` sur un fond de page
  `20 20 23`) et se confondaient avec l'arrière-plan. Les teintes sombres des palettes
  `brand`, `success`, `danger`, `warning`, `info` sont éclaircies pour ressortir nettement,
  les contours des cartes (`--border`) sont renforcés et une ombre de carte visible en
  mode sombre a été ajoutée.

> OTA

## [1.12.2] - 2026-08-09

### Modifié
- **Disposition stratégique des boutons** : l'action principale de l'onglet Rappels
  (« Relancer les X non payés ») passe au premier plan (`btn-primary`), l'écran vide de
  l'onglet Tours gagne un bouton « Ajouter des membres » qui bascule directement vers
  l'onglet Membres. Audit de tous les écrans : les actions primaires pleine largeur, les
  secondaires compactes et les confirmations destructives (modales « Annuler » / action)
  sont désormais cohérentes partout.
- Fond de l'aperçu de message dans les Rappels converti en token `surface-muted`
  (lisibilité en mode sombre).

> OTA

## [1.12.1] - 2026-08-09

### Modifié
- Palette `brand` adoucie : le vert Duolingo néon (`#58cc02`) est remplacé par un vert
  matérial plus profond et élégant (`#43a047`). Appliqué à la palette, aux boutons, aux
  accents, à la roue et aux illustrations de l'onboarding, ainsi qu'au thème système.

> OTA

## [1.12.0] - 2026-08-09

### Ajouté
- **Mode sombre** : toutes les palettes converties en tokens CSS (`gray`, `brand`, `success`,
  `danger`, `warning`, `info`). Réglage « Apparence » dans les Paramètres (Automatique / Clair /
  Sombre) avec script anti-flash au démarrage et suivi du thème système.
- **Notifications de confirmation (toasts)** : groupe créé, membre ajouté, cotisation enregistrée,
  pot reçu, planning généré, paramètres enregistrés, etc.
- **Retour haptique** (`navigator.vibrate`) sur les actions principales (tap, succès, erreur).
- Composant `Skeleton` (états de chargement) et `.btn-icon` (cible tactile 44 px).

### Modifié
- `card`, `.btn-secondary`, `.input`, fond de l'app et modal basculés sur des tokens `surface`
  compatibles sombre (`bg-white` → `bg-surface`).
- `EmptyState` redessiné : icône animée, étoile décorative, meilleure hiérarchie.
- Boutons dupliqués `!p-2` des en-têtes remplacés par `.btn-icon` (44 px, accessible).
- Micro-interactions : pression des boutons avec `scale`, transitions fluides.
- Accessibilité : anneau de focus visible, `role="dialog"` + `aria-label` sur les modales,
  `prefers-reduced-motion` respecté.

> OTA

## [1.11.12] - 2026-08-09

### Ajouté
- Palette de couleurs sémantiques dans `tailwind.config.js` : `success` (vert), `danger` (rouge),
  `warning` (orange), `info` (bleu).
- `CHANGELOG.md` : suivi des versions.

### Modifié
- Remplacement de toutes les classes de couleur ad hoc (`emerald`, `rose`, `amber`, `indigo`, `sky`)
  par les tokens sémantiques dans les 20 fichiers de l'interface :
  payé/encaissé/connecté → `success`, retard/erreur/annulé → `danger`, en attente/pénalités →
  `warning`, lecture seule/synchro/reçu → `info`.
- Icônes de `HistoryTab` (mini-statistiques) alignées sur les tokens sémantiques.

> OTA

## [1.11.11] - 2026-08-09

### Ajouté
- Son de notification « carillon » original (style Duolingo) : `android/app/src/main/res/raw/chime_duo.wav`.
- `sound: 'chime_duo.wav'` sur les 4 notifications locales (échéance, retard récurrent, récap 07h30, test 5 s).

### Modifié
- `versionCode` APK → 20.

> Native (APK v1.11.11) + OTA

## [1.11.10] - 2026-08-09

### Modifié
- Écran « Paramètres » réécrit en accordéon (8 sections : compte, sécurité, notifications,
  automatisations, devise, messages, mises à jour, découverte) avec barre de sauvegarde collante.
- `SectionCard` simplifié en simple wrapper (les en-têtes d'accordéon portent les titres).

> OTA

## [1.11.9] - 2026-08-09

### Modifié
- Réglages de groupe réorganisés en accordéon (`GroupSettingsTab`).

> OTA
