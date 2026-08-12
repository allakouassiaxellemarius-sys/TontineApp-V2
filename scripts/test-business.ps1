# ═══════════════════════════════════════════════════════════════
# Tontine Manager - Tests des règles métier
# Copie src/lib vers un répertoire temporaire (imports adaptés
# pour Node ESM), puis exécute la suite de tests.
# Usage : powershell -ExecutionPolicy Bypass -File scripts\test-business.ps1
# ═══════════════════════════════════════════════════════════════
$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
$tmp = Join-Path $env:TEMP "test-tontine"

if (Test-Path $tmp) { Remove-Item -Recurse -Force $tmp }
New-Item -ItemType Directory -Path (Join-Path $tmp "lib") -Force | Out-Null

Get-ChildItem (Join-Path $root "src\lib\*.js") | ForEach-Object {
  $content = Get-Content $_.FullName -Raw
  $content = [regex]::Replace($content, "from '\./([A-Za-z0-9_]+)'", "from './`$1.js'")
  Set-Content -Path (Join-Path $tmp "lib\$($_.Name)") -Value $content -Encoding UTF8
}

Copy-Item (Join-Path $root "scripts\test.mjs") (Join-Path $tmp "test.mjs")
Push-Location $tmp
node test.mjs
$code = $LASTEXITCODE
Pop-Location
exit $code
