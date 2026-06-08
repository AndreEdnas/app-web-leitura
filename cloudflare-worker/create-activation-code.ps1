[CmdletBinding()]
param(
  [string]$LojaId,

  [string]$Code = "",
  [int]$MaxUses = 1,
  [string]$ExpiresAt = "",
  [string]$TunnelHostname = "",
  [string]$TunnelUrl = "",
  [string]$TunnelToken = "",
  [switch]$AutoTunnel,
  [switch]$AutoTunnelOnInstall,
  [string]$CloudflareAccountId = $env:CLOUDFLARE_ACCOUNT_ID,
  [string]$CloudflareApiToken = $env:CLOUDFLARE_API_TOKEN,
  [string]$CloudflareZoneId = $env:CLOUDFLARE_ZONE_ID,
  [string]$TunnelDomain = "",
  [string]$TunnelName = "",
  [string]$TunnelService = "http://localhost:3051",
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

function ConvertTo-Slug([string]$Value) {
  $slug = $Value.ToLowerInvariant() -replace "[^a-z0-9]+", "-"
  $slug = $slug.Trim("-")
  if ([string]::IsNullOrWhiteSpace($slug)) {
    return "cliente"
  }

  return $slug
}

function Invoke-CloudflareApi(
  [string]$Method,
  [string]$Path,
  $Body = $null
) {
  if ([string]::IsNullOrWhiteSpace($CloudflareApiToken)) {
    throw "CLOUDFLARE_API_TOKEN obrigatorio para criar tunnel automaticamente."
  }

  $headers = @{
    Authorization = "Bearer $CloudflareApiToken"
    "Content-Type" = "application/json"
  }

  $uri = "https://api.cloudflare.com/client/v4$Path"
  $params = @{
    Method = $Method
    Uri = $uri
    Headers = $headers
  }

  if ($null -ne $Body) {
    $params.Body = ($Body | ConvertTo-Json -Depth 20 -Compress)
  }

  $response = Invoke-RestMethod @params
  if (-not $response.success) {
    $errors = ($response.errors | ConvertTo-Json -Depth 10 -Compress)
    throw "Erro Cloudflare API em $Method ${Path}: $errors"
  }

  return $response.result
}

function New-CloudflareTunnelForActivation {
  if ([string]::IsNullOrWhiteSpace($LojaId)) {
    throw "LojaId obrigatorio quando usas -AutoTunnel. Para criar o tunnel no setup, usa -AutoTunnelOnInstall."
  }

  if ([string]::IsNullOrWhiteSpace($CloudflareAccountId)) {
    throw "CLOUDFLARE_ACCOUNT_ID obrigatorio para criar tunnel automaticamente."
  }

  if ([string]::IsNullOrWhiteSpace($CloudflareZoneId)) {
    throw "CLOUDFLARE_ZONE_ID obrigatorio para criar DNS do tunnel automaticamente."
  }

  if ([string]::IsNullOrWhiteSpace($TunnelHostname)) {
    if ([string]::IsNullOrWhiteSpace($TunnelDomain)) {
      throw "Define -TunnelHostname ou -TunnelDomain para criar tunnel automaticamente."
    }

    $codeSlug = ConvertTo-Slug $Code
    $storeSlug = ConvertTo-Slug $LojaId
    $script:TunnelHostname = "$storeSlug-$codeSlug.$TunnelDomain"
  }

  if ([string]::IsNullOrWhiteSpace($TunnelName)) {
    $script:TunnelName = "ednas-$((ConvertTo-Slug $LojaId))-$((ConvertTo-Slug $Code))"
  }

  Write-Host ""
  Write-Host "==> Criar Cloudflare Tunnel: $TunnelName" -ForegroundColor Cyan
  $tunnel = Invoke-CloudflareApi `
    -Method "POST" `
    -Path "/accounts/$CloudflareAccountId/cfd_tunnel" `
    -Body @{
      name = $TunnelName
      config_src = "cloudflare"
    }

  $tunnelId = [string]$tunnel.id
  $token = [string]$tunnel.token
  if ([string]::IsNullOrWhiteSpace($tunnelId) -or [string]::IsNullOrWhiteSpace($token)) {
    throw "A Cloudflare criou o tunnel, mas nao devolveu id/token."
  }

  Write-Host "==> Configurar hostname $TunnelHostname -> $TunnelService" -ForegroundColor Cyan
  Invoke-CloudflareApi `
    -Method "PUT" `
    -Path "/accounts/$CloudflareAccountId/cfd_tunnel/$tunnelId/configurations" `
    -Body @{
      config = @{
        ingress = @(
          @{
            hostname = $TunnelHostname
            service = $TunnelService
            originRequest = @{}
          },
          @{
            service = "http_status:404"
          }
        )
      }
    } | Out-Null

  $dnsName = [uri]::EscapeDataString($TunnelHostname)
  $existingRecords = Invoke-CloudflareApi `
    -Method "GET" `
    -Path "/zones/$CloudflareZoneId/dns_records?type=CNAME&name=$dnsName"

  $dnsBody = @{
    type = "CNAME"
    name = $TunnelHostname
    content = "$tunnelId.cfargotunnel.com"
    proxied = $true
    ttl = 1
  }

  if ($existingRecords -and $existingRecords.Count -gt 0) {
    $recordId = [string]$existingRecords[0].id
    Write-Host "==> Atualizar DNS existente: $TunnelHostname" -ForegroundColor Cyan
    Invoke-CloudflareApi `
      -Method "PUT" `
      -Path "/zones/$CloudflareZoneId/dns_records/$recordId" `
      -Body $dnsBody | Out-Null
  } else {
    Write-Host "==> Criar DNS: $TunnelHostname" -ForegroundColor Cyan
    Invoke-CloudflareApi `
      -Method "POST" `
      -Path "/zones/$CloudflareZoneId/dns_records" `
      -Body $dnsBody | Out-Null
  }

  return @{
    id = $tunnelId
    name = $TunnelName
    hostname = $TunnelHostname
    url = "https://$TunnelHostname"
    token = $token
  }
}

if ([string]::IsNullOrWhiteSpace($Code)) {
  $Code = New-ActivationCode
}

$createdTunnel = $null
if ($AutoTunnel -and [string]::IsNullOrWhiteSpace($TunnelToken)) {
  $createdTunnel = New-CloudflareTunnelForActivation
  $TunnelHostname = $createdTunnel.hostname
  $TunnelUrl = $createdTunnel.url
  $TunnelToken = $createdTunnel.token
}

$record = [ordered]@{
  code = $Code.Trim()
  estado = "ativo"
  max_uses = $MaxUses
  uses = 0
  created_at = (Get-Date).ToUniversalTime().ToString("yyyy-MM-ddTHH:mm:ssZ")
}

if (-not [string]::IsNullOrWhiteSpace($LojaId)) {
  $record.loja_id = $LojaId.Trim()
}

if (-not [string]::IsNullOrWhiteSpace($ExpiresAt)) {
  $record.expires_at = $ExpiresAt.Trim()
}

if (-not [string]::IsNullOrWhiteSpace($TunnelHostname)) {
  $record.tunnel_hostname = $TunnelHostname.Trim()
}

if (-not [string]::IsNullOrWhiteSpace($TunnelUrl)) {
  $record.tunnel_url = $TunnelUrl.Trim()
}

if (-not [string]::IsNullOrWhiteSpace($TunnelToken)) {
  $record.tunnel_token = $TunnelToken.Trim()
}

if ($AutoTunnelOnInstall) {
  $record.auto_tunnel = $true
}

if ($AutoTunnel -and $createdTunnel) {
  $record.tunnel_id = $createdTunnel.id
  $record.tunnel_name = $createdTunnel.name
  $record.tunnel_service = $TunnelService
}

$json = $record | ConvertTo-Json -Depth 20
$key = "activation-code:$($record.code)"

npx --yes wrangler@latest kv key put --remote --binding $Binding $key $json

Write-Host ""
Write-Host "Codigo de ativacao criado:" -ForegroundColor Green
Write-Host $record.code -ForegroundColor Yellow
Write-Host ""
Write-Host "Chave KV: $key"
if (-not [string]::IsNullOrWhiteSpace($TunnelUrl)) {
  Write-Host "Tunnel URL: $TunnelUrl" -ForegroundColor Green
}
