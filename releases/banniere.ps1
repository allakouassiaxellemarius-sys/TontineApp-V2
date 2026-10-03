Add-Type -AssemblyName System.Drawing

$textPath = (Resolve-Path 'banniere-texte.txt').Path
$logoPath = (Resolve-Path 'apkpure-upload/icon-512x512.png').Path
$outName = 'banniere-1024x520.png'

$lines = [System.IO.File]::ReadAllLines($textPath, [System.Text.Encoding]::UTF8)
$title = $lines[0]
$tagline = $lines[1]
$bullets = @($lines[2], $lines[3], $lines[4])
$footer = $lines[5]

$W = 1024; $H = 520
$bmp = New-Object System.Drawing.Bitmap -ArgumentList @($W, $H, [System.Drawing.Imaging.PixelFormat]::Format24bppRgb)
$g = [System.Drawing.Graphics]::FromImage($bmp)
$g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
$g.TextRenderingHint = [System.Drawing.Text.TextRenderingHint]::AntiAliasGridFit
$g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic

$navy1 = [System.Drawing.Color]::FromArgb(18, 19, 42)
$navy2 = [System.Drawing.Color]::FromArgb(35, 40, 86)
$rect = New-Object System.Drawing.Rectangle 0, 0, $W, $H
$brushGrad = New-Object System.Drawing.Drawing2D.LinearGradientBrush $rect, $navy1, $navy2, 18
$g.FillRectangle($brushGrad, $rect)
$brushGrad.Dispose()

$logo = New-Object System.Drawing.Bitmap $logoPath
$g.DrawImage($logo, 52, 112, 272, 272)
$logo.Dispose()

$x = 356
$wmax = $W - $x - 40
$white = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(245, 246, 252))
$green = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(33, 195, 93))
$soft = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(201, 204, 220))
$muted = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(138, 143, 168))
$gold = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(255, 209, 65))

function Fit-Font([string]$famille, [int]$taille, [System.Drawing.FontStyle]$style, [string]$texte, [int]$mini) {
  $t = $taille
  while ($t -gt $mini) {
    $f = New-Object System.Drawing.Font $famille, $t, $style
    $sz = $g.MeasureString($texte, $f)
    $f.Dispose()
    if ($sz.Width -le $wmax) { break }
    $t = $t - 2
  }
  return $t
}

$y = 106
$sz = Fit-Font 'Segoe UI' 62 ([System.Drawing.FontStyle]::Bold) $title 34
$f = New-Object System.Drawing.Font 'Segoe UI', $sz, ([System.Drawing.FontStyle]::Bold)
$g.DrawString($title, $f, $white, $x, $y)
# 1,22 etait trop serré : les jambages du titre (g, J) retombaient sur la
# baseline de l'accroche. Segoe UI Bold demande ~1,42 de hauteur de ligne.
$h1 = [single]($sz * 1.42)
$f.Dispose()
Write-Output ("titre taille=" + $sz + "px largeur=" + [int]$g.MeasureString($title, (New-Object System.Drawing.Font 'Segoe UI', $sz, ([System.Drawing.FontStyle]::Bold))).Width)

$y2 = $y + $h1 + 4
$sz2 = Fit-Font 'Segoe UI' 30 ([System.Drawing.FontStyle]::Regular) $tagline 18
$f2 = New-Object System.Drawing.Font 'Segoe UI', $sz2, ([System.Drawing.FontStyle]::Regular)
$g.DrawString($tagline, $f2, $green, $x, $y2)
$h2 = [single]($sz2 * 1.4)
$f2.Dispose()

$yb = $y2 + $h2 + 18
# L'ajustement se fait sur la PLUS longue puce, pas sur la premiere : sinon les
# puces suivantes debordent du cadre. Retrait de 24 px pour la puce dorée.
$plusLongue = $bullets[0]
foreach ($b in $bullets) { if ($b.Length -gt $plusLongue.Length) { $plusLongue = $b } }
$wmax = $wmax - 24
$sz3 = Fit-Font 'Segoe UI' 21 ([System.Drawing.FontStyle]::Regular) $plusLongue 14
$f3 = New-Object System.Drawing.Font 'Segoe UI', $sz3, ([System.Drawing.FontStyle]::Regular)
$h3 = [single]($sz3 * 1.5)
foreach ($b in $bullets) {
  $mesure = [int]$g.MeasureString($b, $f3).Width
  Write-Output ("puce taille=" + $sz3 + "px largeur=" + $mesure + " max=" + $wmax)
  $g.FillEllipse($gold, $x, ($yb + [single]($sz3 * 0.62)), 8, 8)
  $g.DrawString($b, $f3, $soft, ($x + 24), $yb)
  $yb = $yb + $h3 + 6
}
$f3.Dispose()

$sz4 = Fit-Font 'Segoe UI' 17 ([System.Drawing.FontStyle]::Regular) $footer 12
$f4 = New-Object System.Drawing.Font 'Segoe UI', $sz4, ([System.Drawing.FontStyle]::Regular)
$yFooter = $yb + 10
$g.DrawString($footer, $f4, $muted, $x, $yFooter)
Write-Output ("pied de page y=" + [int]$yFooter + " (cadre " + $H + ")")
$f4.Dispose()

$pen = New-Object System.Drawing.Pen ([System.Drawing.Color]::FromArgb(60, 33, 195, 93)), 3
$g.DrawLine($pen, 40, $H - 8, ($W - 40), ($H - 8))
$pen.Dispose()

foreach ($br in @($white, $green, $soft, $muted, $gold)) { $br.Dispose() }
$bmp.Save((Join-Path (Get-Location) $outName), [System.Drawing.Imaging.ImageFormat]::Png)
$bmp.Dispose()
$g.Dispose()
Write-Output ("ecrit: " + $outName)
