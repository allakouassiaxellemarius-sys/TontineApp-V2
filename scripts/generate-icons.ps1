# ═══════════════════════════════════════════════════════════════
# Tontine Manager - Génération des icônes du logo
# Dessine le pot à sous doré (logo) et génère :
#   - mipmaps Android (ic_launcher, round, foreground) x5 densités
#   - splash Capacitor (480x320, transparent, logo centré)
#   - icônes web (favicon.png 64, logo-192.png, logo-512.png)
# PERIME depuis le 10/11/2026 : ne pas relancer ce script.
# Il dessine le pot a sous dore sur un vert lime (#58CC02) qui n'est plus
# la marque. Le generateur en service est scripts/generate-icons.py :
# il rasterise public/favicon.svg (monogramme T) et verifie les verts
# contre src/lib/charte.js avant d'ecrire les 34 fichiers.
# Usage :
#   powershell -ExecutionPolicy Bypass -File scripts\generate-icons.ps1
# ═══════════════════════════════════════════════════════════════
$ErrorActionPreference = "Stop"
Add-Type -AssemblyName System.Drawing

$root = Split-Path -Parent $PSScriptRoot
$resDir = Join-Path $root "android\app\src\main\res"
$pubDir = Join-Path $root "public"

# ── Palette ────────────────────────────────────────────────────
$GREEN_TOP    = [System.Drawing.Color]::FromArgb(255, 123, 224, 0)
$GREEN_MID    = [System.Drawing.Color]::FromArgb(255, 88, 204, 2)
$GREEN_BOT    = [System.Drawing.Color]::FromArgb(255, 60, 158, 0)
$GREEN_BORDER = [System.Drawing.Color]::FromArgb(255, 46, 125, 0)
$GOLD_LIGHT   = [System.Drawing.Color]::FromArgb(255, 255, 213, 74)
$GOLD_MID     = [System.Drawing.Color]::FromArgb(255, 255, 179, 0)
$GOLD_RIM     = [System.Drawing.Color]::FromArgb(255, 255, 196, 0)
$GOLD_DARK    = [System.Drawing.Color]::FromArgb(255, 201, 138, 0)
$GOLD_BASE    = [System.Drawing.Color]::FromArgb(255, 230, 162, 0)

# ── Helpers géométriques ───────────────────────────────────────
function New-RoundedRectPath([single]$x, [single]$y, [single]$w, [single]$h, [single]$r) {
  $p = New-Object System.Drawing.Drawing2D.GraphicsPath
  $d = 2 * $r
  $p.AddArc($x, $y, $d, $d, 180, 90)
  $p.AddArc($x + $w - $d, $y, $d, $d, 270, 90)
  $p.AddArc($x + $w - $d, $y + $h - $d, $d, $d, 0, 90)
  $p.AddArc($x, $y + $h - $d, $d, $d, 90, 90)
  $p.CloseFigure()
  return $p
}

function New-RoundedPolygon([object[]]$pts, [single]$r) {
  # Polygone fermé avec coins arrondis (algorithme tangentes + arcs)
  $path = New-Object System.Drawing.Drawing2D.GraphicsPath
  $n = $pts.Count
  $rad = [Math]::PI / 180
  for ($i = 0; $i -lt $n; $i++) {
    $a = $pts[($i + $n - 1) % $n]   # précédent
    $b = $pts[$i]                   # coin courant
    $c = $pts[($i + 1) % $n]        # suivant

    # vecteurs unitaires
    $ux1 = $a.X - $b.X; $uy1 = $a.Y - $b.Y
    $l1 = [Math]::Sqrt($ux1 * $ux1 + $uy1 * $uy1)
    $ux1 /= $l1; $uy1 /= $l1
    $ux2 = $c.X - $b.X; $uy2 = $c.Y - $b.Y
    $l2 = [Math]::Sqrt($ux2 * $ux2 + $uy2 * $uy2)
    $ux2 /= $l2; $uy2 /= $l2

    $t1 = [System.Drawing.PointF]::new($b.X + $ux1 * $r, $b.Y + $uy1 * $r)
    $t2 = [System.Drawing.PointF]::new($b.X + $ux2 * $r, $b.Y + $uy2 * $r)

    if ($i -eq 0) { $path.AddLine($t1, $t1) }  # point de départ

    $ang1 = [Math]::Atan2($a.Y - $b.Y, $a.X - $b.X) / $rad
    $ang2 = [Math]::Atan2($c.Y - $b.Y, $c.X - $b.X) / $rad
    $sweep = (($ang2 - $ang1 + 180) % 360) - 180

    $path.AddArc($b.X - $r, $b.Y - $r, 2 * $r, 2 * $r, $ang1, $sweep)
    if ($i -lt $n - 1) {
      $next = $pts[($i + 1) % $n]
      $n2 = [System.Drawing.PointF]::new($next.X + $ux2 * $r, $next.Y + $uy2 * $r)
      # (la ligne vers le coin suivant est ajoutée à l'itération suivante)
    }
  }
  $path.CloseFigure()
  return $path
}

