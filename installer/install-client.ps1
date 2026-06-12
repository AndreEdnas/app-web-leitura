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
  [string]$DbInstance = "",
  [string]$DbDatabase = "",
  [string]$DbPort = "",
  [string]$DbUser = "",
  [string]$DbPassword = "",
  [string]$TunnelToken = "",
  [string]$PublicWebUrl = "https://picagem-ednas.vercel.app",
  [string]$BackendPort = "3052",
  [string]$BackendServiceName = "EdnasBackend",
  [string]$TunnelServiceName = "EdnasTunnel",
  [switch]$PromptValues,
  [switch]$SkipCopy,
  [switch]$AllowWithoutTunnel
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

trap {
  Write-Host ""
  Write-Host "ERRO NA INSTALACAO" -ForegroundColor Red
  Write-Host $_.Exception.Message -ForegroundColor Red
  Write-Host ""
  Read-Host "Pressione Enter para finalizar"
  exit 1
}

function Initialize-ConsoleEncoding {
  try {
    $utf8 = New-Object System.Text.UTF8Encoding($false)
    [Console]::InputEncoding = $utf8
    [Console]::OutputEncoding = $utf8
    $global:OutputEncoding = $utf8
    & chcp.com 65001 | Out-Null
  } catch {
    # Consolas antigas podem não permitir alterar o encoding; nesse caso seguimos.
  }
}

Initialize-ConsoleEncoding

function Disable-ConsoleQuickEdit {
  try {
    $signature = @"
using System;
using System.Runtime.InteropServices;

public static class ConsoleMode {
  [DllImport("kernel32.dll")]
  public static extern IntPtr GetStdHandle(int nStdHandle);

  [DllImport("kernel32.dll")]
  public static extern bool GetConsoleMode(IntPtr hConsoleHandle, out int lpMode);

  [DllImport("kernel32.dll")]
  public static extern bool SetConsoleMode(IntPtr hConsoleHandle, int dwMode);
}
"@
    if (-not ("ConsoleMode" -as [type])) {
      Add-Type -TypeDefinition $signature
    }

    $stdin = [ConsoleMode]::GetStdHandle(-10)
    $mode = 0
    if ([ConsoleMode]::GetConsoleMode($stdin, [ref]$mode)) {
      $enableExtendedFlags = 0x0080
      $enableQuickEditMode = 0x0040
      $newMode = ($mode -bor $enableExtendedFlags) -band (-bnot $enableQuickEditMode)
      [ConsoleMode]::SetConsoleMode($stdin, $newMode) | Out-Null
    }
  } catch {
    # Se a consola não suportar esta opção, continuamos normalmente.
  }
}

