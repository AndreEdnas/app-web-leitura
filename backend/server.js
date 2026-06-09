const express = require('express');
const sql = require('mssql');
const readline = require("readline");
const fs = require("fs");
const yaml = require("js-yaml");
const os = require("os");
let LICENCA_OK = false;
let intervaloLicenca = null;
const LICENCA_CHECK_INTERVAL_MS = 5 * 60 * 1000;

const path = require("path");

let keytar = null;
try {
  keytar = require("keytar");
} catch (err) {
  console.warn("Keytar indisponivel; credenciais serao lidas do .env:", err.message);
}

require("dotenv").config({
  path: path.join(__dirname, ".env"),
});

const CF_APP_KEY = String(process.env.CF_APP_KEY || "").trim();
const CF_BASE = String(process.env.CF_BASE || "").trim();
const ACTIVATION_CODE = String(
  process.env.ACTIVATION_CODE ||
  process.env.CODIGO_ATIVACAO ||
  ""
).trim();
const STORE_NAME = String(process.env.STORE_NAME || process.env.LOJA_NOME || "").trim();
const DB_SERVER = String(process.env.DB_SERVER || "").trim();
const DB_INSTANCE = String(process.env.DB_INSTANCE || "").trim();
const DB_DATABASE = String(process.env.DB_DATABASE || "").trim();
const DB_PORT = String(process.env.DB_PORT || "").trim();
const STORE_TOKEN = String(
  process.env.STORE_TOKEN ||
  process.env.TOKEN_LOJA ||
  ""
).trim();
const DEV_LOCAL_STORE_NAME = String(process.env.DEV_LOCAL_STORE_NAME || "DEV Local").trim();
const DEV_LOCAL_STORE_TOKEN = String(process.env.DEV_LOCAL_STORE_TOKEN || STORE_TOKEN || "dev").trim();
const DEV_LOCAL_API_URL = String(process.env.DEV_LOCAL_API_URL || "http://localhost:3051").trim();
const DEV_LOCAL_BYPASS_LICENSE =
  process.env.DEV_LOCAL_BYPASS_LICENSE === "true" ||
  (
    process.env.NODE_ENV === "development" &&
    process.env.DEV_LOCAL_BYPASS_LICENSE !== "false"
  );

const FRONTEND_BUILD_PATH = process.env.FRONTEND_BUILD_PATH
  ? path.resolve(process.env.FRONTEND_BUILD_PATH)
  : path.resolve(__dirname, "..", "build");
const FRONTEND_INDEX_PATH = path.join(FRONTEND_BUILD_PATH, "index.html");
const HAS_FRONTEND_BUILD = fs.existsSync(FRONTEND_INDEX_PATH);

function getRequestHostName(req) {
  const hostHeader = (
    req?.headers?.["x-forwarded-host"] ||
    req?.headers?.host ||
    ""
  ).toString().toLowerCase();

  return hostHeader.split(":")[0];
}

function isLocalDevRequest(req) {
  const hostname = getRequestHostName(req);
  return hostname === "localhost" || hostname === "127.0.0.1";
}

function getDevLocalStore() {
  return {
    id: DEV_LOCAL_STORE_NAME,
    nome: DEV_LOCAL_STORE_NAME,
    url: DEV_LOCAL_API_URL.replace(/\/+$/, ""),
    server: DB_SERVER || null,
    instance: DB_INSTANCE || null,
    database: DB_DATABASE || null,
    port: DB_PORT ? Number(DB_PORT) : null,
    token: DEV_LOCAL_STORE_TOKEN
  };
}

function ativarModoDevLocal() {
  const lojaDev = getDevLocalStore();
  lojaAtual = lojaDev;
  LICENCA_OK = true;
  console.log(`Modo dev local ativo. Loja: ${lojaDev.id}. Worker/licença central ignorados.`);
}

const devMockState = {
  produtos: [
    {
      codigo: 1001,
      descricao: "Agua 1L",
      codbarras: "8004800001467",
      qtdstock: 20,
      precocompra: 0.35,
      iva: 6,
      margembruta: 50,
      pvp1siva: 0.53,
      precovenda: 0.56,
      fornecedor: 1,
      familia: 1,
      subfam: 1,
      codigopp: 101,
      unidade: 1
    },
    {
      codigo: 1002,
      descricao: "Bolacha Maria",
      codbarras: "5601234567890",
      qtdstock: 5,
      precocompra: 0.8,
      iva: 23,
      margembruta: 40,
      pvp1siva: 1.12,
      precovenda: 1.38,
      fornecedor: 1,
      familia: 2,
      subfam: 2,
      codigopp: 102,
      unidade: 1
    }
  ],
  documentos: []
};

const devMockFornecedores = [
  { codigo: 1, nome: "Fornecedor DEV" },
  { codigo: 2, nome: "Fornecedor Teste" }
];

const devMockFamilias = [
  { codigo: 1, descricao: "Bebidas" },
  { codigo: 2, descricao: "Mercearia" }
];

const devMockSubfamilias = [
  { codigo: 1, descricao: "Aguas", familia: 1 },
  { codigo: 2, descricao: "Bolachas", familia: 2 }
];

const devMockEmpregados = [
  {
    id: 1,
    codigo: 1,
    nome: "Admin",
    password: "1234",
    bloqueado: 0,
    gestaocaixa: 1,
    frontoffice: 1,
    email: "",
    telefone: ""
  }
];

const devMockTiposDocumento = [
  { doc: "CFA", serie: "DEV" },
  { doc: "CFS", serie: "DEV" }
];

const TIPOS_DOCUMENTO_FORNECEDOR = ["CFA", "CFS"];

const devMockTiposInventario = [
  { doc: "IN", serie: "DEV" }
];

function isDevLocalStoreActive() {
  return lojaAtual && String(lojaAtual.id || lojaAtual.nome) === DEV_LOCAL_STORE_NAME;
}

function shouldUseDevMockData() {
  return (
    isDevLocalStoreActive() &&
    (
      process.env.DEV_LOCAL_MOCK === "true" ||
      !DB_SERVER ||
      !DB_DATABASE
    )
  );
}

function escapeSqlIdentifier(identifier) {
  return `[${String(identifier).replace(/]/g, "]]")}]`;
}

function normalizeColumnName(name) {
  return String(name || "").trim().toLowerCase();
}

function getRecordValueCaseInsensitive(record, name) {
  const wanted = normalizeColumnName(name);
  const key = Object.keys(record || {}).find((item) => normalizeColumnName(item) === wanted);
  return key ? record[key] : undefined;
}

function sqlTypeForColumn(column) {
  const type = normalizeColumnName(column.data_type);

  if (["tinyint", "smallint", "int"].includes(type)) return sql.Int;
  if (type === "bigint") return sql.BigInt;
  if (["decimal", "numeric"].includes(type)) return sql.Decimal(18, 4);
  if (["money", "smallmoney"].includes(type)) return sql.Money;
  if (["float", "real"].includes(type)) return sql.Float;
  if (type === "bit") return sql.Bit;
  if (["date"].includes(type)) return sql.Date;
  if (["datetime", "datetime2", "smalldatetime"].includes(type)) return sql.DateTime;

  return sql.NVarChar(sql.MAX);
}

function defaultValueForColumn(column) {
  const type = normalizeColumnName(column.data_type);

  if (type === "bit") return 0;
  if ([
    "tinyint",
    "smallint",
    "int",
    "bigint",
    "decimal",
    "numeric",
    "money",
    "smallmoney",
    "float",
    "real"
  ].includes(type)) {
    return 0;
  }
  if (["date", "datetime", "datetime2", "smalldatetime"].includes(type)) {
    return new Date();
  }

  return "";
}

async function getTableColumns(pool, tableName) {
  const result = await pool.request()
    .input("tableName", sql.VarChar(128), tableName)
    .query(`
      SELECT
        c.TABLE_SCHEMA AS table_schema,
        c.COLUMN_NAME AS column_name,
        c.DATA_TYPE AS data_type,
        c.IS_NULLABLE AS is_nullable,
        c.COLUMN_DEFAULT AS column_default,
        COLUMNPROPERTY(OBJECT_ID(c.TABLE_SCHEMA + '.' + c.TABLE_NAME), c.COLUMN_NAME, 'IsIdentity') AS is_identity,
        COLUMNPROPERTY(OBJECT_ID(c.TABLE_SCHEMA + '.' + c.TABLE_NAME), c.COLUMN_NAME, 'IsComputed') AS is_computed
      FROM INFORMATION_SCHEMA.COLUMNS c
      WHERE c.TABLE_NAME = @tableName
      ORDER BY
        CASE WHEN c.TABLE_SCHEMA = 'dbo' THEN 0 ELSE 1 END,
        c.ORDINAL_POSITION
    `);

  return result.recordset;
}

function buildColumnLookup(columns) {
  const lookup = new Map();

  for (const column of columns) {
    lookup.set(normalizeColumnName(column.column_name), column);
  }

  return lookup;
}

function setFornecedorColumnValue(values, columnLookup, names, value) {
  if (value === undefined || value === null || String(value).trim() === "") return;

  for (const name of names) {
    const column = columnLookup.get(normalizeColumnName(name));
    if (!column || column.is_identity || column.is_computed) continue;

    values.set(normalizeColumnName(column.column_name), {
      column,
      value
    });
    return;
  }
}

function getSqlTarget(rawServer, rawInstance = "") {
  const serverValue = String(rawServer || "").trim();
  const instanceValue = String(rawInstance || "").trim();

  if (!serverValue) {
    return { server: "", instanceName: instanceValue };
  }

  if (instanceValue) {
    return { server: serverValue, instanceName: instanceValue };
  }

  const slashIndex = serverValue.indexOf("\\");
  if (slashIndex > -1) {
    return {
      server: serverValue.slice(0, slashIndex),
      instanceName: serverValue.slice(slashIndex + 1),
    };
  }

  return { server: serverValue, instanceName: "" };
}

async function gerarNovoCodigoProduto(pool) {
  const result = await pool.request().query(`
    SELECT ISNULL(MAX(codigo), 0) + 1 AS novoCodigo
    FROM produtos
  `);

  return Number(result.recordset[0].novoCodigo || 1);
}

async function buscarProdutoBaseParaCopia(pool) {
  const normal = await pool.request().query(`
    SELECT TOP 1 *
    FROM produtos
    WHERE ISNULL(stocks, 0) = 1
      AND ISNULL(prodstock, 0) = codigo
      AND ISNULL(codigo, 0) > 0
    ORDER BY codigo DESC
  `);

  if (normal.recordset[0]) {
    return normal.recordset[0];
  }

  const fallback = await pool.request().query(`
    SELECT TOP 1 *
    FROM produtos
    ORDER BY codigo DESC
  `);

  return fallback.recordset[0] || null;
}

async function buscarStockAtualProduto(pool, codigo, armazem = 0) {
  const result = await pool.request()
    .input("codigo", sql.Int, Number(codigo))
    .input("armazem", sql.Int, Number(armazem) || 0)
    .query(`
      SELECT CAST(ISNULL(SUM(QTD), 0) AS float) AS qtdstock
      FROM stock_actual
      WHERE produto = @codigo
        AND armazem = @armazem
    `);

  return Number(result.recordset[0].qtdstock || 0);
}

async function aplicarStockAtualAProduto(pool, produto) {
  if (!produto || !Number.isInteger(Number(produto.codigo))) {
    return produto;
  }

  const armazem = Number(produto.armazem) || 0;
  const codigoStock = Number(produto.prodstock) > 0
    ? Number(produto.prodstock)
    : Number(produto.codigo);
  const stockAtual = await buscarStockAtualProduto(pool, codigoStock, armazem);
  return {
    ...produto,
    qtdstock: stockAtual,
    stock_atual: stockAtual
  };
}

async function aplicarStockAtualAProdutos(pool, produtos) {
  const normalizados = [];

  for (const produto of produtos || []) {
    normalizados.push(await aplicarStockAtualAProduto(pool, produto));
  }

  return normalizados;
}

async function sincronizarQtdStockComStockAtual(requestFactory, codigoProduto, codigoStock = codigoProduto, armazem = 0) {
  const request = requestFactory()
    .input("codigoProduto", sql.Int, Number(codigoProduto))
    .input("codigoStock", sql.Int, Number(codigoStock))
    .input("armazem", sql.Int, Number(armazem) || 0);

  const result = await request.query(`
    DECLARE @stockAtual money;

    SELECT @stockAtual = ISNULL(SUM(QTD), 0)
    FROM stock_actual
    WHERE produto = @codigoStock
      AND armazem = @armazem;

    UPDATE produtos
    SET qtdstock = ISNULL(@stockAtual, 0),
        id = 0
    WHERE codigo = @codigoProduto;

    SELECT CAST(ISNULL(@stockAtual, 0) AS float) AS qtdstock;
  `);

  return Number(result.recordset[0].qtdstock || 0);
}

async function removerDocumentoParcial(pool, doc, serie, numero) {
  await pool.request()
    .input("doc", sql.VarChar(10), doc)
    .input("serie", sql.VarChar(25), serie)
    .input("numero", sql.Int, numero)
    .query(`
      DELETE FROM Vendas
      WHERE RTRIM(LTRIM(doc)) = RTRIM(LTRIM(@doc))
        AND RTRIM(LTRIM(serie)) = RTRIM(LTRIM(@serie))
        AND numero = @numero;

      DELETE FROM tblStockMov
      WHERE RTRIM(LTRIM(doc)) = RTRIM(LTRIM(@doc))
        AND RTRIM(LTRIM(serie)) = RTRIM(LTRIM(@serie))
        AND numero = @numero;

      DELETE FROM Documentos
      WHERE RTRIM(LTRIM(doc)) = RTRIM(LTRIM(@doc))
        AND RTRIM(LTRIM(serie)) = RTRIM(LTRIM(@serie))
        AND numero = @numero;
    `);
}

function findDevMockProduct(identifier) {
  const value = String(identifier || "").trim();
  const asNumber = /^\d+$/.test(value) ? Number(value) : null;

  return devMockState.produtos.find((produto) => {
    if (String(produto.codbarras || "").trim() === value) return true;
    return asNumber !== null && Number(produto.codigo) === asNumber;
  }) || null;
}

function recalculateDevMockProduct(produto) {
  const precocompra = Number(produto.precocompra) || 0;
  const margembruta = Number(produto.margembruta) || 0;
  const iva = Number(produto.iva) || 0;
  const pvp1siva = precocompra * (1 + margembruta / 100);
  const precovenda = pvp1siva * (1 + iva / 100);

  produto.pvp1siva = Number(pvp1siva.toFixed(2));
  produto.precovenda = Number(precovenda.toFixed(2));
  return produto;
}



const MODO_INSTALACAO = process.env.MODO_INSTALACAO === "true";

const app = express();

app.use((req, res, next) => {
  const origin = req.headers.origin;

  const DEV = process.env.NODE_ENV !== "production";

  const originOk =
    !origin ||
    origin === "https://app.ednas.pt" ||
    origin === "https://picagem-ednas.vercel.app" || // 👈 Vercel
    /^https:\/\/([a-z0-9-]+\.)*ednas\.pt$/i.test(origin) ||
    (DEV && /^http:\/\/localhost:\d+$/.test(origin));



  if (originOk && origin) {
    res.header("Access-Control-Allow-Origin", origin);
    res.header("Vary", "Origin");
  }

  res.header(
    "Access-Control-Allow-Headers",
    "Origin, X-Requested-With, Content-Type, Accept, Authorization"
  );
  res.header(
    "Access-Control-Allow-Methods",
    "GET, POST, PUT, PATCH, DELETE, OPTIONS"
  );

  if (req.method === "OPTIONS") {
    return res.sendStatus(204);
  }

  next();
});



app.use(express.json());

if (HAS_FRONTEND_BUILD) {
  app.use(express.static(FRONTEND_BUILD_PATH, { index: "index.html" }));
} else {
  console.log(`Build do frontend não encontrado em: ${FRONTEND_BUILD_PATH}`);
}

function obterTunnelURLAutomatico() {
  try {
    const base = path.join(process.env.USERPROFILE, ".cloudflared");
    const configPath = path.join(base, "config.yml");

    if (!fs.existsSync(configPath)) {
      console.log("⚠ config.yml do Cloudflare não encontrado.");
      return null;
    }

    const conteudo = fs.readFileSync(configPath, "utf8");
    const data = yaml.load(conteudo);

    if (!data.ingress || !data.ingress[0].hostname) {
      console.log("⚠ Não foi possível obter o hostname do tunnel.");
      return null;
    }

    const hostname = data.ingress[0].hostname;

    // Construir URL completo
    return `https://${hostname}`;
  } catch (e) {
    console.log("⚠ Erro ao ler URL do tunnel:", e.message);
    return null;
  }
}


