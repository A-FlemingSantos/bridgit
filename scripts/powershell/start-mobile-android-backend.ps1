Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

. (Join-Path $PSScriptRoot 'Bridgit.Windows.Common.ps1')

# Expo Go returns from the provider consent screen through an exp:// address, which the API must allow.
$mobilePrefixes = [Environment]::GetEnvironmentVariable('APP_MOBILE_REDIRECT_PREFIXES', 'Process')
if ([string]::IsNullOrWhiteSpace($mobilePrefixes)) {
  $mobilePrefixes = 'bridgit://,exp://'
}
Set-BridgitProcessEnvVar -Name 'APP_MOBILE_REDIRECT_PREFIXES' -Value $mobilePrefixes

Start-BridgitScript -Name 'start-mobile-android-backend' -Target 'expo android api'
Write-BridgitConfig -Rows @(
  (New-BridgitConfigRow 'api' 'http://localhost:8080'),
  (New-BridgitConfigRow 'mobile_redirect' $mobilePrefixes)
)

& (Join-Path $PSScriptRoot 'start-web-backend.ps1')
