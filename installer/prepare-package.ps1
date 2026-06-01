[CmdletBinding()]
param(
  [string]$OutputDir = "dist\ednas-client",
  [switch]$SkipFrontendBuild,
  [switch]$SkipBackendDeps
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

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

if (-not $SkipFrontendBuild) {
  Write-Step "Build frontend (npm run build)"
  Push-Location $repoRoot
  try {
    npm run build
  } finally {
    Pop-Location
  }
}

if (-not $SkipBackendDeps) {
  Write-Step "Instalar dependencias backend (npm ci --omit=dev)"
  Push-Location (Join-Path $repoRoot "backend")
  try {
    npm ci --omit=dev
  } finally {
    Pop-Location
  }
}

Write-Step "Copiar build frontend"
$buildDir = Join-Path $repoRoot "build"
$buildIndex = Join-Path $buildDir "index.html"
if (Test-Path -LiteralPath $buildIndex) {
  Invoke-RobocopySafe `
    -From $buildDir `
    -To (Join-Path $packageRoot "build")
} else {
  Write-Host "Aviso: build frontend nao encontrado. Pacote sera backend+tunnel (modo Vercel)." -ForegroundColor Yellow
}

Write-Step "Copiar backend"
Invoke-RobocopySafe `
  -From (Join-Path $repoRoot "backend") `
  -To (Join-Path $packageRoot "backend") `
  -ExtraArgs @("/XD", ".git")

Write-Step "Copiar scripts de instalacao"
Invoke-RobocopySafe `
  -From (Join-Path $repoRoot "installer") `
  -To (Join-Path $packageRoot "installer") `
  -ExtraArgs @("/XF", "prepare-package.ps1")

$versionFile = Join-Path $packageRoot "PACKAGE_INFO.txt"
@(
  "EDNAS CLIENT PACKAGE"
  "Data UTC: $([DateTime]::UtcNow.ToString("yyyy-MM-dd HH:mm:ss"))"
  "Origem: $repoRoot"
) | Set-Content -Path $versionFile -Encoding UTF8

Write-Step "Pacote criado com sucesso."
Write-Host "Pasta final: $packageRoot" -ForegroundColor Green
