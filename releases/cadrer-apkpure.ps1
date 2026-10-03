
Add-Type -AssemblyName System.Drawing

$src = Join-Path $env:USERPROFILE 'Downloads\apkpure-format'
$out = Join-Path $env:USERPROFILE 'Downloads\apkpure-conformes'
if (-not (Test-Path $out)) { New-Item -ItemType Directory -Path $out | Out-Null }
Get-ChildItem -Path $out -File | Remove-Item -Force

$jpegFormat = [System.Drawing.Imaging.ImageFormat]::JPEG
$pngFormat  = [System.Drawing.Imaging.ImageFormat]::Png
$codec      = @([System.Drawing.Imaging.ImageCodecInfo]::GetImageEncoders() | Where-Object { $_.MimeType -eq 'image/jpeg' })[0]
$encParams  = New-Object System.Drawing.Imaging.EncoderParameters 1
$encParams.Param[0] = New-Object System.Drawing.Imaging.EncoderParameter([System.Drawing.Imaging.Encoder]::Quality, [long]92)

# Regle APKPure / Play : dimension max <= 2 x dimension min, 320 <= min, max <= 3840, JPEG ou PNG 24 bits sans alpha.
$shots  = @('screenshot-1-accueil.png','screenshot-2-discussion.png','screenshot-3-epingle.png','screenshot-4-reply.png')
$targetW = 1280
$targetH = 2400

function Save-Both([System.Drawing.Bitmap]$bmp, [string]$base) {
  $jpgPath = Join-Path $out ($base + '.jpg')
  $pngPath = Join-Path $out ($base + '.png')
  $bmp.Save($jpgPath, $codec, $encParams)
  $bmp.Save($pngPath, $pngFormat)
  $w = $bmp.Width; $h = $bmp.Height
  $mn = [Math]::Min($w, $h); $mx = [Math]::Max($w, $h)
  $okRatio = ($mx -le (2 * $mn)) -and ($mn -ge 320) -and ($mx -le 3840)
  $sj = (Get-Item $jpgPath).Length
  $sp = (Get-Item $pngPath).Length
  Write-Output ("{0,-24} {1}x{2}  ratio={3:N3}  {4}  png={5}  jpg={6}" -f $base, $w, $h, ($mx / $mn), ($(if ($okRatio) {'OK  '} else {'KO  '})), $sp, $sj)
}

foreach ($name in $shots) {
  $inPath = Join-Path $src $name
  $img = [System.Drawing.Image]::FromFile($inPath)
  $sw = $img.Width; $sh = $img.Height

  $canvas = New-Object System.Drawing.Bitmap -ArgumentList @($targetW, $targetH, [System.Drawing.Imaging.PixelFormat]::Format24bppRgb)
  $g = [System.Drawing.Graphics]::FromImage($canvas)
  $g.Clear([System.Drawing.Color]::FromArgb(18, 19, 42))

  # fond = copie floue (miniature etiree) de la capture, pour un cadre plein plutot que des bandes noires
  $tw = 24; $th = 45
  $thumb = New-Object System.Drawing.Bitmap -ArgumentList @($tw, $th, [System.Drawing.Imaging.PixelFormat]::Format24bppRgb)
  $gt = [System.Drawing.Graphics]::FromImage($thumb)
  $gt.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
  $gt.PixelOffsetMode   = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
  $scale = [Math]::Max(($tw / $sw), ($th / $sh))
  $dw = $sw * $scale; $dh = $sh * $scale
  $gt.DrawImage($img, [single](($tw - $dw) / 2), [single](($th - $dh) / 2), [single]$dw, [single]$dh)
  $gt.Dispose()

  $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
  $g.PixelOffsetMode   = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
  $g.DrawImage($thumb, 0, 0, $targetW, $targetH)
  $thumb.Dispose()

  # capture nette centreee, aucune perte de contenu
  $x = [int](($targetW - $sw) / 2)
  $g.DrawImage($img, $x, 0, $sw, $sh)
  $g.Dispose()
  $img.Dispose()

  $base = [System.IO.Path]::GetFilenameWithoutExtension($name)
  Save-Both $canvas $base
  $canvas.Dispose()
}

# icone : 512x512, deja RGB sans alpha, simple copie
$iconPath = Join-Path $src 'icon-512x512.png'
if (Test-Path $iconPath) {
  $ic = New-Object System.Drawing.Bitmap $iconPath
  $canvasIcon = New-Object System.Drawing.Bitmap -ArgumentList @($ic.Width, $ic.Height, [System.Drawing.Imaging.PixelFormat]::Format24bppRgb)
  $gi = [System.Drawing.Graphics]::FromImage($canvasIcon)
  $gi.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
  $gi.Clear([System.Drawing.Color]::FromArgb(18, 19, 42))
  $gi.DrawImage($ic, 0, 0, $ic.Width, $ic.Height)
  $gi.Dispose(); $ic.Dispose()
  Save-Both $canvasIcon 'icon-512x512'
  $canvasIcon.Dispose()
}

Write-Output '--- controle PNG (depth / colorType / interlace) ---'
Get-ChildItem -Path $out -Filter *.png | Sort-Object Name | ForEach-Object {
  $b = [System.IO.File]::ReadAllBytes($_.FullName)
  Write-Output ("{0,-24} depth={1} colorType={2} interlace={3}" -f $_.Name, $b[24], $b[25], $b[28])
}
