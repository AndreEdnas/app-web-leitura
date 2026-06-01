[CmdletBinding()]
param(
  [string]$InstallDir = "$env:ProgramFiles\EdnasLeitura",
  [string]$BackendServiceName = "EdnasBackend",
  [string]$TunnelServiceName = "EdnasTunnel",
  [switch]$RemoveFiles
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

function Write-Step([string]$Message) {
  Write-Host ""
  Write-Host "==> $Message" -ForegroundColor Cyan
}

function Assert-Admin {
  $identity = [Security.Principal.WindowsIdentity]::GetCurrent()
  $principal = New-Object Security.Principal.WindowsPrincipal($identity)
  if (-not $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
    throw "Executa este script como Administrador."
  }
}

function Remove-ServiceIfExists([string]$Name) {
  $svc = Get-Service -Name $Name -ErrorAction SilentlyContinue
  if ($null -eq $svc) {
    return
  }

  if ($svc.Status -ne "Stopped") {
    & sc.exe stop $Name | Out-Null
    Start-Sleep -Seconds 2
  }

  & sc.exe delete $Name | Out-Null
}

Assert-Admin
$InstallDir = [System.IO.Path]::GetFullPath($InstallDir)

Write-Step "Remover servicos"
Remove-ServiceIfExists -Name $TunnelServiceName
Remove-ServiceIfExists -Name $BackendServiceName

if ($RemoveFiles) {
  Write-Step "Remover ficheiros locais"
  if ($InstallDir -notmatch "EdnasLeitura") {
    throw "Seguranca: caminho inesperado para apagar: $InstallDir"
  }

  if (Test-Path -LiteralPath $InstallDir) {
    Remove-Item -LiteralPath $InstallDir -Recurse -Force
  }
}

Write-Step "Desinstalacao concluida."
