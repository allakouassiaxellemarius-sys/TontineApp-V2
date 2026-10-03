
Add-Type -AssemblyName System.Drawing

$src = Join-Path $env:USERPROFILE 'Downloads\apkpure-format'
$out = Join-Path $env:USERPROFILE 'Downloads\apkpure-24bit'
if (-not (Test-Path $out)) { New-Item -ItemType Directory -Path $out | Out-Null }
Get-ChildItem -Path $out -File | Remove-Item -Force

$jpegFormat = [System.Drawing.Imaging.ImageFormat]::JPEG
$pngFormat  = [System.Drawing.Imaging.ImageFormat]::Png
$codec      = @([System.Drawing.Imaging.ImageCodecInfo]::GetImageEncoders() | Where-Object { $_.MimeType -eq 'image/jpeg' })[0]
$encParams  = New-Object System.Drawing.Imaging.EncoderParameters 1
$encParams.Param[0] = New-Object System.Drawing.Imaging.EncoderParameter([System.Drawing.Imaging.Encoder]::Quality, [long]92)

$files = Get-ChildItem -Path $src -Filter *.png | Sort-Object Name
foreach ($f in $files) {
  $img = [System.Drawing.Image]::FromFile($f.FullName)
  $w = $img.Width
  $h = $img.Height
  $bmp = New-Object System.Drawing.Bitmap -ArgumentList @($w, $h, [System.Drawing.Imaging.PixelFormat]::Format24bppRgb)
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
  $g.PixelOffsetMode   = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
  $g.Clear([System.Drawing.Color]::White)
  $g.DrawImage($img, 0, 0, $w, $h)
  $g.Dispose()
  $img.Dispose()

  $base = [System.IO.Path]::GetFilenameWithoutExtension($f.Name)
  $jpgPath = Join-Path $out ($base + '.jpg')
  $pngPath = Join-Path $out ($base + '-rgb.png')
  $bmp.Save($jpgPath, $codec, $encParams)
  $bmp.Save($pngPath, $pngFormat)
  $bmp.Dispose()

  $chk = [System.Drawing.Image]::FromFile($jpgPath)
  $pf  = $chk.PixelFormat
  $cw  = $chk.Width
  $ch  = $chk.Height
  $chk.Dispose()
  Write-Output ("{0,-26} {1}x{2}  {3}" -f ($base + '.jpg'), $cw, $ch, $pf)
}
Write-Output '--- tailles ---'
Get-ChildItem -Path $out -File | Sort-Object Name | ForEach-Object { Write-Output ("{0,-34} {1}" -f $_.Name, $_.Length) }
