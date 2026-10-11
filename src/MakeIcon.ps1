$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName PresentationCore,WindowsBase
$startupIconProject = Split-Path -Parent $PSScriptRoot
$startupIconBuild = Join-Path $startupIconProject 'build\app'
$startupIconPreview = Join-Path $startupIconProject 'build\icon-preview'
New-Item -ItemType Directory -Path $startupIconBuild,$startupIconPreview -Force | Out-Null
[xml]$startupLogoXml = Get-Content -LiteralPath (Join-Path $startupIconProject 'assets\openai.svg') -Raw
$startupLogoGeometry = [Windows.Media.Geometry]::Parse($startupLogoXml.svg.path.d)
$startupLogoBounds = $startupLogoGeometry.Bounds

function New-StartupIconBitmap([int]$Size, [bool]$SettingsBadge) {
  $startupDrawing = New-Object Windows.Media.DrawingVisual
  $startupDrawingContext = $startupDrawing.RenderOpen()
  $startupDrawingContext.PushTransform((New-Object Windows.Media.ScaleTransform ($Size / 256.0),($Size / 256.0)))
  $startupDrawingContext.DrawRoundedRectangle([Windows.Media.Brushes]::Black, $null, (New-Object Windows.Rect 0,0,256,256), 48,48)
  $startupLogoScale = 168 / [Math]::Max($startupLogoBounds.Width, $startupLogoBounds.Height)
  $startupDrawingContext.PushTransform((New-Object Windows.Media.TranslateTransform (128 - $startupLogoBounds.Width * $startupLogoScale / 2),(128 - $startupLogoBounds.Height * $startupLogoScale / 2)))
  $startupDrawingContext.PushTransform((New-Object Windows.Media.ScaleTransform $startupLogoScale,$startupLogoScale))
  $startupDrawingContext.PushTransform((New-Object Windows.Media.TranslateTransform (-$startupLogoBounds.X),(-$startupLogoBounds.Y)))
  $startupDrawingContext.DrawGeometry([Windows.Media.Brushes]::White, $null, $startupLogoGeometry)
  $startupDrawingContext.Pop(); $startupDrawingContext.Pop(); $startupDrawingContext.Pop()
  if ($SettingsBadge) {
    $startupBadgeCenter = New-Object Windows.Point 213,213
    $startupBadgeBrush = New-Object Windows.Media.SolidColorBrush ([Windows.Media.Color]::FromRgb(245,245,242))
    $startupBadgePen = New-Object Windows.Media.Pen ([Windows.Media.Brushes]::Black),4
    $startupDrawingContext.DrawEllipse($startupBadgeBrush, $startupBadgePen, $startupBadgeCenter, 37,37)
    $startupGearPath = New-Object Windows.Media.StreamGeometry
    $startupGearContext = $startupGearPath.Open()
    $startupFirstPoint = $true
    foreach ($startupTooth in 0..7) {
      foreach ($startupCorner in @(@(-22.5,16.5),@(-14,16.5),@(-11,22.5),@(11,22.5),@(14,16.5),@(22.5,16.5))) {
        $startupAngle = ($startupTooth * 45 + $startupCorner[0]) * [Math]::PI / 180
        $startupPoint = New-Object Windows.Point (213 + $startupCorner[1] * [Math]::Cos($startupAngle)),(213 + $startupCorner[1] * [Math]::Sin($startupAngle))
        if ($startupFirstPoint) { $startupGearContext.BeginFigure($startupPoint,$true,$true); $startupFirstPoint = $false }
        else { $startupGearContext.LineTo($startupPoint,$true,$false) }
      }
    }
    $startupGearContext.Close()
    $startupDrawingContext.DrawGeometry([Windows.Media.Brushes]::Black, $null, $startupGearPath)
    $startupDrawingContext.DrawEllipse($startupBadgeBrush, $null, $startupBadgeCenter, 7.5,7.5)
  }
  $startupDrawingContext.Pop()
  $startupDrawingContext.Close()
  $startupBitmap = New-Object Windows.Media.Imaging.RenderTargetBitmap $Size,$Size,96,96,([Windows.Media.PixelFormats]::Pbgra32)
  $startupBitmap.Render($startupDrawing)
  return $startupBitmap
}

function Get-StartupPngBytes($Bitmap) {
  $startupEncoder = New-Object Windows.Media.Imaging.PngBitmapEncoder
  $startupEncoder.Frames.Add([Windows.Media.Imaging.BitmapFrame]::Create($Bitmap))
  $startupPngStream = New-Object IO.MemoryStream
  try { $startupEncoder.Save($startupPngStream); return ,$startupPngStream.ToArray() }
  finally { $startupPngStream.Dispose() }
}

