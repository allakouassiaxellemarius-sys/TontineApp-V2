# Tontine Manager

Application mobile (Android en production, iOS générable) de gestion de tontine : membres, tours,
cotisations, pénalités, historique et export. Elle fonctionne **hors ligne par défaut** (données dans
`localStorage`) et peut se synchroniser en ligne quand l'utilisateur l'active.

Version du source : **2.3.16** (`package.json`, `src/lib/version.js`). L'APK embarqué le plus récent est
**versionCode 99 / 2.3.9** (`android/app/build.gradle`) : les versions postérieures sont livrées par OTA,
l'APK n'est reconstruit qu'à la demande.

## Fonctionnalités

- **Groupes** : tontines multiples (nom, nombre de membres, montant, cycle, devise, date de départ).
- **Membres** : nom + téléphone, rôle, état de contribution.
- **Tours** : planification générée (`generateTours`), receveur désigné, avancement `tour n / total`.
- **Cotisations et pénalités** : retard en % par jour, plafonné, appliqué au bilan.
- **Rappels** : messages pré-remplis via WhatsApp (`wa.me`). Les rappels SMS (Twilio) et les rappels
  WhatsApp automatisés sont **présents dans l'UI mais dormants** : ils exigent des identifiants côté
  serveur qui ne sont pas configurés.
- **Export** : PDF (jsPDF) et tableur Excel/CSV (SheetJS).
- **Discussion de groupe** et **assistant IA** (via le worker).
- **Sécurité locale** : code PIN (SHA-256 + sel) ou biométrie, session dans un stockage chiffré.
- **Synchro en ligne** : code d'invitation court, téléchargement du groupe par le membre, mises à jour
  en lecture depuis le cloud. Le parcours de cotisation s'appuie sur un **lien de paiement externe fourni
  par la plateforme**, imposé côté serveur : l'application ne stocke ni ne traite aucun numéro de carte,
  CVV ou secret d'API de paiement.
- **Mise à jour à distance (OTA)** : bundle web remplacé sans passer par le store.
- Mode sombre/clair, langues, devises configurables.

## Technologies

React 18.3 · Vite 6 · Tailwind CSS 3.4 · **Capacitor 8** (`@capacitor/*`, `@capgo/capacitor-updater` 8,
`@capgo/capacitor-native-biometric`) · react-router 7 · jsPDF 4 + jspdf-autotable · SheetJS xlsx 0.20.3 ·
lucide-react · Firebase 12 (**uniquement** Messaging/FCM pour les notifications push) · stockage
`localStorage`.

Backend : **Cloudflare Worker** `tontine-sync` + base **D1** `tontine-db`
(`cloudflare-worker/`, URL `https://tontine-sync.tontine-manager.workers.dev`), authentification Google
(`@codetrix-studio/capacitor-google-auth`).

## Développement

```bash
npm install
npm run dev        # aperçu navigateur (Vite)
npm run build      # build web -> dist/
npx cap sync android
```

## Tests (ce qui est réellement exécuté)

```bash
node repack/simulation-globale.mjs          # harnais client : 141 contrôles sur la source vivante
cd cloudflare-worker && npm test            # suite serveur : 77 tests (node --test)
npx vite build                              # build + contrôles de contenu dans dist/
```

Le harnais monte les modules de `src/` avec `localStorage` et `fetch` factices ; ses sections 14/15/16
couvrent le compte de collecte, sa descente jusqu'au membre et le régime d'administration. Le
répertoire `repack/` n'est pas suivi par git.

## Synchronisation en ligne (Worker + D1)

1. Déployer le worker : `cd cloudflare-worker && npx wrangler d1 create tontine-db`, reporter l'
   `database_id` dans `wrangler.toml`, puis `npx wrangler d1 migrations apply tontine-db --remote` et
   `npx wrangler deploy`.
2. Côté app, la synchro s'active **groupe par groupe** (Réglages du groupe → Synchronisation), qui
   génère le code d'invitation à 6 caractères.
3. Un membre saisit ce code dans « Rejoindre avec un code » ; le snapshot descendant est relu et
   normalisé avant d'écrire en local.

> ⚠️ L'écriture des données partagées est verrouillée côté serveur : seul l'administrateur de la
> plateforme peut modifier un groupe, le compte de collecte est réimposé à chaque lecture et à chaque
> écriture. Aucun webhook de paiement, aucune écriture silencieuse : le cloud ne rend que des verdicts.

## Mise à jour à distance (OTA)

`src/lib/miseAJour.js` compare la version embarquée au manifeste `update.json`
(`{ version, url }`) hébergé sur `raw.githubusercontent.com` (le CDN de `raw` n'est pas purgé, d'où ce
choix), puis laisse `@capgo/capacitor-updater` installer le zip. Empaquetage : `scripts/pack-ota.py`
(**séparateurs `/` obligatoires** dans le zip, sinon l'installation échoue sur Android).

## Compilation de l'APK (Android)

```powershell
powershell -ExecutionPolicy Bypass -File scripts\build-apk.ps1             # debug
powershell -ExecutionPolicy Bypass -File scripts\build-apk.ps1 -Release    # release signée
```

ou `npm run apk:debug` / `npm run apk:release` (build web + `cap sync` + Gradle).

- Keystore : `keystore\tontine-release.jks` (alias `tontine`), mot de passe dans
  `keystore\password.txt`, config Gradle `android\app\build.gradle` + `keystore\keystore.properties`.
- Ces trois fichiers sont **hors dépôt** (`.gitignore`) : leur perte empêche de réinstaller une version
  plus récente par-dessus l'existante. Les conserver hors machine.

## Compilation iOS

Le projet Xcode est dans `ios\` (généré par Capacitor, bundle id `com.tontine.manager`) ; il se compile
uniquement sur macOS avec Xcode :

```bash
npm install && npm run build && npx cap sync ios
cd ios/App && pod install && open App.xcodeproj
```

Sélectionner l'équipe de signature, puis *Run* ou *Archive* (compte Apple Developer pour installer sur
un appareil).

## Icônes

```powershell
powershell -ExecutionPolicy Bypass -File scripts\generate-icons.ps1
```

Régénère mipmaps et splash Android, icône iOS 1024×1024 + splash iOS, icônes web.

## Structure

```
src/
  lib/        logique métier : db, syncEngine, cloudApi, paiement, format, bornes, export, i18n, theme
  context/    DataContext, AuthContext, ActionsContext, ToastContext…
  components/ UI réutilisable (modales, menu, navigation basse)
  screens/    écrans + onglets (accueil, groupe, trésorerie, épargne, paramètres…)
  index.css   styles globaux — aucune animation (voir plus bas)
cloudflare-worker/  worker de synchronisation + D1 + sa suite de tests
android/ ios/       shells Capacitor
scripts/            build-apk.ps1, generate-icons.ps1, pack-ota.py
repack/             harnais de simulation (non suivi par git)
```

## Notes

- Données locales par défaut : aucune connexion ni serveur requis tant que la synchro n'est pas activée.
- **L'application n'anime plus rien** : plus de `@keyframes`, plus de classe `animate-*`/`transition-*`,
  et un garde-fou global `*, *::before, *::after { animation: none !important; transition: none !important }`
  (`src/index.css:526-531`). Sans animation, un élément rend son état final — c'est ce qui empêche le bug
  des modales bloquées à `opacity: 0`. L'option « Mode léger » ne coupe plus des animations : elle masque
  le fond décoratif flou.
- Les liens WhatsApp fonctionnent uniquement si WhatsApp est installé sur l'appareil.
- Le PIN oublié n'est pas récupérable : l'app se réinitialise.
