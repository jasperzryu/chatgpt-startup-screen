$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName PresentationCore,WindowsBase
$brandProjectRoot = Split-Path -Parent $PSScriptRoot
[xml]$brandSource = Get-Content -LiteralPath (Join-Path $brandProjectRoot 'assets\official-blossom.svg') -Raw
$brandPath = @($brandSource.svg.path | Where-Object { $_.fill -eq 'black' })[-1].d
$brandBounds = [Windows.Media.Geometry]::Parse($brandPath).Bounds
$brandInvariant = [Globalization.CultureInfo]::InvariantCulture
$brandViewBox = (@($brandBounds.X, $brandBounds.Y, $brandBounds.Width, $brandBounds.Height) | ForEach-Object { $_.ToString('0.####', $brandInvariant) }) -join ' '
$brandSvg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="'+$brandViewBox+'"><path d="'+$brandPath+'"/></svg>'
[IO.File]::WriteAllText((Join-Path $brandProjectRoot 'assets\openai.svg'), $brandSvg, (New-Object Text.UTF8Encoding $false))
Write-Output ('Official Blossom viewBox: '+$brandViewBox)