async function autoConfigurarLojaNoArranque() {
  if (!MODO_INSTALACAO) {
    return await carregarConfigCloudflare();
  }


  // 1 — tentar obter a configuração
  const config = await carregarConfigCloudflare();
  if (!config) {
    console.log("❌ Erro ao carregar config do Worker");
    return null;
  }

  // 2 — tentar obter o nome do túnel automaticamente
  const publicUrl = obterTunnelURLAutomatico();
  if (!publicUrl) {
      console.log("⚠ PUBLIC_URL não definido. A ignorar auto-setup.");
    return config;
  }

  // 3 — procurar loja com este URL
  const lojasNormalizadas = normalizarConfigCloudflare(config).lojas;
  const lojaExistente = Object.entries(lojasNormalizadas).find(
    ([lojaNome, dados]) => dados.url === publicUrl
  );

  if (lojaExistente) {
    console.log(`✅ Loja encontrada: ${lojaExistente[0]}`);
    return config;
  }

  // 4 — nenhuma loja encontrada → PERGUNTAR AUTOMÁTICO
  console.log("⚡ A iniciar configuração automática da loja...\n");

  const nome = await perguntarConsole("Nome da loja: ");
  const serverSql = await perguntarConsole("Servidor SQL (ex: ENCOMENDAS): ");
  const database = await perguntarConsole("Base de dados (ex: DEMOZS): ");
  const portInput = await perguntarConsole("Porta SQL (ex: 1433): ");
  const token = await perguntarConsole("Token da loja (ex: 1): ");

  const novaLoja = {
    nome,
    url: publicUrl,
    server: serverSql,
    database,
    port: Number(portInput) || 1433,
    token
  };

  console.log("\n📦 A enviar nova loja para o Worker...");

  let tentativaNome = nome;

  while (true) {
    const body = {
      nome: tentativaNome,
      url: publicUrl,
      server: serverSql,
      database,
      port: Number(portInput) || 1433,
      token
    };

    const res = await fetch(`${CF_BASE}/auto-registar-loja`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-App-Key": CF_APP_KEY

      },
      body: JSON.stringify(body)
    });

    const json = await res.json();

    // ✔ Loja criada
    if (json.success) {
      console.log(`🎉 Loja "${tentativaNome}" criada com sucesso!`);
      break;
    }

    // ❌ Loja existente → pedir novo nome
    if (json.error && json.error.includes("já existe")) {
      console.log(`❌ A loja "${tentativaNome}" já existe!`);
      tentativaNome = await perguntarConsole("Insira outro nome da loja: ");
      continue;
    }

    // ❌ Outro erro qualquer
    console.log("❌ Falhou a criação automática:", json.error || "Erro desconhecido");
    return config;
  }

  // Carregar config já atualizada
  return await carregarConfigCloudflare();

}


// --- LICENCIAMENTO via CLOUDFLARE WORKER + KV ---
const si = require("systeminformation");
const crypto = require("crypto");
const fetch = require("node-fetch");

function hashTokenLocal(value) {
  return crypto.createHash("sha256").update(String(value || "")).digest();
}

function tokensMatchLocal(provided, expected) {
  const providedToken = String(provided || "").trim();
  const expectedToken = String(expected || "").trim();
  if (!providedToken || !expectedToken) return false;

  return crypto.timingSafeEqual(
    hashTokenLocal(providedToken),
    hashTokenLocal(expectedToken)
  );
}

function toPublicStoreLocal(lojaId, loja) {
  if (!loja || typeof loja !== "object") return null;

  return {
    id: lojaId,
    nome: String(loja.nome || lojaId),
    url: String(loja.url || "").trim() || null,
  };
}



// Perguntar na consola (CMD) – usado só na 1ª instalação
function perguntarConsole(pergunta) {
  return new Promise((resolve) => {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });

    rl.question(pergunta, (resposta) => {
      rl.close();
      resolve(resposta.trim());
    });
  });
}

// Registar loja automaticamente no KV SE ainda não existir para este domínio
async function autoRegistarLojaSeNecessario(config, hostHeader, guessedUrl) {

  if (!MODO_INSTALACAO) {
    return config;
  }

  // se estiveres a testar em localhost, não chateamos
  if (
    !hostHeader ||
    hostHeader.includes("localhost") ||
    hostHeader.startsWith("127.0.0.1")
  ) {
    return config;
  }

  const lojas = normalizarConfigCloudflare(config).lojas;
  const hostLower = hostHeader.toLowerCase();
  const urlLower = guessedUrl.toLowerCase();

  // já existe alguma loja com este URL/domínio
  for (const [nome, loja] of Object.entries(lojas)) {
    if (
      loja &&
      typeof loja.url === "string" &&
      (loja.url.toLowerCase() === urlLower ||
        loja.url.toLowerCase().includes(hostLower))
    ) {
      console.log(`ℹ Loja '${nome}' já existe no KV para ${guessedUrl}`);
      return config;
    }
  }

  console.log("\n🆕 Nenhuma loja encontrada no KV para este domínio:", guessedUrl);
  console.log("   Vamos registar esta instalação agora.\n");

  const nome = await perguntarConsole("Nome da loja: ");
  const serverSql = await perguntarConsole("Servidor SQL (ex: ENCOMENDAS): ");
  const database = await perguntarConsole("Base de dados (ex: DEMOZS): ");
  const portInput = await perguntarConsole("Porta SQL (ex: 1433): ");
  const token = await perguntarConsole("Token da loja (ex: 1, 122, etc): ");

  const port = parseInt(portInput, 10) || 1433;

  const body = {
    nome: nome || "Loja Sem Nome",
    url: guessedUrl,
    server: serverSql || "ENCOMENDAS",
    database: database || "DEMOZS",
    port,
    token: token || "1",
  };

  const autoUrl = `${CF_BASE}/auto-registar-loja`;


  try {
    const res = await fetch(autoUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-App-Key": CF_APP_KEY
        // mesma chave que usas no Worker
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      console.error("❌ Falha ao registar loja no Worker:", res.status);
      return config;
    }

    const json = await res.json();
    console.log("✅ Loja registada no KV:", json);

    // voltar a obter a configuração já atualizada
    const novaConfig = await carregarConfigCloudflare();
    return novaConfig || config;
  } catch (err) {
    console.error("❌ Erro ao enviar loja para o Worker:", err);
    return config;
  }
}


// aqui vamos guardar a loja ligada a este PC
let lojaAtual = null;

// Gerar HWID único do PC
async function gerarHWID() {
  try {
    const sys = await si.system();
    const disk = (await si.diskLayout())[0];
    const net = (await si.networkInterfaces())[0];

    const serial = disk.serialNumber || disk.serialNum || "";
    const mac = net.mac || "";
    const uuid = sys.uuid || "";

    const raw = `${uuid}|${serial}|${mac}`;
    return crypto.createHash("sha256").update(raw).digest("hex");

  } catch (err) {
    console.error("Erro ao gerar HWID:", err);
    return null;
  }
}

// Carregar config do Cloudflare (Worker + KV)
async function carregarConfigCloudflare() {
  try {
    if (!CF_BASE) {
      return null;
    }

    const headers = {};
    if (CF_APP_KEY) {
      headers["X-App-Key"] = CF_APP_KEY;
    }

    const res = await fetch(`${CF_BASE}/config`, {

      headers
    });

    if (!res.ok) {
      throw new Error(`HTTP ${res.status}`);
    }
    return await res.json(); // deve devolver exatamente o JSON do KV
  } catch (err) {
    console.error("❌ Erro ao ler config do Cloudflare:", err);
    return null;
  }
}

function parseJsonSeForTexto(value) {
  if (typeof value !== "string") return value;
  const trimmed = value.trim();
  if (!trimmed) return value;

  try {
    return JSON.parse(trimmed);
  } catch {
    return value;
  }
}

function adicionarLojaNoMapa(lojasMap, lojaId, lojaValor) {
  if (!lojaId || !lojaValor || typeof lojaValor !== "object") return;

  const normalizedId = String(lojaId).trim();
  if (!normalizedId) return;

  lojasMap[normalizedId] = {
    ...lojaValor,
    id: lojaValor.id || normalizedId
  };
}

function adicionarLicencaNoMapa(licencasByHwid, licencaValor, fallbackKey = null) {
  if (!licencaValor || typeof licencaValor !== "object") return;

  const hwid = String(
    licencaValor.hwid ||
    licencaValor.HWID ||
    licencaValor.machineHwid ||
    ""
  ).trim();

  if (!hwid) return;

  licencasByHwid[hwid] = {
    ...licencaValor,
    hwid,
    _key: licencaValor._key || fallbackKey || null
  };
}

function normalizarConfigCloudflare(configRaw = {}) {
  const lojasMap = {};
  const licencasByHwid = {};
  const instalacoesById = {};
  const tunnelsByInstalacaoId = {};

  const config = configRaw && typeof configRaw === "object" ? configRaw : {};

  if (config.lojas && typeof config.lojas === "object" && !Array.isArray(config.lojas)) {
    for (const [lojaId, lojaValue] of Object.entries(config.lojas)) {
      adicionarLojaNoMapa(lojasMap, lojaId, parseJsonSeForTexto(lojaValue));
    }
  }

  if (config.lojas_by_id && typeof config.lojas_by_id === "object") {
    for (const [lojaId, lojaValue] of Object.entries(config.lojas_by_id)) {
      adicionarLojaNoMapa(lojasMap, lojaId, parseJsonSeForTexto(lojaValue));
    }
  }

  if (config.lojasById && typeof config.lojasById === "object") {
    for (const [lojaId, lojaValue] of Object.entries(config.lojasById)) {
      adicionarLojaNoMapa(lojasMap, lojaId, parseJsonSeForTexto(lojaValue));
    }
  }

  if (Array.isArray(config.lojas)) {
    for (const lojaEntry of config.lojas) {
      const lojaValue = parseJsonSeForTexto(lojaEntry);
      if (!lojaValue || typeof lojaValue !== "object") continue;
      const lojaId = lojaValue.id || lojaValue.loja_id || lojaValue.nome;
      adicionarLojaNoMapa(lojasMap, lojaId, lojaValue);
    }
  }

  if (config.licencas && typeof config.licencas === "object" && !Array.isArray(config.licencas)) {
    for (const [licKey, licValue] of Object.entries(config.licencas)) {
      const licenca = parseJsonSeForTexto(licValue);
      adicionarLicencaNoMapa(licencasByHwid, licenca, licKey);
    }
  }

  if (config.licencas_by_hwid && typeof config.licencas_by_hwid === "object") {
    for (const [hwid, licValue] of Object.entries(config.licencas_by_hwid)) {
      const licenca = parseJsonSeForTexto(licValue);
      adicionarLicencaNoMapa(licencasByHwid, { ...licenca, hwid }, `licenca:${hwid}`);
    }
  }

  if (config.licencasByHwid && typeof config.licencasByHwid === "object") {
    for (const [hwid, licValue] of Object.entries(config.licencasByHwid)) {
      const licenca = parseJsonSeForTexto(licValue);
      adicionarLicencaNoMapa(licencasByHwid, { ...licenca, hwid }, `licenca:${hwid}`);
    }
  }

  if (Array.isArray(config.licencas)) {
    for (const lic of config.licencas) {
      adicionarLicencaNoMapa(licencasByHwid, parseJsonSeForTexto(lic));
    }
  }

  const sourcesComPrefixos = [config, config.kv, config.kvEntries, config.entries];
  for (const source of sourcesComPrefixos) {
    if (!source || typeof source !== "object" || Array.isArray(source)) continue;

    for (const [rawKey, rawValue] of Object.entries(source)) {
      const value = parseJsonSeForTexto(rawValue);

      if (rawKey.startsWith("loja:")) {
        adicionarLojaNoMapa(lojasMap, rawKey.slice("loja:".length), value);
      } else if (rawKey.startsWith("licenca:")) {
        const hwidFromKey = rawKey.slice("licenca:".length).trim();
        adicionarLicencaNoMapa(
          licencasByHwid,
          typeof value === "object" ? { ...value, hwid: value.hwid || hwidFromKey } : null,
          rawKey
        );
      } else if (rawKey.startsWith("instalacao:")) {
        const instId = rawKey.slice("instalacao:".length).trim();
        if (instId && value && typeof value === "object") {
          instalacoesById[instId] = { ...value, id: value.id || instId };
        }
      } else if (rawKey.startsWith("tunnel:")) {
        const instId = rawKey.slice("tunnel:".length).trim();
        if (instId && value && typeof value === "object") {
          tunnelsByInstalacaoId[instId] = { ...value, instalacao_id: value.instalacao_id || instId };
        }
      }
    }
  }

  return {
    lojas: lojasMap,
    licencasByHwid,
    instalacoesById,
    tunnelsByInstalacaoId
  };
}

function encontrarLojaPorHost(lojasMap, hostHeader) {
  const host = String(hostHeader || "").toLowerCase();
  if (!host) return { lojaId: null, loja: null };

  for (const [lojaId, loja] of Object.entries(lojasMap || {})) {
    if (
      loja &&
      typeof loja.url === "string" &&
      loja.url.toLowerCase().includes(host)
    ) {
      return { lojaId, loja };
    }
  }

  return { lojaId: null, loja: null };
}

function resolverLojaPorLicenca(licenca, lojasMap) {
  if (!licenca || typeof licenca !== "object") {
    return { lojaId: null, loja: null };
  }

  const lojaId =
    licenca.loja_id ||
    licenca.loja ||
    licenca.store_id ||
    null;

  if (!lojaId) return { lojaId: null, loja: null };

  return {
    lojaId,
    loja: lojasMap?.[lojaId] || null
  };
}

async function obterSnapshotLicenca({ req = null, hwid = null, allowAutoRegister = false } = {}) {
  const hostHeader = (
    req?.headers?.["x-forwarded-host"] ||
    req?.headers?.host ||
    ""
  ).toString().toLowerCase();

  const guessedUrl = hostHeader ? `https://${hostHeader}` : "Desconhecida";
  const machineHwid = hwid || await gerarHWID();

  let configRaw = await carregarConfigCloudflare();
  if (configRaw && allowAutoRegister) {
    configRaw = await autoRegistarLojaSeNecessario(configRaw, hostHeader, guessedUrl);
  }

  if (!configRaw && lojaAtual) {
    const lojaId = String(lojaAtual.id || lojaAtual.nome || "local").trim();
    configRaw = {
      lojas: {
        [lojaId]: {
          ...lojaAtual,
          id: lojaId
        }
      },
      licencas: {
        local: {
          hwid: machineHwid,
          loja_id: lojaId,
          loja: lojaId,
          token: ACTIVATION_CODE || null,
          estado: "ativa"
        }
      }
    };
  }

  const normalizado = normalizarConfigCloudflare(configRaw || {});
  const licenca = machineHwid ? (normalizado.licencasByHwid[machineHwid] || null) : null;

  const porHost = encontrarLojaPorHost(normalizado.lojas, hostHeader);
  const porLicenca = resolverLojaPorLicenca(licenca, normalizado.lojas);

  return {
    hostHeader,
    guessedUrl,
    hwid: machineHwid,
    configRaw,
    lojas: normalizado.lojas,
    licencasByHwid: normalizado.licencasByHwid,
    licenca,
    lojaDoHostId: porHost.lojaId,
    lojaDoHost: porHost.loja,
    lojaDaLicencaId: porLicenca.lojaId,
    lojaDaLicenca: porLicenca.loja
  };
}

async function chamarWorkerJson(pathname, { method = "GET", body = null } = {}) {
  const headers = {
    "Accept": "application/json"
  };

  if (CF_APP_KEY) {
    headers["X-App-Key"] = CF_APP_KEY;
  }

  const options = {
    method,
    headers
  };

  if (body !== null && body !== undefined) {
    headers["Content-Type"] = "application/json";
    options.body = JSON.stringify(body);
  }

  const res = await fetch(`${CF_BASE}${pathname}`, options);
  const text = await res.text();

  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = null;
  }

  return {
    ok: res.ok,
    status: res.status,
    data,
    text
  };
}