Disable-ConsoleQuickEdit

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

  Write-Step "A pedir permissão de Administrador"
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
    return (Get-Content -LiteralPath $Path -Tail $Lines -Encoding UTF8 -ErrorAction Stop | Out-String).Trim()
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
  $oldWarningPreference = $WarningPreference
  try {
    $WarningPreference = "SilentlyContinue"
    Start-Service -Name $Name -ErrorAction Stop -WarningAction SilentlyContinue
  } catch {
    $startError = $_.Exception.Message
  } finally {
    $WarningPreference = $oldWarningPreference
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
  [string]$DbInstance,
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
  return arg ?arg.slice(prefix.length) : "";
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
  const explicitInstance = getArg("instance").trim();
  if (explicitInstance) {
    target.instanceName = explicitInstance;
  }
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
  console.error(err && err.message ?err.message : String(err));
  process.exit(1);
});
'@

  $tempScript = Join-Path $BackendDir ("ednas-sql-test-" + [guid]::NewGuid().ToString("N") + ".js")
  Set-Content -Path $tempScript -Value $testScript -Encoding UTF8

  try {
    $arguments = @(
      $tempScript,
      "--server=$DbServer",
      "--instance=$DbInstance",
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

function Get-SqlDatabaseList(
  [string]$NodeExe,
  [string]$BackendDir,
  [string]$DbServer,
  [string]$DbInstance,
  [string]$DbPort,
  [string]$DbUser,
  [string]$DbPassword
) {
  $listScript = @'
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
  const explicitInstance = getArg("instance").trim();
  if (explicitInstance) {
    target.instanceName = explicitInstance;
  }

  const config = {
    user: getArg("user"),
    password: getArg("password"),
    server: target.server,
    database: "master",
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
    const port = String(getArg("port") || "").trim();
    if (port) {
      config.port = Number(port);
    }
  }

  let pool;
  try {
    pool = await sql.connect(config);
    const result = await pool.request().query(`
      SELECT name
      FROM sys.databases
      WHERE database_id > 4
        AND state_desc = 'ONLINE'
      ORDER BY name
    `);
    console.log(JSON.stringify(result.recordset.map((row) => row.name)));
  } finally {
    if (pool) await pool.close();
  }
})().catch((err) => {
  console.error(err && err.message ? err.message : String(err));
  process.exit(1);
});
'@

  $tempScript = Join-Path $BackendDir ("ednas-sql-databases-" + [guid]::NewGuid().ToString("N") + ".js")
  Set-Content -Path $tempScript -Value $listScript -Encoding UTF8

  try {
    $arguments = @(
      $tempScript,
      "--server=$DbServer",
      "--instance=$DbInstance",
      "--port=$DbPort",
      "--user=$DbUser",
      "--password=$DbPassword"
    )

    $output = & $NodeExe @arguments 2>&1
    $exitCode = $LASTEXITCODE
    $detail = ($output | Out-String).Trim()
    if ($exitCode -ne 0) {
      if ([string]::IsNullOrWhiteSpace($detail)) {
        $detail = "Sem detalhe devolvido pelo driver SQL."
      }

      throw "Falha ao listar bases de dados SQL.`n$detail"
    }

    if ([string]::IsNullOrWhiteSpace($detail)) {
      return @()
    }

    return @($detail | ConvertFrom-Json)
  } finally {
    if (Test-Path -LiteralPath $tempScript) {
      Remove-Item -LiteralPath $tempScript -Force
    }
  }
}

function Select-SqlDatabase(
  [string[]]$Databases,
  [string]$DefaultDatabase
) {
  $availableDatabases = @($Databases | Where-Object { -not [string]::IsNullOrWhiteSpace($_) })
  if ($availableDatabases.Count -eq 0) {
    $manual = (Read-Host "Base de dados").Trim()
    return $manual
  }

  Write-Host ""
  Write-Host "Bases de dados encontradas:" -ForegroundColor Cyan
  for ($i = 0; $i -lt $availableDatabases.Count; $i++) {
    Write-Host ("  {0}. {1}" -f ($i + 1), $availableDatabases[$i])
  }

  $defaultSuffix = ""
  if (-not [string]::IsNullOrWhiteSpace($DefaultDatabase)) {
    $defaultSuffix = " [$DefaultDatabase]"
  }

  while ($true) {
    $choice = (Read-Host "Escolhe a base por número ou escreve o nome$defaultSuffix").Trim()
    if ([string]::IsNullOrWhiteSpace($choice) -and -not [string]::IsNullOrWhiteSpace($DefaultDatabase)) {
      return $DefaultDatabase.Trim()
    }

    $choiceNumber = 0
    if ([int]::TryParse($choice, [ref]$choiceNumber)) {
      if ($choiceNumber -ge 1 -and $choiceNumber -le $availableDatabases.Count) {
        return $availableDatabases[$choiceNumber - 1]
      }
    } elseif (-not [string]::IsNullOrWhiteSpace($choice)) {
      return $choice
    }

    Write-Host "Escolha inválida. Usa um número da lista ou escreve o nome da base." -ForegroundColor Yellow
  }
}

