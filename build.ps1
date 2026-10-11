$ErrorActionPreference = 'Stop'
$startupProjectRoot = $PSScriptRoot
Push-Location -LiteralPath $startupProjectRoot
try {
  if (-not (Get-Command node -ErrorAction SilentlyContinue)) { throw 'Install Node.js 20 or newer before building.' }
  & (Join-Path $startupProjectRoot 'prepare.ps1')
  & node (Join-Path $startupProjectRoot 'build.mjs')
  if ($LASTEXITCODE -ne 0) { throw 'Frontend build failed.' }
  $startupBuildRoot = Join-Path $startupProjectRoot 'build\app'
  & 'C:\Windows\System32\WindowsPowerShell\v1.0\powershell.exe' -NoProfile -ExecutionPolicy Bypass -File (Join-Path $startupProjectRoot 'src\MakeIcon.ps1')
  if ($LASTEXITCODE -ne 0) { throw 'Launcher icon generation failed.' }
  $startupSdkRoot = Join-Path $startupProjectRoot 'runtime\webview2-sdk'
  Copy-Item -LiteralPath (Join-Path $startupSdkRoot 'lib\net462\Microsoft.Web.WebView2.Core.dll') -Destination $startupBuildRoot
  Copy-Item -LiteralPath (Join-Path $startupSdkRoot 'lib\net462\Microsoft.Web.WebView2.Wpf.dll') -Destination $startupBuildRoot
  Copy-Item -LiteralPath (Join-Path $startupSdkRoot 'runtimes\win-x64\native\WebView2Loader.dll') -Destination $startupBuildRoot
  $startupFramework = 'C:\Windows\Microsoft.NET\Framework64\v4.0.30319'
  $startupWpf = Join-Path $startupFramework 'WPF'
  $startupCompiler = Join-Path $startupFramework 'csc.exe'
  $startupOutput = Join-Path $startupBuildRoot 'ChatGPTStartup.exe'
  $startupArguments = @('/nologo','/target:winexe','/platform:x64','/optimize+',('/out:' + $startupOutput),('/win32icon:' + (Join-Path $startupBuildRoot 'OpenAI-Startup.ico')),
    ('/reference:' + (Join-Path $startupWpf 'PresentationCore.dll')),
    ('/reference:' + (Join-Path $startupWpf 'PresentationFramework.dll')),
    ('/reference:' + (Join-Path $startupWpf 'WindowsBase.dll')),
    ('/reference:' + (Join-Path $startupFramework 'System.Xaml.dll')),
    ('/reference:' + (Join-Path $startupFramework 'System.Web.Extensions.dll')),
    ('/reference:' + (Join-Path $startupFramework 'System.Drawing.dll')),
    ('/reference:' + (Join-Path $startupBuildRoot 'Microsoft.Web.WebView2.Core.dll')),
    ('/reference:' + (Join-Path $startupBuildRoot 'Microsoft.Web.WebView2.Wpf.dll')),
    (Join-Path $startupProjectRoot 'src\Launcher.cs'))
  & $startupCompiler @startupArguments
  if ($LASTEXITCODE -ne 0) { throw 'Windows launcher compilation failed.' }
  Write-Output ('BUILD COMPLETE: ' + $startupOutput)
} finally { Pop-Location }
