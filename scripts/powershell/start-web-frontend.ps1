Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

. (Join-Path $PSScriptRoot 'Bridgit.Windows.Common.ps1')

$repoRoot = Get-BridgitRepoRoot

Start-BridgitScript -Name 'start-web-frontend' -Target 'web app'
Assert-BridgitCommand -Name 'npm'

Write-BridgitConfig -Rows @(
  (New-BridgitConfigRow 'cwd' $repoRoot)
)
Write-BridgitRun -Command 'npm run dev'
Invoke-BridgitCommand -WorkingDirectory $repoRoot -FilePath 'npm' -Arguments @('run', 'dev')
