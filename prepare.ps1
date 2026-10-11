$ErrorActionPreference = 'Stop'
$startupProjectRoot = [IO.Path]::GetFullPath($PSScriptRoot)
$startupManifest = Get-Content -LiteralPath (Join-Path $startupProjectRoot 'assets\dependencies.lock.json') -Raw | ConvertFrom-Json
$startupPinnedCommit = (Get-Content -LiteralPath (Join-Path $startupProjectRoot 'upstream\COMMIT.txt') -Raw).Trim().TrimStart([char]0xFEFF)
if ($startupPinnedCommit -ne $startupManifest.upstreamCommit) { throw 'The upstream commit and dependency lock do not match.' }
[Net.ServicePointManager]::SecurityProtocol = [Net.ServicePointManager]::SecurityProtocol -bor [Net.SecurityProtocolType]::Tls12

function Resolve-StartupDependencyPath([string]$RelativePath) {
  $startupResolved = [IO.Path]::GetFullPath((Join-Path $startupProjectRoot $RelativePath))
  if (-not $startupResolved.StartsWith($startupProjectRoot.TrimEnd('\') + '\', [StringComparison]::OrdinalIgnoreCase)) {
    throw 'Dependency paths must stay inside the project.'
  }
  return $startupResolved
}

foreach ($startupDependency in $startupManifest.downloads) {
  $startupDestination = Resolve-StartupDependencyPath $startupDependency.destination
  if (-not (Test-Path -LiteralPath $startupDestination)) {
    New-Item -ItemType Directory -Path (Split-Path -Parent $startupDestination) -Force | Out-Null
    $startupDownload = $startupDestination + '.download'
    Write-Output ('Downloading: ' + $startupDependency.name)
    try {
      Invoke-WebRequest -UseBasicParsing -Uri $startupDependency.url -OutFile $startupDownload
      if ((Get-FileHash -Algorithm SHA256 -LiteralPath $startupDownload).Hash -ne $startupDependency.sha256) {
        throw ('Dependency checksum mismatch: ' + $startupDependency.name)
      }
      Move-Item -LiteralPath $startupDownload -Destination $startupDestination
    } finally {
      if (Test-Path -LiteralPath $startupDownload) { Remove-Item -LiteralPath $startupDownload -Force }
    }
  }
  if ((Get-FileHash -Algorithm SHA256 -LiteralPath $startupDestination).Hash -ne $startupDependency.sha256) {
    throw ('Cached dependency checksum mismatch: ' + $startupDependency.name)
  }
  if ($startupDependency.extractTo) {
    $startupSentinel = Resolve-StartupDependencyPath $startupDependency.sentinel
    if (-not (Test-Path -LiteralPath $startupSentinel)) {
      $startupExtractRoot = Resolve-StartupDependencyPath $startupDependency.extractTo
      Write-Output ('Extracting: ' + $startupDependency.name)
      Expand-Archive -LiteralPath $startupDestination -DestinationPath $startupExtractRoot -Force
      if (-not (Test-Path -LiteralPath $startupSentinel)) { throw ('Dependency extraction failed: ' + $startupDependency.name) }
    }
  }
  Write-Output ('Verified: ' + $startupDependency.name)
}

