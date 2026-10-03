Add-Type -AssemblyName System.Drawing
$inPath = (Resolve-Path 'icon-512x512.png').Path
$outPath = Join-Path (Get-Location) 'icon-512x512-opaque.png'
$src = New-Object System.Drawing.Bitmap $inPath
$fmt = [System.Drawing.Imaging.PixelFormat]::Format24bppRgb
$dst = New-Object System.Drawing.Bitmap -ArgumentList @(512, 512, $fmt)
$g = [System.Drawing.Graphics]::FromImage($dst)
$g.Clear([System.Drawing.Color]::FromArgb(18, 19, 42))
$g.DrawImage($src, 0, 0, 512, 512)
$g.Dispose()
$dst.Save($outPath, [System.Drawing.Imaging.ImageFormat]::Png)
$dst.Dispose()
$src.Dispose()
$v = New-Object System.Drawing.Bitmap $outPath
$c = $v.GetPixel(0, 0)
$cc = $v.GetPixel(256, 256)
Write-Output ("check: " + $v.Width + "x" + $v.Height + " " + $v.PixelFormat)
Write-Output ("corner(0,0) A=" + $c.A + " R=" + $c.R + " G=" + $c.G + " B=" + $c.B)
Write-Output ("center(256,256) A=" + $cc.A + " R=" + $cc.R + " G=" + $cc.G + " B=" + $cc.B)
$t = 0
for ($x = 0; $x -lt 512; $x += 8) {
  for ($y = 0; $y -lt 512; $y += 8) {
    if ($v.GetPixel($x, $y).A -lt 255) { $t++ }
  }
}
Write-Output ("translucent pixels = " + $t + " / 4096")
$v.Dispose()
