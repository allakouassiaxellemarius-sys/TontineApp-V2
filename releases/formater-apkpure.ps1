Add-Type -AssemblyName System.Drawing

$srcDir = (Resolve-Path 'apkpure-upload').Path
$dstDir = Join-Path (Get-Location) 'apkpure-format'
if (-not (Test-Path $dstDir)) { New-Item -ItemType Directory -Path $dstDir | Out-Null }

# Les 4 captures passent en 1080x2400 : meme ratio 9:20 que le 720x1600 natif du
# telephone, donc aucun recadrage, seulement une interpolation haute qualite.
$redim = @(
  'screenshot-1-accueil.png',
  'screenshot-2-discussion.png',
  'screenshot-3-epingle.png',
  'screenshot-4-reply.png'
)
foreach ($nom in $redim) {
  $entree = Join-Path $srcDir $nom
  if (-not (Test-Path $entree)) { Write-Output ('ABSENT: ' + $nom); continue }
  $src = New-Object System.Drawing.Bitmap $entree
  $w = 1080
  $h = [int][math]::Round($w * $src.Height / $src.Width)
  $fmt = [System.Drawing.Imaging.PixelFormat]::Format24bppRgb
  $dst = New-Object System.Drawing.Bitmap -ArgumentList @($w, $h, $fmt)
  $g = [System.Drawing.Graphics]::FromImage($dst)
  $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
  $g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
  $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
  $g.DrawImage($src, 0, 0, $w, $h)
  $g.Dispose()
  $dst.Save((Join-Path $dstDir $nom), [System.Drawing.Imaging.ImageFormat]::Png)
  $dst.Dispose(); $src.Dispose()
  Write-Output ($nom.PadRight(28) + '720x1600 -> ' + $w + 'x' + $h)
}

# Icone et banniere sont deja aux dimensions demandees : copie simple, sans
# reechantillonnage (le reechantillonner une image vectorielle-nette l'adoucirait).
$identiques = @(
  @{ src = (Join-Path $srcDir 'icon-512x512-opaque.png'); nom = 'icon-512x512.png' },
  @{ src = (Join-Path (Get-Location) 'banniere-1024x500.png'); nom = 'banniere-1024x500.png' }
)
foreach ($f in $identiques) {
  if (Test-Path $f.src) {
    Copy-Item $f.src (Join-Path $dstDir $f.nom) -Force
    Write-Output ($f.nom.PadRight(28) + 'copie sans reechantillonnage')
  } else {
    Write-Output ('ABSENT: ' + $f.src)
  }
}
Write-Output ('dossier: ' + $dstDir)