# ── Rendu d'une icône ──────────────────────────────────────────
function Render-Icon([int]$size, [string]$kind) {
  # kind : 'square' | 'round' | 'foreground'
  $bmp = New-Object System.Drawing.Bitmap($size, $size)
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
  $g.Clear([System.Drawing.Color]::Transparent)

  if ($kind -ne 'foreground') {
    # Fond vert (carré arrondi ou cercle)
    if ($kind -eq 'round') {
      $bg = New-Object System.Drawing.Drawing2D.GraphicsPath
      $bg.AddEllipse(0, 0, $size, $size)
      $g.SetClip($bg)
    } else {
      $rad = [single]($size * 0.22)
      $bg = New-RoundedRectPath 0 0 $size $size $rad
    }
    $rect = New-Object System.Drawing.RectangleF(0, 0, $size, $size)
    $grad = New-Object System.Drawing.Drawing2D.LinearGradientBrush($rect, $GREEN_TOP, $GREEN_BOT, 90)
    $g.FillPath($grad, $bg)
    # liseré
    $borderPen = New-Object System.Drawing.Pen($GREEN_BORDER, [single]($size * 0.035))
    $inner = New-RoundedRectPath ([single]($size*0.045)) ([single]($size*0.045)) ([single]($size*0.91)) ([single]($size*0.91)) ([single]($size*0.19))
    $g.DrawPath($borderPen, $inner)
    # halo haut
    $glow = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(30, 255, 255, 255))
    $g.FillEllipse($glow, [single]($size*0.18), [single]($size*0.05), [single]($size*0.64), [single]($size*0.34))
    $g.ResetClip()
    $borderPen.Dispose(); $grad.Dispose(); $glow.Dispose(); $bg.Dispose()
  }

  # Échelle : art 512 -> centré
  $maxDim = if ($kind -eq 'foreground') { [single]($size * 0.62) } else { [single]($size * 0.72) }
  $k = $maxDim / 348.0
  $artCX = 256.0; $artCY = 206.0
  $g.TranslateTransform([single]($size/2 - $artCX*$k), [single]($size/2 - $artCY*$k))
  $g.ScaleTransform([single]$k, [single]$k)

  $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
  $goldFill = New-Object System.Drawing.Drawing2D.LinearGradientBrush(
    (New-Object System.Drawing.RectangleF(0, 180, 512, 200)),
    $GOLD_LIGHT, $GOLD_MID, 90)
  $strokeW = 10.0
  $penDark = New-Object System.Drawing.Pen($GOLD_DARK, $strokeW)
  $penDark.LineJoin = [System.Drawing.Drawing2D.LineJoin]::Round

  $body = New-RoundedPolygon @(
    (New-Object System.Drawing.PointF(160, 188)),
    (New-Object System.Drawing.PointF(352, 188)),
    (New-Object System.Drawing.PointF(336, 378)),
    (New-Object System.Drawing.PointF(176, 378))
  ) 20
  $g.FillPath($goldFill, $body)
  $g.DrawPath($penDark, $body)

  $rim = New-RoundedRectPath 132 148 248 52 26
  $g.FillPath((New-Object System.Drawing.SolidBrush($GOLD_RIM)), $rim)
  $g.DrawPath($penDark, $rim)

  $glint = New-RoundedRectPath 180 214 74 122 24
  $g.FillPath((New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(80, 255, 255, 255))), $glint)

  $base = New-RoundedRectPath 222 352 68 18 9
  $g.FillPath((New-Object System.Drawing.SolidBrush($GOLD_BASE)), $base)
  $g.DrawPath($penDark, $base)

  $coinFill = New-Object System.Drawing.SolidBrush($GOLD_LIGHT)
  foreach ($cc in @(@(186, 96), @(256, 68), @(326, 96))) {
    $g.FillEllipse($coinFill, $cc[0] - 36, $cc[1] - 36, 72, 72)
    $g.DrawEllipse($penDark, $cc[0] - 36, $cc[1] - 36, 72, 72)
  }
  $ringPen = New-Object System.Drawing.Pen($GOLD_DARK, 8)
  foreach ($cc in @(@(186, 96), @(256, 68), @(326, 96))) {
    $g.DrawEllipse($ringPen, $cc[0] - 15, $cc[1] - 15, 30, 30)
  }

  $goldFill.Dispose(); $penDark.Dispose(); $coinFill.Dispose(); $ringPen.Dispose()
  $g.Dispose()
  return $bmp
}

