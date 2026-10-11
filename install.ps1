param([string]$Destination = (Join-Path ([Environment]::GetFolderPath('UserProfile')) 'AppData\Local\ChatGPTStartup'), [switch]$WorkspaceOnly)
$ErrorActionPreference = 'Stop'
$startupSource = Join-Path $PSScriptRoot 'build\app'
$startupInstallRoot = [IO.Path]::GetFullPath($Destination)
if (-not (Test-Path -LiteralPath (Join-Path $startupSource 'ChatGPTStartup.exe'))) { throw 'Run build.ps1 before installing.' }
if (-not $WorkspaceOnly) {
  $startupAllowedRoot = [IO.Path]::GetFullPath((Join-Path ([Environment]::GetFolderPath('UserProfile')) 'AppData\Local\ChatGPTStartup'))
  if ($startupInstallRoot.TrimEnd('\') -ne $startupAllowedRoot.TrimEnd('\')) { throw 'The installation directory must be the current user''s ChatGPTStartup folder.' }
}
New-Item -ItemType Directory -Path $startupInstallRoot -Force | Out-Null
foreach ($startupItem in Get-ChildItem -LiteralPath $startupSource) {
  if ($startupItem.Name -in @('data','test-data','startup-error.log')) { continue }
  Copy-Item -LiteralPath $startupItem.FullName -Destination $startupInstallRoot -Recurse -Force
}
if ($WorkspaceOnly) { $startupShortcutRoot = $startupInstallRoot }
else { $startupShortcutRoot = [Environment]::GetFolderPath('Desktop') }
$startupShell = New-Object -ComObject WScript.Shell
foreach ($startupEntry in @(@('ChatGPT - Startup.lnk',''),@('ChatGPT - Startup Settings.lnk','--settings'))) {
  $startupShortcutFile = Join-Path $startupShortcutRoot $startupEntry[0]
  if (Test-Path -LiteralPath $startupShortcutFile) {
    $startupPreviousShortcut = $startupShell.CreateShortcut($startupShortcutFile)
    if ($startupPreviousShortcut.TargetPath -ne (Join-Path $startupInstallRoot 'ChatGPTStartup.exe')) {
      throw ('An existing shortcut points to a different program and was preserved: ' + $startupShortcutFile)
    }
  }
  $startupShortcut = $startupShell.CreateShortcut($startupShortcutFile)
  $startupShortcut.TargetPath = Join-Path $startupInstallRoot 'ChatGPTStartup.exe'
  $startupShortcut.Arguments = $startupEntry[1]
  $startupShortcut.WorkingDirectory = $startupInstallRoot
  $startupShortcut.Description = 'Personal startup screen for ChatGPT, adapted from dsh-startup-screen'
  $startupIconName = if ($startupEntry[1] -eq '--settings') { 'OpenAI-Startup-Settings.ico' } else { 'OpenAI-Startup.ico' }
  $startupIcon = Join-Path $startupInstallRoot $startupIconName
  if (Test-Path -LiteralPath $startupIcon) { $startupShortcut.IconLocation = $startupIcon }
  $startupShortcut.Save()
}
if (-not $WorkspaceOnly) {
  $startupStartMenu = Join-Path ([Environment]::GetFolderPath('Programs')) 'ChatGPT Startup'
  New-Item -ItemType Directory -Path $startupStartMenu -Force | Out-Null
  foreach ($startupEntry in @('ChatGPT - Startup.lnk','ChatGPT - Startup Settings.lnk')) {
    Copy-Item -LiteralPath (Join-Path $startupShortcutRoot $startupEntry) -Destination (Join-Path $startupStartMenu $startupEntry) -Force
  }
}
Write-Output ([ordered]@{ installed = $true; directory = $startupInstallRoot; shortcuts = $startupShortcutRoot; executable = (Join-Path $startupInstallRoot 'ChatGPTStartup.exe') } | ConvertTo-Json)
