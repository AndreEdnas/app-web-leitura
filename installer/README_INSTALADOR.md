# Instalacao Multi-Cliente (EDNAS)

## 1) Preparar pacote (na tua maquina de desenvolvimento)
No root do projeto:

```powershell
powershell -ExecutionPolicy Bypass -File .\installer\prepare-package.ps1
```

Isto cria uma pasta pronta para distribuir:

```text
dist\ednas-client\
  build\
  backend\
  installer\
```

## 2) Instalar no cliente
No PC do cliente, abrir PowerShell **como Administrador** e correr:

```powershell
powershell -ExecutionPolicy Bypass -File .\installer\install-client.ps1 -PromptValues
```

No modo `-PromptValues`, o script pede:
- `CF_BASE`
- `CF_APP_KEY`
- `DB_USER` (opcional)
- `DB_PASSWORD` (opcional)
- `Tunnel token` (opcional)

Se passares o `Tunnel token`, o script instala tambem o servico `EdnasTunnel`.
Por defeito o atalho criado aponta para: `https://picagem-ednas.vercel.app`.
Se quiseres outro URL publico:

```powershell
powershell -ExecutionPolicy Bypass -File .\installer\install-client.ps1 -PromptValues -PublicWebUrl "https://teu-dominio.com"
```

## 3) Resultado da instalacao
O script configura:
- servico Windows `EdnasBackend`
- servico Windows `EdnasTunnel` (se tiver token)
- `backend\.env` no destino
- atalho para o site publico (Vercel/dominio)

## 4) Comandos uteis
Ver servicos:

```powershell
Get-Service EdnasBackend, EdnasTunnel
```

Desinstalar servicos:

```powershell
powershell -ExecutionPolicy Bypass -File .\installer\uninstall-client.ps1
```

Desinstalar servicos + ficheiros:

```powershell
powershell -ExecutionPolicy Bypass -File .\installer\uninstall-client.ps1 -RemoveFiles
```

## 5) Setup.exe (Inno Setup)
O projeto inclui um script base em `installer\EDNAS_SETUP.iss`.

Fluxo:
1. Correr `prepare-package.ps1`.
2. Abrir `installer\EDNAS_SETUP.iss` no Inno Setup.
3. Compilar.
4. Distribuir o `.exe` gerado.
