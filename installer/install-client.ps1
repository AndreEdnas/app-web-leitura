[CmdletBinding()]
param(
  [string]$InstallDir = "$env:ProgramFiles\EdnasLeitura",
  [string]$SourceDir = "",
  [string]$NodeExePath = "",
  [string]$CloudflaredExePath = "",
  [string]$CfBase = "",
  [string]$CfAppKey = "",
  [string]$DbUser = "",
  [string]$DbPassword = "",
  [string]$TunnelToken = "",
  [string]$PublicWebUrl = "https://picagem-ednas.vercel.app",
  [string]$BackendServiceName = "EdnasBackend",
  [string]$TunnelServiceName = "EdnasTunnel",
  [switch]$PromptValues,
  [switch]$SkipCopy
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

function Invoke-RobocopySafe(
  [string]$From,
  [string]$To,
  [string[]]$ExtraArgs = @()
) {
  if (-not (Test-Path -LiteralPath $From)) {
    throw "Pasta de origem nao encontrada: $From"
  }

  New-Item -ItemType Directory -Path $To -Force | Out-Null

  $args = @($From, $To, "/E", "/R:1", "/W:1", "/NFL", "/NDL", "/NJH", "/NJS", "/NP")
  if ($ExtraArgs.Count -gt 0) {
    $args += $ExtraArgs
  }

  & robocopy @args | Out-Null
  $exitCode = $LASTEXITCODE
  if ($exitCode -ge 8) {
    throw "Falha no robocopy ($exitCode): $From -> $To"
  }
}

function Get-EnvValue([string]$EnvPath, [string]$Key) {
  if (-not (Test-Path -LiteralPath $EnvPath)) {
    return ""
  }

  $prefix = "$Key="
  foreach ($line in Get-Content -Path $EnvPath) {
    if ($line.StartsWith($prefix)) {
      return $line.Substring($prefix.Length).Trim()
    }
  }

  return ""
}

function Read-SecretText([string]$Label) {
  $secure = Read-Host $Label -AsSecureString
  $ptr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
  try {
    return [Runtime.InteropServices.Marshal]::PtrToStringBSTR($ptr)
  } finally {
    [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($ptr)
  }
}

function Resolve-Value(
  [string]$Provided,
  [string]$Stored,
  [string]$Label,
  [bool]$Secret = $false
) {
  if (-not [string]::IsNullOrWhiteSpace($Provided)) {
    return $Provided.Trim()
  }

  if (-not [string]::IsNullOrWhiteSpace($Stored)) {
    return $Stored.Trim()
  }

  if ($PromptValues) {
    if ($Secret) {
      return (Read-SecretText $Label).Trim()
    }

    return (Read-Host $Label).Trim()
  }

  return ""
}

function Stop-ServiceIfExists([string]$Name) {
  $svc = Get-Service -Name $Name -ErrorAction SilentlyContinue
  if ($null -eq $svc) {
    return
  }

  if ($svc.Status -ne "Stopped") {
    & sc.exe stop $Name | Out-Null
    Start-Sleep -Seconds 2
  }
}

function Configure-Service(
  [string]$Name,
  [string]$DisplayName,
  [string]$BinPath,
  [string]$Description
) {
  $svc = Get-Service -Name $Name -ErrorAction SilentlyContinue

  if ($null -eq $svc) {
    & sc.exe create $Name "binPath= $BinPath" "start= auto" "DisplayName= $DisplayName" | Out-Null
  } else {
    Stop-ServiceIfExists -Name $Name
    & sc.exe config $Name "binPath= $BinPath" "start= auto" "DisplayName= $DisplayName" | Out-Null
  }

  & sc.exe description $Name $Description | Out-Null
  & sc.exe failure $Name "reset= 0" "actions= restart/5000/restart/5000/restart/5000" | Out-Null
}

Assert-Admin

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
if ([string]::IsNullOrWhiteSpace($SourceDir)) {
  $SourceDir = (Resolve-Path (Join-Path $scriptDir "..")).Path
}

$SourceDir = [System.IO.Path]::GetFullPath($SourceDir)
$InstallDir = [System.IO.Path]::GetFullPath($InstallDir)

$sourceBackend = Join-Path $SourceDir "backend"
$sourceBuild = Join-Path $SourceDir "build"
$sourceBuildIndex = Join-Path $sourceBuild "index.html"

if (-not (Test-Path -LiteralPath (Join-Path $sourceBackend "server.js"))) {
  throw "Nao encontrei backend em: $sourceBackend"
}

$sourceAndInstallEqual = $SourceDir.TrimEnd("\") -ieq $InstallDir.TrimEnd("\")
if ($sourceAndInstallEqual) {
  $SkipCopy = $true
}

if (-not $SkipCopy) {
  Write-Step "Copiar ficheiros para $InstallDir"
  Stop-ServiceIfExists -Name $BackendServiceName
  Stop-ServiceIfExists -Name $TunnelServiceName
  New-Item -ItemType Directory -Path $InstallDir -Force | Out-Null

  Invoke-RobocopySafe `
    -From $sourceBackend `
    -To (Join-Path $InstallDir "backend") `
    -ExtraArgs @("/XD", ".git")

  if (Test-Path -LiteralPath $sourceBuildIndex) {
    Invoke-RobocopySafe `
      -From $sourceBuild `
      -To (Join-Path $InstallDir "build")
  } else {
    Write-Step "Build local nao encontrado. Segue em modo Vercel-only."
  }

  $sourceInstaller = Join-Path $SourceDir "installer"
  if (Test-Path -LiteralPath $sourceInstaller) {
    Invoke-RobocopySafe `
      -From $sourceInstaller `
      -To (Join-Path $InstallDir "installer") `
      -ExtraArgs @("/XF", "prepare-package.ps1")
  }
}

Write-Step "Resolver binario Node.js"
$nodeExe = ""
if (-not [string]::IsNullOrWhiteSpace($NodeExePath)) {
  $nodeExe = [System.IO.Path]::GetFullPath($NodeExePath)
} else {
  $nodeCmd = Get-Command node -ErrorAction SilentlyContinue
  if ($null -ne $nodeCmd) {
    $nodeExe = $nodeCmd.Source
  }
}

if ([string]::IsNullOrWhiteSpace($nodeExe) -or -not (Test-Path -LiteralPath $nodeExe)) {
  throw "Node.js nao encontrado. Instala Node LTS e volta a correr o script."
}

$installEnv = Join-Path $InstallDir "backend\.env"
$sourceEnv = Join-Path $sourceBackend ".env"

$storedCfBase = Get-EnvValue -EnvPath $installEnv -Key "CF_BASE"
if ([string]::IsNullOrWhiteSpace($storedCfBase)) {
  $storedCfBase = Get-EnvValue -EnvPath $sourceEnv -Key "CF_BASE"
}

$storedCfAppKey = Get-EnvValue -EnvPath $installEnv -Key "CF_APP_KEY"
if ([string]::IsNullOrWhiteSpace($storedCfAppKey)) {
  $storedCfAppKey = Get-EnvValue -EnvPath $sourceEnv -Key "CF_APP_KEY"
}

$storedDbUser = Get-EnvValue -EnvPath $installEnv -Key "DB_USER"
$storedDbPassword = Get-EnvValue -EnvPath $installEnv -Key "DB_PASSWORD"

$CfBase = Resolve-Value -Provided $CfBase -Stored $storedCfBase -Label "CF_BASE"
$CfAppKey = Resolve-Value -Provided $CfAppKey -Stored $storedCfAppKey -Label "CF_APP_KEY"
$DbUser = Resolve-Value -Provided $DbUser -Stored $storedDbUser -Label "DB_USER"
$DbPassword = Resolve-Value -Provided $DbPassword -Stored $storedDbPassword -Label "DB_PASSWORD" -Secret $true

if ([string]::IsNullOrWhiteSpace($CfBase)) {
  throw "CF_BASE obrigatorio. Exemplo: https://ednas-cloud.andre-86d.workers.dev"
}

if ([string]::IsNullOrWhiteSpace($CfAppKey)) {
  throw "CF_APP_KEY obrigatorio."
}

Write-Step "Escrever backend\\.env"
$frontendBuildPath = Join-Path $InstallDir "build"
$frontendBuildIndex = Join-Path $frontendBuildPath "index.html"
$envLines = @(
  "CF_BASE=$CfBase"
  "CF_APP_KEY=$CfAppKey"
  "DB_USER=$DbUser"
  "DB_PASSWORD=$DbPassword"
  "MODO_INSTALACAO=false"
)

if (Test-Path -LiteralPath $frontendBuildIndex) {
  $envLines += "FRONTEND_BUILD_PATH=$frontendBuildPath"
}

$envLines | Set-Content -Path $installEnv -Encoding ASCII

Write-Step "Configurar servico backend"
$backendScript = Join-Path $InstallDir "backend\server.js"
$backendBinPath = "`"$nodeExe`" `"$backendScript`""
Configure-Service `
  -Name $BackendServiceName `
  -DisplayName "EDNAS Backend" `
  -BinPath $backendBinPath `
  -Description "Backend local EDNAS (licenca + SQL + API)."
Start-Service -Name $BackendServiceName

$TunnelToken = Resolve-Value -Provided $TunnelToken -Stored "" -Label "Tunnel token (opcional)"

if (-not [string]::IsNullOrWhiteSpace($TunnelToken)) {
  Write-Step "Configurar cloudflared"
  if ([string]::IsNullOrWhiteSpace($CloudflaredExePath)) {
    $CloudflaredExePath = Join-Path $InstallDir "tools\cloudflared.exe"
  }

  $CloudflaredExePath = [System.IO.Path]::GetFullPath($CloudflaredExePath)
  if (-not (Test-Path -LiteralPath $CloudflaredExePath)) {
    New-Item -ItemType Directory -Path (Split-Path -Parent $CloudflaredExePath) -Force | Out-Null
    Invoke-WebRequest `
      -Uri "https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-windows-amd64.exe" `
      -OutFile $CloudflaredExePath
  }

  $secretDir = Join-Path $InstallDir "secrets"
  New-Item -ItemType Directory -Path $secretDir -Force | Out-Null
  $tokenPath = Join-Path $secretDir "tunnel-token.txt"
  Set-Content -Path $tokenPath -Value $TunnelToken -Encoding ASCII -NoNewline

  $tunnelBinPath = "`"$CloudflaredExePath`" tunnel run --token-file `"$tokenPath`""
  Configure-Service `
    -Name $TunnelServiceName `
    -DisplayName "EDNAS Tunnel" `
    -BinPath $tunnelBinPath `
    -Description "Tunnel Cloudflare EDNAS."
  Start-Service -Name $TunnelServiceName
} else {
  Write-Step "Tunnel nao configurado (token vazio)."
}

Write-Step "Criar atalho web"
$desktopShortcut = Join-Path ([Environment]::GetFolderPath("CommonDesktopDirectory")) "EDNAS Leitura.url"
@(
  "[InternetShortcut]"
  "URL=$PublicWebUrl"
) | Set-Content -Path $desktopShortcut -Encoding ASCII

Write-Step "Instalacao concluida."
Write-Host "Site publico: $PublicWebUrl" -ForegroundColor Green
Write-Host "Backend local instalado para responder no tunnel deste cliente." -ForegroundColor Green
