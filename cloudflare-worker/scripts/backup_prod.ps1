<#
 .SYNOPSIS
   Sauvegarde la base D1 de production avant d'appliquer la migration 0002/0003.
 .DESCRIPTION
   Exporte (1) la base complete et (2) uniquement la table kv (source de verite
   du rollback) vers le dossier backups/ avec un horodatage.
   La migration 0002/0003 ne touche JAMAIS la table kv : en cas de probleme, il
   suffit de supprimer les tables relationnelles (scripts/rollback_prod.sql)
   et/ou de re-importer ce backup kv.
 .PARAMETER DbName
   Nom de la base D1 (defaut : tontine-db).
 .EXAMPLE
   .\scripts\backup_prod.ps1
   .\scripts\backup_prod.ps1 -DbName tontine-db
#>
param(
  [string]$DbName = 'tontine-db'
)

$ErrorActionPreference = 'Stop'

# --- Resoudre le binaire wrangler -------------------------------------
function Get-Wrangler {
  if (Get-Command wrangler -ErrorAction SilentlyContinue) { return 'wrangler' }
  $local = Join-Path $PSScriptRoot '..\node_modules\.bin\wrangler.cmd'
  if (Test-Path $local) { return $local }
  return 'npx wrangler'
}
$wl = Get-Wrangler

# --- Dossier de sauvegarde --------------------------------------------
$backupDir = Join-Path $PSScriptRoot '..\backups'
if (-not (Test-Path $backupDir)) { New-Item -ItemType Directory -Path $backupDir | Out-Null }

$ts        = Get-Date -Format 'yyyyMMdd_HHmmss'
$fullFile  = Join-Path $backupDir "$($DbName)_full_$ts.sql"
$kvFile    = Join-Path $backupDir "$($DbName)_kv_$ts.sql"

Write-Host "Sauvegarde de '$DbName' (wrangler: $wl)" -ForegroundColor Cyan

# 1) Export complet (schema + donnees)
Write-Host "=> export complet -> $fullFile"
& $wl d1 export $DbName --remote --output $fullFile -y
if (-not (Test-Path $fullFile) -or (Get-Item $fullFile).Length -eq 0) {
  throw "Echec de l'export complet (fichier vide ou absent)."
}

# 2) Export de la table kv uniquement (rollback le plus fin/granulaire)
Write-Host "=> export table kv -> $kvFile"
& $wl d1 export $DbName --remote --table kv --output $kvFile -y
if (-not (Test-Path $kvFile) -or (Get-Item $kvFile).Length -eq 0) {
  throw "Echec de l'export kv (fichier vide ou absent)."
}

Write-Host ""
Write-Host "Sauvegardes creees :" -ForegroundColor Green
Write-Host "  $fullFile"
Write-Host "  $kvFile"
Write-Host ""
Write-Host "Restauration kv seule (si besoin) :" -ForegroundColor Yellow
Write-Host "  $wl d1 execute $DbName --remote --file=`"$kvFile`""
Write-Host "Annulation de la migration (0002/0003) :" -ForegroundColor Yellow
Write-Host "  $wl d1 execute $DbName --remote --file=scripts/rollback_prod.sql"
