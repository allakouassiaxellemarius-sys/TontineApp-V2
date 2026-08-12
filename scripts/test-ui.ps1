# ═══════════════════════════════════════════════════════════════
# Tontine Manager - Smoke test UI (jsdom)
# Monte chaque onglet dans un DOM simulé pour détecter les erreurs
# de rendu (ex: composant non importé) que le build ne voit pas.
# Usage : powershell -ExecutionPolicy Bypass -File scripts\test-ui.ps1
# ═══════════════════════════════════════════════════════════════
$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
Push-Location $root
& "node_modules\.bin\esbuild.cmd" scripts\smoke-tabs.jsx --bundle --format=cjs --jsx=automatic --platform=node --external:jsdom --outfile=$env:TEMP\smoke-tabs-out.cjs --log-level=warning
if ($LASTEXITCODE -ne 0) { Pop-Location; throw "Bundle du smoke test échoué" }
$env:NODE_PATH = Join-Path $root "node_modules"
node $env:TEMP\smoke-tabs-out.cjs
$code = $LASTEXITCODE
Pop-Location
exit $code
