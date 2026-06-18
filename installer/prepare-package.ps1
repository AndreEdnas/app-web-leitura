[CmdletBinding()]
param(
  [string]$OutputDir = "dist\ednas-client",
  [switch]$IncludeFrontendBuild,
  [switch]$SkipFrontendBuild,
  [switch]$SkipBackendDeps
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

function Initialize-ConsoleEncoding {
  try {
    $utf8 = New-Object System.Text.UTF8Encoding($false)
    [Console]::InputEncoding = $utf8
    [Console]::OutputEncoding = $utf8
    $OutputEncoding = $utf8
  } catch {
    # Consolas antigas podem não permitir alterar o encoding; nesse caso seguimos.
  }
}

Initialize-ConsoleEncoding

function Write-Step([string]$Message) {
  Write-Host ""
  Write-Host "==> $Message" -ForegroundColor Cyan
}

function Invoke-RobocopySafe(
  [string]$From,
  [string]$To,
  [string[]]$ExtraArgs = @()
) {
  if (-not (Test-Path -LiteralPath $From)) {
    throw "Pasta de origem não encontrada: $From"
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

function Add-NssmTool([string]$PackageRoot) {
  $toolsDir = Join-Path $PackageRoot "tools"
  $nssmExe = Join-Path $toolsDir "nssm.exe"
  if (Test-Path -LiteralPath $nssmExe) {
    return
  }

  New-Item -ItemType Directory -Path $toolsDir -Force | Out-Null

  $localCandidates = @(
    (Join-Path $PSScriptRoot "..\tools\nssm.exe"),
    "C:\EDNAS\nssm-2.24-101-g897c7ad\win64\nssm.exe"
  )

  foreach ($candidate in $localCandidates) {
    $candidatePath = [System.IO.Path]::GetFullPath($candidate)
    if (Test-Path -LiteralPath $candidatePath) {
      Copy-Item -LiteralPath $candidatePath -Destination $nssmExe -Force
      return
    }
  }

  $tempRoot = Join-Path $env:TEMP ("ednas-package-nssm-" + [guid]::NewGuid().ToString("N"))
  $zipPath = Join-Path $tempRoot "nssm.zip"
  New-Item -ItemType Directory -Path $tempRoot -Force | Out-Null

  try {
    $downloadUrls = @(
      "https://nssm.cc/release/nssm-2.24.zip",
      "https://nssm.cc/ci/nssm-2.24-101-g897c7ad.zip"
    )
    $downloaded = $false
    foreach ($downloadUrl in $downloadUrls) {
      try {
        Invoke-WebRequest -Uri $downloadUrl -OutFile $zipPath
        $downloaded = $true
        break
      } catch {
        Write-Host "Aviso: falhou download NSSM em $downloadUrl" -ForegroundColor Yellow
      }
    }

    if (-not $downloaded) {
      throw "Não foi possível descarregar NSSM."
    }

    Expand-Archive -Path $zipPath -DestinationPath $tempRoot -Force
    $sourceExe = Get-ChildItem -Path $tempRoot -Recurse -Filter "nssm.exe" |
      Where-Object { $_.FullName -match "\\win64\\nssm\.exe$" } |
      Select-Object -First 1
    if ($null -eq $sourceExe) {
      throw "nssm.exe não encontrado no pacote descarregado."
    }

    Copy-Item -LiteralPath $sourceExe.FullName -Destination $nssmExe -Force
  } finally {
    if (Test-Path -LiteralPath $tempRoot) {
      Remove-Item -LiteralPath $tempRoot -Recurse -Force
    }
  }
}

$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$packageRoot = if ([System.IO.Path]::IsPathRooted($OutputDir)) {
  [System.IO.Path]::GetFullPath($OutputDir)
} else {
  [System.IO.Path]::GetFullPath((Join-Path $repoRoot $OutputDir))
}

Write-Step "Repositorio: $repoRoot"
Write-Step "Destino: $packageRoot"

if (Test-Path -LiteralPath $packageRoot) {
  if (-not $packageRoot.StartsWith($repoRoot, [System.StringComparison]::OrdinalIgnoreCase)) {
    throw "Seguranca: destino fora do repositorio. Abortar limpeza: $packageRoot"
  }

  Write-Step "Limpar pacote anterior"
  Remove-Item -LiteralPath $packageRoot -Recurse -Force
}

New-Item -ItemType Directory -Path $packageRoot -Force | Out-Null

if ($IncludeFrontendBuild -and -not $SkipFrontendBuild) {
  Write-Step "Build frontend (npm run build)"
  Push-Location $repoRoot
  try {
    npm run build
  } finally {
    Pop-Location
  }
  Write-Step "Copiar build frontend"
  $buildDir = Join-Path $repoRoot "build"
  $buildIndex = Join-Path $buildDir "index.html"
  if (-not (Test-Path -LiteralPath $buildIndex)) {
    throw "Build frontend nao encontrado depois de npm run build."
  }

  Invoke-RobocopySafe `
    -From $buildDir `
    -To (Join-Path $packageRoot "build")
} else {
  Write-Step "Omitir frontend local"
}

Write-Step "Copiar backend"
Invoke-RobocopySafe `
  -From (Join-Path $repoRoot "backend") `
  -To (Join-Path $packageRoot "backend") `
  -ExtraArgs @("/XD", ".git", "node_modules", "/XF", ".env", ".env.*", "*.pem")

if (-not $SkipBackendDeps) {
  Write-Step "Instalar dependencias backend no pacote (npm ci --omit=dev)"
  Push-Location (Join-Path $packageRoot "backend")
  try {
    npm ci --omit=dev
  } finally {
    Pop-Location
  }
}

Write-Step "Copiar scripts de instalação"
Invoke-RobocopySafe `
  -From (Join-Path $repoRoot "installer") `
  -To (Join-Path $packageRoot "installer") `
  -ExtraArgs @("/XF", "prepare-package.ps1")

Write-Step "Incluir gestor de servicos Windows"
Add-NssmTool -PackageRoot $packageRoot

$versionFile = Join-Path $packageRoot "PACKAGE_INFO.txt"
@(
  "EDNAS CLIENT PACKAGE"
  "Data UTC: $([DateTime]::UtcNow.ToString("yyyy-MM-dd HH:mm:ss"))"
  "Origem: $repoRoot"
  "Frontend local: $(if ($IncludeFrontendBuild -and -not $SkipFrontendBuild) { "incluido" } else { "omitido - Vercel" })"
) | Set-Content -Path $versionFile -Encoding UTF8

Write-Step "Pacote criado com sucesso."
Write-Host "Pasta final: $packageRoot" -ForegroundColor Green
