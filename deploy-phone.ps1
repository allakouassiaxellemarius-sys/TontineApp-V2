# Deploiement automatique sur le telephone branche en USB.
# Usage : powershell -ExecutionPolicy Bypass -File deploy-phone.ps1
# ou    : npm run deploy:phone
$ErrorActionPreference = 'Continue'
$project = "C:\Users\allak\OneDrive\Documents\New OpenCode Project\tontine-app"
$env:ANDROID_HOME = "C:\Users\allak\AppData\Local\Android\Sdk"
$env:ANDROID_SDK_ROOT = $env:ANDROID_HOME
$adb = Join-Path $env:ANDROID_HOME "platform-tools\adb.exe"
$npm = "C:\Program Files\nodejs\npm.cmd"
$npx = "C:\Program Files\nodejs\npx.cmd"

Set-Location $project

Write-Host "`n[1/4] Build web..." -ForegroundColor Cyan
& $npm run build
if ($LASTEXITCODE -ne 0) { Write-Host "Build web echoue" -ForegroundColor Red; exit 1 }

Write-Host "`n[2/4] Capacitor sync android..." -ForegroundColor Cyan
& $npx cap sync android
if ($LASTEXITCODE -ne 0) { Write-Host "cap sync echoue" -ForegroundColor Red; exit 1 }

Write-Host "`n[3/4] Build APK (gradle)..." -ForegroundColor Cyan
Set-Location android
& .\gradlew.bat assembleDebug
if ($LASTEXITCODE -ne 0) { Write-Host "Build Android echoue" -ForegroundColor Red; exit 1 }

Write-Host "`n[4/4] Installation sur le telephone..." -ForegroundColor Cyan
& $adb install -r "app\build\outputs\apk\debug\app-debug.apk"
if ($LASTEXITCODE -ne 0) { Write-Host "Installation echoue (telephone branche ?)" -ForegroundColor Red; exit 1 }

Write-Host "`nMise a jour installee sur le telephone.`n" -ForegroundColor Green
