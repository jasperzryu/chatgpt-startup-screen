$ErrorActionPreference = 'Stop'
$startupSource = Join-Path $PSScriptRoot 'build\app'
$startupProfile = [Environment]::GetFolderPath('UserProfile')
$startupKnownRoots = @(
  (Join-Path $startupProfile 'AppData\Local\ChatGPTStartup'),
  (Join-Path $startupProfile 'AppData\Local\Packages\OpenAI.Codex_2p2nqsd0c76g0\LocalCache\Local\ChatGPTStartup')
)
$startupShortcutRoots = @(
  [Environment]::GetFolderPath('Desktop'),
  (Join-Path ([Environment]::GetFolderPath('Programs')) 'ChatGPT Startup')
)
$startupShell = New-Object -ComObject WScript.Shell
$startupEntries = foreach ($startupShortcutRoot in $startupShortcutRoots) {
  foreach ($startupEntry in @(@('ChatGPT - Startup.lnk',''),@('ChatGPT - Startup Settings.lnk','--settings'))) {
    $startupShortcutPath = Join-Path $startupShortcutRoot $startupEntry[0]
    if (-not (Test-Path -LiteralPath $startupShortcutPath)) { throw ('Shortcut is missing: ' + $startupShortcutPath) }
    $startupShortcut = $startupShell.CreateShortcut($startupShortcutPath)
    $startupTarget = [IO.Path]::GetFullPath($startupShortcut.TargetPath)
    $startupTargetRoot = Split-Path -Parent $startupTarget
    if ($startupTargetRoot -notin $startupKnownRoots -or
        [IO.Path]::GetFileName($startupTarget) -ne 'ChatGPTStartup.exe' -or
        $startupShortcut.Arguments -ne $startupEntry[1]) {
      throw ('Shortcut ownership check failed: ' + $startupShortcutPath)
    }
    [pscustomobject]@{
      Path = $startupShortcutPath; Target = $startupTarget; Root = $startupTargetRoot
      Arguments = $startupShortcut.Arguments
      Icon = if ($startupEntry[1] -eq '--settings') { 'OpenAI-Startup-Settings.ico' } else { 'OpenAI-Startup.ico' }
    }
  }
}
$startupUsedRoots = @($startupEntries.Root | Select-Object -Unique)
$startupConfigurationHashes = @{}
foreach ($startupRoot in $startupUsedRoots) {
  $startupRegistration = Get-Content -LiteralPath (Join-Path $startupRoot 'launcher.json') -Raw | ConvertFrom-Json
  if ($startupRegistration.appId -ne 'OpenAI.Codex_2p2nqsd0c76g0!App' -or
      $startupRegistration.source -ne 'https://github.com/6shenhonghong9/dsh-startup-screen' -or
      $startupRegistration.commit -ne '4a2cfe642867fac013fdef90095981544a819a2a') {
    throw ('Installed launcher ownership check failed: ' + $startupRoot)
  }
  $startupConfig = Join-Path $startupRoot 'data\config.json'
  if (Test-Path -LiteralPath $startupConfig) { $startupConfigurationHashes[$startupConfig] = (Get-FileHash -LiteralPath $startupConfig).Hash }
}
foreach ($startupFile in @('OpenAI-Startup.ico','OpenAI-Startup-Settings.ico','ChatGPTStartup.exe','README.md')) {
  if (-not (Test-Path -LiteralPath (Join-Path $startupSource $startupFile))) { throw ('Build file is missing: ' + $startupFile) }
}
foreach ($startupRoot in $startupUsedRoots) {
  foreach ($startupFile in @('OpenAI-Startup.ico','OpenAI-Startup-Settings.ico','ChatGPTStartup.exe','README.md')) {
    Copy-Item -LiteralPath (Join-Path $startupSource $startupFile) -Destination (Join-Path $startupRoot $startupFile) -Force
  }
}
Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
public static class StartupIconShellNotify {
  [DllImport("shell32.dll", CharSet=CharSet.Unicode)]
  public static extern void SHChangeNotify(uint eventId, uint flags, string path, IntPtr secondItem);
}
'@
$startupUpdated = foreach ($startupEntry in $startupEntries) {
  $startupShortcut = $startupShell.CreateShortcut($startupEntry.Path)
  $startupIcon = Join-Path $startupEntry.Root $startupEntry.Icon
  $startupShortcut.IconLocation = $startupIcon + ',0'
  $startupShortcut.Save()
  [StartupIconShellNotify]::SHChangeNotify(0x2000,0x5,$startupEntry.Path,[IntPtr]::Zero)
  $startupReadBack = $startupShell.CreateShortcut($startupEntry.Path)
  if ($startupReadBack.TargetPath -ne $startupEntry.Target -or $startupReadBack.Arguments -ne $startupEntry.Arguments -or
      $startupReadBack.IconLocation -ne ($startupIcon + ',0')) { throw ('Shortcut verification failed: ' + $startupEntry.Path) }
  [pscustomobject]@{ shortcut = $startupEntry.Path; icon = $startupReadBack.IconLocation; target = $startupReadBack.TargetPath; arguments = $startupReadBack.Arguments }
}
foreach ($startupConfig in $startupConfigurationHashes.Keys) {
  if ((Get-FileHash -LiteralPath $startupConfig).Hash -ne $startupConfigurationHashes[$startupConfig]) { throw 'Existing settings changed during the icon update.' }
}
$startupIconReport = [ordered]@{ updated = $true; shortcuts = $startupUpdated; settingsPreserved = $true; checkedUtc = [DateTime]::UtcNow.ToString('o') }
$startupIconReport | ConvertTo-Json -Depth 4 | Set-Content -LiteralPath (Join-Path $PSScriptRoot 'icon-update-report.json') -Encoding utf8
$startupIconReport | ConvertTo-Json -Depth 4