// Validar licença usando HWID + config do Cloudflare
function getHostInfo(req = null) {
  const hostHeader = (
    req?.headers?.["x-forwarded-host"] ||
    req?.headers?.host ||
    os.hostname() ||
    ""
  ).toString().toLowerCase();

  return {
    hostHeader,
    guessedUrl: hostHeader ? `https://${hostHeader}` : "Desconhecida"
  };
}

function normalizarLojaAtivacao(data = {}) {
  const loja =
    data.loja ||
    data.store ||
    data.license.loja ||
    data.licenca.loja ||
    null;

  if (!loja || typeof loja !== "object") {
    return null;
  }

  const lojaId = String(
    loja.id ||
    loja.loja_id ||
    data.license.loja_id ||
    data.license.loja ||
    data.licenca.loja_id ||
    data.licenca.loja ||
    loja.nome ||
    ""
  ).trim();

  if (!lojaId) {
    return null;
  }

  return {
    id: lojaId,
    nome: loja.nome || lojaId,
    url: loja.url || data.tunnel.url || null,
    server: loja.server || DB_SERVER || null,
    database: loja.database || DB_DATABASE || null,
    port: Number(loja.port || DB_PORT || 1433),
    token: loja.token || loja.store_token || STORE_TOKEN || data.license.token || data.licenca.token || null,
  };
}

async function ativarInstalacaoPorCodigo({ req = null } = {}) {
  if (!ACTIVATION_CODE || !CF_BASE) {
    return null;
  }

  const hwid = await gerarHWID();
  if (!hwid) {
    throw new Error("Não foi possível gerar HWID.");
  }

  const hostInfo = getHostInfo(req);
  const workerResp = await chamarWorkerJson("/activation/finish", {
    method: "POST",
    body: {
      activation_code: ACTIVATION_CODE,
      hwid,
      host: hostInfo.hostHeader,
      guessedUrl: hostInfo.guessedUrl,
      store_name: STORE_NAME,
      store_token: STORE_TOKEN,
      db_server: DB_SERVER,
      db_database: DB_DATABASE,
      db_port: DB_PORT
    }
  });

  if (!workerResp.ok || !workerResp.data.success) {
    throw new Error(
      workerResp.data.error ||
      workerResp.text ||
      `Ativação rejeitada pelo Worker (${workerResp.status})`
    );
  }

  const loja = normalizarLojaAtivacao(workerResp.data);
  if (!loja) {
    throw new Error("O Worker ativou a licença, mas não devolveu dados da loja.");
  }

  lojaAtual = loja;
  LICENCA_OK = true;

  return {
    hwid,
    loja,
    data: workerResp.data
  };
}

async function validarLicenca() {
  try {
    if (ACTIVATION_CODE) {
      try {
        const ativacao = await ativarInstalacaoPorCodigo();
        if (ativacao) {
          console.log(`Licença ativada por código para loja: ${ativacao.loja.id}`);

          if (intervaloLicenca) {
            clearInterval(intervaloLicenca);
            intervaloLicenca = null;
            console.log("Verificação automática de licença interrompida.");
          }

          return;
        }
      } catch (activationErr) {
        LICENCA_OK = false;
        console.log("Erro ao ativar por código:", activationErr.message);

        if (!CF_APP_KEY) {
          return;
        }
      }
    }

    const snapshot = await obterSnapshotLicenca();

    if (!snapshot.licenca) {
      LICENCA_OK = false;
      console.log("Licença não encontrada para esta máquina. A aguardar ativação.");
      return;
    }

    const loja = snapshot.lojaDaLicenca;
    if (!loja) {
      LICENCA_OK = false;
      console.log("Loja da licença não existe no KV.");
      return;
    }

    LICENCA_OK = true;
    lojaAtual = loja;

    if (intervaloLicenca) {
      clearInterval(intervaloLicenca);
      intervaloLicenca = null;
      console.log("Verificação automática de licença interrompida.");
    }
  } catch (err) {
    LICENCA_OK = false;
    console.log("Erro ao validar licença:", err);
  }
}

// Função para obter a configuração da BD (usa a lojaAtual)
async function getDbConfig() {
  let userKeytar = "";
  let passwordKeytar = "";

  if (keytar) {
    try {
      userKeytar = await keytar.getPassword("app-web-leitura", "db-user");
      passwordKeytar = await keytar.getPassword("app-web-leitura", "db-password");
    } catch (err) {
      console.warn("Não foi possível ler credenciais do Credential Manager:", err.message);
    }
  }

  const userEnv = String(process.env.DB_USER || "").trim();
  const passwordEnv = String(process.env.DB_PASSWORD || "").trim();

  const user = userKeytar || userEnv;
  const password = passwordKeytar || passwordEnv;

  if (!user || !password) {
    throw new Error("Credenciais SQL não encontradas (Credential Manager ou .env).");
  }

  if (!lojaAtual) {
    throw new Error(
      "lojaAtual não definida. Certifique-se de que validarLicenca() correu antes de iniciar o servidor."
    );
  }

  const target = getSqlTarget(lojaAtual.server || DB_SERVER, lojaAtual.instance || DB_INSTANCE);
  const dbConfig = {
    user,
    password,
    server: target.server,
    database: lojaAtual.database || DB_DATABASE,
    options: {
      encrypt: false,
      trustServerCertificate: true,
    },
  };

  if (target.instanceName) {
    dbConfig.options.instanceName = target.instanceName;
  } else {
    dbConfig.port = Number(lojaAtual.port || DB_PORT || 1433);
  }

  return dbConfig;
}







app.get("/config-lojas", async (req, res) => {
  try {
    if (isLocalDevRequest(req)) {
      const lojaDev = getDevLocalStore();
      lojaAtual = lojaDev;
      LICENCA_OK = true;

      return res.json({
        schema: "local-dev",
        lojas: {
          [lojaDev.id]: lojaDev
        }
      });
    }

    const snapshot = await obterSnapshotLicenca({ req });
    if (!snapshot.configRaw) {
      return res.status(500).json({ error: "Erro ao obter config" });
    }

    res.json({
      schema: "v2",
      lojas: snapshot.lojas
    });

  } catch (err) {
    res.status(500).json({ error: "Erro interno" });
  }
});

app.post("/resolver-loja", async (req, res) => {
  try {
    const token = String(
      req.body.token ||
      req.body.store_token ||
      req.body.token_loja ||
      ""
    ).trim();

    if (!token) {
      return res.status(400).json({ success: false, error: "Token obrigatório" });
    }

    if (isLocalDevRequest(req)) {
      const lojaDev = getDevLocalStore();
      if (tokensMatchLocal(token, lojaDev.token)) {
        lojaAtual = lojaDev;
        LICENCA_OK = true;
        return res.json({
          success: true,
          schema: "local-dev",
          loja: toPublicStoreLocal(lojaDev.id, lojaDev)
        });
      }
    }

    const snapshot = await obterSnapshotLicenca({ req });
    for (const [lojaId, loja] of Object.entries(snapshot.lojas || {})) {
      const expectedToken = loja.token || loja.store_token || loja.token_loja || "";
      if (tokensMatchLocal(token, expectedToken)) {
        const publicStore = toPublicStoreLocal(lojaId, loja);
        if (!publicStore.url) {
          return res.status(409).json({
            success: false,
            error: "Loja sem URL pública configurada"
          });
        }

        lojaAtual = {
          ...loja,
          id: lojaId
        };

        return res.json({
          success: true,
          schema: "v2-public",
          loja: publicStore
        });
      }
    }

    return res.status(404).json({ success: false, error: "Token inválido" });
  } catch (err) {
    console.error("Erro em /resolver-loja:", err);
    return res.status(500).json({ success: false, error: "Erro interno" });
  }
});

app.get("/health", (req, res) => {
  res.json({
    ok: true,
    service: "backend",
    time: new Date().toISOString(),
    licensed: LICENCA_OK
  });
});







// ==================== ROTA: PEDIR LICENÇA ====================
function decodeBase64Url(value) {
  const normalized = String(value || "").replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=");
  return Buffer.from(padded, "base64").toString("utf8");
}

function isLocalProxyHostName(hostname) {
  return hostname === "localhost" || hostname === "127.0.0.1";
}

function proxyHostMatchesRule(hostname, rule) {
  const normalizedRule = String(rule || "").trim().toLowerCase();
  if (!normalizedRule) return false;
  if (normalizedRule === "*") return true;
  if (normalizedRule.startsWith("*.")) {
    const suffix = normalizedRule.slice(1);
    const root = normalizedRule.slice(2);
    return hostname === root || hostname.endsWith(suffix);
  }
  if (normalizedRule.startsWith(".")) {
    return hostname.endsWith(normalizedRule);
  }
  return hostname === normalizedRule;
}

function isProxyTargetAllowed(targetBaseUrl) {
  try {
    const parsed = new URL(targetBaseUrl);
    const hostname = parsed.hostname.toLowerCase();

    if (!["http:", "https:"].includes(parsed.protocol)) {
      return false;
    }

    const configuredRules = String(process.env.API_PROXY_ALLOWED_HOSTS || "")
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean);

    if (configuredRules.length > 0) {
      return configuredRules.some((rule) => proxyHostMatchesRule(hostname, rule));
    }

    return (
      isLocalProxyHostName(hostname) ||
      hostname === "ednas.pt" ||
      hostname.endsWith(".ednas.pt") ||
      hostname.endsWith(".workers.dev")
    );
  } catch {
    return false;
  }
}

function buildProxyRequestHeaders(req) {
  const blockedHeaders = new Set([
    "host",
    "connection",
    "content-length",
    "origin",
    "referer",
    "sec-fetch-dest",
    "sec-fetch-mode",
    "sec-fetch-site",
    "sec-fetch-user",
    "upgrade-insecure-requests"
  ]);
  const headers = {};

  for (const [key, value] of Object.entries(req.headers || {})) {
    const lowerKey = key.toLowerCase();
    if (blockedHeaders.has(lowerKey)) continue;
    headers[key] = Array.isArray(value) ? value.join(", ") : String(value);
  }

  if (req.body !== undefined && !headers["content-type"] && !headers["Content-Type"]) {
    headers["Content-Type"] = "application/json";
  }

  return headers;
}

function getProxyRequestBody(req) {
  if (req.method === "GET" || req.method === "HEAD") {
    return undefined;
  }

  if (req.body === undefined) {
    return undefined;
  }

  if (Buffer.isBuffer(req.body) || typeof req.body === "string") {
    return req.body;
  }

  return JSON.stringify(req.body);
}

app.use("/api-proxy/:encodedBase", async (req, res) => {
  try {
    const targetBaseUrl = decodeBase64Url(req.params.encodedBase);
    if (!isProxyTargetAllowed(targetBaseUrl)) {
      return res.status(403).json({ error: "Destino de proxy não permitido" });
    }

    const targetUrl = `${targetBaseUrl.replace(/\/+$/, "")}${req.url === "/" ? "" : req.url}`;
    const upstream = await fetch(targetUrl, {
      method: req.method,
      headers: buildProxyRequestHeaders(req),
      body: getProxyRequestBody(req)
    });

    const skippedResponseHeaders = new Set([
      "connection",
      "content-encoding",
      "content-length",
      "keep-alive",
      "transfer-encoding"
    ]);

    upstream.headers.forEach((value, key) => {
      if (!skippedResponseHeaders.has(key.toLowerCase())) {
        res.setHeader(key, value);
      }
    });

    res.status(upstream.status);

    if (req.method === "HEAD") {
      return res.end();
    }

    const buffer = await upstream.buffer();
    return res.send(buffer);
  } catch (err) {
    console.error("Erro no proxy de API:", err);
    return res.status(502).json({
      error: "Erro ao contactar API remota",
      detalhe: err.message || String(err)
    });
  }
});

app.get("/pedir-licenca", async (req, res) => {
  try {
    if (isLocalDevRequest(req)) {
      if (lojaAtual) {
        LICENCA_OK = true;
        return res.json({
          success: true,
          chave: "local-selected",
          loja: lojaAtual.id || lojaAtual.nome,
          schema: "local-selected"
        });
      }

      const lojaDev = getDevLocalStore();
      lojaAtual = lojaDev;
      LICENCA_OK = true;

      return res.json({
        success: true,
        chave: "local-dev",
        loja: lojaDev.id,
        schema: "local-dev"
      });
    }

    const snapshot = await obterSnapshotLicenca({
      req,
      allowAutoRegister: true
    });

    if (!snapshot.hwid) {
      return res.json({
        success: false,
        erro: "Não foi possível gerar HWID.",
      });
    }

    if (!snapshot.licenca && snapshot.lojaDoHost) {
      LICENCA_OK = true;
      lojaAtual = {
        ...snapshot.lojaDoHost,
        id: snapshot.lojaDoHostId
      };

      return res.json({
        success: true,
        chave: snapshot.hwid,
        loja: snapshot.lojaDoHostId,
        schema: "v2-host"
      });
    }

    // Caso 1: máquina sem licença ativa
    if (!snapshot.licenca) {
      return res.json({
        success: false,
        chave: snapshot.hwid,
        loja: snapshot.lojaDoHostId || "Desconhecida",
        precisaAtivacao: true,
        schema: "v2"
      });
    }

    // Caso 2: licença existe mas loja não foi encontrada
    if (!snapshot.lojaDaLicenca) {
      console.log(
        "⚠ /pedir-licenca -> licença encontrada mas loja não existe no config:",
        snapshot.lojaDaLicencaId
      );
      return res.json({
        success: false,
        chave: snapshot.hwid,
        loja: snapshot.lojaDaLicencaId || "Desconhecida",
        token: snapshot.licenca.token || "Desconhecido",
        server: "Desconhecido",
        database: "Desconhecida",
        port: "Desconhecida",
        url: snapshot.guessedUrl,
        erro: "Loja não encontrada na configuração. Verifique o KV.",
        schema: "v2"
      });
    }

    console.log(
      "✅ /pedir-licenca -> licença OK para loja",
      snapshot.lojaDaLicencaId,
      "no host",
      snapshot.hostHeader
    );

    return res.json({
      success: true,
      chave: snapshot.hwid,
      loja: snapshot.lojaDaLicencaId,
      schema: "v2"
    });

  } catch (err) {
    console.error("❌ /pedir-licenca -> erro inesperado:", err);
    return res.json({
      success: false,
      erro: "Erro ao verificar licença.",
    });
  }
});


// ==================== V2: ACTIVATION / LICENSE / HEARTBEAT ====================
app.post("/activation/start", async (req, res) => {
  try {
    const snapshot = await obterSnapshotLicenca({
      req,
      allowAutoRegister: true
    });

    return res.json({
      success: true,
      schema: "v2",
      hwid: snapshot.hwid,
      host: snapshot.hostHeader || null,
      guessedUrl: snapshot.guessedUrl,
      lojaDetetada: snapshot.lojaDoHostId
        ?
        {
          id: snapshot.lojaDoHostId,
          ...snapshot.lojaDoHost
        }
        : null,
      licencaAtiva: Boolean(snapshot.licenca && snapshot.lojaDaLicenca),
      precisaAtivacao: !snapshot.licenca,
      licenca: snapshot.licenca
        ?
        {
          loja: snapshot.lojaDaLicencaId || snapshot.licenca.loja || snapshot.licenca.loja_id || null,
          token: snapshot.licenca.token || null,
          estado: snapshot.licenca.estado || "ativa"
        }
        : null
    });
  } catch (err) {
    console.error("Erro em /activation/start:", err);
    return res.status(500).json({
      success: false,
      error: "Erro ao iniciar ativação"
    });
  }
});