function Get-StartupDibBytes($Bitmap, [int]$Size) {
  # Small ICO frames use classic 32-bit DIBs for Windows shell compatibility.
  $startupBgra = New-Object Windows.Media.Imaging.FormatConvertedBitmap $Bitmap,([Windows.Media.PixelFormats]::Bgra32),$null,0
  $startupPixels = New-Object byte[] ($Size * $Size * 4)
  $startupBgra.CopyPixels($startupPixels, $Size * 4, 0)
  $startupMaskStride = [int]([Math]::Ceiling($Size / 32.0) * 4)
  $startupDibStream = New-Object IO.MemoryStream
  $startupDibWriter = New-Object IO.BinaryWriter $startupDibStream
  try {
    $startupDibWriter.Write([uint32]40)
    $startupDibWriter.Write([int32]$Size); $startupDibWriter.Write([int32]($Size * 2))
    $startupDibWriter.Write([uint16]1); $startupDibWriter.Write([uint16]32)
    $startupDibWriter.Write([uint32]0); $startupDibWriter.Write([uint32]($startupPixels.Length + $startupMaskStride * $Size))
    foreach ($startupUnused in 1..4) { $startupDibWriter.Write([int32]0) }
    for ($startupRow = $Size - 1; $startupRow -ge 0; $startupRow--) {
      $startupDibWriter.Write($startupPixels, $startupRow * $Size * 4, $Size * 4)
    }
    for ($startupRow = $Size - 1; $startupRow -ge 0; $startupRow--) {
      $startupMaskRow = New-Object byte[] $startupMaskStride
      for ($startupColumn = 0; $startupColumn -lt $Size; $startupColumn++) {
        if ($startupPixels[($startupRow * $Size + $startupColumn) * 4 + 3] -eq 0) {
          $startupMaskByte = [int][Math]::Floor($startupColumn / 8.0)
          $startupMaskRow[$startupMaskByte] = $startupMaskRow[$startupMaskByte] -bor (128 -shr ($startupColumn % 8))
        }
      }
      $startupDibWriter.Write($startupMaskRow)
    }
    return ,$startupDibStream.ToArray()
  } finally { $startupDibWriter.Dispose(); $startupDibStream.Dispose() }
}

function Write-StartupIcon([string]$Name, [bool]$SettingsBadge) {
  $startupFrames = foreach ($startupSize in @(16,20,24,32,40,48,64,96,128,256)) {
    $startupBitmap = New-StartupIconBitmap $startupSize $SettingsBadge
    $startupBytes = if ($startupSize -le 64) { Get-StartupDibBytes $startupBitmap $startupSize } else { Get-StartupPngBytes $startupBitmap }
    [pscustomobject]@{ Size = $startupSize; Bytes = $startupBytes }
    if ($startupSize -in @(32,48,256)) {
      [IO.File]::WriteAllBytes((Join-Path $startupIconPreview ($Name + '-' + $startupSize + '.png')), (Get-StartupPngBytes $startupBitmap))
    }
  }
  $startupIconStream = [IO.File]::Create((Join-Path $startupIconBuild ($Name + '.ico')))
  $startupIconWriter = New-Object IO.BinaryWriter $startupIconStream
  try {
    $startupIconWriter.Write([uint16]0); $startupIconWriter.Write([uint16]1); $startupIconWriter.Write([uint16]$startupFrames.Count)
    $startupOffset = 6 + 16 * $startupFrames.Count
    foreach ($startupFrame in $startupFrames) {
      $startupDimension = if ($startupFrame.Size -eq 256) { 0 } else { $startupFrame.Size }
      $startupIconWriter.Write([byte]$startupDimension); $startupIconWriter.Write([byte]$startupDimension)
      $startupIconWriter.Write([byte]0); $startupIconWriter.Write([byte]0)
      $startupIconWriter.Write([uint16]1); $startupIconWriter.Write([uint16]32)
      $startupIconWriter.Write([uint32]$startupFrame.Bytes.Length); $startupIconWriter.Write([uint32]$startupOffset)
      $startupOffset += $startupFrame.Bytes.Length
    }
    foreach ($startupFrame in $startupFrames) { $startupIconWriter.Write([byte[]]$startupFrame.Bytes) }
  } finally { $startupIconWriter.Dispose() }
}

Write-StartupIcon 'OpenAI-Startup' $false
Write-StartupIcon 'OpenAI-Startup-Settings' $true
