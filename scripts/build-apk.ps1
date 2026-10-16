# ═══════════════════════════════════════════════════════════════
# Tontine Manager - Build APK Android
# Installe le SDK Android si absent, puis compile l'APK.
# Usage :
#   powershell -ExecutionPolicy Bypass -File scripts\build-apk.ps1            (debug)
#   powershell -ExecutionPolicy Bypass -File scripts\build-apk.ps1 -Release  (release signée)
# ═══════════════════════════════════════════════════════════════
param([switch]$Release)
$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot

$sdkDir = "C:\Users\$env:USERNAME\AppData\Local\Android\Sdk"
$env:ANDROID_HOME = $sdkDir
$env:ANDROID_SDK_ROOT = $sdkDir

# ── 1. Vérifier/installer le SDK Android ──────────────────────
if (-not (Test-Path (Join-Path $sdkDir "cmdline-tools"))) {
  Write-Host "SDK Android absent. Installation en cours (téléchargement via curl, cela peut prendre plusieurs minutes)..."
  $toolsZip = Join-Path $env:TEMP "cmdline-tools.zip"
  if (Test-Path $toolsZip) { Remove-Item $toolsZip }
  & curl.exe -L --fail --retry 5 -C - -o $toolsZip "https://dl.google.com/android/repository/commandlinetools-win-11076708_latest.zip"
  if ($LASTEXITCODE -ne 0 -or -not (Test-Path $toolsZip)) { throw "Échec du téléchargement du SDK Android" }
  New-Item -ItemType Directory -Path (Join-Path $sdkDir "cmdline-tools") -Force | Out-Null
  Expand-Archive -Path $toolsZip -DestinationPath (Join-Path $sdkDir "cmdline-tools\latest") -Force
  if (Test-Path (Join-Path $sdkDir "cmdline-tools\latest\cmdline-tools")) {
    Move-Item (Join-Path $sdkDir "cmdline-tools\latest\cmdline-tools\*") (Join-Path $sdkDir "cmdline-tools\latest") -Force
  }
  Remove-Item $toolsZip
}

$sdkManager = Join-Path $sdkDir "cmdline-tools\latest\bin\sdkmanager.bat"
if (-not (Test-Path $sdkManager)) {
  throw "sdkmanager introuvable. Installez Android Studio ou placez le SDK dans $sdkDir"
}

# ── 2. Accepter les licences (écriture directe des fichiers) ──
Write-Host "Acceptation des licences SDK..."
$licDir = Join-Path $sdkDir "licenses"
New-Item -ItemType Directory -Path $licDir -Force | Out-Null
Set-Content -Path (Join-Path $licDir "android-sdk-license") -Value "24333f8a63b6825ea9c5514f83c2829b004d1fee" -NoNewline
Set-Content -Path (Join-Path $licDir "android-sdk-preview-license") -Value "84831b9409646a918e30573bab4c9c91346d8abd" -NoNewline
Set-Content -Path (Join-Path $licDir "android-sdk-arm-dbt-license") -Value "859f3175f83ef7f413c1fcf0c6b0a98a7e1f5d3c" -NoNewline

# ── 3. Installer les composants requis ────────────────────────
# sdkmanager ecrit ses avertissements ("Warning: This version only understands
# SDK XML versions up to 3...") sur stderr : avec $ErrorActionPreference='Stop',
# le pipeline 2>&1 les transforme en NativeCommandError terminating et tue le
# script avant meme Gradle. On abaisse la preference le temps de l'appel et on
# juge $LASTEXITCODE, comme dans publish-ota.ps1.
Write-Host "Installation des composants SDK (platform-34, build-tools, platform-tools)..."
$prevEAP = $ErrorActionPreference
$ErrorActionPreference = 'Continue'
& $sdkManager "platform-tools" "platforms;android-34" "build-tools;34.0.0" 2>&1 | Out-Null
$rcManager = $LASTEXITCODE
$ErrorActionPreference = $prevEAP
if ($rcManager -ne 0) { throw "Échec de l'installation des composants SDK" }