function Invoke-BackendActivation(
  [string]$Code,
  [string]$StoreToken,
  [string]$StoreName,
  [string]$DbServer,
  [string]$DbInstance,
  [string]$DbDatabase,
  [string]$DbPort,
  [string]$BackendPort
) {
  if ([string]::IsNullOrWhiteSpace($Code)) {
    throw "Código de ativação obrigatório."
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
  if (-not [string]::IsNullOrWhiteSpace($DbInstance)) {
    $bodyObject.db_instance = $DbInstance.Trim()
  }
  if (-not [string]::IsNullOrWhiteSpace($DbDatabase)) {
    $bodyObject.db_database = $DbDatabase.Trim()
  }
  if (-not [string]::IsNullOrWhiteSpace($DbPort)) {
    $bodyObject.db_port = $DbPort.Trim()
  }

  $body = $bodyObject | ConvertTo-Json -Compress
  $uri = "http://127.0.0.1:$BackendPort/activation/finish"

  for ($i = 1; $i -le 3; $i++) {
    try {
      Write-Host "A contactar backend local (tentativa $i de 3)..." -ForegroundColor DarkGray
      return Invoke-RestMethod `
        -Uri $uri `
        -Method Post `
        -ContentType "application/json" `
        -Body $body `
        -TimeoutSec 35
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
      if ($i -lt 3) {
        Start-Sleep -Seconds 2
      }
    }
  }

  throw "Não foi possível ativar o backend local em $uri."
}

function Get-TunnelPublicUrl($ActivationResult) {
  if ($null -eq $ActivationResult -or $null -eq $ActivationResult.tunnel) {
    return ""
  }

  $rawUrl = ""
  if ($null -ne $ActivationResult.tunnel.url) {
    $rawUrl = [string]$ActivationResult.tunnel.url
  } elseif ($null -ne $ActivationResult.tunnel.hostname) {
    $rawUrl = "https://$($ActivationResult.tunnel.hostname)"
  }

  return $rawUrl.Trim().TrimEnd("/")
}

function Get-WebErrorDetail([System.Management.Automation.ErrorRecord]$ErrorRecord) {
  $message = $ErrorRecord.Exception.Message
  if ($null -eq $ErrorRecord.Exception.Response) {
    return $message
  }

  try {
    $statusCode = [int]$ErrorRecord.Exception.Response.StatusCode
    $statusDescription = [string]$ErrorRecord.Exception.Response.StatusDescription
    if (-not [string]::IsNullOrWhiteSpace($statusDescription)) {
      return "$statusCode $statusDescription - $message"
    }

    return "$statusCode - $message"
  } catch {
    return $message
  }
}

function Wait-PublicTunnelHealth(
  [string]$PublicUrl,
  [int]$TimeoutSeconds = 90
) {
  if ([string]::IsNullOrWhiteSpace($PublicUrl)) {
    throw "O Worker devolveu token do tunnel, mas não devolveu URL público para validação."
  }

  $healthUrl = "$($PublicUrl.TrimEnd('/'))/health"
  $deadline = [DateTime]::UtcNow.AddSeconds($TimeoutSeconds)
  $attempt = 0
  $lastError = ""

  while ([DateTime]::UtcNow -lt $deadline) {
    $attempt++
    try {
      Write-Host "A validar tunnel público (tentativa $attempt): $healthUrl" -ForegroundColor DarkGray
      $response = Invoke-RestMethod -Uri $healthUrl -Method Get -TimeoutSec 12

      if ($null -ne $response -and $response.ok -eq $true -and [string]$response.service -eq "backend") {
        return
      }

      $lastError = "Resposta inesperada em $healthUrl"
    } catch {
      $lastError = Get-WebErrorDetail -ErrorRecord $_
    }

    Start-Sleep -Seconds 5
  }

  throw "O tunnel Cloudflare foi iniciado, mas o URL público não respondeu corretamente em $TimeoutSeconds segundos.`nURL testado: $healthUrl`nÚltimo erro: $lastError"
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
  throw "Não encontrei backend em: $sourceBackend"
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
    Write-Step "Build local não encontrado. Segue em modo Vercel-only."
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
  throw "Node.js não encontrado. Instala Node LTS e volta a correr o script."
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
$storedDbInstance = Get-EnvValue -EnvPath $installEnv -Key "DB_INSTANCE"
$storedDbDatabase = Get-EnvValue -EnvPath $installEnv -Key "DB_DATABASE"
$storedDbPort = Get-EnvValue -EnvPath $installEnv -Key "DB_PORT"
$storedDbUser = Get-EnvValue -EnvPath $installEnv -Key "DB_USER"
$storedDbPassword = Get-EnvValue -EnvPath $installEnv -Key "DB_PASSWORD"
$storedBackendPort = Get-EnvValue -EnvPath $installEnv -Key "BACKEND_PORT"
if ([string]::IsNullOrWhiteSpace($storedBackendPort)) {
  $storedBackendPort = Get-EnvValue -EnvPath $installEnv -Key "PORT"
}

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
$ActivationCode = Resolve-Value -Provided $ActivationCode -Stored $storedActivationCode -Label "Código de ativação"
$StoreToken = Resolve-Value -Provided $StoreToken -Stored $storedStoreToken -Label "Senha de entrada da loja"
$StoreName = if (-not [string]::IsNullOrWhiteSpace($StoreName)) {
  $StoreName.Trim()
} elseif (-not [string]::IsNullOrWhiteSpace($storedStoreName)) {
  $storedStoreName.Trim()
} else {
  ""
}
$DbServer = Resolve-Value -Provided $DbServer -Stored $storedDbServer -Label "Servidor SQL"
$DbInstance = Resolve-Value -Provided $DbInstance -Stored $storedDbInstance -Label "Instância SQL"
$DbPort = Resolve-Value -Provided $DbPort -Stored $storedDbPort -Label "Porta SQL (Enter se não tiver)"
$DbDatabase = if (-not [string]::IsNullOrWhiteSpace($DbDatabase)) {
  $DbDatabase.Trim()
} elseif (-not $PromptValues -and -not [string]::IsNullOrWhiteSpace($storedDbDatabase)) {
  $storedDbDatabase.Trim()
} else {
  ""
}
$DbUser = Resolve-Value -Provided $DbUser -Stored $storedDbUser -Label "DB_USER"
$DbPassword = Resolve-Value -Provided $DbPassword -Stored $storedDbPassword -Label "DB_PASSWORD" -Secret $true
$BackendPort = Resolve-Value -Provided $BackendPort -Stored $storedBackendPort -Label "Porta backend EDNAS (default 3052)"

if ([string]::IsNullOrWhiteSpace($CfBase)) {
  throw "CF_BASE obrigatório. Exemplo: https://ednas-cloud.andre-86d.workers.dev"
}

if ([string]::IsNullOrWhiteSpace($ActivationCode)) {
  throw "Código de ativação obrigatório."
}
if ([string]::IsNullOrWhiteSpace($StoreToken)) {
  throw "Senha de entrada da loja obrigatória."
}
if ([string]::IsNullOrWhiteSpace($DbServer)) {
  throw "Servidor SQL obrigatório."
}
if ([string]::IsNullOrWhiteSpace($BackendPort)) {
  $BackendPort = "3052"
}

$backendScript = Join-Path $InstallDir "backend\server.js"
$backendDir = Split-Path -Parent $backendScript

while ($true) {
  Write-Step "Testar ligacao SQL"
  try {
    Test-SqlConnection `
      -NodeExe $nodeExe `
      -BackendDir $backendDir `
      -DbServer $DbServer `
      -DbInstance $DbInstance `
      -DbDatabase "master" `
      -DbPort $DbPort `
      -DbUser $DbUser `
      -DbPassword $DbPassword

    $availableDatabases = Get-SqlDatabaseList `
      -NodeExe $nodeExe `
      -BackendDir $backendDir `
      -DbServer $DbServer `
      -DbInstance $DbInstance `
      -DbPort $DbPort `
      -DbUser $DbUser `
      -DbPassword $DbPassword

    if ([string]::IsNullOrWhiteSpace($DbDatabase)) {
      $DbDatabase = Select-SqlDatabase -Databases $availableDatabases -DefaultDatabase $storedDbDatabase
    }

    if ([string]::IsNullOrWhiteSpace($DbDatabase)) {
      throw "Base de dados obrigatoria."
    }

    Test-SqlConnection `
      -NodeExe $nodeExe `
      -BackendDir $backendDir `
      -DbServer $DbServer `
      -DbInstance $DbInstance `
      -DbDatabase $DbDatabase `
      -DbPort $DbPort `
      -DbUser $DbUser `
      -DbPassword $DbPassword
    break
  } catch {
    Write-Host ""
    Write-Host $_.Exception.Message -ForegroundColor Red

    if (-not $PromptValues) {
      throw
    }

    Write-Host ""
    Write-Host "A ligação SQL falhou. Volta a inserir os dados para tentar novamente." -ForegroundColor Yellow
    $DbServer = (Read-Host "Servidor SQL").Trim()
    $DbInstance = (Read-Host "Instância SQL").Trim()
    $DbPort = (Read-Host "Porta SQL (Enter se não tiver)").Trim()
    $DbUser = (Read-Host "DB_USER").Trim()
    $DbPassword = (Read-SecretText "DB_PASSWORD").Trim()
    $DbDatabase = ""

    if ([string]::IsNullOrWhiteSpace($DbServer)) {
      throw "Servidor SQL obrigatório."
    }
  }
}

Write-Step "Escrever backend\\.env"
$frontendBuildPath = Join-Path $InstallDir "build"
$frontendBuildIndex = Join-Path $frontendBuildPath "index.html"
$envLines = @(
  "CF_BASE=$CfBase"
  "CF_TIMEOUT_MS=25000"
  "ACTIVATION_CODE=$ActivationCode"
  "STORE_TOKEN=$StoreToken"
  "STORE_NAME=$StoreName"
  "DB_SERVER=$DbServer"
  "DB_INSTANCE=$DbInstance"
  "DB_DATABASE=$DbDatabase"
  "DB_PORT=$DbPort"
  "DB_USER=$DbUser"
  "DB_PASSWORD=$DbPassword"
  "PORT=$BackendPort"
  "BACKEND_PORT=$BackendPort"
  "MODO_INSTALACAO=false"
)

if (-not [string]::IsNullOrWhiteSpace($CfAppKey)) {
  $envLines += "CF_APP_KEY=$CfAppKey"
}

if (Test-Path -LiteralPath $frontendBuildIndex) {
  $envLines += "FRONTEND_BUILD_PATH=$frontendBuildPath"
}

$envLines | Set-Content -Path $installEnv -Encoding ASCII

Write-Step "Configurar servico backend"
$nssmExe = Resolve-NssmExe -InstallDir $InstallDir

Configure-NssmService `
  -NssmExe $nssmExe `
  -Name $BackendServiceName `
  -DisplayName "EDNAS Backend" `
  -Program $nodeExe `
  -Arguments @("server.js") `
  -AppDirectory $backendDir `
  -Description "Backend local EDNAS (licença + SQL + API)."
Start-ServiceWithDiagnostics -Name $BackendServiceName -AppDirectory $backendDir

Write-Step "Ativar licença no backend local"
try {
  $activationResult = Invoke-BackendActivation `
    -Code $ActivationCode `
    -StoreToken $StoreToken `
    -StoreName $StoreName `
    -DbServer $DbServer `
    -DbInstance $DbInstance `
    -DbDatabase $DbDatabase `
    -DbPort $DbPort `
    -BackendPort $BackendPort
} catch {
  $logSummary = Get-ServiceLogSummary -Name $BackendServiceName -AppDirectory $backendDir
  $message = $_.Exception.Message
  if (-not [string]::IsNullOrWhiteSpace($logSummary)) {
    $message += "`n`nUltimos logs do backend:`n$logSummary"
  }

  Stop-ServiceIfExists -Name $TunnelServiceName
  Stop-ServiceIfExists -Name $BackendServiceName
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

  Stop-ServiceIfExists -Name $TunnelServiceName
  Stop-ServiceIfExists -Name $BackendServiceName
  throw $message
}

