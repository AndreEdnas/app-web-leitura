[CmdletBinding()]
param(
  [string]$InstallDir = "$env:ProgramFiles\EdnasLeitura",
  [string]$SourceDir = "",
  [string]$NodeExePath = "",
  [string]$CloudflaredExePath = "",
  [string]$CfBase = "",
  [string]$CfAppKey = "",
  [string]$ActivationCode = "",
  [string]$StoreToken = "",
  [string]$StoreName = "",
  [string]$DbServer = "",
  [string]$DbDatabase = "",
  [string]$DbPort = "",
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
$script:ScriptBoundParameters = @{}
foreach ($entry in $PSBoundParameters.GetEnumerator()) {
  $script:ScriptBoundParameters[$entry.Key] = $entry.Value
}

function Write-Step([string]$Message) {
  Write-Host ""
  Write-Host "==> $Message" -ForegroundColor Cyan
}

function Test-IsAdmin {
  $identity = [Security.Principal.WindowsIdentity]::GetCurrent()
  $principal = New-Object Security.Principal.WindowsPrincipal($identity)
  return $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
}

function Quote-ProcessArgument([string]$Value) {
  return '"' + ($Value -replace '"', '\"') + '"'
}

function Start-ElevatedScript([hashtable]$BoundParameters) {
  $scriptPath = if (-not [string]::IsNullOrWhiteSpace($PSCommandPath)) {
    $PSCommandPath
  } else {
    $MyInvocation.MyCommand.Path
  }

  $argumentParts = @(
    "-NoProfile",
    "-ExecutionPolicy Bypass",
    "-NoExit",
    "-File $(Quote-ProcessArgument $scriptPath)"
  )

  foreach ($entry in $BoundParameters.GetEnumerator()) {
    $name = $entry.Key
    $value = $entry.Value

    if ($value -is [System.Management.Automation.SwitchParameter]) {
      if ($value.IsPresent) {
        $argumentParts += "-$name"
      }
      continue
    }

    if ($null -ne $value -and -not [string]::IsNullOrWhiteSpace([string]$value)) {
      $argumentParts += "-$name $(Quote-ProcessArgument ([string]$value))"
    }
  }

  Write-Step "A pedir permissao de Administrador"
  Start-Process `
    -FilePath "$env:SystemRoot\System32\WindowsPowerShell\v1.0\powershell.exe" `
    -Verb RunAs `
    -ArgumentList ($argumentParts -join " ")
}

function Assert-Admin {
  if (-not (Test-IsAdmin)) {
    Start-ElevatedScript -BoundParameters $script:ScriptBoundParameters
    exit 0
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

function Wait-ServiceDeleted([string]$Name) {
  for ($i = 1; $i -le 20; $i++) {
    $svc = Get-Service -Name $Name -ErrorAction SilentlyContinue
    if ($null -eq $svc) {
      return
    }

    Start-Sleep -Seconds 1
  }

  throw "Servico ainda existe/esta pendente de remocao: $Name"
}

function Resolve-NssmExe([string]$InstallDir) {
  $toolsDir = Join-Path $InstallDir "tools"
  $nssmExe = Join-Path $toolsDir "nssm.exe"

  if (Test-Path -LiteralPath $nssmExe) {
    return $nssmExe
  }

  New-Item -ItemType Directory -Path $toolsDir -Force | Out-Null

  $tempRoot = Join-Path $env:TEMP ("ednas-nssm-" + [guid]::NewGuid().ToString("N"))
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
      throw "Nao foi possivel descarregar NSSM."
    }

    Expand-Archive -Path $zipPath -DestinationPath $tempRoot -Force
    $sourceExe = Get-ChildItem -Path $tempRoot -Recurse -Filter "nssm.exe" |
      Where-Object { $_.FullName -match "\\win64\\nssm\.exe$" } |
      Select-Object -First 1
    if ($null -eq $sourceExe) {
      throw "nssm.exe nao encontrado no pacote descarregado."
    }

    Copy-Item -LiteralPath $sourceExe.FullName -Destination $nssmExe -Force
  } finally {
    if (Test-Path -LiteralPath $tempRoot) {
      Remove-Item -LiteralPath $tempRoot -Recurse -Force
    }
  }

  return $nssmExe
}

function ConvertTo-NssmArgument([string]$Value) {
  if ($null -eq $Value) {
    return '""'
  }

  $escaped = $Value.Replace('"', '\"')
  if ($escaped -match "\s" -or $escaped -eq "") {
    return '"' + $escaped + '"'
  }

  return $escaped
}

function ConvertTo-NssmParameterString([string[]]$Arguments) {
  if ($null -eq $Arguments -or $Arguments.Count -eq 0) {
    return ""
  }

  return (($Arguments | ForEach-Object { ConvertTo-NssmArgument -Value $_ }) -join " ")
}

function Configure-NssmService(
  [string]$NssmExe,
  [string]$Name,
  [string]$DisplayName,
  [string]$Program,
  [string[]]$Arguments,
  [string]$AppDirectory,
  [string]$Description
) {
  $existing = Get-Service -Name $Name -ErrorAction SilentlyContinue
  if ($null -ne $existing) {
    if ($existing.Status -ne "Stopped") {
      & $NssmExe stop $Name | Out-Null
      Start-Sleep -Seconds 2
    }

    & $NssmExe remove $Name confirm | Out-Null
    Wait-ServiceDeleted -Name $Name
  }

  & $NssmExe install $Name $Program | Out-Null
  if ($LASTEXITCODE -ne 0) {
    throw "Falha ao instalar servico $Name com NSSM."
  }

  $parameterString = ConvertTo-NssmParameterString -Arguments $Arguments
  $logDir = Join-Path $AppDirectory "logs"
  New-Item -ItemType Directory -Path $logDir -Force | Out-Null
  $stdoutLog = Join-Path $logDir "$Name.out.log"
  $stderrLog = Join-Path $logDir "$Name.err.log"

  foreach ($logPath in @($stdoutLog, $stderrLog)) {
    if (Test-Path -LiteralPath $logPath) {
      Remove-Item -LiteralPath $logPath -Force
    }
  }

  & $NssmExe set $Name DisplayName $DisplayName | Out-Null
  & $NssmExe set $Name Description $Description | Out-Null
  & $NssmExe set $Name AppDirectory $AppDirectory | Out-Null
  if (-not [string]::IsNullOrWhiteSpace($parameterString)) {
    & $NssmExe set $Name AppParameters $parameterString | Out-Null
  }
  & $NssmExe set $Name Start SERVICE_AUTO_START | Out-Null
  & $NssmExe set $Name AppStdout $stdoutLog | Out-Null
  & $NssmExe set $Name AppStderr $stderrLog | Out-Null
  & $NssmExe set $Name AppRotateFiles 1 | Out-Null
  & $NssmExe set $Name AppRotateOnline 1 | Out-Null
  & $NssmExe set $Name AppRotateSeconds 86400 | Out-Null
  & $NssmExe set $Name AppRotateBytes 10485760 | Out-Null
  & $NssmExe set $Name AppExit Default Restart | Out-Null
  & $NssmExe set $Name AppThrottle 1500 | Out-Null

  & sc.exe failure $Name "reset= 0" "actions= restart/5000/restart/5000/restart/5000" | Out-Null
}

function Get-RecentFileText(
  [string]$Path,
  [int]$Lines = 60
) {
  if (-not (Test-Path -LiteralPath $Path)) {
    return ""
  }

  try {
    return (Get-Content -LiteralPath $Path -Tail $Lines -ErrorAction Stop | Out-String).Trim()
  } catch {
    return ""
  }
}

function Get-ServiceLogSummary(
  [string]$Name,
  [string]$AppDirectory
) {
  $logDir = Join-Path $AppDirectory "logs"
  $paths = @(
    (Join-Path $logDir "$Name.err.log"),
    (Join-Path $logDir "$Name.out.log")
  )

  $parts = @()
  foreach ($path in $paths) {
    $text = Get-RecentFileText -Path $path
    if (-not [string]::IsNullOrWhiteSpace($text)) {
      $parts += "---- $path ----`n$text"
    }
  }

  return ($parts -join "`n")
}