app.post("/activation/finish", async (req, res) => {
  try {
    const hostInfo = getHostInfo(req);
    const hwid = req.body.hwid || await gerarHWID();
    const payload = {
      ...req.body,
      hwid,
      guessedUrl: hostInfo.guessedUrl,
      host: hostInfo.hostHeader || null,
      store_name: req.body.store_name || req.body.storeName || STORE_NAME,
      store_token: req.body.store_token || req.body.storeToken || req.body.token_loja || STORE_TOKEN,
      db_server: req.body.db_server || req.body.dbServer || DB_SERVER,
      db_database: req.body.db_database || req.body.dbDatabase || DB_DATABASE,
      db_port: req.body.db_port || req.body.dbPort || DB_PORT
    };
    const codigoAtivacao = String(
      payload.activation_code ||
      payload.activationCode ||
      payload.codigo ||
      ""
    ).trim();

    // Se o Worker central ja tiver endpoint novo, usa-o.
    try {
      const workerResp = await chamarWorkerJson("/activation/finish", {
        method: "POST",
        body: payload
      });

      if (workerResp.ok) {
        if (workerResp.data.success === false) {
          return res.status(400).json({
            success: false,
            schema: "v2",
            source: "worker",
            ...(workerResp.data || {}),
            error:
              workerResp.data.error ||
              workerResp.text ||
              "Ativação rejeitada pelo Worker"
          });
        }

        const lojaAtivada = normalizarLojaAtivacao(workerResp.data || {});
        if (lojaAtivada) {
          lojaAtual = lojaAtivada;
          LICENCA_OK = true;
        }

        return res.json({
          success: true,
          schema: "v2",
          source: "worker",
          ...(workerResp.data || {})
        });
      }

      if (codigoAtivacao) {
        return res.status(workerResp.status || 502).json({
          success: false,
          schema: "v2",
          source: "worker",
          status: workerResp.status,
          error:
            workerResp.data.error ||
            workerResp.text ||
            `Ativação rejeitada pelo Worker (${workerResp.status})`
        });
      }
    } catch (proxyErr) {
      if (codigoAtivacao) {
        return res.status(502).json({
          success: false,
          schema: "v2",
          source: "worker",
          error: proxyErr.message || "Erro ao contactar Worker"
        });
      }

      // fallback silencioso para compatibilidade
    }

    // Fallback: ainda sem endpoint central novo, devolve estado local
    const atualizado = await obterSnapshotLicenca({
      req,
      hwid: payload.hwid,
      allowAutoRegister: true
    });

    return res.json({
      success: Boolean(atualizado.licenca && atualizado.lojaDaLicenca),
      schema: "v2",
      source: "local-fallback",
      hwid: atualizado.hwid,
      precisaAtivacao: !atualizado.licenca,
      loja: atualizado.lojaDaLicencaId || atualizado.lojaDoHostId || null,
      mensagem: atualizado.licenca
        ?
        "Licença detetada após validação local."
        : "Licença ainda não encontrada. Ative no painel central e tente novamente."
    });
  } catch (err) {
    console.error("Erro em /activation/finish:", err);
    return res.status(500).json({
      success: false,
      error: "Erro ao concluir ativação"
    });
  }
});

app.post("/license/check", async (req, res) => {
  try {
    const snapshot = await obterSnapshotLicenca({
      req,
      hwid: req.body.hwid || null
    });

    return res.json({
      success: true,
      schema: "v2",
      hwid: snapshot.hwid,
      ativa: Boolean(snapshot.licenca && snapshot.lojaDaLicenca),
      precisaAtivacao: !snapshot.licenca,
      loja: snapshot.lojaDaLicencaId || null,
      checkedAt: new Date().toISOString()
    });
  } catch (err) {
    console.error("Erro em /license/check:", err);
    return res.status(500).json({
      success: false,
      error: "Erro ao verificar licença"
    });
  }
});

app.post("/heartbeat", async (req, res) => {
  try {
    const snapshot = await obterSnapshotLicenca({
      req,
      hwid: req.body.hwid || null
    });

    return res.json({
      success: true,
      schema: "v2",
      hwid: snapshot.hwid,
      ativa: Boolean(snapshot.licenca && snapshot.lojaDaLicenca),
      loja: snapshot.lojaDaLicencaId || null,
      serverTime: new Date().toISOString(),
      commands: []
    });
  } catch (err) {
    console.error("Erro em /heartbeat:", err);
    return res.status(500).json({
      success: false,
      error: "Erro no heartbeat"
    });
  }
});



// ==================== MIDDLEWARE DE LICENÇA ====================
app.use(async (req, res, next) => {
  const rotasLivres = [
    "/",
    "/config-lojas",
    "/resolver-loja",
    "/pedir-licenca",
    "/activation/start",
    "/activation/finish",
    "/license/check",
    "/heartbeat"
  ];

  if (rotasLivres.includes(req.path)) {
    return next();
  }

  if (!LICENCA_OK || !lojaAtual) {
    try {
      const snapshot = await obterSnapshotLicenca({ req });
      if (snapshot.lojaDoHost) {
        LICENCA_OK = true;
        lojaAtual = {
          ...snapshot.lojaDoHost,
          id: snapshot.lojaDoHostId
        };
        return next();
      }
    } catch (err) {
      console.warn("Não foi possível resolver loja pelo host:", err.message);
    }

    return res.status(403).json({
      success: false,
      erro: "Máquina não licenciada",
      precisaLicenca: true
    });
  }

  next();
});


// ------------------- GET Produto -------------------
app.get('/produto/:codigo', async (req, res) => {
  const codigoParam = (req.params.codigo || "").trim();
  const codigoInt =
    /^\d+$/.test(codigoParam) && codigoParam.length <= 6
      ? parseInt(codigoParam, 10)
      : null;

  if (shouldUseDevMockData()) {
    const produto = findDevMockProduct(codigoParam);
    if (produto) return res.json(produto);
    return res.status(404).json({ mensagem: 'Produto não encontrado' });
  }

  let pool;
  try {
    const dbConfig = await getDbConfig();
    pool = await sql.connect(dbConfig);

    const query = `
      SELECT TOP 1 *
      FROM produtos
      WHERE (
        RTRIM(LTRIM(codbarras)) = @codigo
        OR (@codigoInt IS NOT NULL AND codigo = @codigoInt)
      )
      ORDER BY CASE WHEN RTRIM(LTRIM(codbarras)) = @codigo THEN 0 ELSE 1 END
    `;

    const request = pool.request()
      .input('codigo', sql.VarChar, codigoParam)
      .input('codigoInt', sql.Int, codigoInt);


    const result = await request.query(query);

    if (result.recordset.length > 0) {
      return res.json(await aplicarStockAtualAProduto(pool, result.recordset[0]));
    }
    return res.status(404).json({ mensagem: 'Produto não encontrado' });
  } catch (err) {
    console.error('Erro ao aceder à base de dados:', err);
    return res.status(500).json({ erro: 'Erro ao aceder à base de dados' });
  } finally {
    if (pool) await pool.close();
  }
});





// 🔍 Procurar produtos por nome
app.get("/produtos/pesquisa", async (req, res) => {
  const termo = req.query.q || "";

  if (!termo || (termo.length < 2 && !/^\d$/.test(termo))) {
    return res.json([]);
  }

  if (shouldUseDevMockData()) {
    const needle = String(termo).toLowerCase();
    return res.json(
      devMockState.produtos
        .filter((produto) =>
          String(produto.descricao || "").toLowerCase().includes(needle) ||
          String(produto.codbarras || "").includes(String(termo))
        )
        .slice(0, 20)
    );
  }

  try {
    const dbConfig = await getDbConfig();
    const pool = await sql.connect(dbConfig);

    const result = await pool.request()
      .input("termo", sql.VarChar, `%${termo}%`)
      .query(`
        SELECT TOP 20 *
        FROM produtos
        WHERE descricao LIKE @termo
        ORDER BY descricao
      `);

    const produtosComStockAtual = await aplicarStockAtualAProdutos(pool, result.recordset);

    await pool.close();
    res.json(produtosComStockAtual);
  } catch (err) {
    console.error("Erro na pesquisa:", err);
    res.status(500).json({ error: "Erro ao pesquisar produtos" });
  }
});


