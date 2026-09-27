Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

. (Join-Path $PSScriptRoot 'Bridgit.Windows.Common.ps1')

Start-BridgitScript -Name 'start-mobile-android-backend' -Target 'expo android api'
Write-BridgitConfig -Rows @(
  (New-BridgitConfigRow 'api' 'http://localhost:8080')
)

& (Join-Path $PSScriptRoot 'start-web-backend.ps1')