function Start-ServiceWithDiagnostics(
  [string]$Name,
  [string]$AppDirectory
) {
  $startError = ""
  try {
    Start-Service -Name $Name -ErrorAction Stop
  } catch {
    $startError = $_.Exception.Message
  }

  for ($i = 1; $i -le 15; $i++) {
    $svc = Get-Service -Name $Name -ErrorAction SilentlyContinue
    if ($null -ne $svc -and $svc.Status -eq "Running") {
      return
    }

    Start-Sleep -Seconds 1
  }

  $logSummary = Get-ServiceLogSummary -Name $Name -AppDirectory $AppDirectory
  $message = "Falha ao arrancar servico $Name."
  if (-not [string]::IsNullOrWhiteSpace($startError)) {
    $message += "`nErro Windows: $startError"
  }
  if (-not [string]::IsNullOrWhiteSpace($logSummary)) {
    $message += "`n`nUltimos logs:`n$logSummary"
  }

  throw $message
}

function Test-SqlConnection(
  [string]$NodeExe,
  [string]$BackendDir,
  [string]$DbServer,
  [string]$DbDatabase,
  [string]$DbPort,
  [string]$DbUser,
  [string]$DbPassword
) {
  $testScript = @'
const sql = require("mssql");

function getArg(name) {
  const prefix = `--${name}=`;
  const arg = process.argv.find((item) => item.startsWith(prefix));
  return arg ? arg.slice(prefix.length) : "";
}

function splitSqlTarget(rawServer) {
  const server = String(rawServer || "").trim();
  const slashIndex = server.indexOf("\\");
  if (slashIndex > -1) {
    return {
      server: server.slice(0, slashIndex),
      instanceName: server.slice(slashIndex + 1),
    };
  }

  return { server, instanceName: "" };
}

(async () => {
  const target = splitSqlTarget(getArg("server"));
  const config = {
    user: getArg("user"),
    password: getArg("password"),
    server: target.server,
    database: getArg("database"),
    connectionTimeout: 10000,
    requestTimeout: 10000,
    options: {
      encrypt: false,
      trustServerCertificate: true,
    },
  };

  if (target.instanceName) {
    config.options.instanceName = target.instanceName;
  } else {
    config.port = Number(getArg("port") || 1433);
  }

  let pool;
  try {
    pool = await sql.connect(config);
    await pool.request().query("SELECT 1 AS ok");
    console.log("SQL_OK");
  } finally {
    if (pool) await pool.close();
  }
})().catch((err) => {
  console.error(err && err.message ? err.message : String(err));
  process.exit(1);
});
'@

  $tempScript = Join-Path $BackendDir ("ednas-sql-test-" + [guid]::NewGuid().ToString("N") + ".js")
  Set-Content -Path $tempScript -Value $testScript -Encoding UTF8

  try {
    $arguments = @(
      $tempScript,
      "--server=$DbServer",
      "--database=$DbDatabase",
      "--port=$DbPort",
      "--user=$DbUser",
      "--password=$DbPassword"
    )

    $output = & $NodeExe @arguments 2>&1
    $exitCode = $LASTEXITCODE
    if ($exitCode -ne 0) {
      $detail = ($output | Out-String).Trim()
      if ([string]::IsNullOrWhiteSpace($detail)) {
        $detail = "Sem detalhe devolvido pelo driver SQL."
      }

      throw "Falha ao ligar ao SQL com os dados inseridos.`n$detail"
    }
  } finally {
    if (Test-Path -LiteralPath $tempScript) {
      Remove-Item -LiteralPath $tempScript -Force
    }
  }
}