// ------------------- POST Produto -------------------
app.post('/produto', async (req, res) => {
  const {
    descricao,
    codbarras,
    qtdstock,
    precocompra,
    iva,
    margembruta,
    fornecedor,
    familia,
    subfam,
    plu,
    precovenda,
    pvp1siva
  } = req.body;

  if (shouldUseDevMockData()) {
    if (!descricao) {
      return res.status(400).json({ error: 'Campos obrigatórios em falta' });
    }

    const codBarrasNorm = (codbarras ?? "").toString().trim();
    const codBarrasFinal = codBarrasNorm !== "" ? codBarrasNorm : null;

    if (codBarrasFinal && findDevMockProduct(codBarrasFinal)) {
      return res.status(409).json({
        error: `Já existe produto com este código de barras: ${codBarrasFinal}`
      });
    }

    const novoCodigo =
      Math.max(...devMockState.produtos.map((produto) => Number(produto.codigo) || 0)) + 1;
    const precoCompraVal = Number(precocompra) || 0;
    const margemVal = Number(margembruta) || 0;
    const ivaVal = Number(iva) || 0;
    const precoSemIva =
      Number(pvp1siva) > 0
        ? Number(pvp1siva)
        : precoCompraVal * (1 + margemVal / 100);
    const precoVenda =
      Number(precovenda) > 0
        ? Number(precovenda)
        : precoSemIva * (1 + ivaVal / 100);

    const produto = {
      codigo: novoCodigo,
      descricao: descricao.trim(),
      codbarras: codBarrasFinal,
      qtdstock: 0,
      precocompra: Number(precoCompraVal.toFixed(2)),
      iva: ivaVal,
      margembruta: margemVal,
      precovenda: Number(precoVenda.toFixed(2)),
      fornecedor: fornecedor || 1,
      familia: familia || 1,
      subfam: subfam || 1,
      pvp1siva: Number(precoSemIva.toFixed(2)),
      codigopp: plu || null,
      unidade: 1
    };

    devMockState.produtos.push(produto);
    return res.status(201).json(produto);
  }


  if (!descricao) {
    return res.status(400).json({ error: 'Campos obrigatórios em falta' });
  }

  try {
    const dbConfig = await getDbConfig();
    const pool = await sql.connect(dbConfig);

    // ===============================
    // NORMALIZAÇÃO DE CÓDIGO DE BARRAS
    // ===============================
    const codBarrasNorm = (codbarras ?? "").toString().trim();
    const codBarrasFinal = codBarrasNorm !== "" ? codBarrasNorm : null;

    // ===============================
    // BLOQUEAR DUPLICADOS POR CÓDIGO DE BARRAS
    // ===============================
    if (codBarrasFinal) {
      const dup = await pool.request()
        .input("cb", sql.VarChar, codBarrasFinal)
        .query(`
      SELECT TOP 1 codigo, descricao
      FROM produtos
      WHERE RTRIM(LTRIM(codbarras)) = @cb
    `);

      if (dup.recordset.length > 0) {
        return res.status(409).json({
          error: `Já existe produto com este código de barras: ${dup.recordset[0].descricao}`
        });
      }
    }



    // obter último produto como base
    const original = await buscarProdutoBaseParaCopia(pool);
    if (!original) return res.status(400).json({ error: 'Não existe produto para copiar' });

    // gerar novo código sequencial
    const novoCodigo = await gerarNovoCodigoProduto(pool);
    const referenciaFinal = codBarrasFinal || String(novoCodigo);

    const precoCompraVal = Number(precocompra) || 0;
    const margemVal = Number(margembruta) || 0;
    const ivaVal = Number(iva) || 0;


    // ===============================
    // 🔐 REGRA FINAL DE PREÇOS (POST /produto)
    // ===============================

    // 1️⃣ Preço sem IVA
    const precoSemIva =
      Number(pvp1siva) > 0
        ? Number(pvp1siva)
        : precoCompraVal * (1 + margemVal / 100);

    // 2️⃣ Preço com IVA
    const precoVenda =
      Number(precovenda) > 0
        ? Number(precovenda)
        : precoSemIva * (1 + ivaVal / 100);



    const now = new Date();

    const pad = (n, size = 2) => String(n).padStart(size, "0");
    const padMs = (n) => String(n).padStart(3, "0");

    const datacriacao = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())} ` +
      `${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}.` +
      `${padMs(now.getMilliseconds())}`;


    // copiar produto original, mas substituir campos do utilizador
    await pool.request()
      .input('novoCodigo', sql.Int, novoCodigo)
      .input('novaDescricao', sql.VarChar, descricao.trim())
      .input('novoCodBarras', sql.VarChar, codBarrasFinal)
      .input('novaReferencia', sql.VarChar, referenciaFinal)
      .input('novoQtdStock', sql.Float, 0)
      .input('novoPrecoCompra', sql.Float, precoCompraVal)
      .input('novoIVA', sql.Float, ivaVal)
      .input('novaMargem', sql.Float, margemVal)
      .input('novoPrecoVenda', sql.Float, precoVenda)
      .input('novoFornecedor', sql.Int, fornecedor ?? original.fornecedor)
      .input('novaFamilia', sql.Int, familia ?? original.familia)
      .input('novaSubFam', sql.Int, subfam ?? original.subfam)
      .input('novaDataCriacao', sql.VarChar, datacriacao)
      .input('novoPvp1Siva', sql.Float, precoSemIva)
      .input('novoPlu', sql.Int, plu ?? null)
      .input('novaUnidade', sql.Int, parseInt(original.unidade ?? 1))
      .input('novaUnCompra', sql.Int, parseInt(original.uncompra ?? original.unidade ?? 1))
      .input('novaUnInventario', sql.Int, parseInt(original.uninventario ?? original.unidade ?? 1))
      .input('novoIvaCompra', sql.Float, Number(original.ivacompra ?? ivaVal ?? 0))
      .input('novoIva2', sql.Float, Number(original.iva2 ?? ivaVal ?? 0))
      .input('novoStocks', sql.Int, 1)
      .input('codigoOriginal', sql.Int, original.codigo)


      .query(`
        INSERT INTO produtos (
          id, codigo, descricao, codbarras, qtdstock,
          precocompra, iva, margembruta, precovenda,
          fornecedor, familia, subfam,
          dataultcompra, ultprecocompra,
          datacriacao, obs, retalho, composto, ultprecovenda, topo, cozinha,
          grupo, referencia, ivacompra, balanca, prodstock, compra,
          stocks, meiadose, precomeia, qtdmeia, ordemtop, ordem, ordemlocal,
          listseparado, armazem, tempoprep, maxopcoes, iva2, tara,
          prepagamento, fundo, letra, descricaocurta, promocao, percentprom,
          codigopp, revenda, precorevenda, ivarevenda, autoquebra,
          pvp2, pvp3, pvp4, pvp5, pvpmeia2, pvpmeia3, pvpmeia4, pvpmeia5,
          consumominimo, precominimo, excluirdescontos, vendersemstock,
          dosedesc, meiadosedesc, restricted, pvp6, pvp7, pvp8, pvp9, pvp10,
          pvpmeia6, pvpmeia7, pvpmeia8, pvpmeia9, pvpmeia10,
          categoria, subcategoria, retencao, isencao,
          pvp1siva, pvp2siva, pvp3siva, pvp4siva, pvp5siva, pvp6siva, pvp7siva,
          pvp8siva, pvp9siva, pvp10siva, pvpmeia1siva, pvpmeia2siva,
          pvpmeia3siva, pvpmeia4siva, pvpmeia5siva, pvpmeia6siva,
          pvpmeia7siva, pvpmeia8siva, pvpmeia9siva, pvpmeia10siva,
          tiposaft, uncompra, uninventario,
          min_complementos, max_complementos, transferivel,
          politicapreco, unidade
        )
        SELECT
          0, @novoCodigo, @novaDescricao, @novoCodBarras, @novoQtdStock,
          @novoPrecoCompra, @novoIVA, @novaMargem, @novoPrecoVenda,
          @novoFornecedor, @novaFamilia, @novaSubFam,
           dataultcompra, ultprecocompra,
          @novaDataCriacao, obs, '1', '0', @novoPrecoVenda, '0', '0',
          '0', @novaReferencia, @novoIvaCompra, '0', @novoCodigo, '1',
          @novoStocks, '0', '0', '0', '0', '0', '0',
          listseparado, '0', tempoprep, '0', @novoIva2, '0',
          '0', fundo, letra, '', '0', '0',
          @novoPlu, '0', '0', '23', '0',
          '0', '0', '0', '0', '0', '0', '0', '0',
          '0', '0', '0', '1',
          '', '', '0', '0', '0', '0', '0', '0',
          '0', '0', '0', '0', '0',
          '0', '0', '0', '',
          @novoPvp1Siva, '0', '0', '0', '0', '0', '0',
          '0', '0', '0', '0', '0',
          '0', '0', '0', '0',
          '0', '0', '0', '0',
          'P', @novaUnCompra, @novaUnInventario,
          '0', '0', '1',
          '0', @novaUnidade
        FROM produtos
        WHERE codigo = @codigoOriginal;

      `);

    // obter o novo produto
    const result = await pool.request()
      .input('codigo', sql.Int, novoCodigo)
      .query('SELECT * FROM produtos WHERE codigo = @codigo');

    await pool.close();
    console.log(`🟢 Produto criado: ${descricao}`);
    res.status(201).json(result.recordset[0]);

  } catch (err) {
    console.error("Erro ao criar produto:", err);
    res.status(500).json({ error: 'Erro ao criar produto' });
  }
});



// ------------------- GET Fornecedores -------------------
app.get('/fornecedores', async (req, res) => {
  if (shouldUseDevMockData()) {
    return res.json(devMockFornecedores);
  }

  try {
    const dbConfig = await getDbConfig();
    const pool = await sql.connect(dbConfig);

    const result = await pool.request().query(`
      SELECT codigo, nome
      FROM fornecedores
      WHERE nome IS NOT NULL
      ORDER BY nome
    `);

    await pool.close();
    res.json(result.recordset);
  } catch (err) {
    console.error('Erro ao obter fornecedores:', err);
    res.status(500).json({ error: 'Erro ao procurar fornecedores' });
  }
});


// ------------------- GET Famílias -------------------
// ------------------- POST Fornecedor -------------------
app.post('/fornecedores', async (req, res) => {
  const body = req.body || {};
  const nome = String(body.nome || "").trim();

  if (!nome) {
    return res.status(400).json({ error: "O nome do fornecedor é obrigatório." });
  }

  if (shouldUseDevMockData()) {
    const codigo = Math.max(0, ...devMockFornecedores.map((f) => Number(f.codigo) || 0)) + 1;
    const fornecedor = {
      codigo,
      nome,
      nif: String(body.nif || "").trim(),
      telefone: String(body.telefone || "").trim(),
      email: String(body.email || "").trim()
    };

    devMockFornecedores.push(fornecedor);
    return res.status(201).json(fornecedor);
  }

  let pool;
  try {
    const dbConfig = await getDbConfig();
    pool = await sql.connect(dbConfig);

    const columns = await getTableColumns(pool, "fornecedores");
    if (!columns.length) {
      return res.status(500).json({ error: "Tabela de fornecedores não encontrada." });
    }

    const columnLookup = buildColumnLookup(columns);
    const values = new Map();
    const codigoColumn = columnLookup.get("codigo");
    let codigo = null;

    if (codigoColumn && !codigoColumn.is_identity && !codigoColumn.is_computed) {
      const codigoRes = await pool.request().query(`
        SELECT ISNULL(MAX(codigo), 0) + 1 AS codigo
        FROM fornecedores
      `);
      codigo = Number(codigoRes.recordset[0].codigo) || 1;
      values.set("codigo", { column: codigoColumn, value: codigo });
    }

    setFornecedorColumnValue(values, columnLookup, ["id"], 0);
    setFornecedorColumnValue(values, columnLookup, ["nome"], nome);
    setFornecedorColumnValue(values, columnLookup, ["nif", "contribuinte", "ncontribuinte", "numcontribuinte", "ncont"], body.nif);
    setFornecedorColumnValue(values, columnLookup, ["telefone", "telemovel", "tel"], body.telefone);
    setFornecedorColumnValue(values, columnLookup, ["email", "mail"], body.email);
    setFornecedorColumnValue(values, columnLookup, ["morada", "endereco", "morada1"], body.morada);
    setFornecedorColumnValue(values, columnLookup, ["localidade", "cidade"], body.localidade);
    setFornecedorColumnValue(values, columnLookup, ["codpostal", "codigopostal", "codigo_postal", "cp"], body.codigoPostal);
    setFornecedorColumnValue(values, columnLookup, ["obs", "observacoes", "notas"], body.observacoes);
    setFornecedorColumnValue(values, columnLookup, ["bloqueado"], 0);
    setFornecedorColumnValue(values, columnLookup, ["ativo"], 1);

    if (!values.has("nome")) {
      return res.status(500).json({ error: "A tabela de fornecedores não tem coluna de nome." });
    }

    for (const column of columns) {
      const key = normalizeColumnName(column.column_name);
      if (values.has(key) || column.is_identity || column.is_computed) continue;

      const required =
        String(column.is_nullable).toUpperCase() === "NO" &&
        column.column_default === null;

      if (required) {
        values.set(key, {
          column,
          value: defaultValueForColumn(column)
        });
      }
    }

    const entries = Array.from(values.values());
    const request = pool.request();
    const columnSql = [];
    const paramSql = [];

    entries.forEach((entry, index) => {
      const paramName = `p${index}`;
      columnSql.push(escapeSqlIdentifier(entry.column.column_name));
      paramSql.push(`@${paramName}`);
      request.input(paramName, sqlTypeForColumn(entry.column), entry.value);
    });

    const outputColumns = ["codigo", "nome"]
      .map((name) => columnLookup.get(name))
      .filter(Boolean);
    const outputSql = outputColumns
      .map((column) => `inserted.${escapeSqlIdentifier(column.column_name)} AS ${escapeSqlIdentifier(column.column_name)}`)
      .join(", ");

    const insertResult = await request.query(`
      INSERT INTO fornecedores (${columnSql.join(", ")})
      OUTPUT ${outputSql}
      VALUES (${paramSql.join(", ")})
    `);

    const inserted = insertResult.recordset[0] || {};
    return res.status(201).json({
      codigo: getRecordValueCaseInsensitive(inserted, "codigo") ?? codigo,
      nome: getRecordValueCaseInsensitive(inserted, "nome") ?? nome
    });
  } catch (err) {
    console.error("Erro ao criar fornecedor:", err);
    return res.status(500).json({ error: err.message || "Erro ao criar fornecedor" });
  } finally {
    if (pool) await pool.close();
  }
});

app.get('/familias', async (req, res) => {
  if (shouldUseDevMockData()) {
    return res.json(devMockFamilias);
  }

  let pool;
  try {
    const dbConfig = await getDbConfig();
    pool = await sql.connect(dbConfig);

    const result = await pool.request().query('SELECT codigo, descricao FROM familias');
    res.json(result.recordset);
  } catch (err) {
    console.error('Erro ao obter famílias:', err);
    res.status(500).json({ error: 'Erro ao procurar famílias' });
  } finally {
    if (pool) await pool.close();
  }
});


// ------------------- GET Subfamílias -------------------
app.get('/subfamilias', async (req, res) => {
  const familiaCodigo = req.query.familia;

  if (shouldUseDevMockData()) {
    const data = familiaCodigo
      ? devMockSubfamilias.filter((subfamilia) => String(subfamilia.familia) === String(familiaCodigo))
      : devMockSubfamilias;

    return res.json(data);
  }

  try {
    const dbConfig = await getDbConfig();
    const pool = await sql.connect(dbConfig);

    let query = 'SELECT codigo, descricao, familia FROM subfamilias';
    if (familiaCodigo) {
      query += ' WHERE familia = @familiaCodigo';
    }

    const request = pool.request();
    if (familiaCodigo) {
      request.input('familiaCodigo', sql.Int, familiaCodigo);
    }

    const result = await request.query(query);

    await pool.close();

    res.json(result.recordset);
  } catch (err) {
    console.error('Erro ao obter subfamílias:', err);
    res.status(500).json({ error: 'Erro ao procurar subfamílias' });
  }
});




// ------------------- PATCH Stock -------------------
app.patch('/produto/:codigo/stock', async (req, res) => {
  const codigoParam = (req.params.codigo || "").trim();
  const quantidadeAdd = req.body.quantidade;

  if (shouldUseDevMockData()) {
    if (typeof quantidadeAdd !== 'number' || isNaN(quantidadeAdd)) {
      return res.status(400).json({ error: 'Quantidade inválida' });
    }

    const produto = findDevMockProduct(codigoParam);
    if (!produto) return res.status(404).json({ error: 'Produto não encontrado' });

    produto.qtdstock = (Number(produto.qtdstock) || 0) + quantidadeAdd;
    return res.json(produto);
  }

  return res.status(400).json({
    error: `Entrada direta de stock bloqueada para o produto ${codigoParam}. As existências da ZoneSoft têm de ser atualizadas por documento/série real para gerar movimentos em tblStockMov.`
  });


  if (typeof quantidadeAdd !== 'number' || isNaN(quantidadeAdd)) {
    return res.status(400).json({ error: 'Quantidade inválida' });
  }

  let pool;
  try {
    pool = await sql.connect(await getDbConfig());

    const result = await pool.request()
      .input('codigo', sql.VarChar, codigoParam)
      .input('codigoInt', sql.Int, codigoInt)
      .query(`
        SELECT codigo, qtdstock
        FROM produtos
        WHERE
          (@codigo <> '' AND RTRIM(LTRIM(codbarras)) = @codigo)
          OR (@codigoInt IS NOT NULL AND codigo = @codigoInt)
      `);

    if (result.recordset.length === 0) {
      return res.status(404).json({ error: 'Produto não encontrado' });
    }

    const produto = result.recordset[0];
    const novoStock = produto.qtdstock + quantidadeAdd;



    await pool.request()
      .input('codigo', sql.Int, produto.codigo)
      .input('novoStock', sql.Float, novoStock)
      .query('UPDATE produtos SET qtdstock = @novoStock, id = 0 WHERE codigo = @codigo');

    const updated = await pool.request()
      .input('codigo', sql.Int, produto.codigo)
      .query('SELECT * FROM produtos WHERE codigo = @codigo');

    res.json(updated.recordset[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro ao atualizar stock' });
  } finally {
    if (pool) await pool.close();
  }
});



// ------------------- PATCH Preço -------------------
app.patch('/produto/:codigo/preco', async (req, res) => {
  const codigoParam = (req.params.codigo || "").trim();
  const codigoInt =
    /^\d+$/.test(codigoParam) && codigoParam.length <= 6
      ? parseInt(codigoParam, 10)
      : null;

  const { preco } = req.body;

  if (shouldUseDevMockData()) {
    if (typeof preco !== 'number' || isNaN(preco)) {
      return res.status(400).json({ error: 'Preço inválido' });
    }

    const produto = findDevMockProduct(codigoParam);
    if (!produto) return res.status(404).json({ error: 'Produto não encontrado' });

    produto.precovenda = Number(preco);
    produto.pvp1siva = Number((Number(preco) / (1 + (Number(produto.iva) || 0) / 100)).toFixed(2));
    return res.json(produto);
  }

  if (typeof preco !== 'number' || isNaN(preco)) {
    return res.status(400).json({ error: 'Preço inválido' });
  }

  let pool;
  try {
    pool = await sql.connect(await getDbConfig());

    const result = await pool.request()
      .input('codigo', sql.VarChar, codigoParam)
      .input('codigoInt', sql.Int, codigoInt)
      .input('preco', sql.Float, preco)
      .query(`
        UPDATE p
        SET precovenda = @preco,
            pvp1siva = calc.precoSemIva,
            margembruta = CASE
              WHEN ISNULL(p.precocompra, 0) > 0 AND ISNULL(calc.precoSemIva, 0) > 0
                THEN ((calc.precoSemIva / p.precocompra) - 1) * 100
              ELSE ISNULL(p.margembruta, 0)
            END,
            id = 0
        FROM produtos p
        CROSS APPLY (
          SELECT @preco / NULLIF((1 + ISNULL(p.iva, 0) / 100), 0) AS precoSemIva
        ) calc
        WHERE
          RTRIM(LTRIM(p.codbarras)) = @codigo
          OR (@codigoInt IS NOT NULL AND p.codigo = @codigoInt)
      `);

    if (result.rowsAffected[0] === 0) {
      return res.status(404).json({ error: 'Produto não encontrado para atualização' });
    }

    const updated = await pool.request()
      .input('codigo', sql.VarChar, codigoParam)
      .input('codigoInt', sql.Int, codigoInt)
      .query(`
        SELECT * FROM produtos
        WHERE
          RTRIM(LTRIM(codbarras)) = @codigo
          OR (@codigoInt IS NOT NULL AND codigo = @codigoInt)
      `);

    res.json(updated.recordset[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  } finally {
    if (pool) await pool.close();
  }
});




// ------------------- PATCH Preço de compra -------------------
app.patch('/produto/:codigo/precocompra', async (req, res) => {
  const codigoParam = (req.params.codigo || "").trim();
  const codigoInt =
    /^\d+$/.test(codigoParam) && codigoParam.length <= 6
      ? parseInt(codigoParam, 10)
      : null;

  const { preco } = req.body;

  if (shouldUseDevMockData()) {
    const produto = findDevMockProduct(codigoParam);
    if (!produto) return res.status(404).json({ error: 'Produto não encontrado' });

    produto.precocompra = Number(preco) || 0;
    return res.json(recalculateDevMockProduct(produto));
  }

  let pool;
  try {
    pool = await sql.connect(await getDbConfig());

    const result = await pool.request()
      .input('codigo', sql.VarChar, codigoParam)
      .input('codigoInt', sql.Int, codigoInt)
      .input('preco', sql.Float, preco)
      .query(`
        UPDATE p
        SET precocompra = @preco,
            margembruta = calc.margem,
            pvp1siva = @preco * (1 + calc.margem / 100),
            precovenda = @preco
              * (1 + calc.margem / 100)
              * (1 + ISNULL(p.iva, 0) / 100),
            id = 0
        FROM produtos p
        CROSS APPLY (
          SELECT CASE
            WHEN ISNULL(p.precocompra, 0) > 0 AND ISNULL(p.pvp1siva, 0) > 0
              THEN ((p.pvp1siva / p.precocompra) - 1) * 100
            ELSE ISNULL(p.margembruta, 0)
          END AS margem
        ) calc
        WHERE
          RTRIM(LTRIM(p.codbarras)) = @codigo
          OR (@codigoInt IS NOT NULL AND p.codigo = @codigoInt)
      `);

    if (result.rowsAffected[0] === 0) {
      return res.status(404).json({ error: 'Produto não encontrado para atualização' });
    }

    const updated = await pool.request()
      .input('codigo', sql.VarChar, codigoParam)
      .input('codigoInt', sql.Int, codigoInt)
      .query(`
        SELECT * FROM produtos
        WHERE
          RTRIM(LTRIM(codbarras)) = @codigo
          OR (@codigoInt IS NOT NULL AND codigo = @codigoInt)
      `);

    res.json(updated.recordset[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  } finally {
    if (pool) await pool.close();
  }
});





// ------------------- PATCH Margem Bruta -------------------
app.patch('/produto/:codigo/margembruta', async (req, res) => {
  const codigoParam = (req.params.codigo || "").trim();
  const codigoInt =
    /^\d+$/.test(codigoParam) && codigoParam.length <= 6
      ? parseInt(codigoParam, 10)
      : null;

  const { margembruta } = req.body;

  if (shouldUseDevMockData()) {
    const produto = findDevMockProduct(codigoParam);
    if (!produto) return res.status(404).json({ error: 'Produto não encontrado' });

    produto.margembruta = Number(margembruta) || 0;
    return res.json(recalculateDevMockProduct(produto));
  }

  let pool;
  try {
    pool = await sql.connect(await getDbConfig());

    const result = await pool.request()
      .input('codigo', sql.VarChar, codigoParam)
      .input('codigoInt', sql.Int, codigoInt)
      .input('margem', sql.Float, margembruta)
      .query(`
        UPDATE produtos
        SET margembruta = @margem,
            pvp1siva = precocompra * (1 + @margem / 100),
            precovenda = precocompra
              * (1 + @margem / 100)
              * (1 + ISNULL(iva, 0) / 100),
            id = 0
        WHERE
          RTRIM(LTRIM(codbarras)) = @codigo
          OR (@codigoInt IS NOT NULL AND codigo = @codigoInt)
      `);

    if (result.rowsAffected[0] === 0) {
      return res.status(404).json({ error: 'Produto não encontrado para atualização' });
    }

    const updated = await pool.request()
      .input('codigo', sql.VarChar, codigoParam)
      .input('codigoInt', sql.Int, codigoInt)
      .query(`
        SELECT * FROM produtos
        WHERE
          RTRIM(LTRIM(codbarras)) = @codigo
          OR (@codigoInt IS NOT NULL AND codigo = @codigoInt)
      `);

    res.json(updated.recordset[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  } finally {
    if (pool) await pool.close();
  }
});





app.get("/", (req, res) => {
  res.send("API Ednas está a funcionar através de Cloudflare Tunnel 🚀");
});

// -- PLU ---
app.get('/produto/verificar-plu/:plu', async (req, res) => {
  const { plu } = req.params;

  if (shouldUseDevMockData()) {
    const produto = devMockState.produtos.find((item) =>
      String(item.codigopp || item.plu || "") === String(plu)
    );

    if (produto) {
      return res.json({
        disponivel: false,
        produto: {
          codigo: produto.codigo,
          descricao: produto.descricao
        }
      });
    }

    return res.json({ disponivel: true });
  }

  try {
    const dbConfig = await getDbConfig();
    const pool = await sql.connect(dbConfig);

    const result = await pool.request()
      .input('plu', sql.VarChar, plu)
      .query('SELECT codigo, descricao FROM produtos WHERE codigopp = @plu');

    await pool.close();

    if (result.recordset.length > 0) {
      // PLU já em uso, retornamos também o produto
      return res.json({
        disponivel: false,
        produto: result.recordset[0] // código e descrição do produto
      });
    } else {
      return res.json({ disponivel: true });
    }
  } catch (err) {
    console.error(err);
    res.status(500).json({ disponivel: false, erro: err.message });
  }
});


// ------------------- GET Tipos de Documento -------------------
app.get("/tiposdocumento", async (req, res) => {
  if (shouldUseDevMockData()) {
    return res.json(devMockTiposDocumento);
  }

  try {
    const dbConfig = await getDbConfig();
    const pool = await sql.connect(dbConfig);

    // Só devolve os documentos permitidos
    const result = await pool.request().query(`
      SELECT
        RTRIM(LTRIM(nd.doc)) AS doc,
        RTRIM(LTRIM(nd.serie)) AS serie,
        nd.numero,
        dd.descricao,
        atcud.atcud,
        atcud.ativo AS atcudAtivo
      FROM numdocseries nd
      LEFT JOIN documentos_definicao dd
        ON RTRIM(LTRIM(dd.acronimo)) = RTRIM(LTRIM(nd.doc))
      LEFT JOIN ATCUD atcud
        ON RTRIM(LTRIM(atcud.doc)) = RTRIM(LTRIM(nd.doc))
       AND RTRIM(LTRIM(atcud.serie)) = RTRIM(LTRIM(nd.serie))
       AND ISNULL(atcud.ativo, 0) = 1
      WHERE NULLIF(RTRIM(LTRIM(nd.doc)), '') IS NOT NULL
        AND NULLIF(RTRIM(LTRIM(nd.serie)), '') IS NOT NULL
        AND RTRIM(LTRIM(nd.doc)) IN ('CFA', 'CFS')
      ORDER BY nd.doc, nd.serie
    `);

    await pool.close();
    res.json(result.recordset);
  } catch (err) {
    console.error("❌ Erro ao obter tipos de documento:", err);
    res.status(500).json({ error: "Erro ao obter tipos de documento" });
  }
});

// ------------------- GET Series de Inventario -------------------
app.get("/tiposdocumento/inventario", async (req, res) => {
  if (shouldUseDevMockData()) {
    return res.json(devMockTiposInventario);
  }

  try {
    const dbConfig = await getDbConfig();
    const pool = await sql.connect(dbConfig);

    const result = await pool.request().query(`
      SELECT
        RTRIM(LTRIM(nd.doc)) AS doc,
        RTRIM(LTRIM(nd.serie)) AS serie,
        nd.numero,
        dd.descricao
      FROM numdocseries nd
      LEFT JOIN documentos_definicao dd
        ON RTRIM(LTRIM(dd.acronimo)) = RTRIM(LTRIM(nd.doc))
      WHERE RTRIM(LTRIM(nd.doc)) = 'IN'
        AND NULLIF(RTRIM(LTRIM(nd.serie)), '') IS NOT NULL
      ORDER BY nd.serie
    `);

    await pool.close();
    res.json(result.recordset);
  } catch (err) {
    console.error("Erro ao obter séries de inventário:", err);
    res.status(500).json({ error: "Erro ao procurar séries de inventário" });
  }
});

// ------------------- GET Inventarios Abertos -------------------
app.get("/inventarios/abertos", async (req, res) => {
  if (shouldUseDevMockData()) {
    const inventarios = devMockState.documentos
      .filter((documento) => documento.inventario && documento.estado !== "fechado")
      .map((documento) => ({
        doc: "IN",
        serie: documento.serie,
        numero: documento.numero,
        datahora: documento.createdAt,
        descricao: "Inventario DEV",
        armazem: 0
      }));

    return res.json(inventarios);
  }

  let pool;
  try {
    pool = await sql.connect(await getDbConfig());

    const result = await pool.request().query(`
      SELECT
        RTRIM(LTRIM(d.doc)) AS doc,
        RTRIM(LTRIM(d.serie)) AS serie,
        d.numero,
        d.data,
        d.datahora,
        d.descricao,
        d.emp,
        ISNULL(v.armazem, 0) AS armazem
      FROM Documentos d
      OUTER APPLY (
        SELECT TOP 1 armazem
        FROM Vendas v
        WHERE RTRIM(LTRIM(v.doc)) = RTRIM(LTRIM(d.doc))
          AND RTRIM(LTRIM(v.serie)) = RTRIM(LTRIM(d.serie))
          AND v.numero = d.numero
      ) v
      WHERE RTRIM(LTRIM(d.doc)) = 'IN'
        AND ISNULL(d.anulado, 0) = 0
        AND ISNULL(d.tipo, 0) = 0
      ORDER BY d.datahora DESC, d.numero DESC
    `);

    res.json(result.recordset);
  } catch (err) {
    console.error("Erro ao obter inventários abertos:", err);
    res.status(500).json({ error: "Erro ao procurar inventários abertos" });
  } finally {
    if (pool) await pool.close();
  }
});

// ------------------- GET Linhas de Inventario -------------------
app.get("/inventarios/:serie/:numero/linhas", async (req, res) => {
  const serie = String(req.params.serie || "").trim();
  const numero = Number(req.params.numero);

  if (!serie || !Number.isInteger(numero)) {
    return res.status(400).json({ error: "Inventário inválido." });
  }

  if (shouldUseDevMockData()) {
    const inventario = devMockState.documentos.find((documento) =>
      documento.inventario &&
      documento.serie === serie &&
      Number(documento.numero) === numero
    );

    return res.json(inventario.produtos || []);
  }

  let pool;
  try {
    pool = await sql.connect(await getDbConfig());

    const result = await pool.request()
      .input("serie", sql.VarChar(25), serie)
      .input("numero", sql.Int, numero)
      .query(`
        SELECT
          v.codigo,
          v.descricao,
          p.codbarras,
          p.referencia,
          p.unidade,
          p.prodstock,
          p.armazem,
          CAST(ISNULL(stock.qtdstock, 0) AS float) AS qtdstock,
          CAST(ISNULL(v.qtd, 0) AS float) AS inventarioQtd
        FROM Vendas v
        LEFT JOIN produtos p
          ON p.codigo = v.codigo
        OUTER APPLY (
          SELECT CAST(ISNULL(SUM(sa.QTD), 0) AS float) AS qtdstock
          FROM stock_actual sa
          WHERE sa.produto = ISNULL(NULLIF(p.prodstock, 0), p.codigo)
            AND sa.armazem = ISNULL(p.armazem, 0)
        ) stock
        WHERE RTRIM(LTRIM(v.doc)) = 'IN'
          AND RTRIM(LTRIM(v.serie)) = RTRIM(LTRIM(@serie))
          AND v.numero = @numero
        ORDER BY v.id
      `);

    res.json(result.recordset);
  } catch (err) {
    console.error("Erro ao obter linhas de inventário:", err);
    res.status(500).json({ error: "Erro ao procurar linhas de inventário" });
  } finally {
    if (pool) await pool.close();
  }
});

// ------------------- POST Linhas de Inventario Aberto -------------------
app.post("/inventarios/:serie/:numero/linhas", async (req, res) => {
  const serie = String(req.params.serie || "").trim();
  const numero = Number(req.params.numero);
  const produtos = Array.isArray(req.body.produtos) ? req.body.produtos : [];
  const empregadoId = Number(req.body.empregadoId) || 1;

  if (!serie || !Number.isInteger(numero) || !produtos.length) {
    return res.status(400).json({ error: "Inventário e produtos são obrigatórios." });
  }

  if (shouldUseDevMockData()) {
    const inventario = devMockState.documentos.find((documento) =>
      documento.inventario &&
      documento.serie === serie &&
      Number(documento.numero) === numero
    );

    if (!inventario) {
      return res.status(404).json({ error: "Inventário aberto não encontrado." });
    }

    inventario.produtos = produtos;
    return res.json({ sucesso: true, numero, serie, linhas: produtos.length });
  }

  let pool;
  try {
    pool = await sql.connect(await getDbConfig());

    const inventarioRes = await pool.request()
      .input("serie", sql.VarChar(25), serie)
      .input("numero", sql.Int, numero)
      .query(`
        SELECT TOP 1 doc, serie, numero, data, datahora, tipo
        FROM Documentos
        WHERE RTRIM(LTRIM(doc)) = 'IN'
          AND RTRIM(LTRIM(serie)) = RTRIM(LTRIM(@serie))
          AND numero = @numero
          AND ISNULL(anulado, 0) = 0
          AND ISNULL(tipo, 0) = 0
      `);

    const inventario = inventarioRes.recordset[0];
    if (!inventario) {
      return res.status(404).json({
        error: `Inventário aberto não encontrado: ${serie}/${numero}. Crie ou abra o documento na ZoneSoft antes de enviar.`
      });
    }

    for (const linha of produtos) {
      const codigo = Number(linha.codigo);
      const inventarioQtd = Number(linha.inventarioQtd);

      if (!Number.isInteger(codigo) || codigo <= 0 || !Number.isFinite(inventarioQtd) || inventarioQtd < 0) {
        throw new Error(`Linha de inventário inválida para o produto ${linha.codigo || ""}.`);
      }

      const produtoRes = await pool.request()
        .input("codigo", sql.Int, codigo)
        .query(`
          SELECT TOP 1
            codigo, descricao, referencia, iva, unidade, armazem,
            prodstock, qtdstock, stocks
          FROM produtos
          WHERE codigo = @codigo
        `);

      const produto = produtoRes.recordset[0];
      if (!produto) {
        throw new Error(`Produto ${codigo} não encontrado.`);
      }

      if (Number(produto.stocks) !== 1) {
        throw new Error(`Produto ${codigo} não está configurado para gerir stocks.`);
      }

      const descricao = String(linha.descricao || produto.descricao || "").trim();
      const armazem = Number(produto.armazem) || 0;
      const prodstock = Number(produto.prodstock) > 0 ? Number(produto.prodstock) : Number(produto.codigo);
      const unidade = Number(produto.unidade) || 1;
      const qtdStockCache = Number(produto.qtdstock) || 0;
      const dataHora = inventario.datahora || new Date();

      const updateRes = await pool.request()
        .input("serie", sql.VarChar(25), serie)
        .input("numero", sql.Int, numero)
        .input("codigo", sql.Int, produto.codigo)
        .input("descricao", sql.VarChar(200), descricao)
        .input("qtd", sql.Money, inventarioQtd)
        .input("qtdstock", sql.Money, qtdStockCache)
        .input("qtdunidades", sql.Money, inventarioQtd)
        .input("unidade", sql.Int, unidade)
        .input("armazem", sql.Int, armazem)
        .input("prodstock", sql.Int, prodstock)
        .input("referencia", sql.VarChar(100), produto.referencia || "")
        .input("datahora", sql.DateTime, dataHora)
        .query(`
          UPDATE Vendas
          SET descricao = @descricao,
              qtd = @qtd,
              qtdstock = @qtdstock,
              qtdunidades = @qtdunidades,
              unidade = @unidade,
              armazem = @armazem,
              prodstock = @prodstock,
              referencia = @referencia,
              uid_caracteristica = 0,
              prodorigem = 0,
              addon = '',
              edicao = 0,
              tipo = 0
          WHERE RTRIM(LTRIM(doc)) = 'IN'
            AND RTRIM(LTRIM(serie)) = RTRIM(LTRIM(@serie))
            AND numero = @numero
            AND codigo = @codigo
        `);

      if (updateRes.rowsAffected[0] === 0) {
        await pool.request()
          .input("data", sql.DateTime, inventario.data)
          .input("numero", sql.Int, numero)
          .input("doc", sql.VarChar(10), "IN")
          .input("serie", sql.VarChar(25), serie)
          .input("codigo", sql.Int, produto.codigo)
          .input("descricao", sql.VarChar(200), descricao)
          .input("qtd", sql.Money, inventarioQtd)
          .input("empid", sql.Int, empregadoId)
          .input("datahora", sql.DateTime, dataHora)
          .input("armazem", sql.Int, armazem)
          .input("prodstock", sql.Int, prodstock)
          .input("qtdstock", sql.Money, qtdStockCache)
          .input("referencia", sql.VarChar(100), produto.referencia || "")
          .input("qtdunidades", sql.Money, inventarioQtd)
          .input("unidade", sql.Int, unidade)
          .query(`
            INSERT INTO Vendas (
              data, numero, doc, serie, codigo, descricao, qtd,
              empid, datahora, armazem, prodstock, qtdstock,
              referencia, qtdunidades, unidade, uid_caracteristica,
              tipo, prodorigem, addon, edicao
            )
            VALUES (
              @data, @numero, @doc, @serie, @codigo, @descricao, @qtd,
              @empid, @datahora, @armazem, @prodstock, @qtdstock,
              @referencia, @qtdunidades, @unidade, 0,
              0, 0, '', 0
            )
          `);
      }
    }

    await pool.request()
      .input("serie", sql.VarChar(25), serie)
      .input("numero", sql.Int, numero)
      .query(`
        UPDATE Documentos
        SET id = 0
        WHERE RTRIM(LTRIM(doc)) = 'IN'
          AND RTRIM(LTRIM(serie)) = RTRIM(LTRIM(@serie))
          AND numero = @numero
      `);

    const linhasRes = await pool.request()
      .input("serie", sql.VarChar(25), serie)
      .input("numero", sql.Int, numero)
      .query(`
        SELECT COUNT(*) AS linhas
        FROM Vendas
        WHERE RTRIM(LTRIM(doc)) = 'IN'
          AND RTRIM(LTRIM(serie)) = RTRIM(LTRIM(@serie))
          AND numero = @numero
      `);

    res.json({
      sucesso: true,
      numero,
      serie,
      linhas: Number(linhasRes.recordset[0].linhas || 0)
    });
  } catch (err) {
    console.error("Erro ao gravar linhas de inventário:", err);
    res.status(500).json({ error: err.message });
  } finally {
    if (pool) await pool.close();
  }
});

// ------------------- POST Criar Documento de Inventario -------------------
app.post('/criarDocumentoInventario', async (req, res) => {
  const { tipoDoc = "IN", serie, produtos, empregadoId } = req.body;

  if (shouldUseDevMockData()) {
    if (tipoDoc !== "IN" || !serie || !produtos.length) {
      return res.status(400).json({ error: 'Faltam dados obrigatórios para inventário.' });
    }

    const numero = devMockState.documentos.length + 1;

    for (const linha of produtos) {
      const produto = findDevMockProduct(linha.codigo);
      if (produto) {
        produto.qtdstock = Number(linha.inventarioQtd) || 0;
      }
    }

    devMockState.documentos.push({
      numero,
      tipoDoc,
      serie,
      produtos,
      inventario: true,
      createdAt: new Date().toISOString()
    });

    return res.json({
      sucesso: true,
      mensagem: `Inventário ${tipoDoc}/${serie} n.º ${numero} criado em mock local.`,
      numero,
      serie
    });
  }

  if (tipoDoc !== "IN") {
    return res.status(400).json({ error: "O inventário físico só pode usar documento IN." });
  }

  if (!serie || !produtos.length) {
    return res.status(400).json({ error: 'Faltam dados obrigatórios (série e produtos).' });
  }

  const linhasInventario = produtos.map((produto) => ({
    codigo: Number(produto.codigo),
    descricao: String(produto.descricao || "").trim(),
    inventarioQtd: Number(produto.inventarioQtd)
  }));

  if (linhasInventario.some((linha) =>
    !Number.isInteger(linha.codigo) ||
    linha.codigo <= 0 ||
    !Number.isFinite(linha.inventarioQtd) ||
    linha.inventarioQtd < 0
  )) {
    return res.status(400).json({ error: "Produtos ou quantidades inválidas para inventário." });
  }

  let pool;
  let documentoParcial = null;

  try {
    const dbConfig = await getDbConfig();
    pool = await sql.connect(dbConfig);

    const checkTipo = await pool.request()
      .input('serie', sql.VarChar(25), serie)
      .query(`
        SELECT TOP 1 doc, serie, numero
        FROM numdocseries
        WHERE RTRIM(LTRIM(doc)) = 'IN'
          AND RTRIM(LTRIM(serie)) = RTRIM(LTRIM(@serie))
      `);

    if (checkTipo.recordset.length === 0) {
      return res.status(400).json({
        error: `Série de inventário não configurada na ZoneSoft: IN/${serie}. Configure a série IN na ZoneSoft antes de enviar o inventário.`
      });
    }

    let novoNumero = 1;
    const checkNum = await pool.request()
      .input('doc', sql.VarChar(10), 'IN')
      .input('serie', sql.VarChar(25), serie)
      .query(`SELECT MAX(numero) AS ultimoNumero FROM Documentos WHERE doc = @doc AND serie = @serie`);

    const ultimoNumero = checkNum.recordset[0].ultimoNumero;
    if (ultimoNumero && !isNaN(ultimoNumero)) novoNumero = ultimoNumero + 1;

    const agora = new Date();
    const pad = (n, size = 2) => String(n).padStart(size, "0");
    const dataAtualString = `${agora.getFullYear()}-${pad(agora.getMonth() + 1)}-${pad(agora.getDate())} ` +
      `${pad(agora.getHours())}:${pad(agora.getMinutes())}:${pad(agora.getSeconds())}.` +
      `${String(agora.getMilliseconds()).padStart(3, "0")}`;

    await pool.request()
      .input('id', sql.Int, 0)
      .input('data', sql.VarChar, dataAtualString)
      .input('datadoc', sql.VarChar, dataAtualString)
      .input('datapagamento', sql.VarChar, dataAtualString)
      .input('numero', sql.Int, novoNumero)
      .input('doc', sql.VarChar(10), 'IN')
      .input('serie', sql.VarChar(25), serie)
      .input('cliente', sql.Int, 0)
      .input('nome', sql.VarChar(100), 'Inventario')
      .input('liquido', sql.Money, 0)
      .input('total', sql.Money, 0)
      .input('deve', sql.Money, 0)
      .input('datahora', sql.VarChar, dataAtualString)
      .input('tipo', sql.Int, 1)
      .input('emp', sql.Int, Number(empregadoId) || 1)
      .query(`
        INSERT INTO Documentos (
          id, data, datadoc, datapagamento,
          numero, doc, serie, cliente, nome,
          liquido, total, deve, datahora, tipo, emp
        )
        VALUES (
          @id, @data, @datadoc, @datapagamento,
          @numero, @doc, @serie, @cliente, @nome,
          @liquido, @total, @deve, @datahora, @tipo, @emp
        )
      `);

    documentoParcial = { doc: 'IN', serie, numero: novoNumero };

    const quantidadesEsperadas = new Map();

    for (const linha of linhasInventario) {
      const produtoRes = await pool.request()
        .input('codigo', sql.Int, linha.codigo)
        .query(`
          SELECT TOP 1 codigo, descricao, iva, armazem, stocks
          FROM produtos
          WHERE codigo = @codigo
        `);

      const produto = produtoRes.recordset[0];
      if (!produto) {
        throw new Error(`Produto ${linha.codigo} não encontrado para inventário.`);
      }

      if (Number(produto.stocks) !== 1) {
        throw new Error(`Produto ${linha.codigo} não está configurado para gerir stocks na ZoneSoft.`);
      }

      const descricao = linha.descricao || produto.descricao || String(linha.codigo);
      const armazem = Number(produto.armazem) || 0;
      const qtdInventario = Number(linha.inventarioQtd) || 0;

      quantidadesEsperadas.set(
        Number(produto.codigo),
        (quantidadesEsperadas.get(Number(produto.codigo)) || 0) + qtdInventario
      );

      await pool.request()
        .input('data', sql.VarChar, dataAtualString)
        .input('numero', sql.Int, novoNumero)
        .input('doc', sql.VarChar(10), 'IN')
        .input('serie', sql.VarChar(25), serie)
        .input('codigo', sql.Int, produto.codigo)
        .input('descricao', sql.VarChar(200), descricao)
        .input('iva', sql.Money, Number(produto.iva) || 0)
        .input('qtd', sql.Money, qtdInventario)
        .input('punit', sql.Money, 0)
        .input('valor', sql.Money, 0)
        .input('total', sql.Money, 0)
        .input('datahora', sql.VarChar, dataAtualString)
        .input('armazem', sql.Int, armazem)
        .input('prodstock', sql.Int, produto.codigo)
        .query(`
          INSERT INTO Vendas (
            data, numero, doc, serie, codigo, descricao, iva, qtd,
            punit, valor, total, datahora, empid, armazem, prodstock
          )
          VALUES (
            @data, @numero, @doc, @serie, @codigo, @descricao, @iva, @qtd,
            @punit, @valor, @total, @datahora, 1, @armazem, @prodstock
          )
        `);
    }

    await pool.request()
      .input('doc', sql.VarChar(3), 'IN')
      .input('serie', sql.VarChar(25), serie)
      .input('numero', sql.Int, novoNumero)
      .query('EXEC new_doc @doc, @serie, @numero');

    const movimentosRes = await pool.request()
      .input('doc', sql.VarChar(3), 'IN')
      .input('serie', sql.VarChar(25), serie)
      .input('numero', sql.Int, novoNumero)
      .query(`
        SELECT produto, CAST(SUM(qtd) AS float) AS qtd
        FROM tblStockMov
        WHERE RTRIM(LTRIM(doc)) = 'IN'
          AND RTRIM(LTRIM(serie)) = RTRIM(LTRIM(@serie))
          AND numero = @numero
        GROUP BY produto
      `);

    const movimentosPorProduto = new Map(
      movimentosRes.recordset.map((mov) => [Number(mov.produto), Number(mov.qtd) || 0])
    );
    const falhas = [];

    for (const [codigo, qtdEsperada] of quantidadesEsperadas.entries()) {
      const temMovimento = movimentosPorProduto.has(Number(codigo));
      const qtdMovimentada = movimentosPorProduto.get(Number(codigo)) || 0;

      if (!temMovimento || Math.abs(qtdMovimentada - qtdEsperada) > 0.0001) {
        falhas.push(`${codigo}: esperado ${qtdEsperada}, movimento ${qtdMovimentada}`);
      }
    }

    if (falhas.length > 0) {
      throw new Error(`A ZoneSoft não gerou os movimentos IN esperados em tblStockMov (${falhas.join('; ')}).`);
    }

    for (const codigo of quantidadesEsperadas.keys()) {
      await sincronizarQtdStockComStockAtual(() => pool.request(), Number(codigo), Number(codigo), 0);
    }

    await pool.request()
      .input('serie', sql.VarChar(25), serie)
      .input('numero', sql.Int, novoNumero)
      .query(`
        UPDATE numdocseries
        SET numero = CASE
          WHEN ISNULL(numero, 0) < @numero THEN @numero
          ELSE numero
        END
        WHERE RTRIM(LTRIM(doc)) = 'IN'
          AND RTRIM(LTRIM(serie)) = RTRIM(LTRIM(@serie))
      `);

    documentoParcial = null;

    res.json({
      sucesso: true,
      mensagem: `Inventário IN/${serie} n.º ${novoNumero} criado com sucesso.`,
      numero: novoNumero,
      serie
    });
  } catch (err) {
    if (pool && documentoParcial) {
      try {
        await removerDocumentoParcial(pool, documentoParcial.doc, documentoParcial.serie, documentoParcial.numero);
      } catch (cleanupErr) {
        console.error('Erro ao limpar inventario parcial:', cleanupErr);
      }
    }

    console.error('Erro ao criar documento de inventario:', err);
    res.status(500).json({ error: err.message });
  } finally {
    if (pool) await pool.close();
  }
});




// ------------------- POST Criar Documento de Compra -------------------
app.post('/criarDocumentoCompra', async (req, res) => {
  const { fornecedorId, fornecedorNome, tipoDoc, serie, produtos } = req.body;
  const tipoDocCompra = String(tipoDoc || "").trim().toUpperCase();
  const serieCompra = String(serie || "").trim();

  if (!fornecedorId || !tipoDocCompra || !serieCompra || !produtos.length) {
    return res.status(400).json({ error: 'Faltam dados obrigatórios (fornecedor, tipo de documento, série e produtos).' });
  }

  if (!TIPOS_DOCUMENTO_FORNECEDOR.includes(tipoDocCompra)) {
    return res.status(400).json({
      error: `Tipo de documento não permitido para documentos de fornecedor: ${tipoDocCompra}. Use ${TIPOS_DOCUMENTO_FORNECEDOR.join(" ou ")}.`
    });
  }

  if (shouldUseDevMockData()) {
    const numero = devMockState.documentos.length + 1;

    for (const linha of produtos) {
      const produto =
        findDevMockProduct(linha.codigo) ||
        findDevMockProduct(linha.codbarras);

      if (produto) {
        produto.fornecedor = Number(fornecedorId);
        produto.qtdstock = (Number(produto.qtdstock) || 0) + (Number(linha.qtd) || 0);
      }
    }

    devMockState.documentos.push({
      numero,
      fornecedorId,
      fornecedorNome,
      tipoDoc: tipoDocCompra,
      serie: serieCompra,
      produtos,
      createdAt: new Date().toISOString()
    });

    return res.json({
      sucesso: true,
      mensagem: `Documento ${tipoDocCompra}/${serieCompra} n.º ${numero} criado em mock local.`,
      numero,
      serie: serieCompra
    });
  }

  let pool;
  let documentoParcial = null;
  try {
    const dbConfig = await getDbConfig();
    pool = await sql.connect(dbConfig);

    // ✅ Garante data de hoje com hora 00:00:00 sem offset UTC
    const agora = new Date();
    const pad = (n) => String(n).padStart(2, "0");
    const dataAtualString = `${agora.getFullYear()}-${pad(agora.getMonth() + 1)}-${pad(agora.getDate())} 00:00:00`;

    // ✅ Buscar nome correto do fornecedor
    let nomeFornecedorFinal = fornecedorNome;
    const fornecedorRes = await pool.request()
      .input('id', sql.Int, fornecedorId)
      .query('SELECT nome FROM fornecedores WHERE codigo = @id');

    if (fornecedorRes.recordset.length > 0) {
      nomeFornecedorFinal = fornecedorRes.recordset[0].nome;
    } else {
      nomeFornecedorFinal = "Fornecedor desconhecido";
    }

    // ✅ Garantir que o tipo/série existe
    const checkTipo = await pool.request()
      .input('doc', sql.VarChar(10), tipoDocCompra)
      .input('serie', sql.VarChar(20), serieCompra)
      .query(`
        SELECT TOP 1 doc, serie, numero
        FROM numdocseries
        WHERE RTRIM(LTRIM(doc)) = RTRIM(LTRIM(@doc))
          AND RTRIM(LTRIM(serie)) = RTRIM(LTRIM(@serie))
          AND RTRIM(LTRIM(doc)) IN ('CFA', 'CFS')
      `);

    if (checkTipo.recordset.length === 0) {
      return res.status(400).json({
        error: `Série/documento não configurado na ZoneSoft: ${tipoDocCompra}/${serieCompra}. Configure a série na ZoneSoft antes de criar documentos.`
      });
    }

    // ✅ Calcular próximo número de documento
    let novoNumero = 1;
    const checkNum = await pool.request()
      .input('doc', sql.VarChar(10), tipoDocCompra)
      .input('serie', sql.VarChar(20), serieCompra)
      .query(`SELECT MAX(numero) AS ultimoNumero FROM Documentos WHERE doc = @doc AND serie = @serie`);

    const ultimoNumero = checkNum.recordset[0].ultimoNumero;
    if (ultimoNumero && !isNaN(ultimoNumero)) novoNumero = ultimoNumero + 1;
    else console.log(`Nenhum documento encontrado para ${tipoDocCompra}/${serieCompra}. A iniciar no n 1.`);

    // ✅ ID fixo = 1
    const novoId = 0;

    // 💰 Calcular totais
    let totalLiquido = 0, totalGeral = 0;
    const quantidadesEsperadasPorStock = new Map();
    const produtosParaSincronizar = new Map();

    for (const p of produtos) {
      const linha = (p.precoCompra || 0) * (p.qtd || 1);
      totalLiquido += linha;
      totalGeral += linha * (1 + (p.iva || 0) / 100);
    }

    // 🧾 Inserir cabeçalho do documento
    await pool.request()
      .input('id', sql.Int, novoId)
      .input('data', sql.VarChar, dataAtualString)          // Data Lanç.
      .input('datadoc', sql.VarChar, dataAtualString)       // Data Doc.
      .input('datapagamento', sql.VarChar, dataAtualString) // Data Venc.
      .input('numero', sql.Int, novoNumero)
      .input('doc', sql.VarChar(10), tipoDocCompra)
      .input('serie', sql.VarChar(20), serieCompra)
      .input('cliente', sql.Int, fornecedorId)
      .input('nome', sql.VarChar(100), nomeFornecedorFinal)
      .input('liquido', sql.Money, totalLiquido)
      .input('total', sql.Money, totalGeral)
      .input('deve', sql.Money, totalGeral)
      .input('datahora', sql.VarChar, dataAtualString)
      .input('tipo', sql.Int, 4)
      .input('emp', sql.Int, 1)
      .query(`
    INSERT INTO Documentos (
      id, data, datadoc, datapagamento,
      numero, doc, serie, cliente, nome,
      liquido, total, deve, datahora, tipo, emp
    )
    VALUES (
      @id, @data, @datadoc, @datapagamento,
      @numero, @doc, @serie, @cliente, @nome,
      @liquido, @total, @deve, @datahora, @tipo, @emp
    )
  `);


    // 🔁 Inserir produtos e linhas de venda
    documentoParcial = { doc: tipoDocCompra, serie: serieCompra, numero: novoNumero };

    for (const p of produtos) {
      let produtoNovo = false;
      let codigoProduto = p.codigo;
      let check;

      // 🔍 Tenta encontrar produto existente
      if (p.codbarras) {
        check = await pool.request()
          .input('codbarras', sql.VarChar, p.codbarras)
          .query('SELECT codigo, fornecedor FROM produtos WHERE RTRIM(LTRIM(codbarras)) = @codbarras');
      }

      if (!check || check.recordset.length === 0) {
        check = await pool.request()
          .input('descricao', sql.VarChar, p.descricao)
          .query('SELECT codigo, fornecedor FROM produtos WHERE RTRIM(LTRIM(descricao)) = @descricao');
      }

      // 🔁 Se existe, atualizar fornecedor
      if (check.recordset.length > 0) {
        const produtoExistente = check.recordset[0];
        codigoProduto = produtoExistente.codigo;
        await pool.request()
          .input('codigo', sql.Int, codigoProduto)
          .input('novoFornecedor', sql.Int, fornecedorId)
          .query('UPDATE produtos SET fornecedor = @novoFornecedor, compra = 1, id = 0 WHERE codigo = @codigo');
      } else {
        produtoNovo = true;
        // Criar novo produto com fornecedor atual
        const original = await buscarProdutoBaseParaCopia(pool);
        if (!original) throw new Error('Não existe produto base para copiar');

        const novoCodigo = await gerarNovoCodigoProduto(pool);
        const precoCompraVal = p.precoCompra ?? original.precocompra ?? 0;
        const margemVal = p.margembruta ?? original.margembruta ?? 0;
        const ivaVal = p.iva ?? original.iva ?? 0;

        const precoSemIva = precoCompraVal * (1 + margemVal / 100);
        const precoVenda = precoSemIva * (1 + ivaVal / 100);


        const now = new Date();

        const pad = (n, s = 2) => String(n).padStart(s, "0");
        const padMs = (n) => String(n).padStart(3, "0");
        const datacriacao = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())} ${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}.${padMs(now.getMilliseconds())}`;
        const cbDoc = (p.codbarras ?? "").toString().trim();
        const referenciaFinal = cbDoc !== "" ? cbDoc : String(novoCodigo);

        await pool.request()
          .input('novoCodigo', sql.Int, novoCodigo)
          .input('novaDescricao', sql.VarChar, p.descricao.trim())
          .input(
            'novoCodBarras',
            sql.VarChar,
            cbDoc !== "" ? cbDoc : null
          )
          .input('novaReferencia', sql.VarChar, referenciaFinal)
          .input('novoQtdStock', sql.Float, 0)
          .input('novoPrecoCompra', sql.Float, precoCompraVal)
          .input('novoIVA', sql.Float, ivaVal)
          .input('novaMargem', sql.Float, margemVal)
          .input('novoPrecoVenda', sql.Float, precoVenda)
          .input('novoFornecedor', sql.Int, fornecedorId)
          .input('novaFamilia', sql.Int, p.familia ?? original.familia)
          .input('novaSubFam', sql.Int, p.subfam ?? original.subfam)
          .input('novaDataCriacao', sql.VarChar, datacriacao)
          .input('novoPvp1Siva', sql.Float, precoSemIva)
          .input('novoPlu', sql.Int, p.plu ?? null)
          .input('novaUnidade', sql.Int, parseInt(original.unidade ?? 1))
          .input('novaUnCompra', sql.Int, parseInt(original.uncompra ?? original.unidade ?? 1))
          .input('novaUnInventario', sql.Int, parseInt(original.uninventario ?? original.unidade ?? 1))
          .input('novoIvaCompra', sql.Float, Number(original.ivacompra ?? ivaVal ?? 0))
          .input('novoIva2', sql.Float, Number(original.iva2 ?? ivaVal ?? 0))
          .input('novoStocks', sql.Int, 1)
          .input('codigoOriginal', sql.Int, original.codigo)
          .query(`
            INSERT INTO produtos (
              id, codigo, descricao, codbarras, qtdstock,
              precocompra, iva, margembruta, precovenda,
              fornecedor, familia, subfam,
              dataultcompra, ultprecocompra,
              datacriacao, obs, retalho, composto, ultprecovenda, topo, cozinha,
              grupo, referencia, ivacompra, balanca, prodstock, compra,
              stocks, meiadose, precomeia, qtdmeia, ordemtop, ordem, ordemlocal,
              listseparado, armazem, tempoprep, maxopcoes, iva2, tara,
              prepagamento, fundo, letra, descricaocurta, promocao, percentprom,
              codigopp, revenda, precorevenda, ivarevenda, autoquebra,
              pvp2, pvp3, pvp4, pvp5, pvpmeia2, pvpmeia3, pvpmeia4, pvpmeia5,
              consumominimo, precominimo, excluirdescontos, vendersemstock,
              dosedesc, meiadosedesc, restricted, pvp6, pvp7, pvp8, pvp9, pvp10,
              categoria, subcategoria, retencao, isencao,
              pvp1siva, pvp2siva, pvp3siva, pvp4siva, pvp5siva, pvp6siva, pvp7siva,
              pvp8siva, pvp9siva, pvp10siva, pvpmeia1siva, pvpmeia2siva,
              pvpmeia3siva, pvpmeia4siva, pvpmeia5siva, pvpmeia6siva,
              pvpmeia7siva, pvpmeia8siva, pvpmeia9siva, pvpmeia10siva,
              tiposaft, uncompra, uninventario,
              min_complementos, max_complementos, transferivel,
              politicapreco, unidade
            )
            SELECT
              0, @novoCodigo, @novaDescricao, @novoCodBarras, @novoQtdStock,
              @novoPrecoCompra, @novoIVA, @novaMargem, @novoPrecoVenda,
              @novoFornecedor, @novaFamilia, @novaSubFam,
              dataultcompra, ultprecocompra,
              @novaDataCriacao, obs, '1', '0', @novoPrecoVenda, '0', '0',
              '0', @novaReferencia, @novoIvaCompra, '0', @novoCodigo, '1',
              @novoStocks,'0','0','0','0','0','0',
              listseparado, '0', tempoprep, '0', @novoIva2, '0',
              '0', fundo, letra, '', '0', '0',
              @novoPlu, '0','0','23','0',
              '0','0','0','0','0','0','0','0',
              '0','0','0','1',
              '', '', '0','0','0','0','0','0',
              '0','0','0','0','0',
              '0','0','0','',
              @novoPvp1Siva,'0','0','0','0','0','0',
              '0','0','0','0','0',
              '0','0','0','0',
              '0','0','0','0',
              'P',@novaUnCompra,@novaUnInventario,
              '0','0','1',
              '0', @novaUnidade
            FROM produtos
            WHERE codigo = @codigoOriginal
          `);
        codigoProduto = novoCodigo;
      }

      // 🔹 Atualizar stock e calcular quantidade adicionada
      // 🔹 Buscar stock atual antes de atualizar
      let stockAntes = 0;
      const stockRes = await pool.request()
        .input('codigo', sql.Int, codigoProduto)
        .query('SELECT qtdstock FROM produtos WHERE codigo = @codigo');

      if (stockRes.recordset.length > 0) {
        stockAntes = stockRes.recordset[0].qtdstock || 0;
      }

      // 🔹 Quantidade picada (aumentada)
      const qtdMovimento = Number(p.qtd) || 1;



      // 🔹 Quantidade que vai para o documento
      const qtdInserida = Number(p.qtd) || 1;

      // se não existia na BD, o stock final é exatamente o que veio do frontend
      const novoStock = check.recordset.length === 0
        ? qtdInserida
        : stockAntes + qtdInserida;




      // 🔹 Atualizar stock do produto
      await pool.request()
        .input('codigo', sql.Int, codigoProduto)
        .input('novoStock', sql.Float, novoStock)
        .input('novoFornecedor', sql.Int, fornecedorId)
        .input('dataUltCompra', sql.VarChar, dataAtualString)
        .input('precoCompraLinha', sql.Float, Number(p.precoCompra) || 0)
        .query(`
          UPDATE produtos
          SET fornecedor = @novoFornecedor,
              compra = 1,
              dataultcompra = @dataUltCompra,
              ultprecocompra = CASE
                WHEN @precoCompraLinha > 0 THEN @precoCompraLinha
                ELSE ultprecocompra
              END,
              precocompra = CASE
                WHEN @precoCompraLinha > 0 THEN @precoCompraLinha
                ELSE precocompra
              END,
              id = 0
          WHERE codigo = @codigo
        `);

      const unidadeRes = await pool.request()
        .input('codigo', sql.Int, codigoProduto)
        .query('SELECT unidade, prodstock, armazem FROM produtos WHERE codigo = @codigo');

      const unidade = unidadeRes.recordset[0]?.unidade ?? '1';
      const codigoStock = Number(unidadeRes.recordset[0].prodstock) > 0
        ? Number(unidadeRes.recordset[0].prodstock)
        : Number(codigoProduto);
      const armazemProduto = Number(unidadeRes.recordset[0].armazem) || 0;

      quantidadesEsperadasPorStock.set(
        codigoStock,
        (quantidadesEsperadasPorStock.get(codigoStock) || 0) + qtdInserida
      );
      produtosParaSincronizar.set(codigoProduto, { codigoStock, armazem: armazemProduto });


      const valorLinha = (p.precoCompra || 0) * qtdInserida;

      await pool.request()
        .input('data', sql.VarChar, dataAtualString)
        .input('numero', sql.Int, novoNumero)
        .input('doc', sql.VarChar(10), tipoDocCompra)
        .input('serie', sql.VarChar(20), serieCompra)
        .input('codigo', sql.Int, codigoProduto)
        .input('descricao', sql.VarChar(200), p.descricao)
        .input('iva', sql.Money, p.iva || 0)
        .input('qtd', sql.Money, qtdInserida)
        .input('punit', sql.Money, p.precoCompra || 0)
        .input('valor', sql.Money, valorLinha)
        .input('total', sql.Money, valorLinha)
        .input('datahora', sql.VarChar, dataAtualString)
        .input('armazem', sql.Int, armazemProduto)
        .input('prodstock', sql.Int, codigoStock)
        .query(`
    INSERT INTO Vendas (
      data, numero, doc, serie, codigo, descricao, iva, qtd, punit, valor, total, datahora, empid, armazem, prodstock
    )
    VALUES (
      @data, @numero, @doc, @serie, @codigo, @descricao, @iva, @qtd, @punit, @valor, @total, @datahora, 1, @armazem, @prodstock
    )
  `);




    }

    await pool.request()
      .input('doc', sql.VarChar(3), tipoDocCompra)
      .input('serie', sql.VarChar(25), serieCompra)
      .input('numero', sql.Int, novoNumero)
      .query('EXEC new_doc @doc, @serie, @numero');

    const movimentosRes = await pool.request()
      .input('doc', sql.VarChar(3), tipoDocCompra)
      .input('serie', sql.VarChar(25), serieCompra)
      .input('numero', sql.Int, novoNumero)
      .query(`
        SELECT produto, CAST(SUM(qtd) AS float) AS qtd
        FROM tblStockMov
        WHERE RTRIM(LTRIM(doc)) = RTRIM(LTRIM(@doc))
          AND RTRIM(LTRIM(serie)) = RTRIM(LTRIM(@serie))
          AND numero = @numero
        GROUP BY produto
      `);

    const movimentosPorStock = new Map(
      movimentosRes.recordset.map((mov) => [Number(mov.produto), Number(mov.qtd) || 0])
    );
    const movimentosEmFalta = [];

    for (const [codigoStock, qtdEsperada] of quantidadesEsperadasPorStock.entries()) {
      const qtdMovimentada = movimentosPorStock.get(Number(codigoStock)) || 0;
      if (Math.abs(qtdMovimentada - qtdEsperada) > 0.0001) {
        movimentosEmFalta.push(`${codigoStock}: esperado ${qtdEsperada}, movimento ${qtdMovimentada}`);
      }
    }

    if (movimentosEmFalta.length > 0) {
      throw new Error(
        `Documento criado, mas a ZoneSoft não gerou os movimentos de stock esperados em tblStockMov (${movimentosEmFalta.join('; ')}).`
      );
    }

    for (const [codigoProduto, stockInfo] of produtosParaSincronizar.entries()) {
      await sincronizarQtdStockComStockAtual(
        () => pool.request(),
        Number(codigoProduto),
        Number(stockInfo.codigoStock),
        Number(stockInfo.armazem) || 0
      );
    }

    await pool.request()
      .input('doc', sql.VarChar(10), tipoDocCompra)
      .input('serie', sql.VarChar(20), serieCompra)
      .input('numero', sql.Int, novoNumero)
      .query(`
        UPDATE numdocseries
        SET numero = CASE
          WHEN ISNULL(numero, 0) < @numero THEN @numero
          ELSE numero
        END
        WHERE RTRIM(LTRIM(doc)) = RTRIM(LTRIM(@doc))
          AND RTRIM(LTRIM(serie)) = RTRIM(LTRIM(@serie))
      `);

    documentoParcial = null;

    res.json({
      sucesso: true,
      mensagem: `Documento ${tipoDocCompra}/${serieCompra} n.º ${novoNumero} criado com sucesso.`,
      numero: novoNumero,
      serie
    });

  } catch (err) {
    console.error('❌ Erro ao criar documento de compra:', err);
    if (pool && documentoParcial) {
      try {
        await removerDocumentoParcial(pool, documentoParcial.doc, documentoParcial.serie, documentoParcial.numero);
      } catch (cleanupErr) {
        console.error('Erro ao limpar documento parcial:', cleanupErr);
      }
    }

    res.status(500).json({ error: err.message });
  } finally {
    if (pool) await pool.close();
  }
});


