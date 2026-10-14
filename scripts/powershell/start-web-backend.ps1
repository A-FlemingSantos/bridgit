# Parametros do banco: o padrao e o SQL Server local em localhost:1433, banco bridgit_db.
# Se mudar host ou porta e SPRING_DATASOURCE_URL nao estiver definida, a URL JDBC e montada com eles.
[CmdletBinding()]
param(
  [string]$DatabaseHost = 'localhost',
  [ValidateRange(1, 65535)]
  [int]$DatabasePort = 1433,
  [string]$DatabaseName = 'bridgit_db'
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

. (Join-Path $PSScriptRoot 'Bridgit.Windows.Common.ps1')

# Confirma que o SQL Server responde e cria o banco se ele ainda nao existir.
function Confirm-BridgitDatabase {
  param(
    [Parameter(Mandatory = $true)]
    [string]$Username,
    [Parameter(Mandatory = $true)]
    [string]$Password,
    [Parameter(Mandatory = $true)]
    [string]$DatabaseHost,
    [Parameter(Mandatory = $true)]
    [int]$DatabasePort,
    [Parameter(Mandatory = $true)]
    [string]$DatabaseName
  )

  Add-Type -AssemblyName 'System.Data' -ErrorAction SilentlyContinue

  $builder = New-Object System.Data.SqlClient.SqlConnectionStringBuilder
  $builder['Data Source'] = "$DatabaseHost,$DatabasePort"
  $builder['Initial Catalog'] = 'master'
  $builder['User ID'] = $Username
  $builder['Password'] = $Password
  $builder['Encrypt'] = $false
  $builder['TrustServerCertificate'] = $true
  $builder['Connect Timeout'] = 5
  $connection = New-Object System.Data.SqlClient.SqlConnection $builder.ConnectionString

  try {
    $connection.Open()
  } catch {
    throw "Nao foi possivel conectar ao SQL Server em ${DatabaseHost}:${DatabasePort} com o usuario '$Username'. Verifique se o servidor esta em execucao e se SPRING_DATASOURCE_USERNAME e SPRING_DATASOURCE_PASSWORD estao corretos. Detalhe: $($_.Exception.Message)"
  }

  try {
    $command = $connection.CreateCommand()
    $command.CommandText = 'SELECT COUNT(*) FROM sys.databases WHERE name = @dbName'
    $null = $command.Parameters.AddWithValue('@dbName', $DatabaseName)
    $count = [int]$command.ExecuteScalar()

    if ($count -eq 0) {
      Write-Host "  Banco '$DatabaseName' nao existe em ${DatabaseHost}:${DatabasePort}. Criando..."
      $create = $connection.CreateCommand()
      # O nome de banco nao pode ser parametro de CREATE DATABASE; QUOTENAME evita injecao.
      $create.CommandText = 'DECLARE @sql nvarchar(400) = N''CREATE DATABASE '' + QUOTENAME(@dbName); EXEC (@sql);'
      $null = $create.Parameters.AddWithValue('@dbName', $DatabaseName)
      try {
        $null = $create.ExecuteNonQuery()
      } catch {
        throw "Nao foi possivel criar o banco '$DatabaseName' em ${DatabaseHost}:${DatabasePort}. Crie-o manualmente ou use um usuario com permissao CREATE DATABASE. Detalhe: $($_.Exception.Message)"
      }
      Write-Host "  Banco '$DatabaseName' criado."
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
  (New-BridgitConfigRow 'database' "${DatabaseHost}:${DatabasePort}/${DatabaseName}"),
  (New-BridgitConfigRow 'spring_db_password' 'loaded'),
  (New-BridgitConfigRow 'jwt' 'loaded'),
  (New-BridgitConfigRow 'integration_token_key' 'loaded'),
  (New-BridgitConfigRow 'onedrive_oauth' (Get-ProviderConfigStatus -ClientIdVar 'APP_ONEDRIVE_CLIENT_ID' -ClientSecretVar 'APP_ONEDRIVE_CLIENT_SECRET')),
  (New-BridgitConfigRow 'google_drive_oauth' (Get-ProviderConfigStatus -ClientIdVar 'APP_GOOGLE_DRIVE_CLIENT_ID' -ClientSecretVar 'APP_GOOGLE_DRIVE_CLIENT_SECRET')),
  (New-BridgitConfigRow 'dropbox_oauth' (Get-ProviderConfigStatus -ClientIdVar 'APP_DROPBOX_CLIENT_ID' -ClientSecretVar 'APP_DROPBOX_CLIENT_SECRET'))
)

if ([string]::IsNullOrWhiteSpace([Environment]::GetEnvironmentVariable('SPRING_DATASOURCE_URL', 'Process')) -and
    ($DatabaseHost -ne 'localhost' -or $DatabasePort -ne 1433 -or $DatabaseName -ne 'bridgit_db')) {
  Set-BridgitProcessEnvVar -Name 'SPRING_DATASOURCE_URL' -Value "jdbc:sqlserver://${DatabaseHost}:${DatabasePort};databaseName=${DatabaseName};encrypt=false;trustServerCertificate=true"
}

Confirm-BridgitDatabase -Username $datasourceUsername -Password $datasourcePassword -DatabaseHost $DatabaseHost -DatabasePort $DatabasePort -DatabaseName $DatabaseName

Write-BridgitRun -Command 'mvn spring-boot:run'
Invoke-BridgitCommand -WorkingDirectory $apiRoot -FilePath 'mvn' -Arguments @('spring-boot:run')