# ── 4. local.properties (pointe vers le SDK) ───────────────────
Set-Content -Path (Join-Path $root "android\local.properties") -Value "sdk.dir=$($sdkDir.Replace('\', '/'))"

# ── 4bis. JDK 21 explicite ────────────────────────────────────
# Capacitor 8 compile en Java 21. JAVA_HOME global pointe sur un JDK 17 (et le
# PATH sur un Temurin 8 selon la console), ce qui fait echouer la tache
# compileReleaseJavaWithJavac sur « error: invalid source release: 21 ». On
# resout un JDK 21 installe sur la machine, sans modifier l'environnement systeme.
function Resolve-Jdk21 {
  $prev = $ErrorActionPreference
  $ErrorActionPreference = 'Continue'   # java -version ecrit sur stderr
  try {
    foreach ($c in @($env:JAVA_HOME,
                     "C:\Program Files\Eclipse Adoptium\jdk-21.0.12.101-hotspot",
                     "C:\Users\$env:USERNAME\dev-tools\jdk-21.0.12.1+1",
                     "C:\Program Files\Android\Android Studio\jbr")) {
      $exe = if ($c) { Join-Path $c "bin\java.exe" } else { $null }
      if ($exe -and (Test-Path $exe)) {
        $v = (& $exe -version 2>&1 | Select-Object -First 1) -join ''
        if ($v -match '"21') { return $c }
      }
    }
  } finally { $ErrorActionPreference = $prev }
  return $null
}
$jdk = Resolve-Jdk21
if (-not $jdk) { throw "Aucun JDK 21 trouve : Capacitor 8 exige Java 21 (JAVA_HOME = $env:JAVA_HOME)" }
$env:JAVA_HOME = $jdk
Write-Host "JDK utilise : $jdk"

# ── 5. Build web + sync Capacitor + Gradle ────────────────────
Write-Host "Build web..."
Push-Location $root
cmd /c "npm.cmd run build"
if ($LASTEXITCODE -ne 0) { throw "Build web échoué" }
cmd /c "npx.cmd cap sync android"
Pop-Location

Write-Host "Compilation APK (première fois : téléchargement de Gradle, patience)..."
$task = if ($Release) { "assembleRelease" } else { "assembleDebug" }
Push-Location (Join-Path $root "android")
$prevEAP2 = $ErrorActionPreference
$ErrorActionPreference = 'Continue'
& .\gradlew.bat $task -x lintVitalRelease -x generateReleaseLintModel -x lint
$rcGradle = $LASTEXITCODE
$ErrorActionPreference = $prevEAP2
Pop-Location
if ($rcGradle -ne 0) { throw "Gradle a échoué" }

$variant = if ($Release) { "release" } else { "debug" }
$apk = Join-Path $root "android\app\build\outputs\apk\$variant\app-$variant.apk"
if (Test-Path $apk) {
  $outDir = Join-Path $root "dist-apk"
  New-Item -ItemType Directory -Path $outDir -Force | Out-Null
  # Nom derive de build.gradle : le "v1.10.0" fige dans ce script produisait des
  # APK dont le nom contredisait le versionName embarque.
  $gradle = Get-Content (Join-Path $root "android\app\build.gradle") -Raw
  $num = if ($gradle -match 'versionName\s+"([^"]+)"') { $Matches[1] } else { "inconnue" }
  $code = if ($gradle -match 'versionCode\s+(\d+)') { $Matches[1] } else { "0" }
  $friendly = "Tontine-Manager-v$num-vc$code-$variant.apk"
  Copy-Item $apk (Join-Path $outDir $friendly) -Force
  Write-Host ""
  Write-Host "✔ APK $variant : $apk"
  Write-Host "  Copie : $outDir\$friendly"
  if ($Release) { Write-Host "  Installable sur le téléphone (activer 'sources inconnues')." }
} else {
  Write-Host "APK introuvable (vérifiez la sortie Gradle)."
}