// PATCH fornecedor
app.patch('/produto/:codigo/fornecedor', async (req, res) => {
  const identificador = (req.params.codigo || "").trim();
  const { fornecedor } = req.body;

  if (shouldUseDevMockData()) {
    if (!Number.isInteger(fornecedor)) {
      return res.status(400).json({ error: "Fornecedor inválido" });
    }

    const produto = findDevMockProduct(identificador);
    if (!produto) return res.status(404).json({ error: "Produto não encontrado" });

    produto.fornecedor = fornecedor;
    return res.json({ success: true });
  }

  if (!Number.isInteger(fornecedor)) {
    return res.status(400).json({ error: "Fornecedor inválido" });
  }

  let pool;
  try {
    pool = await sql.connect(await getDbConfig());

    const request = pool.request()
      .input('fornecedor', sql.Int, fornecedor);

    let whereClause = "";

    if (/^\d+$/.test(identificador)) {
      request.input('codigo', sql.Int, Number(identificador));
      whereClause = "codigo = @codigo";
    } else {
      request.input('codbarras', sql.VarChar, identificador);
      whereClause = "RTRIM(LTRIM(codbarras)) = @codbarras";
    }

    const result = await request.query(`
      UPDATE produtos
      SET fornecedor = @fornecedor, compra = 1, id = 0
      WHERE ${whereClause}
    `);

    if (result.rowsAffected[0] === 0) {
      return res.status(404).json({ error: "Produto não encontrado" });
    }

    res.json({ success: true });
  } catch (err) {
    console.error("Erro ao atualizar fornecedor:", err);
    res.status(500).json({ error: "Erro ao atualizar fornecedor" });
  } finally {
    if (pool) await pool.close();
  }
});




