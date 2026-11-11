# Fiche APKPure — Tontine Manager v2.3.0 (vc95)

Artifact à téléverser : `C:\tontine-app\releases\Tontine-Manager-v2.3.0-vc95.apk`
(4 360 317 octets ≈ 4,16 Mio) — release signée, non debuggable, R8 + shrinkResources.

- `package` : `com.tontine.manager`
- `versionCode` 95 · `versionName` 2.3.0
- `minSdk` 23 (Android 6.0) · `targetSdk` 35
- Signature (certificat release, à déclarer au compte dev) :
  - SHA-256 `33:21:89:22:95:1B:4A:43:0D:80:8B:F3:75:F7:22:12:5D:AA:12:7E:F6:62:C5:D0:27:09:18:BF:C2:86:A1:90`
  - SHA-1 `D0:7E:09:36:0A:EB:AA:F9:9C:89:AA:9F:82:1F:7A:7F:FA:F6:1D:0A`
- Mapping R8 (à conserver pour relire les crashs) : `releases/mapping-2.3.0-vc95.txt`
- Politique de confidentialité hébergée : `https://tontine-sync.tontine-manager.workers.dev/privacy`
- Page de suppression de compte : `https://tontine-sync.tontine-manager.workers.dev/suppression`
- Email de contact : `tontine.manager.app@gmail.com`

## Permissions réellement déclarées (manifest fusionné, vérifié sur l'APK)

INTERNET, ACCESS_NETWORK_STATE, POST_NOTIFICATIONS, USE_EXACT_ALARM,
SCHEDULE_EXACT_ALARM, USE_BIOMETRIC, USE_FINGERPRINT, FOREGROUND_SERVICE,
VIBRATE, WAKE_LOCK, RECEIVE_BOOT_COMPLETED, USE_CREDENTIALS,
com.google.android.c2dm.permission.RECEIVE.

Aucune : micro, caméra, contacts, stockage externe, localisation.

## Titre

Tontine Manager — gérer sa tontine

## Description courte (79 caractères)

Cotisations, tours, épargne et discussion : la tontine gérée sans banque.

## Description longue

Tontine Manager tient les comptes de vos tontines, tontines scolaires,
rotatives et groupes d'entraide — sans jamais toucher à l'argent.

**Gestion complète**
- Plusieurs tontines, avec montant de cotisation, période, nombre de membres.
- Planning des tours généré automatiquement, ordre de passage, dates d'échéance.
- Suivi des paiements par tour, pénalités de retard, prêts entre membres.
- Épargne : objectifs d'épargne par membre et par groupe, avec progression.
- Calendrier des tours et alertes de rappel, même téléphone éteint.

**Travail à plusieurs**
- Chaque tontine peut rester 100 % locale sur votre téléphone.
- Activez la synchronisation pour partager une copie avec les membres du
  groupe : ils la consultent et y participent avec un simple code d'invitation.
- Discussion de groupe complète : messages, photos, réponses citées, messages
  épinglés, accusés de lecture, brouillons et file d'envoi hors ligne.
- Annuaire des membres, import par fichier .vcf ou copier-coller.

**Rappels WhatsApp par le serveur (facultatif)**
- Le responsable d'une tontine synchronisée peut relancer les retardataires
  depuis le numéro professionnel de la tontine, via WhatsApp Business — même
  téléphone éteint.
- Envoi confirmé par le responsable, message pré-rempli (montant, échéance,
  nom du groupe) ; une réponse « STOP » du membre arrête toute relance.
- Les numéros ne sont transmis que pour les rappels que le responsable
  déclenche.

**Paiements et cotisations**
- Lorsqu'un lien de collecte est configuré par la plateforme, le membre règle sa
  cotisation via ce lien de paiement externe puis signale le paiement dans
  l'application ; le responsable/l'administrateur confirme après vérification.
- L'argent ne transite jamais par l'application et aucun moyen de paiement n'est
  stocké dans l'application.

**Assistant IA intégré**
- Un assistant spécialisé finance, comptabilité et analyse de données répond à
  partir des chiffres de votre tontine : retardataires, projection de trésorerie,
  explication d'un solde, message de rappel prêt à envoyer.

**Statistiques et exports**
- Bilan du groupe, tableau des cotisations, historique, statistiques.
- Export PDF, Excel, CSV et JSON pour garder une trace hors de l'application.

**Confidentialité**
- Aucune publicité, aucun traceur, aucune revente de données, aucune
  géolocalisation. Les données de gestion restent sur l'appareil par défaut.
