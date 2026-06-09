[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)]
  [string]$LojaId,

  [string]$Nome = "",
  [string]$Url = "",

  [string]$Server = "",

  [string]$Database = "",

  [int]$Port = 1433,

  [string]$Token = "",

  [string]$ActivationCode = "",
  [int]$MaxUses = 1,
  [string]$ExpiresAt = "",
  [switch]$SkipActivationCode,
  [switch]$PrecreateStore,
  [switch]$AutoTunnelOnInstall,
  [string]$TunnelHostname = "",
  [string]$TunnelUrl = "",
  [string]$TunnelToken = "",
  [string]$Binding = "CONFIG"
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

function New-ActivationCode {
  $alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"
  $rng = [System.Security.Cryptography.RandomNumberGenerator]::Create()
  $bytes = New-Object byte[] 12
  $rng.GetBytes($bytes)

  $chars = foreach ($b in $bytes) {
    $alphabet[$b % $alphabet.Length]
  }

  $raw = -join $chars
  return "EDN-{0}-{1}-{2}" -f $raw.Substring(0, 4), $raw.Substring(4, 4), $raw.Substring(8, 4)
}

function ConvertTo-Hashtable($Value) {
  if ($null -eq $Value) {
    return $null
  }

  if ($Value -is [System.Collections.IDictionary]) {
    $result = @{}
    foreach ($key in $Value.Keys) {
      $result[$key] = ConvertTo-Hashtable $Value[$key]
    }
    return $result
  }

  if ($Value -is [System.Collections.IEnumerable] -and $Value -isnot [string]) {
    $items = @()
    foreach ($item in $Value) {
      $items += ConvertTo-Hashtable $item
    }
    return $items
  }

  if ($Value.PSObject.Properties.Count -gt 0 -and $Value.GetType().Name -eq "PSCustomObject") {
    $result = @{}
    foreach ($property in $Value.PSObject.Properties) {
      $result[$property.Name] = ConvertTo-Hashtable $property.Value
    }
    return $result
  }

  return $Value
}

function Invoke-Wrangler {
  param(
    [string[]]$Arguments,
    [switch]$AllowFailure
  )

  $oldErrorActionPreference = $ErrorActionPreference
  $ErrorActionPreference = "Continue"
  try {
    $output = & npx --yes wrangler@latest @Arguments 2>&1
    $exitCode = $LASTEXITCODE
  } finally {
    $ErrorActionPreference = $oldErrorActionPreference
  }

  if ($exitCode -ne 0 -and -not $AllowFailure) {
    throw (($output | Out-String).Trim())
  }

  return @{
    ExitCode = $exitCode
    Output = ($output | Out-String).Trim()
  }
}

function Get-RemoteConfig {
  $result = Invoke-Wrangler -Arguments @(
    "kv", "key", "get",
    "--remote",
    "--binding", $Binding,
    "config"
  ) -AllowFailure

  if ($result.ExitCode -ne 0 -or [string]::IsNullOrWhiteSpace($result.Output)) {
    return @{
      lojas = @{}
      licencas = @{}
    }
  }

  try {
    $parsed = $result.Output | ConvertFrom-Json
    $config = ConvertTo-Hashtable $parsed
  } catch {
    throw "A chave 'config' existe, mas não contém JSON válido."
  }

  if (-not $config) {
    $config = @{}
  }

  if (-not $config.ContainsKey("lojas") -or $null -eq $config.lojas) {
    $config["lojas"] = @{}
  }

  if (-not $config.ContainsKey("licencas") -or $null -eq $config.licencas) {
    $config["licencas"] = @{}
  }

  return $config
}

function Put-KvJson {
  param(
    [string]$Key,
    $Value
  )

  $json = $Value | ConvertTo-Json -Depth 30
  Invoke-Wrangler -Arguments @(
    "kv", "key", "put",
    "--remote",
    "--binding", $Binding,
    $Key,
    $json
  ) | Out-Null
}

