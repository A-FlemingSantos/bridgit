Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
$script:BridgitInputShown = $false

function Import-BridgitLocalSecrets {
  $localSecretsPath = Join-Path $PSScriptRoot 'local.secrets.ps1'
  $originalEnvironment = @{}

  foreach ($entry in [Environment]::GetEnvironmentVariables('Process').GetEnumerator()) {
    $originalEnvironment[$entry.Key] = $entry.Value
  }

  if (Test-Path $localSecretsPath) {
    . $localSecretsPath
  }

  foreach ($name in $originalEnvironment.Keys) {
    if ([Environment]::GetEnvironmentVariable($name, 'Process') -ne $originalEnvironment[$name]) {
      [Environment]::SetEnvironmentVariable($name, $originalEnvironment[$name], 'Process')
    }
  }
}

function Get-BridgitRepoRoot {
  return (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
}

function Get-BridgitTrimmedUrl {
  param(
    [Parameter(Mandatory = $true)]
    [string]$Url
  )

  return $Url.Trim().TrimEnd('/')
}

function Start-BridgitScript {
  param(
    [Parameter(Mandatory = $true)]
    [string]$Name,
    [Parameter(Mandatory = $true)]
    [string]$Target
  )

  Write-Host ''
  Write-Host "[$Name]  $Target" -ForegroundColor Cyan
  Write-Host ''
  $script:BridgitInputShown = $false
}

function Show-BridgitInputHeader {
  if (-not $script:BridgitInputShown) {
    Write-Host 'input'
    $script:BridgitInputShown = $true
  }
}

function New-BridgitConfigRow {
  param(
    [Parameter(Mandatory = $true)]
    [string]$Key,
    [Parameter(Mandatory = $true)]
    [string]$Value
  )

  return [pscustomobject]@{
    Key = $Key
    Value = $Value
  }
}

function Write-BridgitConfig {
  param(
    [Parameter(Mandatory = $true)]
    [object[]]$Rows
  )

  if ($Rows.Count -eq 0) {
    return
  }

  if ($script:BridgitInputShown) {
    Write-Host ''
  }

  Write-Host 'config'
  foreach ($row in $Rows) {
    Write-Host ("  {0,-20} {1}" -f $row.Key, $row.Value)
  }
  Write-Host ''
}

function Write-BridgitRun {
  param(
    [Parameter(Mandatory = $true)]
    [string]$Command
  )

  Write-Host 'run'
  Write-Host "  $Command"
  Write-Host ''
}

function Assert-BridgitCommand {
  param(
    [Parameter(Mandatory = $true)]
    [string]$Name
  )

  if (-not (Get-Command $Name -ErrorAction SilentlyContinue)) {
    throw "Comando obrigatorio nao encontrado no PATH: $Name"
  }
}

function Read-BridgitValue {
  param(
    [Parameter(Mandatory = $true)]
    [string]$Prompt,
    [string]$Default,
    [switch]$Secret
  )

  while ($true) {
    Show-BridgitInputHeader
    if ($Secret) {
      $suffix = if ([string]::IsNullOrEmpty($Default)) { '' } else { ' [Enter usa o valor atual]' }
      $value = Read-Host "  $Prompt$suffix"

      if ([string]::IsNullOrWhiteSpace($value)) {
        if (-not [string]::IsNullOrEmpty($Default)) {
          return $Default
        }

        Write-Warning 'Valor obrigatorio. Tente novamente.'
        continue
      }

      return $value.Trim()
    }

    $suffix = if ([string]::IsNullOrEmpty($Default)) { '' } else { " [$Default]" }
    $value = Read-Host ("  $Prompt" + $suffix)

    if (-not [string]::IsNullOrWhiteSpace($value)) {
      return $value.Trim()
    }

    if (-not [string]::IsNullOrEmpty($Default)) {
      return $Default
    }

    Write-Warning 'Valor obrigatorio. Tente novamente.'
  }
}

function Set-BridgitEnvVar {
  param(
    [Parameter(Mandatory = $true)]
    [string]$Name,
    [Parameter(Mandatory = $true)]
    [string]$Prompt,
    [string]$Default,
    [switch]$Secret,
    [switch]$UseDefaultIfMissing
  )

  $current = [Environment]::GetEnvironmentVariable($Name, 'Process')
  if (-not [string]::IsNullOrWhiteSpace($current)) {
    return $current
  }

  if ($UseDefaultIfMissing -and -not [string]::IsNullOrEmpty($Default)) {
    [Environment]::SetEnvironmentVariable($Name, $Default, 'Process')
    return $Default
  }

  $value = Read-BridgitValue -Prompt $Prompt -Default $Default -Secret:$Secret
  [Environment]::SetEnvironmentVariable($Name, $value, 'Process')
  return $value
}

function Set-BridgitProcessEnvVar {
  param(
    [Parameter(Mandatory = $true)]
    [string]$Name,
    [string]$Value
  )

  if ([string]::IsNullOrWhiteSpace($Value)) {
    [Environment]::SetEnvironmentVariable($Name, $null, 'Process')
    return
  }

  [Environment]::SetEnvironmentVariable($Name, $Value, 'Process')
}

function Invoke-BridgitCommand {
  param(
    [Parameter(Mandatory = $true)]
    [string]$WorkingDirectory,
    [Parameter(Mandatory = $true)]
    [string]$FilePath,
    [string[]]$Arguments = @()
  )

  Push-Location $WorkingDirectory
  try {
    & $FilePath @Arguments
  } finally {
    Pop-Location
  }
}

Import-BridgitLocalSecrets