- Protection par code PIN ou biométrie, exigée pour toute action sensible
  (distribution du pot, changement du compte de collecte, suppression d'un
  groupe).
- Suppression définitive du compte et des données serveur en un geste :
  Profil → Sécurité → Supprimer mon compte, ou via la page
  https://tontine-sync.tontine-manager.workers.dev/suppression
- Politique de confidentialité complète :
  https://tontine-sync.tontine-manager.workers.dev/privacy

Fonctionne hors ligne. Interface en français et en anglais.

## Notes de version 2.3.0

- Nouveauté : rappels de cotisation par WhatsApp Business, envoyés par le
  serveur depuis le numéro professionnel de la tontine — même téléphone éteint.
  Le responsable confirme l'envoi ; une réponse « STOP » du membre arrête toute
  relance. Facultatif.
- Nouvelle discussion de groupe : écran plein écran, photos, réponses citées,
  messages épinglés, accusés de lecture (« vu par »), brouillons conservés,
  file d'envoi hors ligne avec reprise automatique, séparateurs de jour.
- Les messages de la discussion déclenchent désormais une notification push.
- Confirmation par code PIN ou biométrie exigée pour toute action qui déplace
  de l'argent : distribution du pot, changement du compte de collecte,
  suppression d'une tontine.
- Assistant IA : expertise finance, comptabilité, analyse de données et conseil.
- Confidentialité renforcée : permissions micro et contacts retirées, secret
  technique retiré du paquet applicatif ; l'application ne lit aucun carnet
  d'adresses.
- Fluidité et stabilité améliorées, corrections diverses.

## Captures d'écran — set final (4)

Dans `releases/screenshots/`, toutes en PNG **720×1600** (l'Xiaomi de test), à
téléverser dans cet ordre :

| Ordre | Fichier | Poids | Contenu |
| --- | --- | --- | --- |
| 1 | `01-accueil.png` | 162 Ko | Accueil « Bonjour Alla », badge V 2.2.1 + « En ligne », Nouvelle tontine / Rejoindre / Explorer, liste Mes tontines, barre de navigation du bas |
| 2 | `02-discussion.png` | 45 Ko | Discussion pleine page : bulles, horaires, accusés de lecture, actions par message |
| 3 | `03-discussion-epinglee.png` | 49 Ko | Bandeau de message épinglé avec compteur |
| 4 | `04-discussion-citation.png` | 56 Ko | Réponse citée (bloc citation dans la bulle) |

Écartées (dans `releases/screenshots/rejetees/`) : `02-groupe-apercu.png`, état
vide « Aucun tour généré pour ce groupe ».

Note du 2026-10-01 : ces captures ont été prises sur vc94, donc le badge de la
capture 1 affiche « V 2.2.1 ». L'interface n'a pas changé en 2.3.0 — recapturer
la seule capture 1 (badge V 2.3.0) est possible mais facultatif ; les 4 captures
actuelles restent exactes quant au contenu.

Les écrans monétaires (Calendrier, Membres/Argent, Épargne, Statistiques,
Assistant IA) sont absents car le groupe de test n'a pas de planning — ils
sortent en état vide. Pour les obtenir, toucher « Essayer avec une tontine de
démonstration » sur l'accueil (`src/lib/demo.js` : 5 membres, 5 tours, paiements
et un retardataire) puis recapturer. Les taps sur le téléphone ne peuvent pas
être faits par l'agent.

## Emprise de l'artifact

`releases/Tontine-Manager-v2.3.0-vc95.apk` — 4 360 317 octets,
SHA-256 `a5fa08d346b7700adce6b68198e95aa46e28acaeaf50062ca24a05c82c97db3c`
(vérifié après copie depuis `android/app/build/outputs/apk/release/`, identique ;
même certificat de signature que vc94 — seules la version et le bundle web
changent). Mapping R8 : `releases/mapping-2.3.0-vc95.txt` (5 510 107 o).

## Visuel de vitrine (feature graphic)