// ------------------- LOGIN EMPREGADO (por nome + password) -------------------
app.post('/login', async (req, res) => {
  const { nome, password } = req.body;

  if (!nome || !password) {
    return res.status(400).json({ error: 'Campos obrigatórios em falta.' });
  }

  if (shouldUseDevMockData()) {
    const user = devMockEmpregados.find((empregado) =>
      empregado.nome === nome && empregado.password === password
    );

    if (!user) {
      return res.status(401).json({ error: 'Credenciais inválidas.' });
    }

    if (user.bloqueado === 1) {
      return res.status(403).json({ error: 'Utilizador bloqueado.' });
    }

    const { password: _password, ...publicUser } = user;
    return res.json({ success: true, user: publicUser });
  }

  try {
    const dbConfig = await getDbConfig();
    const pool = await sql.connect(dbConfig);

    const result = await pool.request()
      .input('nome', sql.VarChar, nome)
      .input('password', sql.VarChar, password)
      .query(`
        SELECT id, codigo, nome, bloqueado, gestaocaixa, frontoffice, email, telefone
        FROM empregados
        WHERE nome = @nome AND password = @password
      `);

    await pool.close();

    if (result.recordset.length === 0)
      return res.status(401).json({ error: 'Credenciais inválidas.' });

    const user = result.recordset[0];

    if (user.bloqueado === 1)
      return res.status(403).json({ error: 'Utilizador bloqueado.' });

    res.json({ success: true, user });
  } catch (err) {
    console.error('Erro ao autenticar:', err);
    res.status(500).json({ error: 'Erro interno ao autenticar.' });
  }
});