# ── Génération mipmaps Android ─────────────────────────────────
$densities = @(
  @{ name = 'mdpi';   px = 48;  fg = 108 },
  @{ name = 'hdpi';   px = 72;  fg = 162 },
  @{ name = 'xhdpi';  px = 96;  fg = 216 },
  @{ name = 'xxhdpi'; px = 144; fg = 324 },
  @{ name = 'xxxhdpi';px = 192; fg = 432 }
)
foreach ($d in $densities) {
  $dir = Join-Path $resDir "mipmap-$($d.name)"
  $legacy = Render-Icon $d.px 'square'
  $legacy.Save((Join-Path $dir "ic_launcher.png"), [System.Drawing.Imaging.ImageFormat]::Png); $legacy.Dispose()
  $round = Render-Icon $d.px 'round'
  $round.Save((Join-Path $dir "ic_launcher_round.png"), [System.Drawing.Imaging.ImageFormat]::Png); $round.Dispose()
  $fg = Render-Icon $d.fg 'foreground'
  $fg.Save((Join-Path $dir "ic_launcher_foreground.png"), [System.Drawing.Imaging.ImageFormat]::Png); $fg.Dispose()
  Write-Output "mipmap-$($d.name) OK (ic_launcher $($d.px)px, foreground $($d.fg)px)"
}

# ── Splash Capacitor (480x320, transparent, logo centré) ───────
$w = 480; $h = 320
$bmp = New-Object System.Drawing.Bitmap($w, $h)
$g = [System.Drawing.Graphics]::FromImage($bmp)
$g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
$g.Clear([System.Drawing.Color]::Transparent)
$k = (320 * 0.5) / 348.0
$g.TranslateTransform([single]($w/2 - 256*$k), [single]($h/2 - 206*$k))
$g.ScaleTransform([single]$k, [single]$k)
$goldFill = New-Object System.Drawing.Drawing2D.LinearGradientBrush((New-Object System.Drawing.RectangleF(0, 180, 512, 200)), $GOLD_LIGHT, $GOLD_MID, 90)
$penDark = New-Object System.Drawing.Pen($GOLD_DARK, 10); $penDark.LineJoin = [System.Drawing.Drawing2D.LineJoin]::Round
$body = New-RoundedPolygon @((New-Object System.Drawing.PointF(160,188)),(New-Object System.Drawing.PointF(352,188)),(New-Object System.Drawing.PointF(336,378)),(New-Object System.Drawing.PointF(176,378))) 20
$g.FillPath($goldFill, $body); $g.DrawPath($penDark, $body)
$rim = New-RoundedRectPath 132 148 248 52 26
$g.FillPath((New-Object System.Drawing.SolidBrush($GOLD_RIM)), $rim); $g.DrawPath($penDark, $rim)
$glint = New-RoundedRectPath 180 214 74 122 24
$g.FillPath((New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(80,255,255,255))), $glint)
$base = New-RoundedRectPath 222 352 68 18 9
$g.FillPath((New-Object System.Drawing.SolidBrush($GOLD_BASE)), $base); $g.DrawPath($penDark, $base)
$coinFill = New-Object System.Drawing.SolidBrush($GOLD_LIGHT)
foreach ($cc in @(@(186,96),@(256,68),@(326,96))) { $g.FillEllipse($coinFill, $cc[0]-36, $cc[1]-36, 72, 72); $g.DrawEllipse($penDark, $cc[0]-36, $cc[1]-36, 72, 72) }
$ringPen = New-Object System.Drawing.Pen($GOLD_DARK, 8)
foreach ($cc in @(@(186,96),@(256,68),@(326,96))) { $g.DrawEllipse($ringPen, $cc[0]-15, $cc[1]-15, 30, 30) }
$goldFill.Dispose(); $penDark.Dispose(); $coinFill.Dispose(); $ringPen.Dispose(); $g.Dispose()
$bmp.Save((Join-Path $resDir "drawable\splash.png"), [System.Drawing.Imaging.ImageFormat]::Png); $bmp.Dispose()
Write-Output "splash.png OK (480x320)"

# ── Icônes web ─────────────────────────────────────────────────
foreach ($icon in @(@{ f='favicon.png'; s=64 }, @{ f='logo-192.png'; s=192 }, @{ f='logo-512.png'; s=512 })) {
  $i = Render-Icon $icon.s 'square'
  $i.Save((Join-Path $pubDir $icon.f), [System.Drawing.Imaging.ImageFormat]::Png); $i.Dispose()
  Write-Output "$($icon.f) OK ($($icon.s)px)"
}