`releases/banniere-1024x500.png` — 1024×500, PNG 24 bpp sans alpha, 113 651 o,
SHA-256 `32b34ae53fcb27f7dd3083946984151906d02c7ea4fe5ca7e8807bbf1b090940`.
Composé programmatiquement (pas d'IA générative, donc aucun texte déformé) par
`releases/banniere.ps1` + `releases/banniere-texte.txt`, dans la palette mesurée sur
les captures elles-mêmes : fond navy `#12132A`→`#232856`, titre blanc, accroche verte
`#21C35D`, puces or `#FFD141`. Le monogramme est `public/logo-512.png`.

Pour changer un texte : éditer `banniere-texte.txt` (6 lignes = titre, accroche,
3 puces, pied de page) puis relancer le script. L'ajustement de corps est
automatique et **mesuré** : le script imprime la largeur de chaque ligne et la
refuse si elle dépasse le cadre, ce qui avait justement révélé deux défauts à la
première mouture (puce coupée à droite, jambages du titre sur l'accroche).

## Jeu « format APKPure » (contrôlé contre les bornes du formulaire)

Règle affichée par la console : au moins 2 captures, JPEG ou PNG, dimension
minimale 320 px, maximale 3840 px. `releases/apkpure-format/` contient le jeu
regénéré et **validé ligne par ligne** par `releases/formater-apkpure.ps1` :

| Fichier | Dimensions | min ≥ 320 | max ≤ 3840 | Poids |
| --- | --- | --- | --- | --- |
| `screenshot-1-accueil.png` | 1080×2400 | 1080 ✓ | 2400 ✓ | 445 044 o |
| `screenshot-2-discussion.png` | 1080×2400 | 1080 ✓ | 2400 ✓ | 136 549 o |
| `screenshot-3-epingle.png` | 1080×2400 | 1080 ✓ | 2400 ✓ | 151 068 o |
| `screenshot-4-reply.png` | 1080×2400 | 1080 ✓ | 2400 ✓ | 178 228 o |
| `icon-512x512.png` | 512×512 | 512 ✓ | 512 ✓ | 29 703 o |
| `banniere-1024x500.png` | 1024×500 | 500 ✓ | 1024 ✓ | 113 651 o |

Les captures sont ré-échantillonnées de 720×1600 à 1080×2400 — **ratio 9:20
conservé au pixel près, donc aucun recadrage**, interpolation bicubique haute
qualité, contrôle visuel fait sur le rendu. L'icône et la bannière sont des
**copies sans ré-échantillonnage** (elles étaient déjà aux dimensions demandées ;
les ré-échantillonner les adoucirait). Le jeu natif 720×1600 de
`apkpure-upload/` reste conforme lui aussi : dépose l'un ou l'autre, pas les deux.

## Réglages du compte dev APKPure

- Category : Finance
- Contenu : aucune publicité, aucun achat intégré, aucun lien externe de
  tracking ; pas de contenu classé.
- Âge : tout public (16+ recommandé par la politique de l'application).
- Langue principale : Français (+ Anglais).

## Exécution — les 4 gestes qui n'appartiennent qu'à toi

Le 2026-10-01, tout le reste a été fait et vérifié par l'agent. Ces quatre
actions touchent tes comptes ou l'interface du téléphone : l'automatisation est
refusée par la politique de sécurité de la session, y compris sur demande
expresse. À faire dans cet ordre.

**1. Vérifier les empreintes Google (30 s, console uniquement — a priori RIEN à
modifier)** — le diagnostic « SHA-1 release manquant chez Firebase » est **faux**,
vérifié sur les fichiers le 2026-10-01 :
- `apksigner verify --print-certs` sur vc95 donne SHA-1
  `D0:7E:09:36:0A:EB:AA:F9:9C:89:AA:9F:82:1F:7A:7F:FA:F6:1D:0A` (identique à
  vc94 : même keystore), et
  `android/app/google-services.json` (modifié le 28 sept.) contient déjà un client
  **Android** (oauth_client `793106571941-adscuojrbdlovolif195889b993kue5c.apps.googleusercontent.com`)
  dont le `certificate_hash` est exactement `D07E0936…`. Le SHA-1 est donc
  enregistré : **aucune action sur la console Firebase, aucun re-téléchargement
  du fichier, aucun rebuild.** L'APK vc95 reste bon à téléverser.
- Le `androidClientId` de `capacitor.config.json` (pointant sur le client debug)
  est **du code mort** : `AuthContext.jsx:14-20` passe `clientId` (le client web
  `…-co6ftihch6vi1r5s9589bu8pl9thshud`) à `GoogleAuth.initialize()`, et le Java du
  plugin (`GoogleAuth.initialize`, lignes 172-180) prend `call.getData().getString("clientId", configClientId)`
  — l'appel prime sur la config. Prouvé dans l'APK : `assets/public/assets/index-LqfUijwo.js`
  (vc95) ne contient que `co6ft…`, aucune occurrence de `29pnbau27…` (mêmes
  vérifications que sur vc94). Ne pas « corriger »
  cette ligne : elle forcerait un rebuild et casserait les empreintes ci-dessus.

Deux points restent **invérifiables sans tes comptes** :
- `co6ft…` est-il un client OAuth **« Web »** du projet Google Cloud `793106571941` ?
  `google-services.json` n'en déclare aucun (ni `client_type` 3, ni entrée web dans
  `other_platform_oauth_client`, ce qui explique l'absence de
  `default_web_client_id` dans les ressources de l'APK). Console Google Cloud →
  API & services → Identifiants, chercher cet ID.
- ~~Le worker accepte-t-il cette audience ?~~ **Vérifié le 2026-10-01 : oui, la
  liste est déjà complète, il n'y a rien à modifier.** Dans
  `cloudflare-worker/wrangler.toml` (section `[vars]`, donc non secrète),
  `GOOGLE_SERVER_CLIENT_ID` **est** `…-co6ftihch6vi…`, la valeur exacte que l'app
  présente comme audience — et `GOOGLE_ANDROID_CLIENT_IDS` contient les deux
  clients Android (debug + release). `verifyGoogle`
  (`cloudflare-worker/src/index.js:520-539`) accepte donc `co6ft…` ; cette ligne
  `GOOGLE_SERVER_CLIENT_ID` est commitée de longue date, elle est en production
  depuis avant vc94. **Corollaire** : si la connexion Google échoue, le refus ne
  vient pas du worker mais de l'étape native en amont (aucun `idToken` produit →
  aucune requête `auth2/google` → aucune ligne `[google:aud]` dans les logs
  Cloudflare). Les logs ne servent qu'à confirmer ça : Workers & Pages →
  tontine-sync → Logs, puis toucher « Continuer avec Google » sur le téléphone.
  Aucune ligne `[google:aud]` = le client web `co6ft…` est le coupable.

**2. Rotation du secret du worker legacy `tontine-notifier`** — le bearer
embarqué dans les builds ≤ vc87 est extraction depuis l'APK.
Workers & Pages → tontine-notifier → Settings → Variables and Secrets →
supprimer la valeur de `NOTIF_TOKEN` et la remplacer par une neuve
(`openssl rand -hex 32`), **sous ce nom exact** (le client legacy envoyait
l'en-tête `X-Notif-Token`, le worker comparait à `env.NOTIF_TOKEN`) → Save and
deploy. Vérifié : `tontine-sync` n'appelle pas ce worker (il fabrique son propre
token OAuth FCM v1, `cloudflare-worker/src/index.js:255-266`), donc vc94
continue de notifier ; seules les vieilles builds perdent leurs notifications de
discussion. **Ne pas `wrangler delete`** : le code source de ce worker n'existe
que dans Cloudflare (rien dans le dépôt ni dans l'historique git).

**3. Captures des écrans monétaires** (optionnel mais vend mieux) — sur le
téléphone : Accueil → « Essayer avec une tontine de démonstration » → ouvrir le
groupe → Calendrier, Épargne, Stats/Bilan, Assistant IA. Un mot par écran et
l'agent capture et nomme.

**4. Téléversement APKPure** — les six fichiers sont **réunis et prêts à glisser**
dans `releases/apkpure-upload/`, nommés dans l'ordre de dépôt :

| Fichier | Rôle sur la fiche |
| --- | --- |
| `Tontine-Manager-v2.3.0-vc95.apk` | l'APK (4 360 317 o) |
| `icon-512x512-opaque.png` | **icône à téléverser** (512×512, 24 bpp RGB sans canal alpha, 29 703 o, SHA-256 `41b5b37eb4a0f1b41d86516f71b9f3a651f6d5eec96d5a5a919a5199ee174776`) |
| `icon-512x512.png` | l'original RGBA à **coins transparents** (6 % de pixels translucides, forme arrondie) — à ne PAS déposer si le formulaire refuse la transparence ; garder comme référence |
| `screenshot-1-accueil.png` → `screenshot-4-reply.png` | les 4 captures 720×1600 |
| `../banniere-1024x500.png` | visuel de vitrine (feature graphic), si le formulaire le demande |

`icon-512x512-opaque.png` est l'original aplati sur `#12132A` (la couleur
d'arrière-plan de l'app, `capacitor.config.json → backgroundColor`) par
`releases/aplatir-icone.ps1`, contrôle inclus : 0 pixel translucide sur 4096
échantillonnés, coin (0,0) = `18,19,42`, centre = le jaune du monogramme. Même
visuel, mais accepté par les validateurs les plus stricts.

Ce sont des **copies** : les originaux (`releases/…`, `public/logo-512.png`) sont
intacts, et le SHA-256 du copié a été revérifié identique à
`a5fa08d346b7700adce6b68198e95aa46e28acaeaf50062ca24a05c82c97db3c`. Le texte à
coller champ par champ est plus haut (« Titre », « Description courte »,
« Description longue », « Notes de version 2.3.0 », « Réglages du compte dev »).

Après la mise en ligne : **l'agent ne peut pas contrôler le résultat
automatiquement** — `https://apkpure.com/com.tontine.manager` répond **403 Forbidden**
aux requêtes automatisées (mesuré le 2026-10-01), donc ni veille ni comparaison à
distance. Pour prouver que le binaire publié est bien celui vérifié, télécharge
l'APK depuis la page en ligne dans `releases/apkpure-apre/` et l'agent recalcule le
SHA-256 et le compare.

## Si la connexion Google est cassée : aucun nouveau APK nécessaire

C'est le point qui rend la publication immédiate sans risque. L'ID de client OAuth
utilisé par l'app est une **constante JavaScript** (`src/context/AuthContext.jsx:14`,
`GOOGLE_CLIENT_ID_WEB`), embarquée dans le bundle web — pas dans le binaire natif.
Or `installerMiseAJour()` (`src/lib/miseAJour.js:149-204`) fait
`CapacitorUpdater.download()` puis `.set()` : le bundle web est **entièrement
remplacé** sur l'appareil, le texte du rappel natif le dit lui-même (« aucune
réinstallation de l'APK nécessaire »). Le plugin natif, lui, lit son `clientId` de
l'appel `initialize()` (`GoogleAuth.java:180`), donc il suit le nouveau bundle.

Conséquence : **publier vc95 maintenant n'enferme rien.** Si le contrôle Google
Cloud ci-dessus révèle que `…-co6ftihch6vi…` n'est pas un client Web du projet
`793106571941`, la correction est : créer (ou relever) le client Web → remplacer la
constante → `vite build` → publier `bundle-2.3.1.zip` + `update.json` en 2.3.1, par
la même chaîne que celle validée pour le 2.3.0. Les installs existantes reçoivent
la correction sans retélécharger l'APK, et la fiche du store ne bouge pas.

Seule limite : `autoUpdate` est sur `"off"` dans `capacitor.config.json`, donc le
bundle n'est pas posé tout seul — l'utilisateur confirme dans l'app (Réglages →
mise à jour), ou attend le rappel quotidien 10h00. Un testeur qui ne rouvre jamais
les réglages restera sur le bundle d'origine.