if ([string]::IsNullOrWhiteSpace($Nome)) {
  $Nome = $LojaId
}

if ([string]::IsNullOrWhiteSpace($Url) -and -not [string]::IsNullOrWhiteSpace($TunnelUrl)) {
  $Url = $TunnelUrl
}

if ($PrecreateStore -and [string]::IsNullOrWhiteSpace($Url) -and -not $AutoTunnelOnInstall -and -not $SkipActivationCode) {
  throw "Url obrigatório, exceto quando usas -AutoTunnelOnInstall."
}

if ($SkipActivationCode -and -not $PrecreateStore) {
  throw "Usa -PrecreateStore quando queres correr com -SkipActivationCode."
}

if (-not $SkipActivationCode -and [string]::IsNullOrWhiteSpace($ActivationCode)) {
  $ActivationCode = New-ActivationCode
}

$now = (Get-Date).ToUniversalTime().ToString("yyyy-MM-ddTHH:mm:ssZ")
$storeToken = if ([string]::IsNullOrWhiteSpace($Token)) {
  $ActivationCode.Trim()
} else {
  $Token.Trim()
}

$store = [ordered]@{
  id = $LojaId.Trim()
  nome = $Nome.Trim()
  url = $Url.Trim()
  server = $Server.Trim()
  database = $Database.Trim()
  port = $Port
  token = $storeToken
  created_at = $now
  updated_at = $now
}

Push-Location $PSScriptRoot
try {
  if ($PrecreateStore) {
    Write-Host "==> Gravar loja:$($store.id)" -ForegroundColor Cyan
    Put-KvJson -Key "loja:$($store.id)" -Value $store
  }

  if (-not $SkipActivationCode) {
    $activation = [ordered]@{
      code = $ActivationCode.Trim()
      loja_id = $store.id
      loja_nome = $store.nome
      estado = "ativo"
      max_uses = $MaxUses
      uses = 0
      created_at = $now
    }

    if (-not [string]::IsNullOrWhiteSpace($storeToken)) {
      $activation.store_token = $storeToken
    }

    if (-not [string]::IsNullOrWhiteSpace($ExpiresAt)) {
      $activation.expires_at = $ExpiresAt.Trim()
    }

    if (-not [string]::IsNullOrWhiteSpace($TunnelHostname)) {
      $activation.tunnel_hostname = $TunnelHostname.Trim()
    }

    if (-not [string]::IsNullOrWhiteSpace($TunnelUrl)) {
      $activation.tunnel_url = $TunnelUrl.Trim()
    }

    if (-not [string]::IsNullOrWhiteSpace($TunnelToken)) {
      $activation.tunnel_token = $TunnelToken.Trim()
    }

    if ($AutoTunnelOnInstall) {
      $activation.auto_tunnel = $true
    }

    Write-Host "==> Gravar activation-code:$($activation.code)" -ForegroundColor Cyan
    Put-KvJson -Key "activation-code:$($activation.code)" -Value $activation
  }

  Write-Host ""
  if ($PrecreateStore) {
    Write-Host "Cliente registado no KV remoto." -ForegroundColor Green
  } else {
    Write-Host "Código de ativação criado no KV remoto." -ForegroundColor Green
  }
  Write-Host "Loja: $($store.id)"

  if (-not $SkipActivationCode) {
    Write-Host "Código de ativação: $ActivationCode" -ForegroundColor Yellow
  }

  if (-not $PrecreateStore) {
    Write-Host "Antes da instalação fica só a chave activation-code no KV." -ForegroundColor Cyan
  } elseif ([string]::IsNullOrWhiteSpace($store.url)) {
    Write-Host "Nota: a loja so aparece no frontend depois do tunnel/url ser definido." -ForegroundColor Yellow
  } else {
    Write-Host "URL pública: $($store.url)"
  }
} finally {
  Pop-Location
}
