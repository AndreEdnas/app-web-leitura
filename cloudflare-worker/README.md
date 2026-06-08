# Ednas Cloudflare Worker (Licencas e Ativacao)

Este worker centraliza:
- configuracao de lojas (`/config`)
- registo de loja (`/auto-registar-loja`)
- ativacao/licenca (`/activation/start`, `/activation/finish`, `/license/check`)
- heartbeat (`/heartbeat`)
- e mantem compatibilidade com rotas antigas:
  - `/listar-lojas`
  - `/listar-licencas`
  - `/guardar-loja`
  - `/update-tunnel`
  - `/validar-licenca`
  - `/ativar-licenca`
  - `/pedir-licenca` (GET e POST)

## 1. Preparar

1. Editar `wrangler.toml` e colocar o `id` real do KV namespace (`lojas-db`).
2. Definir segredo da app key:

```bash
wrangler secret put APP_KEY
```

3. Publicar:

```bash
wrangler deploy
```

## 2. Chaves KV usadas

- `loja:<loja_id>`
- `licenca:<hwid>`
- `instalacao:<instalacao_id>`
- `tunnel:<hwid>` (quando o tunnel e criado automaticamente por PC)
- `activation-code:<codigo>`
- `config` (compatibilidade com schema legado)

## 3. Criar dados iniciais

### Loja

```bash
wrangler kv key put --binding CONFIG "loja:Teste" "{\"id\":\"Teste\",\"nome\":\"Teste\",\"url\":\"https://api.ednas.pt\",\"server\":\"BRUNO\",\"database\":\"tiofredo\",\"port\":1433,\"token\":\"99\"}"
```

### Codigo de ativacao

```bash
wrangler kv key put --binding CONFIG "activation-code:EDN-TESTE-001" "{\"code\":\"EDN-TESTE-001\",\"loja_id\":\"Teste\",\"estado\":\"ativo\",\"max_uses\":50,\"uses\":0}"
```

Para instalacoes comerciais, o codigo de ativacao pode tambem incluir dados de tunnel:

```json
{
  "code": "EDN-TESTE-001",
  "loja_id": "Teste",
  "estado": "ativo",
  "max_uses": 1,
  "uses": 0,
  "expires_at": "2026-12-31",
  "tunnel_hostname": "teste.ednas.pt",
  "tunnel_url": "https://teste.ednas.pt",
  "tunnel_token": "TOKEN_UNICO_DA_INSTALACAO"
}
```

O instalador envia este codigo para `/activation/finish`; o Worker valida o codigo, cria a licenca para o HWID do PC e devolve `loja` + `tunnel` ao backend local.

Tambem podes gerar e gravar um codigo com o script incluido:

```powershell
powershell -ExecutionPolicy Bypass -File .\create-activation-code.ps1 -LojaId "Teste" -MaxUses 1
```

Com tunnel ja criado manualmente:

```powershell
powershell -ExecutionPolicy Bypass -File .\create-activation-code.ps1 -LojaId "Teste" -TunnelHostname "teste.ednas.pt" -TunnelUrl "https://teste.ednas.pt" -TunnelToken "TOKEN_UNICO"
```

Com tunnel criado automaticamente pela API da Cloudflare:

```powershell
$env:CLOUDFLARE_ACCOUNT_ID="ACCOUNT_ID"
$env:CLOUDFLARE_ZONE_ID="ZONE_ID"
$env:CLOUDFLARE_API_TOKEN="API_TOKEN"

powershell -ExecutionPolicy Bypass -File .\create-activation-code.ps1 -LojaId "Teste" -AutoTunnel -TunnelHostname "teste.ednas.pt"
```

Com tunnel criado automaticamente no momento da instalacao do cliente:

```powershell
powershell -ExecutionPolicy Bypass -File .\create-activation-code.ps1 -LojaId "Teste" -AutoTunnelOnInstall
```

Neste modo, o tunnel nao e criado quando geras o codigo. O codigo fica marcado com `auto_tunnel: true`; quando o tecnico instala no cliente, o Worker cria o tunnel, cria/atualiza o DNS e devolve o token ao instalador.

Tambem podes deixar o script gerar o hostname:

```powershell
powershell -ExecutionPolicy Bypass -File .\create-activation-code.ps1 -LojaId "Teste" -AutoTunnel -TunnelDomain "ednas.pt"
```

Para `-AutoTunnelOnInstall`, estes valores devem estar configurados como secrets/vars do Worker:

```bash
wrangler secret put CLOUDFLARE_API_TOKEN
wrangler secret put CLOUDFLARE_ACCOUNT_ID
wrangler secret put CLOUDFLARE_ZONE_ID
wrangler secret put TUNNEL_DOMAIN
```

O `API_TOKEN` precisa de permissoes para criar Cloudflare Tunnel e editar DNS. O tunnel e configurado para apontar para `http://localhost:3051`, que e o backend local instalado no cliente.

## 4. Endpoints principais

- `GET /health`
- `GET /config-lojas` (publico para frontend Vercel)
- `GET /config`
- `POST /auto-registar-loja`
- `POST /activation/start`
- `POST /activation/finish`
- `POST /license/check`
- `POST /heartbeat`

Todos (exceto `/health` e `GET /config-lojas`) validam header:
- `X-App-Key: <APP_KEY>`

Nota: este valor deve bater com `CF_APP_KEY` usado no backend local.

## 5. Compatibilidade

O worker aceita os dois formatos:

1. Legado: tudo dentro da chave `config` (`lojas` e `licencas`).
2. Novo: chaves separadas por prefixo (`loja:`, `licenca:`, etc).

O endpoint `/config` devolve formato legado para manter compatibilidade com o backend atual.

## 6. Deploy sem downtime

1. Fazer backup de `config` no KV.
2. Publicar com o mesmo nome (`ednas-cloud`) para substituir só a lógica.
3. Testar:
   - `GET /health`
   - `GET /config` com `X-App-Key`
   - `POST /license/check`
4. Se tudo OK, manter em produção. Se algo falhar, reverter pelo tab Deployments.