## Déjà terminé et vérifié

- Quatre blocages de publication levés : secret retiré du bundle (0 occurrence
  dans `dist` et dans l'APK), permissions micro/contacts/caméra/storage
  neutralisées sur le manifeste fusionné, PIN ou biométrie exigé avant toute
  action financière, politique de confidentialité complétée et hébergée.
- Build release signé, non debuggable, mapping R8 archivé
  (`releases/mapping-2.2.1-vc94.txt`), installé et lancé sur le Xiaomi.
- **Build 2.3.0/vc95** signé (release, non debuggable), bundle web vérifié :
  badge V 2.3.0, code des rappels WhatsApp présent, aucun sourcemap, aucun
  secret ; permissions et certificat identiques à vc94. Mapping archivé :
  `releases/mapping-2.3.0-vc95.txt`.
- **vc95 installée et lancée sur le Xiaomi** (2026-10-01 23:10) : `dumpsys
  package` = versionCode 95 / 2.3.0, premier lancement sans crash. Connexion
  Google : erreur 10 (DEVELOPER_ERROR) — la constante web
  `…-co6ftihch6vi…` (`AuthContext.jsx:14`) n'est pas confirmée comme client
  **Web** du projet 793106571941, tandis que les deux empreintes Android
  (debug + release `d07e0936…`) sont bien dans `google-services.json`. vc94
  avait le même comportement (constante introduite le 28/09) : non-régression.
  Correctif sans rebuild de l'APK : client Web créé/vérifié en console →
  remplacer la constante → bundle OTA 2.3.1 + `GOOGLE_SERVER_CLIENT_ID` du
  worker.
- **Conformité 2.3.0** : politique de confidentialité complétée de la section
  « Rappels WhatsApp envoyés par le serveur (facultatif) » et du sous-traitant
  Meta — dans les trois miroirs (`PRIVACY.md`, page hébergée `/privacy`,
  écrans in-app FR/EN) ; version de politique `2026-10-01.2` ; fiche APKPure
  corrigée (l'affirmation « les numéros ne quittent pas l'appareil » n'y figure
  plus nulle part).
- Routes publiques en ligne : `/privacy` (+ alias `/confidentialite`) et
  `/suppression` avec formulaire RGPD fonctionnel.
- **OTA 2.2.1 publiée** : commit `cb84b9e` du dépôt `tontine-manager-ota`,
  `bundle-2.2.1.zip` 779 288 o SHA-256
  `2525a3c20be93aacaa257529cfe8441f4b17558c9983294fcda01c1fbdd09df3`, revérifié
  après re-téléchargement et prouvé identique au bundle embarqué dans vc94.
  Retour arrière : re-pousser `update.json` en 2.0.1.
- **OTA 2.3.0 publiée** : commit `20498da` du dépôt `tontine-manager-ota`,
  `bundle-2.3.0.zip` 780 953 o SHA-256
  `702fb702835b2c7fda8cdbdaaa15b1acad8c05f0500c22927f5e36ba271e739d`,
  revérifié après re-téléchargement depuis GitHub, et **prouvé byte-identique
  au bundle embarqué dans vc95** (`diff -r` dist vs `assets/public` de l'APK :
  58/58 fichiers identiques). Retour arrière : re-pousser `update.json` en 2.2.1.
- **OTA 2.3.1 publiée** (2026-10-02) : commit `75467e6` du dépôt
  `tontine-manager-ota` (re-push du bundle), `bundle-2.3.1.zip` 780 939 o
  SHA-256
  `a7caedb8b77b75c17c45d117253e4eda31dfa7f15a7fba55a3abf7503b7202ff`,
  revérifié après re-téléchargement depuis GitHub (update.json en ligne =
  2.3.1). Contenu : nouveau client OAuth Web `…-tva6kieobdac95…`
  (`AuthContext.jsx:14`, `capacitor.config.json`, Info.plist) + badge V 2.3.1
  + correctif web `push.js` (ci-dessous).
  Worker redéployé dans la foulée : Version ID
  `04c45186-0b40-43a1-a2b8-97268a63dda3`, `GOOGLE_SERVER_CLIENT_ID` = nouveau
  client (liste blanche `src/index.js:822`). Validation finale de l'erreur 10 :
  sur le téléphone, Réglages → mise à jour puis « Se connecter avec Google ».
- **Correctif web trouvé au test navigateur** (2026-10-02) : au démarrage,
  `TypeError: o2(...).then is not a function` — `App.jsx:103` chaîne `.then()`
  sur `surNotificationPremierPlan()` (`push.js`), qui renvoyait une fonction
  synchrone sur web (`firebase.js:61`) au lieu d'une Promise ; le chemin natif
  étant async, le plantage était 100 % web (écran d'erreur au lieu du login).
  Corrigé : `Promise.resolve(...)` sur la branche web. Re-poussé le même jour
  sous 2.3.1 (commit `75467e6`, hash `a7caedb8…` ci-dessus) avant qu'aucun
  téléphone ne consomme le bundle ; le chemin natif du téléphone était intact.
- **Origines localhost du client Web** (2026-10-03) : `http://localhost:4173`
  et `http://localhost:5173` ajoutées aux « Origines JavaScript autorisées ».
  Vérifié en navigateur : instance `gapi.auth2` initialisée sur
  `localhost:4173` (pas d'`origin_mismatch`) → origine et client Web valides
  pour le flux web. Le popup de connexion reste impossible dans le navigateur
  automatisé (`window.open` bloqué) : la connexion réelle se fait dans le
  navigateur de l'utilisateur ou sur le téléphone.
- **Worker `tontine-sync` déployé** : Version ID `66e28675-9ea9-4b3a-a841-78cb38a3eed8`,
  routes `/whatsapp/{code}` + webhook `/whatsapp/webhook` en ligne, 57 tests
  verts avant deploy ; `/privacy` en ligne vérifié « révision 2 / version 2.3.0 »
  avec la section Meta. Webhook sans config → 403, route inconnue → 401 : les
  gardes sont actives. Sans secrets `WA_*` la fonctionnalité reste dormante et
  l'app garde l'ouverture `wa.me`.
- Worker legacy `tontine-notifier` toujours vivant et sa porte fermée aux jetons
  inconnus : `GET /` → 405, `POST /` sans jeton → 401, avec faux jeton → 401.
