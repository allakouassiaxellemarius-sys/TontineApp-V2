# Tontine Manager

Application mobile (Android & iOS) de gestion de tontine fixe, 100 % hors ligne (données stockées localement sur l'appareil).

## Fonctionnalités

- **Groupes** : créer plusieurs tontines (nom, nombre de membres, montant de la cotisation, cycle, devise).
- **Membres** : ajout avec nom + téléphone (WhatsApp), contribution au pot (totale/partielle/refus).
- **Tours** : planification automatique des tours (espacés du cycle choisi), attribution du receveur, versement du pot.
- **Pénalités** : retard = % de la cotisation par jour, plafonné, appliqué automatiquement au bilan.
- **Rappels** : génération de messages + lien WhatsApp (`wa.me`) et SMS (Twilio) pour les membres en retard.
- **Historique** : chaque versement enregistré (payé/reçu), solde par membre.
- **Export** : PDF (jsPDF) et Excel/CSV (membres, tours, historique).
- **Sécurité** : code PIN optionnel (verrouillage de l'app).
- **Synchro en ligne (optionnelle)** : le responsable active la synchronisation et partage un **code court
  d'invitation (6 caractères)**. Les invités tapent ce code dans « Rejoindre un groupe », l'app télécharge la
  tontine depuis la Firebase Realtime Database, puis affiche les mises à jour du responsable (membres, tours,
  cotisations) en direct, tout en restant en lecture seule.
- **Mode sombre/clair**, devise configurable (XOF, FCFA, EUR, USD...), pénalités activables/désactivables.

## Technologies

React 18 · Vite 6 · Tailwind CSS 3 · Capacitor 6 · jsPDF · lucide-react · Firebase (Realtime Database, optionnel) · stockage `localStorage`.

## Prérequis

- Node.js 18+
- **Android** : Android Studio (ou le SDK Android + JDK 17+) pour compiler l'APK
- **iOS** : macOS + Xcode 15+ + CocoaPods (la compilation iOS n'est pas possible sous Windows)

## Développement

```bash
npm install
npm run dev        # aperçu navigateur (http://localhost:5173)
npm run build      # build web (dist/)
npx cap sync android
npx cap sync ios
```

## Synchronisation en ligne (Firebase)

La synchro est **optionnelle** : sans configuration, l'app reste 100 % locale. Pour l'activer :

1. Créez un projet sur https://console.firebase.google.com (plan Spark gratuit).
2. **Project settings → Vos applications → `</>` (Web)** → copiez la configuration du SDK
   (les 6 champs + `databaseURL`).
3. Collez les champs dans **`src/lib/firebaseConfig.js`** (le fichier contient les instructions complètes).
4. Créez la **Realtime Database** (Build → Realtime Database, mode de production — déjà fait :
   `tontine-manager-f3965-default-rtdb`).
5. Onglet **Règles** de la Realtime Database, sous `tontines` :

```
{
  "rules": {
    "tontines": {
      "$tontineId": { ".read": true, ".write": true }
    }
  }
}
```

6. Compilez à nouveau (l'app n'est pas publiée sans cette config). Dans un groupe → **Réglages →
   Partager / Inviter** (générez le code) puis **Synchronisation en ligne → Activer**, et partagez le code
   court à vos invités.

> ⚠️ Les invités restent en **lecture seule** : ils voient les mises à jour du responsable en direct
> (connexion internet requise des deux côtés), mais ne peuvent pas modifier le groupe. Rejoindre un groupe
> nécessite la synchro active du responsable (les données sont téléchargées depuis le cloud).
> `apiKey` côté client n'est pas un secret ; les règles ci-dessus permettent à quiconque possède le code
> de lire/écrire le document — pour une diffusion publique, ajoutez une authentification Firebase.

## Compilation de l'APK (Android)

Script PowerShell qui installe le SDK Android si nécessaire puis compile :

```powershell
powershell -ExecutionPolicy Bypass -File scripts\build-apk.ps1             # APK debug
powershell -ExecutionPolicy Bypass -File scripts\build-apk.ps1 -Release    # APK release signée
```

APK déposés dans `dist-apk\` :
- `Tontine-Manager-v1.4.0-debug.apk`
- `Tontine-Manager-v1.4.0-release.apk` (signée avec `keystore\tontine-release.jks`)

Ou manuellement :

```bash
npm run apk:debug     # build web + cap sync + gradlew assembleDebug
npm run apk:release   # build web + cap sync + gradlew assembleRelease (signée)
```

### Signature (keystore)

- Keystore : `keystore\tontine-release.jks` (alias `tontine`, validité 10 000 jours)
- Mot de passe : `keystore\password.txt`
- Config Gradle : `android\app\build.gradle` + `keystore\keystore.properties`

> ⚠️ Conservez le keystore et son mot de passe en lieu sûr (copie USB/cloud).
> Ils signent toutes les mises à jour de l'app ; leur perte empêche de réinstaller une
> version plus récente par-dessus une app déjà installée.

## Compilation iOS

Le projet Xcode est dans `ios\` (généré par Capacitor, version 1.4.0 / build 5, bundle id `com.tontine.manager`).
Il se compile uniquement sur un **Mac** avec Xcode :

```bash
# Sur le Mac, une fois le dossier ios/ copié :
npm install
npm run build
npx cap sync ios
cd ios/App && pod install
open App.xcodeproj
```

Dans Xcode : sélectionner l'équipe de signature (Signing & Capabilities), puis *Run* sur simulateur/appareil
ou *Archive* pour produire l'IPA (compte Apple Developer requis pour installer sur un appareil).
Icônes, splash et couleurs iOS sont déjà personnalisés (voir `scripts\generate-icons.ps1`).

## Icônes

```powershell
powershell -ExecutionPolicy Bypass -File scripts\generate-icons.ps1
```

Régénère : mipmaps Android (5 densités), splash Android, icône iOS 1024×1024 opaque + splash iOS 2732×2732,
et icônes web (favicon, logo-192, logo-512).

## Tests

```powershell
powershell -ExecutionPolicy Bypass -File scripts\test-business.ps1   # règles métier (Node)
powershell -ExecutionPolicy Bypass -File scripts\test-ui.ps1         # rendu des onglets (jsdom)
```

`test-business.ps1` copie les règles métier (`src/lib`) dans un répertoire temporaire
(imports adaptés pour Node) et exécute la suite de tests Node.
`test-ui.ps1` monte chaque onglet dans un DOM simulé (jsdom) pour détecter les erreurs
de rendu que le build ne voit pas (composant non importé, etc.).

## Structure

```
src/
  lib/        logique métier (db, penalty, remind, export, pin, format)
  context/    DataContext (données), PinContext (verrouillage)
  components/ UI réutilisable (modales, boutons, écran de chargement)
  screens/    écrans principaux + onglets (tableau de bord, membres, tours...)
scripts/      build-apk.ps1, generate-icons.ps1, test-business.ps1
android/      projet Android Capacitor (icônes générées)
ios/          projet Xcode Capacitor (icônes + splash personnalisés)
```

## Notes

- Toutes les données sont stockées localement (`localStorage`) : aucune connexion ni serveur requis.
  La synchronisation en ligne (optionnelle) utilise la Firebase Realtime Database ; sans configuration elle est désactivée.
- Le code PIN est haché (SHA-256 + sel) ; il n'est pas récupérable en cas d'oubli (réinitialisation de l'app).
- Les liens WhatsApp fonctionnent uniquement si WhatsApp est installé sur l'appareil.
