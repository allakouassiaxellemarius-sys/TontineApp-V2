param(
  [string]$Version
)
$ErrorActionPreference = 'Stop'
$project = "C:\tontine-app"
$npm = "C:\Program Files\nodejs\npm.cmd"
$repo = "https://github.com/allakouassiaxellemarius-sys/tontine-manager-ota.git"
$owner = "allakouassiaxellemarius-sys"
$staging = "C:\Users\allak\AppData\Local\Temp\opencode\ota"

if (-not $Version) {
  $vFile = Get-Content "$project\src\lib\version.js" -Raw
  if ($vFile -match "VERSION_APP\s*=\s*'([^']+)'") { $Version = $Matches[1] }
}
if (-not $Version) { Write-Host "Version introuvable dans src/lib/version.js" -ForegroundColor Red; exit 1 }
Write-Host "Version OTA : $Version" -ForegroundColor Cyan

Write-Host "`n[1/4] Build web..." -ForegroundColor Cyan
Set-Location $project
& $npm run build 2>&1 | Select-Object -Last 4
if ($LASTEXITCODE -ne 0) { Write-Host "Build echoue" -ForegroundColor Red; exit 1 }

Write-Host "`n[2/4] Preparation du bundle zip..." -ForegroundColor Cyan
if (Test-Path $staging) { Remove-Item $staging -Recurse -Force }
New-Item -ItemType Directory -Path $staging | Out-Null
$bundle = "bundle-$Version.zip"
# Compress-Archive et ZipFile.CreateFromDirectory ecrivent des entrees du type
# "assets\index.js", que @capgo/capacitor-updater refuse a l'appareil ("Unzip
# failed: Windows path not supported") : la mise a jour ne s'installe jamais,
# sans le moindre signal cote app. `tar -a` corrige les separateurs mais ajoute
# 3 entrees repertoire et prefixe tous les noms de "./" (mesure sur le meme
# dist : 61 entrees contre 58 pour le bundle livre), et le binaire vise depend
# du PATH : lance depuis Git Bash c'est le tar de Git, qui ne connait pas le
# format zip et echoue sur les chemins Windows ("Cannot connect to C: ...").
# scripts/pack-ota.py est deterministe : deflate, separateurs "/", index.html a
# la racine, puis relit les en-tetes de l'archive et sort en 1 sinon.
python "$project\scripts\pack-ota.py" "$project\dist" "$staging\$bundle"
if ($LASTEXITCODE -ne 0) { Write-Host "Zip OTA invalide (voir le diagnostic ci-dessus)" -ForegroundColor Red; exit 1 }
Write-Host "Bundle : $bundle" -ForegroundColor Gray

Write-Host "`n[3/4] Clonage du depot OTA..." -ForegroundColor Cyan
$env:GIT_TERMINAL_PROMPT = '0'
& git clone $repo "$staging\repo" 2>&1 | Select-Object -Last 5
if ($LASTEXITCODE -ne 0) { Write-Host "Clone impossible (verifiez les droits GitHub)" -ForegroundColor Red; exit 1 }

Write-Host "`n[4/4] Publication update.json + bundle..." -ForegroundColor Cyan
Copy-Item "$staging\$bundle" "$staging\repo\$bundle" -Force
$json = "{ `"version`": `"$Version`", `"url`": `"https://raw.githubusercontent.com/$owner/tontine-manager-ota/main/$bundle`" }"
Set-Content -Path "$staging\repo\update.json" -Value $json -NoNewline
Set-Location "$staging\repo"
& git config user.email "ota-bot@users.noreply.github.com"
& git config user.name "OTA Bot"
& git add -A
& git commit -m "OTA $Version" 2>&1 | Select-Object -Last 5
& git push origin main 2>&1 | Select-Object -Last 10
if ($LASTEXITCODE -ne 0) { Write-Host "Push impossible" -ForegroundColor Red; exit 1 }

Write-Host "`nOTA $Version publiee. Le telephone la detectera automatiquement au prochain lancement." -ForegroundColor Green