// ------------------- GET Lista de Empregados (para dropdown) -------------------
app.get('/empregados', async (req, res) => {
  if (shouldUseDevMockData()) {
    return res.json(
      devMockEmpregados.map(({ password: _password, ...empregado }) => empregado)
    );
  }

  try {
    const dbConfig = await getDbConfig();
    const pool = await sql.connect(dbConfig);

    const result = await pool.request().query(`
  SELECT codigo, nome
  FROM empregados
  WHERE bloqueado = 0
  ORDER BY nome
`);


    await pool.close();
    res.json(result.recordset);
  } catch (err) {
    console.error('Erro ao obter empregados:', err);
    res.status(500).json({ error: 'Erro ao obter empregados' });
  }
});








// ------------------- Iniciar Servidor -------------------
async function iniciarAPI() {
  const PORT = Number(process.env.PORT || process.env.BACKEND_PORT || 3051);

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`API a correr na porta ${PORT}`);
  });

  if (MODO_INSTALACAO) {
    console.log("🛠 MODO INSTALAÇÃO ativo");

    console.log("🔧 A verificar se é primeira instalação...");
    await autoConfigurarLojaNoArranque();
  } else if (DEV_LOCAL_BYPASS_LICENSE) {
    ativarModoDevLocal();
    return;
  } else {
    console.log("🔒 MODO PRODUÇÃO — auto-setup desligado");
  }

  await validarLicenca();

  if (!LICENCA_OK) {
    console.log("🔄 Licença inválida — a verificar de 5 em 5 minutos...");
    intervaloLicenca = setInterval(async () => {
      await validarLicenca();

      if (LICENCA_OK) {
        clearInterval(intervaloLicenca);
        intervaloLicenca = null;
        console.log("⏹ Licença ativada. Parado check automático.");
      }
    }, LICENCA_CHECK_INTERVAL_MS);
  } else {
    console.log("👍 Licença válida — sem verificações repetidas.");
  }
}



iniciarAPI();