function Invoke-BackendActivation(
  [string]$Code,
  [string]$StoreToken,
  [string]$StoreName,
  [string]$DbServer,
  [string]$DbDatabase,
  [string]$DbPort
) {
  if ([string]::IsNullOrWhiteSpace($Code)) {
    throw "Codigo de ativacao obrigatorio."
  }

  $bodyObject = @{
    activation_code = $Code.Trim()
  }

  if (-not [string]::IsNullOrWhiteSpace($StoreToken)) {
    $bodyObject.store_token = $StoreToken.Trim()
  }
  if (-not [string]::IsNullOrWhiteSpace($StoreName)) {
    $bodyObject.store_name = $StoreName.Trim()
  }
  if (-not [string]::IsNullOrWhiteSpace($DbServer)) {
    $bodyObject.db_server = $DbServer.Trim()
  }
  if (-not [string]::IsNullOrWhiteSpace($DbDatabase)) {
    $bodyObject.db_database = $DbDatabase.Trim()
  }
  if (-not [string]::IsNullOrWhiteSpace($DbPort)) {
    $bodyObject.db_port = $DbPort.Trim()
  }

  $body = $bodyObject | ConvertTo-Json -Compress
  $uri = "http://127.0.0.1:3051/activation/finish"

  for ($i = 1; $i -le 30; $i++) {
    try {
      return Invoke-RestMethod `
        -Uri $uri `
        -Method Post `
        -ContentType "application/json" `
        -Body $body `
        -TimeoutSec 5
    } catch {
      if ($null -ne $_.Exception.Response) {
        $errorText = ""
        try {
          $reader = New-Object System.IO.StreamReader($_.Exception.Response.GetResponseStream())
          $errorText = $reader.ReadToEnd()
        } catch {
          $errorText = $_.Exception.Message
        }

        if ([string]::IsNullOrWhiteSpace($errorText)) {
          $errorText = $_.Exception.Message
        }

        throw "Ativacao rejeitada pelo backend local: $errorText"
      }

      Start-Sleep -Seconds 2
    }
  }

  throw "Nao foi possivel ativar o backend local em $uri."
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

$storedActivationCode = Get-EnvValue -EnvPath $installEnv -Key "ACTIVATION_CODE"
if ([string]::IsNullOrWhiteSpace($storedActivationCode)) {
  $storedActivationCode = Get-EnvValue -EnvPath $sourceEnv -Key "ACTIVATION_CODE"
}

$storedStoreName = Get-EnvValue -EnvPath $installEnv -Key "STORE_NAME"
$storedStoreToken = Get-EnvValue -EnvPath $installEnv -Key "STORE_TOKEN"
$storedDbServer = Get-EnvValue -EnvPath $installEnv -Key "DB_SERVER"
$storedDbDatabase = Get-EnvValue -EnvPath $installEnv -Key "DB_DATABASE"
$storedDbPort = Get-EnvValue -EnvPath $installEnv -Key "DB_PORT"
$storedDbUser = Get-EnvValue -EnvPath $installEnv -Key "DB_USER"
$storedDbPassword = Get-EnvValue -EnvPath $installEnv -Key "DB_PASSWORD"

if (-not [string]::IsNullOrWhiteSpace($CfBase)) {
  $CfBase = $CfBase.Trim()
} elseif (-not [string]::IsNullOrWhiteSpace($storedCfBase)) {
  $CfBase = $storedCfBase.Trim()
} else {
  $CfBase = "https://ednas-cloud.andre-86d.workers.dev"
}
if (-not [string]::IsNullOrWhiteSpace($CfAppKey)) {
  $CfAppKey = $CfAppKey.Trim()
} elseif (-not [string]::IsNullOrWhiteSpace($storedCfAppKey)) {
  $CfAppKey = $storedCfAppKey.Trim()
} else {
  $CfAppKey = ""
}
$ActivationCode = Resolve-Value -Provided $ActivationCode -Stored $storedActivationCode -Label "Codigo de ativacao"
$StoreToken = Resolve-Value -Provided $StoreToken -Stored $storedStoreToken -Label "Token de entrada da loja"
$StoreName = if (-not [string]::IsNullOrWhiteSpace($StoreName)) {
  $StoreName.Trim()
} elseif (-not [string]::IsNullOrWhiteSpace($storedStoreName)) {
  $storedStoreName.Trim()
} else {
  ""
}
$DbServer = Resolve-Value -Provided $DbServer -Stored $storedDbServer -Label "Servidor SQL"
$DbDatabase = Resolve-Value -Provided $DbDatabase -Stored $storedDbDatabase -Label "Base de dados"
$DbPort = Resolve-Value -Provided $DbPort -Stored $storedDbPort -Label "Porta SQL (default 1433)"
$DbUser = Resolve-Value -Provided $DbUser -Stored $storedDbUser -Label "DB_USER"
$DbPassword = Resolve-Value -Provided $DbPassword -Stored $storedDbPassword -Label "DB_PASSWORD" -Secret $true

if ([string]::IsNullOrWhiteSpace($CfBase)) {
  throw "CF_BASE obrigatorio. Exemplo: https://ednas-cloud.andre-86d.workers.dev"
}

if ([string]::IsNullOrWhiteSpace($ActivationCode)) {
  throw "Codigo de ativacao obrigatorio."
}
if ([string]::IsNullOrWhiteSpace($StoreToken)) {
  throw "Token de entrada da loja obrigatorio."
}
if ([string]::IsNullOrWhiteSpace($DbServer)) {
  throw "Servidor SQL obrigatorio."
}
if ([string]::IsNullOrWhiteSpace($DbDatabase)) {
  throw "Base de dados obrigatoria."
}
if ([string]::IsNullOrWhiteSpace($DbPort)) {
  $DbPort = "1433"
}

Write-Step "Escrever backend\\.env"
$frontendBuildPath = Join-Path $InstallDir "build"
$frontendBuildIndex = Join-Path $frontendBuildPath "index.html"
$envLines = @(
  "CF_BASE=$CfBase"
  "ACTIVATION_CODE=$ActivationCode"
  "STORE_TOKEN=$StoreToken"
  "STORE_NAME=$StoreName"
  "DB_SERVER=$DbServer"
  "DB_DATABASE=$DbDatabase"
  "DB_PORT=$DbPort"
  "DB_USER=$DbUser"
  "DB_PASSWORD=$DbPassword"
  "MODO_INSTALACAO=false"
)

if (-not [string]::IsNullOrWhiteSpace($CfAppKey)) {
  $envLines += "CF_APP_KEY=$CfAppKey"
}

if (Test-Path -LiteralPath $frontendBuildIndex) {
  $envLines += "FRONTEND_BUILD_PATH=$frontendBuildPath"
}

$envLines | Set-Content -Path $installEnv -Encoding ASCII

$backendScript = Join-Path $InstallDir "backend\server.js"
$backendDir = Split-Path -Parent $backendScript

Write-Step "Testar ligacao SQL"
Test-SqlConnection `
  -NodeExe $nodeExe `
  -BackendDir $backendDir `
  -DbServer $DbServer `
  -DbDatabase $DbDatabase `
  -DbPort $DbPort `
  -DbUser $DbUser `
  -DbPassword $DbPassword

Write-Step "Configurar servico backend"
$nssmExe = Resolve-NssmExe -InstallDir $InstallDir

Configure-NssmService `
  -NssmExe $nssmExe `
  -Name $BackendServiceName `
  -DisplayName "EDNAS Backend" `
  -Program $nodeExe `
  -Arguments @("server.js") `
  -AppDirectory $backendDir `
  -Description "Backend local EDNAS (licenca + SQL + API)."
Start-ServiceWithDiagnostics -Name $BackendServiceName -AppDirectory $backendDir

Write-Step "Ativar licenca no backend local"
try {
  $activationResult = Invoke-BackendActivation `
    -Code $ActivationCode `
    -StoreToken $StoreToken `
    -StoreName $StoreName `
    -DbServer $DbServer `
    -DbDatabase $DbDatabase `
    -DbPort $DbPort
} catch {
  $logSummary = Get-ServiceLogSummary -Name $BackendServiceName -AppDirectory $backendDir
  $message = $_.Exception.Message
  if (-not [string]::IsNullOrWhiteSpace($logSummary)) {
    $message += "`n`nUltimos logs do backend:`n$logSummary"
  }

  throw $message
}

if (-not $activationResult.success) {
  $activationError = ""
  if ($null -ne $activationResult.error) {
    $activationError = [string]$activationResult.error
  } elseif ($null -ne $activationResult.erro) {
    $activationError = [string]$activationResult.erro
  } elseif ($null -ne $activationResult.mensagem) {
    $activationError = [string]$activationResult.mensagem
  }

  if ([string]::IsNullOrWhiteSpace($activationError)) {
    $activationError = "Sem detalhe devolvido."
  }

  $activationJson = ""
  try {
    $activationJson = ($activationResult | ConvertTo-Json -Depth 8 -Compress)
  } catch {
    $activationJson = ""
  }

  $message = "Ativacao rejeitada pelo backend local: $activationError"
  if (-not [string]::IsNullOrWhiteSpace($activationJson)) {
    $message += "`nResposta: $activationJson"
  }

  throw $message
}

$activationTunnelToken = ""
if ($null -ne $activationResult.tunnel -and $null -ne $activationResult.tunnel.token) {
  $activationTunnelToken = [string]$activationResult.tunnel.token
}

if ([string]::IsNullOrWhiteSpace($TunnelToken)) {
  $TunnelToken = $activationTunnelToken
}

$tunnelConfigured = $false
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
  $cloudflaredDir = Split-Path -Parent $CloudflaredExePath

  Configure-NssmService `
    -NssmExe $nssmExe `
    -Name $TunnelServiceName `
    -DisplayName "EDNAS Tunnel" `
    -Program $CloudflaredExePath `
    -Arguments @("tunnel", "run", "--token-file", "..\secrets\tunnel-token.txt") `
    -AppDirectory $cloudflaredDir `
    -Description "Tunnel Cloudflare EDNAS."
  Start-ServiceWithDiagnostics -Name $TunnelServiceName -AppDirectory $cloudflaredDir
  $tunnelConfigured = $true
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
if ($tunnelConfigured) {
  Write-Host "Backend local instalado e tunnel Cloudflare configurado." -ForegroundColor Green
} else {
  Write-Host "Backend local instalado. Tunnel Cloudflare nao configurado." -ForegroundColor Yellow
}
