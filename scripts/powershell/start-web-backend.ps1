Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

. (Join-Path $PSScriptRoot 'Bridgit.Windows.Common.ps1')

function Assert-BridgitDatabaseExists {
  param(
    [Parameter(Mandatory = $true)]
    [string]$Username,
    [Parameter(Mandatory = $true)]
    [string]$Password,
    [string]$Server = 'localhost,1433',
    [string]$DatabaseName = 'bridgit_db'
  )

  Add-Type -AssemblyName 'System.Data' -ErrorAction SilentlyContinue

  $connectionString = "Server=$Server;Database=master;User Id=$Username;Password=$Password;Encrypt=False;TrustServerCertificate=True;Connection Timeout=5"
  $connection = New-Object System.Data.SqlClient.SqlConnection $connectionString

  try {
    $connection.Open()
  } catch {
    throw 'O SQL Server deve estar escutando em localhost:1433 antes de iniciar o backend. Verifique se o servidor esta em execucao.'
  }

  try {
    $command = $connection.CreateCommand()
    $command.CommandText = 'SELECT COUNT(*) FROM sys.databases WHERE name = @dbName'
    $null = $command.Parameters.AddWithValue('@dbName', $DatabaseName)
    $count = [int]$command.ExecuteScalar()

    if ($count -eq 0) {
      throw "O banco de dados '$DatabaseName' nao existe. Crie o banco '$DatabaseName' em localhost:1433 antes de continuar."
    }
  } finally {
    $connection.Close()
  }
}

$repoRoot = Get-BridgitRepoRoot
$apiRoot = Join-Path $repoRoot 'services\api'

Start-BridgitScript -Name 'start-web-backend' -Target 'web api'
Assert-BridgitCommand -Name 'mvn'

$frontendBaseUrl = [Environment]::GetEnvironmentVariable('APP_FRONTEND_BASE_URL', 'Process')
if ([string]::IsNullOrWhiteSpace($frontendBaseUrl)) {
  $frontendBaseUrl = 'http://localhost:5173'
  Set-BridgitProcessEnvVar -Name 'APP_FRONTEND_BASE_URL' -Value $frontendBaseUrl
}

$corsAllowedOrigins = [Environment]::GetEnvironmentVariable('APP_CORS_ALLOWED_ORIGINS', 'Process')
if ([string]::IsNullOrWhiteSpace($corsAllowedOrigins)) {
  $corsAllowedOrigins = 'http://localhost:5173'
  Set-BridgitProcessEnvVar -Name 'APP_CORS_ALLOWED_ORIGINS' -Value $corsAllowedOrigins
}

$datasourceUsername = [Environment]::GetEnvironmentVariable('SPRING_DATASOURCE_USERNAME', 'Process')
if ([string]::IsNullOrWhiteSpace($datasourceUsername)) {
  $datasourceUsername = 'sa'
}

$datasourcePassword = [Environment]::GetEnvironmentVariable('SPRING_DATASOURCE_PASSWORD', 'Process')
if ([string]::IsNullOrWhiteSpace($datasourcePassword)) {
  throw 'SPRING_DATASOURCE_PASSWORD nao esta definida. Coloque a senha em scripts/powershell/local.secrets.ps1.'
}

$jwtSecret = [Environment]::GetEnvironmentVariable('APP_JWT_SECRET', 'Process')
if ([string]::IsNullOrWhiteSpace($jwtSecret)) {
  throw 'APP_JWT_SECRET nao esta definida. Coloque a chave em scripts/powershell/local.secrets.ps1.'
}

$integrationTokenKey = [Environment]::GetEnvironmentVariable('APP_INTEGRATION_TOKEN_KEY_B64', 'Process')
if ([string]::IsNullOrWhiteSpace($integrationTokenKey)) {
  throw 'APP_INTEGRATION_TOKEN_KEY_B64 nao esta definida. Coloque a chave em scripts/powershell/local.secrets.ps1.'
}

$defaultRedirectUris = @{
  'APP_ONEDRIVE_REDIRECT_URI' = 'http://localhost:8080/api/providers/onedrive/callback'
  'APP_GOOGLE_DRIVE_REDIRECT_URI' = 'http://localhost:8080/api/providers/google-drive/callback'
  'APP_DROPBOX_REDIRECT_URI' = 'http://localhost:8080/api/providers/dropbox/callback'
}

foreach ($entry in $defaultRedirectUris.GetEnumerator()) {
  $currentValue = [Environment]::GetEnvironmentVariable($entry.Key, 'Process')
  if ([string]::IsNullOrWhiteSpace($currentValue)) {
    Set-BridgitProcessEnvVar -Name $entry.Key -Value $entry.Value
  }
}

function Get-ProviderConfigStatus {
  param(
    [Parameter(Mandatory = $true)]
    [string]$ClientIdVar,
    [Parameter(Mandatory = $true)]
    [string]$ClientSecretVar
  )

  $clientId = [Environment]::GetEnvironmentVariable($ClientIdVar, 'Process')
  $clientSecret = [Environment]::GetEnvironmentVariable($ClientSecretVar, 'Process')

  if ([string]::IsNullOrWhiteSpace($clientId) -or [string]::IsNullOrWhiteSpace($clientSecret)) {
    return 'missing'
  }

  return 'loaded'
}

Write-BridgitConfig -Rows @(
  (New-BridgitConfigRow 'web_url' (Get-BridgitTrimmedUrl -Url $frontendBaseUrl)),
  (New-BridgitConfigRow 'spring_db_password' 'loaded'),
  (New-BridgitConfigRow 'jwt' 'loaded'),
  (New-BridgitConfigRow 'integration_token_key' 'loaded'),
  (New-BridgitConfigRow 'onedrive_oauth' (Get-ProviderConfigStatus -ClientIdVar 'APP_ONEDRIVE_CLIENT_ID' -ClientSecretVar 'APP_ONEDRIVE_CLIENT_SECRET')),
  (New-BridgitConfigRow 'google_drive_oauth' (Get-ProviderConfigStatus -ClientIdVar 'APP_GOOGLE_DRIVE_CLIENT_ID' -ClientSecretVar 'APP_GOOGLE_DRIVE_CLIENT_SECRET')),
  (New-BridgitConfigRow 'dropbox_oauth' (Get-ProviderConfigStatus -ClientIdVar 'APP_DROPBOX_CLIENT_ID' -ClientSecretVar 'APP_DROPBOX_CLIENT_SECRET'))
)

Assert-BridgitDatabaseExists -Username $datasourceUsername -Password $datasourcePassword

Write-BridgitRun -Command 'mvn spring-boot:run'
Invoke-BridgitCommand -WorkingDirectory $apiRoot -FilePath 'mvn' -Arguments @('spring-boot:run')
