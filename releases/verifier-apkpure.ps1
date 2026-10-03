
Add-Type -AssemblyName System.Drawing
$out = Join-Path $env:USERPROFILE 'Downloads\apkpure-conformes'
$jpegFormat = [System.Drawing.Imaging.ImageFormat]::JPEG
$codec = @([System.Drawing.Imaging.ImageCodecInfo]::GetImageEncoders() | Where-Object { $_.MimeType -eq 'image/jpeg' })[0]
$encParams = New-Object System.Drawing.Imaging.EncoderParameters 1
$encParams.Param[0] = New-Object System.Drawing.Imaging.EncoderParameter([System.Drawing.Imaging.Encoder]::Quality, [long]92)

$src = Join-Path $out 'banniere-1024x520.png'
$img = [System.Drawing.Image]::FromFile($src)
$bmp = New-Object System.Drawing.Bitmap -ArgumentList @($img.Width, $img.Height, [System.Drawing.Imaging.PixelFormat]::Format24bppRgb)
$g = [System.Drawing.Graphics]::FromImage($bmp)
$g.Clear([System.Drawing.Color]::White)
$g.DrawImage($img, 0, 0, $img.Width, $img.Height)
$g.Dispose(); $img.Dispose()
$bmp.Save((Join-Path $out 'banniere-1024x520.jpg'), $codec, $encParams)
$bmp.Dispose()

Write-Output '--- tableau final ---'
Get-ChildItem -Path $out -File | Sort-Object Name | ForEach-Object {
  $p = $_.FullName
  $ext = $_.Extension.ToLower()
  if ($ext -eq '.png') {
    $b = [System.IO.File]::ReadAllBytes($p)
    $w = ($b[16] * 16777216) + ($b[17] * 65536) + ($b[18] * 256) + $b[19]
    $h = ($b[20] * 16777216) + ($b[21] * 65536) + ($b[22] * 256) + $b[23]
    $ct = $b[25]
    $bits = $b[24] * $(if ($ct -eq 2) { 3 } elseif ($ct -eq 6) { 4 } else { 1 })
    $alpha = $(if ($ct -eq 6) { 'ALPHA' } else { 'aucune' })
  } else {
    $i = [System.Drawing.Image]::FromFile($p); $w = $i.Width; $h = $i.Height; $i.Dispose()
    $bits = 24; $alpha = 'aucune'
  }
  $mn = [Math]::Min($w, $h); $mx = [Math]::Max($w, $h)
  $ok = ($mx -le 2 * $mn) -and ($mn -ge 320) -and ($mx -le 3840)
  Write-Output ("{0,-26} {1,5}x{2,-5} ratio={3:N3} {4,-7} bits={5,-3} alpha={6,-7} {7,7} o  {8}" -f $_.Name, $w, $h, ($mx / $mn), $ext, $bits, $alpha, $_.Length, $(if ($ok) { 'OK' } else { 'KO' }))
}
