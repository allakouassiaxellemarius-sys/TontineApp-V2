# ═══════════════════════════════════════════════════════════════
# Empaguète et publie une mise à jour à distance
# ---------------------------------------------------------------
# 1. Construit le bundle web (vite build)
# 2. Compresse dist/ en un zip "tontine-vX.Y.Z.zip" (index.html à la
#    racine, exigence de @capgo/capacitor-updater)
# 3. Génère update.json { version, url } pointant vers le zip
# 4. Publie dans le dépôt GitHub OTA (mode "github", par défaut)
#    ou prépare le dossier Netlify (mode "netlify", historique)
#
# La version est lue depuis package.json.
# ═══════════════════════════════════════════════════════════════
param(
  [ValidateSet("github", "netlify")]
  [string]$Mode = "github",
  [string]$Url = "",
  [string]$Site = "tontine-manager.netlify.app",
  [string]$GhOwner = "allakouassiaxellemarius-sys",
  [string]$GhRepo = "tontine-manager-ota",
  [string]$GhBranch = "main",
  [string]$GhClone = "$env:TEMP\opencode\ota-gh",
  [switch]$Push
)

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
$dist = Join-Path $root "dist"
$out = Join-Path $root "netlify-update"

# 1. Build du bundle web
Write-Host "==> Build vite..." -ForegroundColor Cyan
Push-Location $root
npm.cmd run build
if ($LASTEXITCODE -ne 0) { throw "Build failed" }
Pop-Location

# 2. Version depuis package.json
$pkg = Get-Content (Join-Path $root "package.json") -Raw | ConvertFrom-Json
$version = $pkg.version
$zipName = "tontine-v$version.zip"

# 3. Zip du contenu de dist/ (index.html à la racine du zip)
Write-Host "==> Creation du zip $zipName ..." -ForegroundColor Cyan
# IMPORTANT : Compress-Archive et ZipFile.CreateFromDirectory (.NET Framework)
# créent des entrées avec des antislashs ("\") que le plugin Android
# (@capgo/capacitor-updater, resolvePathInsideDirectory) rejette avec
# "Unzip failed: Windows path not supported". tar (bsdtar, inclus avec
# Windows 10+) écrit des séparateurs "/" conformes au format ZIP.

function Build-Zip([string]$Dest) {
  if (Test-Path $Dest) { Remove-Item -Force $Dest }
  tar -a -c -f $Dest -C $dist .
}

function New-Manifest([string]$Dir, [string]$FinalUrl) {
  $manifest = [ordered]@{
    version = $version
    url     = $FinalUrl
  }
  $manifest | ConvertTo-Json | Set-Content (Join-Path $Dir "update.json") -Encoding UTF8
}

if ($Mode -eq "github") {
  # Dépôt OTA : publier zip + update.json dans le clone local, puis pousser
  if (-not (Test-Path (Join-Path $GhClone ".git"))) {
    throw "Clone OTA introuvable : $GhClone (initialisez le depot GitHub puis `git clone`)."
  }
  $zipPath = Join-Path $GhClone $zipName
  Build-Zip $zipPath
  if (-not $Url) { $Url = "https://raw.githubusercontent.com/$GhOwner/$GhRepo/$GhBranch/$zipName" }
  New-Manifest $GhClone $Url

  Write-Host "OK — publie dans le depot OTA :" -ForegroundColor Green
  Write-Host "   $zipPath" -ForegroundColor White
  Write-Host "   update.json -> $Url" -ForegroundColor White
  Write-Host ""
  Push-Location $GhClone
  git add -A
  git commit -m "OTA $version" 2>$null | Out-Null
  if ($Push -or $LASTEXITCODE -eq 0) {
    if (-not $Push) {
      Write-Host "En attente du push (ajoutez -Push pour publier automatiquement)." -ForegroundColor Yellow
    } else {
      git push origin $GhBranch
      Write-Host "Pousse OK — verifiez :" -ForegroundColor Green
      Write-Host "   $Url" -ForegroundColor White
    }
  }
  Pop-Location
} else {
  # Mode historique Netlify
  $zipPath = Join-Path $out $zipName
  if (Test-Path $out) { Remove-Item -Recurse -Force $out }
  New-Item -ItemType Directory -Path $out | Out-Null
  Build-Zip $zipPath
  if (-not $Url) { $Url = "https://$Site/$zipName" }
  New-Manifest $out $Url
  $headers = @"
/update.json
  Access-Control-Allow-Origin: *

/$zipName
  Access-Control-Allow-Origin: *
"@
  Set-Content -Path (Join-Path $out "_headers") -Value $headers -Encoding UTF8
  Write-Host ""
  Write-Host "OK — deploiement pret dans :" -ForegroundColor Green
  Write-Host "   $out" -ForegroundColor White
  Get-ChildItem $out | ForEach-Object { Write-Host "   - $($_.Name)" }
  Write-Host ""
  Write-Host "Deposez le contenu de ce dossier sur Netlify, puis verifiez que :" -ForegroundColor Yellow
  Write-Host "   update.json  -> $Url" -ForegroundColor Yellow
  Write-Host "L'app (v1.11.0+, plugin CapacitorUpdater) detectera la mise a jour au prochain lancement." -ForegroundColor Yellow
}
