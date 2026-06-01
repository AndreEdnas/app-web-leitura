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
- `tunnel:<instalacao_id>` (opcional, preparado para fase seguinte)
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
