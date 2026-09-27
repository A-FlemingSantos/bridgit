Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

. (Join-Path $PSScriptRoot 'Bridgit.Windows.Common.ps1')

function Get-BridgitAndroidClient {
  param(
    [Parameter(Mandatory = $true)]
    [string]$Value
  )

  $normalizedValue = $Value.Trim().ToLowerInvariant()
  switch ($normalizedValue) {
    'expo' { return 'expo-go' }
    'expo-go' { return 'expo-go' }
    'go' { return 'expo-go' }
    'dev' { return 'dev-build' }
    'dev-build' { return 'dev-build' }
    'development-build' { return 'dev-build' }
  }

  throw "Cliente Android invalido: $Value. Use expo-go ou dev-build."
}

$repoRoot = Get-BridgitRepoRoot
$mobileRoot = Join-Path $repoRoot 'apps\mobile'

Start-BridgitScript -Name 'start-mobile-android-expo' -Target 'expo android'
Assert-BridgitCommand -Name 'npx'

$expoGoPort = Set-BridgitEnvVar -Name 'BRIDGIT_EXPO_GO_PORT' -Prompt 'expo_go_port' -Default '8082' -UseDefaultIfMissing
$androidClient = Set-BridgitEnvVar -Name 'BRIDGIT_ANDROID_CLIENT' -Prompt 'android_client' -Default 'expo-go' -UseDefaultIfMissing
$androidClient = Get-BridgitAndroidClient -Value $androidClient
Set-BridgitProcessEnvVar -Name 'BRIDGIT_ANDROID_CLIENT' -Value $androidClient

$apiBaseUrl = [Environment]::GetEnvironmentVariable('EXPO_PUBLIC_API_BASE_URL', 'Process')
if ([string]::IsNullOrWhiteSpace($apiBaseUrl)) {
  $apiBaseUrl = 'http://localhost:8080'
}

$apiBaseUrl = Get-BridgitTrimmedUrl -Url $apiBaseUrl
Set-BridgitProcessEnvVar -Name 'EXPO_PUBLIC_API_BASE_URL' -Value $apiBaseUrl

$expoArguments = @('expo', 'start', '--port', $expoGoPort)
switch ($androidClient) {
  'dev-build' { $expoArguments += '--dev-client' }
  'expo-go' { $expoArguments += '--go' }
}

Write-BridgitConfig -Rows @(
  (New-BridgitConfigRow 'android_client' $androidClient),
  (New-BridgitConfigRow 'expo_go_port' $expoGoPort),
  (New-BridgitConfigRow 'api_base_url' $apiBaseUrl)
)
Write-BridgitRun -Command "npx $($expoArguments -join ' ')"
Invoke-BridgitCommand -WorkingDirectory $mobileRoot -FilePath 'npx' -Arguments $expoArguments