# ── Icône iOS (1024x1024 opaque, plein cadre) ──────────────────
function Render-IosIcon([int]$size) {
  $bmp = New-Object System.Drawing.Bitmap($size, $size)
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
  # Fond opaque : iOS refuse toute transparence, les coins sont masqués par iOS
  $rect = New-Object System.Drawing.RectangleF(0, 0, $size, $size)
  $grad = New-Object System.Drawing.Drawing2D.LinearGradientBrush($rect, $GREEN_TOP, $GREEN_BOT, 90)
  $g.FillRectangle($grad, $rect)
  $grad.Dispose()

  $maxDim = [single]($size * 0.68)
  $k = $maxDim / 348.0
  $artCX = 256.0; $artCY = 206.0
  $g.TranslateTransform([single]($size/2 - $artCX*$k), [single]($size/2 - $artCY*$k))
  $g.ScaleTransform([single]$k, [single]$k)

  $goldFill = New-Object System.Drawing.Drawing2D.LinearGradientBrush(
    (New-Object System.Drawing.RectangleF(0, 180, 512, 200)),
    $GOLD_LIGHT, $GOLD_MID, 90)
  $strokeW = 10.0
  $penDark = New-Object System.Drawing.Pen($GOLD_DARK, $strokeW)
  $penDark.LineJoin = [System.Drawing.Drawing2D.LineJoin]::Round

  $body = New-RoundedPolygon @(
    (New-Object System.Drawing.PointF(160, 188)),
    (New-Object System.Drawing.PointF(352, 188)),
    (New-Object System.Drawing.PointF(336, 378)),
    (New-Object System.Drawing.PointF(176, 378))
  ) 20
  $g.FillPath($goldFill, $body)
  $g.DrawPath($penDark, $body)

  $rim = New-RoundedRectPath 132 148 248 52 26
  $g.FillPath((New-Object System.Drawing.SolidBrush($GOLD_RIM)), $rim)
  $g.DrawPath($penDark, $rim)

  $glint = New-RoundedRectPath 180 214 74 122 24
  $g.FillPath((New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(80, 255, 255, 255))), $glint)

  $base = New-RoundedRectPath 222 352 68 18 9
  $g.FillPath((New-Object System.Drawing.SolidBrush($GOLD_BASE)), $base)
  $g.DrawPath($penDark, $base)

  $coinFill = New-Object System.Drawing.SolidBrush($GOLD_LIGHT)
  foreach ($cc in @(@(186, 96), @(256, 68), @(326, 96))) {
    $g.FillEllipse($coinFill, $cc[0] - 36, $cc[1] - 36, 72, 72)
    $g.DrawEllipse($penDark, $cc[0] - 36, $cc[1] - 36, 72, 72)
  }
  $ringPen = New-Object System.Drawing.Pen($GOLD_DARK, 8)
  foreach ($cc in @(@(186, 96), @(256, 68), @(326, 96))) {
    $g.DrawEllipse($ringPen, $cc[0] - 15, $cc[1] - 15, 30, 30)
  }

  $goldFill.Dispose(); $penDark.Dispose(); $coinFill.Dispose(); $ringPen.Dispose()
  $g.Dispose()
  return $bmp
}

$iosIconDir = Join-Path $root "ios\App\App\Assets.xcassets\AppIcon.appiconset"
if (Test-Path $iosIconDir) {
  $ios = Render-IosIcon 1024
  $ios.Save((Join-Path $iosIconDir "AppIcon-512@2x.png"), [System.Drawing.Imaging.ImageFormat]::Png); $ios.Dispose()
  Write-Output "AppIcon-512@2x.png OK (1024px, opaque)"
} else {
  Write-Output "Dossier AppIcon iOS introuvable : $iosIconDir (ignoré)"
}

# ── Splash iOS (2732x2732 vert uni, sert de fond en scaleAspectFill) ─
$iosSplashDir = Join-Path $root "ios\App\App\Assets.xcassets\Splash.imageset"
if (Test-Path $iosSplashDir) {
  $s = 2732
  $bmp = New-Object System.Drawing.Bitmap($s, $s)
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
  $rect = New-Object System.Drawing.RectangleF(0, 0, $s, $s)
  $grad = New-Object System.Drawing.Drawing2D.LinearGradientBrush($rect, $GREEN_TOP, $GREEN_BOT, 90)
  $g.FillRectangle($grad, $rect)
  $grad.Dispose(); $g.Dispose()
  foreach ($f in @('splash-2732x2732.png', 'splash-2732x2732-1.png', 'splash-2732x2732-2.png')) {
    $bmp.Save((Join-Path $iosSplashDir $f), [System.Drawing.Imaging.ImageFormat]::Png)
  }
  $bmp.Dispose()
  Write-Output "Splash iOS OK (2732x2732, vert, x3 fichiers)"
} else {
  Write-Output "Dossier Splash iOS introuvable : $iosSplashDir (ignoré)"
}

Write-Output ""
Write-Output "Icônes générées avec succès ✅"