$activationTunnelToken = ""
if ($null -ne $activationResult.tunnel -and $null -ne $activationResult.tunnel.token) {
  $activationTunnelToken = [string]$activationResult.tunnel.token
}

if ([string]::IsNullOrWhiteSpace($TunnelToken)) {
  $TunnelToken = $activationTunnelToken
}

$publicTunnelUrl = Get-TunnelPublicUrl -ActivationResult $activationResult
$tunnelReused = $false
if ($null -ne $activationResult.tunnel -and $null -ne $activationResult.tunnel.reused) {
  $tunnelReused = [System.Convert]::ToBoolean($activationResult.tunnel.reused)
}

if (
  [string]::IsNullOrWhiteSpace($TunnelToken) -and
  [string]::IsNullOrWhiteSpace($publicTunnelUrl) -and
  -not $AllowWithoutTunnel
) {
  Stop-ServiceIfExists -Name $TunnelServiceName
  Stop-ServiceIfExists -Name $BackendServiceName
  throw "O Worker ativou a licença, mas não devolveu token do tunnel. Confirma se a key do cliente tem auto_tunnel=true e se o Worker tem permissões Cloudflare para criar tunnels."
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
  try {
    Start-ServiceWithDiagnostics -Name $TunnelServiceName -AppDirectory $cloudflaredDir
  } catch {
    Stop-ServiceIfExists -Name $TunnelServiceName
    Stop-ServiceIfExists -Name $BackendServiceName
    throw
  }
  $tunnelService = Get-Service -Name $TunnelServiceName -ErrorAction SilentlyContinue
  if ($null -eq $tunnelService -or $tunnelService.Status -ne "Running") {
    $logSummary = Get-ServiceLogSummary -Name $TunnelServiceName -AppDirectory $cloudflaredDir
    $message = "O servico $TunnelServiceName foi criado, mas não ficou em execução."
    if (-not [string]::IsNullOrWhiteSpace($logSummary)) {
      $message += "`n`nUltimos logs do tunnel:`n$logSummary"
    }

    Stop-ServiceIfExists -Name $TunnelServiceName
    Stop-ServiceIfExists -Name $BackendServiceName
    throw $message
  }

  Write-Step "Validar tunnel público"
  try {
    Wait-PublicTunnelHealth -PublicUrl $publicTunnelUrl -TimeoutSeconds 90
  } catch {
    $logSummary = Get-ServiceLogSummary -Name $TunnelServiceName -AppDirectory $cloudflaredDir
    $message = $_.Exception.Message
    if (-not [string]::IsNullOrWhiteSpace($logSummary)) {
      $message += "`n`nUltimos logs do tunnel:`n$logSummary"
    }

    Stop-ServiceIfExists -Name $TunnelServiceName
    Stop-ServiceIfExists -Name $BackendServiceName
    throw $message
  }

  $tunnelConfigured = $true
} elseif (-not [string]::IsNullOrWhiteSpace($publicTunnelUrl)) {
  Write-Step "Validar tunnel público existente"
  try {
    Wait-PublicTunnelHealth -PublicUrl $publicTunnelUrl -TimeoutSeconds 90
  } catch {
    Stop-ServiceIfExists -Name $BackendServiceName
    throw $_.Exception.Message
  }

  $tunnelConfigured = $true
  $tunnelReused = $true
} else {
  Write-Step "Tunnel não configurado (token vazio)."
}

Write-Step "Criar atalho web"
$desktopShortcut = Join-Path ([Environment]::GetFolderPath("CommonDesktopDirectory")) "EDNAS Leitura.url"
@(
  "[InternetShortcut]"
  "URL=$PublicWebUrl"
) | Set-Content -Path $desktopShortcut -Encoding ASCII

Write-Step "Instalacao concluida."
Write-Host "Site público: $PublicWebUrl" -ForegroundColor Green
if ($tunnelConfigured) {
  if ($tunnelReused) {
    Write-Host "Backend local instalado e tunnel Cloudflare existente validado." -ForegroundColor Green
  } else {
    Write-Host "Backend local instalado e tunnel Cloudflare configurado." -ForegroundColor Green
  }
} else {
  Write-Host "Backend local instalado. Tunnel Cloudflare não configurado." -ForegroundColor Yellow
}

Write-Host ""
Read-Host "Pressione Enter para finalizar"
