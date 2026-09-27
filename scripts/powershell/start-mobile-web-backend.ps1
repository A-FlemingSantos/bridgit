Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

. (Join-Path $PSScriptRoot 'Bridgit.Windows.Common.ps1')

$expoWebPort = '8081'
$webPort = '5173'
$expoOrigins = @(
  "http://localhost:$expoWebPort",
  "http://127.0.0.1:$expoWebPort"
)

$current = [Environment]::GetEnvironmentVariable('APP_CORS_ALLOWED_ORIGINS', 'Process')
if ([string]::IsNullOrWhiteSpace($current)) {
  $current = "http://localhost:$webPort,http://127.0.0.1:$webPort"
}

$parts = @($current -split ',' | ForEach-Object { $_.Trim() } | Where-Object { $_ })
foreach ($origin in $expoOrigins) {
  if ($parts -notcontains $origin) {
    $parts += $origin
  }
}

Set-BridgitProcessEnvVar -Name 'APP_CORS_ALLOWED_ORIGINS' -Value ($parts -join ',')

Start-BridgitScript -Name 'start-mobile-web-backend' -Target 'mobile:web api'
Write-BridgitConfig -Rows @(
  (New-BridgitConfigRow 'cors' ($parts -join ','))
)

& (Join-Path $PSScriptRoot 'start-web-backend.ps1')
