Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

. (Join-Path $PSScriptRoot 'Bridgit.Windows.Common.ps1')

$repoRoot = Get-BridgitRepoRoot

Start-BridgitScript -Name 'start-mobile-web-expo' -Target 'mobile:web'
Assert-BridgitCommand -Name 'npm'

$apiBaseUrl = [Environment]::GetEnvironmentVariable('EXPO_PUBLIC_API_BASE_URL', 'Process')
if ([string]::IsNullOrWhiteSpace($apiBaseUrl)) {
  $apiBaseUrl = 'http://localhost:8080'
}

$apiBaseUrl = Get-BridgitTrimmedUrl -Url $apiBaseUrl
Set-BridgitProcessEnvVar -Name 'EXPO_PUBLIC_API_BASE_URL' -Value $apiBaseUrl

Write-BridgitConfig -Rows @(
  (New-BridgitConfigRow 'api_base_url' $apiBaseUrl)
)
Write-BridgitRun -Command 'npm run mobile:web'
Invoke-BridgitCommand -WorkingDirectory $repoRoot -FilePath 'npm' -Arguments @('run', 'mobile:web')
