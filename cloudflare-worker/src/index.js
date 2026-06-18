function jsonResponse(data, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      ...extraHeaders,
    },
  });
}

function getKvNamespace(env) {
  // Compatibilidade:
  // - worker novo: LOJAS_DB
  // - worker atual em producao: CONFIG
  return env.LOJAS_DB || env.CONFIG || null;
}

function normalizeStoreId(storeId) {
  return String(storeId || "").trim();
}

function nowIso() {
  return new Date().toISOString();
}

function buildCorsHeaders(request, env) {
  const allowOrigin = env.ALLOW_ORIGIN || request.headers.get("origin") || "*";
  return {
    "access-control-allow-origin": allowOrigin,
    "access-control-allow-methods": "GET,POST,PUT,PATCH,DELETE,OPTIONS",
    "access-control-allow-headers": "Accept, Content-Type, X-App-Key",
    vary: "Origin",
  };
}

function getClienteTunnelUrl(cliente) {
  const tunnel = cliente?.tunnel && typeof cliente.tunnel === "object" ?cliente.tunnel : null;
  return String(
    tunnel?.url ||
    tunnel?.tunnel_url ||
    (tunnel?.hostname ?`https://${tunnel.hostname}` : "") ||
    (tunnel?.tunnel_hostname ?`https://${tunnel.tunnel_hostname}` : "") ||
    ""
  ).trim();
}

function getPublicStoreUrl(store, cliente = null) {
  const clienteUrl = getClienteTunnelUrl(cliente);
  const storeUrl = String(store?.url || "").trim();
  const storeUrlIsLocal =
    /^https?:\/\/(127\.0\.0\.1|localhost)(?::\d+)?(?:\/|$)/i.test(storeUrl);

  return String(
    clienteUrl ||
    store?.public_url ||
    store?.publicUrl ||
    store?.tunnel_url ||
    (storeUrlIsLocal ?"" : storeUrl) ||
    ""
  ).trim();
}

function toPublicStore(storeId, store, cliente = null) {
  if (!store || typeof store !== "object") return null;

  return {
    id: storeId,
    nome: String(store.nome || storeId),
    url: getPublicStoreUrl(store, cliente) || null,
  };
}

function getProxyTokenFromPath(pathname) {
  const match = pathname.match(/^\/api[-_]proxy\/([^/]+)(?:\/|$)/);
  if (!match) return "";
  try {
    return decodeURIComponent(match[1]);
  } catch {
    return "";
  }
}

function getProxyPath(pathname) {
  return pathname.replace(/^\/api[-_]proxy\/[^/]+/, "") || "/";
}

function buildProxyHeaders(request) {
  const headers = new Headers(request.headers);
  headers.delete("host");
  headers.delete("origin");
  headers.delete("referer");
  headers.delete("cf-connecting-ip");
  headers.delete("cf-ipcountry");
  headers.delete("cf-ray");
  headers.delete("cf-visitor");
  headers.delete("x-forwarded-proto");
  headers.delete("x-real-ip");
  return headers;
}

function copyProxyResponseHeaders(response, corsHeaders) {
  const headers = new Headers(response.headers);
  headers.delete("access-control-allow-origin");
  headers.delete("access-control-allow-methods");
  headers.delete("access-control-allow-headers");
  headers.delete("access-control-allow-credentials");
  headers.delete("content-encoding");
  headers.delete("content-length");

  for (const [key, value] of Object.entries(corsHeaders)) {
    headers.set(key, value);
  }

  return headers;
}

async function fetchProxyJson(storeUrl, path, request, url) {
  const targetUrl = new URL(`${storeUrl}${path}`);
  targetUrl.search = url.search;

  const response = await fetch(targetUrl.toString(), {
    method: "GET",
    headers: buildProxyHeaders(request),
    redirect: "manual",
  });

  const text = await response.text();
  let payload = null;
  try {
    payload = text ?JSON.parse(text) : null;
  } catch {
    payload = null;
  }

  if (!response.ok || !payload) {
    throw new Error(`Falha ao carregar ${path}: ${response.status}`);
  }

  return payload;
}

async function bootstrapProxyResponse(storeUrl, request, url, corsHeaders) {
  const [fornecedores, familias, subfamilias, tiposDocumento] = await Promise.all([
    fetchProxyJson(storeUrl, "/fornecedores", request, url),
    fetchProxyJson(storeUrl, "/familias", request, url),
    fetchProxyJson(storeUrl, "/subfamilias", request, url),
    fetchProxyJson(storeUrl, "/tiposdocumento", request, url),
  ]);

  return jsonResponse(
    {
      fornecedores,
      familias,
      subfamilias,
      tiposDocumento,
    },
    200,
    corsHeaders
  );
}

async function hashToken(value) {
  const bytes = new TextEncoder().encode(String(value || ""));
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return new Uint8Array(digest);
}

async function tokensMatch(provided, expected) {
  const providedToken = String(provided || "").trim();
  const expectedToken = String(expected || "").trim();
  if (!providedToken || !expectedToken) return false;

  const [providedHash, expectedHash] = await Promise.all([
    hashToken(providedToken),
    hashToken(expectedToken),
  ]);

  let diff = providedHash.length ^ expectedHash.length;
  const length = Math.max(providedHash.length, expectedHash.length);
  for (let i = 0; i < length; i++) {
    diff |= (providedHash[i] || 0) ^ (expectedHash[i] || 0);
  }

  return diff === 0;
}

async function findStoreByToken(lojas, token) {
  for (const [storeId, store] of Object.entries(lojas || {})) {
    if (!store || typeof store !== "object") continue;
    const expectedToken = store.token || store.store_token || store.token_loja || "";
    if (await tokensMatch(token, expectedToken)) {
      return { storeId, store };
    }
  }

  return { storeId: null, store: null };
}

async function resolveStoreByDirectToken(kv, token) {
  const providedToken = String(token || "").trim();
  if (!kv || !providedToken) return { storeId: null, store: null, cliente: null };

  const cached = getStoreResolveCache(providedToken);
  if (cached) return cached;

  const clienteEntries = await readPrefixMap(kv, "cliente:");
  for (const [clienteKeyId, cliente] of Object.entries(clienteEntries || {})) {
    if (!cliente || typeof cliente !== "object") continue;

    const clienteId = normalizeStoreId(cliente.id || cliente.cliente_id || cliente.loja_id || clienteKeyId);
    const store = getClienteStore(clienteId, cliente);
    const acceptedTokens = [
      store?.token,
      store?.store_token,
      store?.token_loja,
      cliente.store_token,
      cliente.token,
      cliente.token_loja,
    ];
    const accepted = acceptedTokens.some((value) => String(value || "").trim() === providedToken);
    if (accepted && store) {
      return setStoreResolveCache(providedToken, { storeId: clienteId, store, cliente });
    }
  }

  const storeId = normalizeStoreId(providedToken);
  const legacyConfig = await readLegacyConfigFromKv(kv);
  const store = await readStoreDirect(kv, legacyConfig, storeId);
  if (store) {
    const expectedToken = store.token || store.store_token || store.token_loja || "";
    if (String(expectedToken || "").trim() === providedToken) {
      return setStoreResolveCache(providedToken, { storeId, store, cliente: null });
    }
  }

  return { storeId: null, store: null, cliente: null };
}

function normalizeEstado(value) {
  return String(value || "").trim().toLowerCase();
}

function isBlockedEstado(value) {
  return [
    "inativo",
    "inativa",
    "bloqueado",
    "bloqueada",
    "suspenso",
    "suspensa",
    "desativado",
    "desativada",
  ].includes(normalizeEstado(value));
}

function isClienteAccessBlocked(cliente) {
  if (!cliente || typeof cliente !== "object") return false;
  const licenca = cliente.licenca && typeof cliente.licenca === "object" ?cliente.licenca : null;
  return isBlockedEstado(cliente.estado) || isBlockedEstado(licenca?.estado);
}

function clienteBlockedResponse(cliente, corsHeaders) {
  return jsonResponse(
    {
      success: false,
      error: "Conta inativa ou bloqueada",
      estado: cliente?.estado || cliente?.licenca?.estado || null,
    },
    403,
    corsHeaders
  );
}

function isAuthorized(request, env) {
  const expected = (env.APP_KEY || "").trim();
  if (!expected) return false;

  const provided = (request.headers.get("x-app-key") || "").trim();
  return provided === expected;
}

async function readJson(kv, key) {
  const raw = await kv.get(key);
  if (!raw) return null;

  try {
    return JSON.parse(String(raw).replace(/^\uFEFF/, ""));
  } catch {
    return null;
  }
}

async function writeJson(kv, key, value) {
  await kv.put(key, JSON.stringify(value, null, 2));
}

const CONFIG_CACHE_TTL_MS = 30 * 1000;
let cachedLegacyConfig = null;
let cachedLegacyConfigAt = 0;

const ACTIVE_STORE_RESOLVE_CACHE_TTL_MS = 10 * 1000;
const BLOCKED_STORE_RESOLVE_CACHE_TTL_MS = 60 * 1000;
let storeResolveCache = new Map();
const HEARTBEAT_WRITE_INTERVAL_MS = 5 * 60 * 1000;

function cloneCacheValue(value) {
  if (!value || typeof value !== "object") return value;
  return JSON.parse(JSON.stringify(value));
}

function getStoreResolveCache(token) {
  const key = String(token || "").trim();
  if (!key) return null;

  const entry = storeResolveCache.get(key);
  if (!entry) return null;
  const ttlMs = Number(entry.ttlMs || ACTIVE_STORE_RESOLVE_CACHE_TTL_MS);
  if (Date.now() - entry.cachedAt > ttlMs) {
    storeResolveCache.delete(key);
    return null;
  }

  return cloneCacheValue(entry.value);
}

function setStoreResolveCache(token, value) {
  const key = String(token || "").trim();
  if (!key || !value?.storeId || !value?.store) return value;

  storeResolveCache.set(key, {
    cachedAt: Date.now(),
    ttlMs: isClienteAccessBlocked(value?.cliente)
      ?BLOCKED_STORE_RESOLVE_CACHE_TTL_MS
      : ACTIVE_STORE_RESOLVE_CACHE_TTL_MS,
    value: cloneCacheValue(value),
  });

  if (storeResolveCache.size > 200) {
    const oldestKey = storeResolveCache.keys().next().value;
    if (oldestKey) storeResolveCache.delete(oldestKey);
  }

  return value;
}

function clearStoreResolveCache() {
  storeResolveCache = new Map();
}

function shouldWriteHeartbeat(installation) {
  const rawLastSeen = installation?.last_seen_at || installation?.updated_at || "";
  if (!rawLastSeen) return true;

  const lastSeenAt = new Date(rawLastSeen);
  if (Number.isNaN(lastSeenAt.getTime())) return true;

  return Date.now() - lastSeenAt.getTime() >= HEARTBEAT_WRITE_INTERVAL_MS;
}

function clearLegacyConfigCache() {
  cachedLegacyConfig = null;
  cachedLegacyConfigAt = 0;
  clearStoreResolveCache();
}

async function readLegacyConfigFromKv(kv, { bypassCache = false } = {}) {
  const now = Date.now();
  if (
    !bypassCache &&
    cachedLegacyConfig &&
    now - cachedLegacyConfigAt < CONFIG_CACHE_TTL_MS
  ) {
    return cachedLegacyConfig;
  }

  const legacyConfig = (await readJson(kv, "config")) || {};
  cachedLegacyConfig = legacyConfig;
  cachedLegacyConfigAt = now;
  return legacyConfig;
}

async function writeLegacyConfig(kv, legacyConfig) {
  const value = legacyConfig || {};
  await writeJson(kv, "config", value);
  cachedLegacyConfig = value;
  cachedLegacyConfigAt = Date.now();
}

async function listAllKeysByPrefix(kv, prefix) {
  const allKeys = [];
  let cursor = undefined;

  while (true) {
    const page = await kv.list({ prefix, cursor, limit: 1000 });
    for (const entry of page.keys || []) {
      allKeys.push(entry.name);
    }

    if (page.list_complete || !page.cursor) break;
    cursor = page.cursor;
  }

  return allKeys;
}

async function readPrefixMap(kv, prefix) {
  const keys = await listAllKeysByPrefix(kv, prefix);
  const map = {};

  for (const fullKey of keys) {
    const value = await readJson(kv, fullKey);
    if (!value || typeof value !== "object") continue;
    map[fullKey.slice(prefix.length)] = value;
  }

  return map;
}

function getClienteStore(clienteId, cliente) {
  const loja = cliente?.loja && typeof cliente.loja === "object" ?cliente.loja : {};
  const storeId = normalizeStoreId(loja.id || loja.loja_id || cliente?.loja_id || clienteId);
  if (!storeId) return null;

  return {
    ...loja,
    id: storeId,
    nome: loja.nome || cliente?.nome || storeId,
    url: loja.url || cliente?.url || "",
    server: loja.server || cliente?.server || null,
    database: loja.database || cliente?.database || null,
    instance: loja.instance || loja.db_instance || cliente?.instance || cliente?.db_instance || null,
    port: Number(loja.port || cliente?.port || 1433),
    token: loja.token || cliente?.token || cliente?.store_token || cliente?.activation_code || null,
    cliente_id: clienteId,
  };
}

function getClienteLicense(clienteId, cliente) {
  const licenca = cliente?.licenca && typeof cliente.licenca === "object" ?cliente.licenca : null;
  const hwid = String(licenca?.hwid || cliente?.hwid || "").trim();
  if (!hwid) return null;

  return {
    ...licenca,
    hwid,
    loja_id: licenca?.loja_id || licenca?.loja || cliente?.loja_id || clienteId,
    loja: licenca?.loja || licenca?.loja_id || cliente?.loja_id || clienteId,
    token: licenca?.token || cliente?.activation_code || null,
    estado: licenca?.estado || cliente?.estado || "ativa",
    instalacao_id: licenca?.instalacao_id || cliente?.instalacao?.id || null,
    cliente_id: clienteId,
  };
}

function mergeClientesIntoState(lojas, licencasByHwid, clientes = {}) {
  for (const [clienteIdRaw, cliente] of Object.entries(clientes || {})) {
    if (!cliente || typeof cliente !== "object") continue;
    const clienteId = normalizeStoreId(cliente.id || cliente.cliente_id || cliente.loja_id || clienteIdRaw);
    if (!clienteId) continue;

    const store = getClienteStore(clienteId, cliente);
    if (store) {
      lojas[store.id] = {
        ...(lojas[store.id] || {}),
        ...store,
      };
    }

    const license = getClienteLicense(clienteId, cliente);
    if (license?.hwid) {
      licencasByHwid[license.hwid] = {
        ...(licencasByHwid[license.hwid] || {}),
        ...license,
      };
    }
  }
}

function extractLicensesByHwidFromLegacy(legacyLicencas) {
  const byHwid = {};
  if (!legacyLicencas || typeof legacyLicencas !== "object") return byHwid;

  for (const lic of Object.values(legacyLicencas)) {
    if (!lic || typeof lic !== "object") continue;
    const hwid = String(lic.hwid || "").trim();
    if (!hwid) continue;
    byHwid[hwid] = {
      ...lic,
      hwid,
    };
  }

  return byHwid;
}

function buildNormalizedState(legacyConfig, lojasV2, licencasV2, instalacoesV2, tunnelsV2, clientesV2 = {}) {
  const lojas = {};

  if (legacyConfig?.lojas && typeof legacyConfig.lojas === "object") {
    for (const [legacyStoreId, legacyStore] of Object.entries(legacyConfig.lojas)) {
      if (!legacyStore || typeof legacyStore !== "object") continue;
      const storeId = normalizeStoreId(legacyStore.id || legacyStore.loja_id || legacyStore.nome || legacyStoreId);
      if (!storeId) continue;
      lojas[storeId] = {
        id: storeId,
        ...legacyStore,
      };
    }
  }

  for (const [storeIdRaw, storeValue] of Object.entries(lojasV2 || {})) {
    const storeId = normalizeStoreId(storeIdRaw || storeValue?.id || storeValue?.loja_id);
    if (!storeId) continue;
    lojas[storeId] = {
      ...(lojas[storeId] || {}),
      ...storeValue,
      id: storeId,
    };
  }

  const licencasByHwid = {
    ...extractLicensesByHwidFromLegacy(legacyConfig?.licencas),
  };

  for (const [hwidRaw, licValue] of Object.entries(licencasV2 || {})) {
    const hwid = String(licValue?.hwid || hwidRaw || "").trim();
    if (!hwid) continue;

    licencasByHwid[hwid] = {
      ...(licencasByHwid[hwid] || {}),
      ...licValue,
      hwid,
    };
  }

  mergeClientesIntoState(lojas, licencasByHwid, clientesV2);

  return {
    lojas,
    licencasByHwid,
    instalacoesById: instalacoesV2 || {},
    tunnelsByInstalacaoId: tunnelsV2 || {},
    clientesById: clientesV2 || {},
  };
}

function toLegacyConfig(normalized, originalLegacyConfig) {
  const legacy = originalLegacyConfig && typeof originalLegacyConfig === "object"
    ?{ ...originalLegacyConfig }
    : {};

  legacy.lojas = normalized.lojas || {};

  const licencasLegacy = {};
  let index = 1;
  for (const lic of Object.values(normalized.licencasByHwid || {})) {
    if (!lic || typeof lic !== "object") continue;
    const key = lic._legacy_key || `lic_${index++}`;
    licencasLegacy[key] = {
      hwid: lic.hwid,
      loja: lic.loja || lic.loja_id || null,
      loja_id: lic.loja_id || lic.loja || null,
      token: lic.token || null,
      estado: lic.estado || "ativa",
      ativada_em: lic.ativada_em || null,
    };
  }

  legacy.licencas = licencasLegacy;
  return legacy;
}

async function loadState(env, { bypassCache = false } = {}) {
  const kv = getKvNamespace(env);
  if (!kv) {
    throw new Error("KV namespace não configurado (LOJAS_DB/CONFIG)");
  }

  const legacyConfig = await readLegacyConfigFromKv(kv, { bypassCache });
  const lojasV2 = await readPrefixMap(kv, "loja:");
  const licencasV2 = await readPrefixMap(kv, "licenca:");
  const instalacoesV2 = await readPrefixMap(kv, "instalacao:");
  const tunnelsV2 = await readPrefixMap(kv, "tunnel:");
  const clientesV2 = await readPrefixMap(kv, "cliente:");

  return {
    legacyConfig,
    normalized: buildNormalizedState(
      legacyConfig,
      lojasV2,
      licencasV2,
      instalacoesV2,
      tunnelsV2,
      clientesV2
    ),
  };
}

function findStoreByGuessedUrl(lojas, guessedUrl, host) {
  const guessed = String(guessedUrl || "").toLowerCase();
  const hostLower = String(host || "").toLowerCase();

  for (const [storeId, store] of Object.entries(lojas || {})) {
    const storeUrl = String(store?.url || "").toLowerCase();
    if (!storeUrl) continue;

    if (guessed && storeUrl === guessed) {
      return { storeId, store };
    }

    if (hostLower && storeUrl.includes(hostLower)) {
      return { storeId, store };
    }
  }

  return { storeId: null, store: null };
}

async function persistLicenseAndInstallation(env, payload) {
  const kv = getKvNamespace(env);
  if (!kv) throw new Error("KV namespace não configurado");

  const {
    hwid,
    lojaId,
    activationCode,
    host,
    guessedUrl,
  } = payload;

  const installationId = `hwid-${hwid}`;
  const activatedAt = nowIso();
  const existingInstallation = await readJson(kv, `instalacao:${installationId}`);

  const installation = {
    ...(existingInstallation && typeof existingInstallation === "object"
      ?existingInstallation
      : {}),
    id: installationId,
    loja_id: lojaId,
    hwid,
    host: host || null,
    guessed_url: guessedUrl || null,
    estado: "ativo",
    created_at: existingInstallation?.created_at || activatedAt,
    updated_at: activatedAt,
    last_seen_at: activatedAt,
  };

  const license = {
    hwid,
    loja_id: lojaId,
    loja: lojaId,
    instalacao_id: installationId,
    estado: "ativa",
    token: activationCode || null,
    ativada_em: existingInstallation?.created_at || activatedAt,
    updated_at: activatedAt,
  };

  await writeJson(kv, `instalacao:${installationId}`, installation);
  await writeJson(kv, `licenca:${hwid}`, license);

  return { installation, license };
}

async function updateLegacyConfigLicense(env, oldLegacyConfig, normalizedState, license) {
  clearLegacyConfigCache();
}

function getActivationCode(rawBody) {
  return String(
    rawBody?.activation_code ||
    rawBody?.codigo_ativacao ||
    rawBody?.codigoAtivacao ||
    ""
  ).trim();
}

function getClienteActivationCode(cliente) {
  return String(
    cliente?.activation_code ||
    cliente?.codigo_ativacao ||
    cliente?.codigoAtivacao ||
    cliente?.code ||
    ""
  ).trim();
}

async function findClienteByActivationCode(kv, activationCode) {
  const code = String(activationCode || "").trim();
  if (!code) return { clienteId: null, cliente: null, key: null };

  const compactCode = code.toLowerCase().replace(/[^a-z0-9]+/g, "");
  const candidateIds = new Set(
    [
      normalizeStoreId(code),
      normalizeStoreId(compactCode),
      normalizeStoreId(compactCode.replace(/^edn/, "")),
    ].filter(Boolean)
  );

  const clienteMatch = compactCode.match(/cliente0*(\d+)$/);
  if (clienteMatch?.[1]) {
    candidateIds.add(`cliente${clienteMatch[1].padStart(3, "0")}`);
  }

  for (const clienteId of candidateIds) {
    const cliente = await readClienteDirect(kv, clienteId);
    if (!cliente || typeof cliente !== "object") continue;
    if (getClienteActivationCode(cliente) === code) {
      return {
        clienteId,
        cliente,
        key: `cliente:${clienteId}`,
      };
    }
  }

  const clienteEntries = await readPrefixMap(kv, "cliente:");
  for (const [clienteKeyId, cliente] of Object.entries(clienteEntries || {})) {
    if (!cliente || typeof cliente !== "object") continue;
    if (getClienteActivationCode(cliente) !== code) continue;

    const clienteId = normalizeStoreId(
      cliente.id ||
      cliente.cliente_id ||
      cliente.loja_id ||
      clienteKeyId
    );
    if (!clienteId) continue;

    return {
      clienteId,
      cliente,
      key: `cliente:${clienteId}`,
    };
  }

  return { clienteId: null, cliente: null, key: null };
}

async function readClienteDirect(kv, clienteId) {
  const normalizedClienteId = normalizeStoreId(clienteId);
  if (!normalizedClienteId) return null;
  return readJson(kv, `cliente:${normalizedClienteId}`);
}

async function handleClienteActivationDirect(env, kv, corsHeaders, params) {
  const {
    body,
    hwid,
    guessedUrl,
    host,
    activationCode,
    clienteId,
    currentCliente,
  } = params;
  const lojaId = normalizeStoreId(clienteId || currentCliente?.id || currentCliente?.loja_id);
  if (!lojaId || !currentCliente || typeof currentCliente !== "object") return null;

  const expectedActivationCode = String(
    currentCliente.activation_code ||
    currentCliente.codigo_ativacao ||
    currentCliente.code ||
    ""
  ).trim();
  if (expectedActivationCode && activationCode && expectedActivationCode !== activationCode) {
    return jsonResponse(
      { success: false, error: "Codigo de ativacao invalido para este cliente" },
      403,
      corsHeaders
    );
  }

  if (!isActivationCodeActive(currentCliente)) {
    return jsonResponse(
      { success: false, error: "Codigo de ativacao bloqueado" },
      403,
      corsHeaders
    );
  }

  if (isActivationCodeExpired(currentCliente)) {
    return jsonResponse(
      { success: false, error: "Codigo de ativacao expirado" },
      403,
      corsHeaders
    );
  }

  const maxUses = Number(currentCliente.max_uses || 0);
  const uses = Number(currentCliente.uses || 0);
  const currentStore = getClienteStore(lojaId, currentCliente) || {};
  const existingLicenseForCliente = getClienteLicense(lojaId, currentCliente);
  const isSameInstallation = existingLicenseForCliente?.hwid === hwid;

  if (!isSameInstallation && maxUses > 0 && uses >= maxUses) {
    return jsonResponse(
      { success: false, error: "Codigo de ativacao esgotado" },
      409,
      corsHeaders
    );
  }

  const storeSetup = getActivationStoreSetup(body, currentCliente, activationCode, guessedUrl);
  const now = nowIso();
  const installationId =
    currentCliente?.instalacao?.id ||
    existingLicenseForCliente?.instalacao_id ||
    `hwid-${hwid}`;
  const explicitStoreUrl = String(
    body?.url ||
    body?.api_url ||
    body?.apiUrl ||
    body?.base_url ||
    body?.baseUrl ||
    ""
  ).trim();
  const explicitPort = Number(
    body?.port ||
    body?.db_port ||
    body?.dbPort ||
    body?.sql_port ||
    body?.sqlPort ||
    0
  );
  const storePayload = {
    ...currentStore,
    ...(storeSetup || {}),
    id: lojaId,
    nome:
      storeSetup?.nome ||
      currentStore.nome ||
      currentCliente.nome ||
      lojaId,
    url: explicitStoreUrl || currentStore.url || storeSetup?.url || guessedUrl || null,
    server: storeSetup?.server || currentStore.server || null,
    instance: storeSetup?.instance || currentStore.instance || null,
    database: storeSetup?.database || currentStore.database || null,
    port: Number(explicitPort || currentStore.port || storeSetup?.port || 1433),
    token: storeSetup?.token || currentStore.token || activationCode || null,
  };
  const installationPayload = {
    id: installationId,
    loja_id: lojaId,
    hwid,
    host: host || null,
    guessed_url: guessedUrl || null,
    estado: "ativo",
    created_at: currentCliente?.instalacao?.created_at || now,
    last_seen_at: now,
  };
  const licensePayload = {
    hwid,
    loja_id: lojaId,
    loja: lojaId,
    instalacao_id: installationId,
    estado: "ativa",
    token: activationCode || null,
    ativada_em: currentCliente?.licenca?.ativada_em || now,
  };
  const activationRecordWithTunnel = await ensureTunnelForActivationSafe(
    env,
    kv,
    `cliente:${lojaId}`,
    {
      ...currentCliente,
      code: currentCliente.code || currentCliente.activation_code || activationCode || null,
      host,
    },
    lojaId,
    hwid
  );
  const tunnelSource =
    activationRecordWithTunnel?.tunnel_token ||
    activationRecordWithTunnel?.tunnelToken ||
    activationRecordWithTunnel?.cloudflare_tunnel_token ||
    activationRecordWithTunnel?.tunnel_url ||
    activationRecordWithTunnel?.reused
      ?activationRecordWithTunnel
      : currentCliente?.tunnel || activationRecordWithTunnel;
  const tunnelPayload = toInstallerTunnel(tunnelSource, storePayload);
  const hasTunnelPayload = Boolean(
    tunnelPayload?.url ||
    tunnelPayload?.hostname ||
    tunnelPayload?.token
  );

  const updatedCliente = await writeClienteInstallRecord(kv, lojaId, currentCliente, {
    activationCode: activationCode || null,
    store: storePayload,
    installation: installationPayload,
    license: licensePayload,
    tunnel: hasTunnelPayload ?tunnelPayload : null,
  });
  const updatedClienteWithUsage = {
    ...updatedCliente,
    uses: isSameInstallation ?uses : uses + 1,
    last_hwid: hwid,
    updated_at: now,
  };
  await writeJson(kv, `cliente:${lojaId}`, updatedClienteWithUsage);
  clearLegacyConfigCache();

  return jsonResponse(
    {
      success: true,
      schema: "cliente-v1",
      already_active: isSameInstallation,
      license: licensePayload,
      installation: installationPayload,
      loja: toInstallerStore(lojaId, storePayload),
      tunnel: hasTunnelPayload ?tunnelPayload : toInstallerTunnel(null, storePayload),
    },
    200,
    corsHeaders
  );
}

async function writeClienteInstallRecord(kv, clienteId, currentCliente, payload) {
  const now = nowIso();
  const loja = {
    ...(currentCliente?.loja && typeof currentCliente.loja === "object" ?currentCliente.loja : {}),
    ...payload.store,
    id: payload.store.id || clienteId,
    nome: payload.store.nome || currentCliente?.nome || payload.store.id || clienteId,
    updated_at: now,
  };

  const installation = {
    ...(currentCliente?.instalacao && typeof currentCliente.instalacao === "object" ?currentCliente.instalacao : {}),
    ...payload.installation,
    updated_at: now,
  };

  const license = {
    ...(currentCliente?.licenca && typeof currentCliente.licenca === "object" ?currentCliente.licenca : {}),
    ...payload.license,
    updated_at: now,
  };

  const tunnel = payload.tunnel
    ?{
        ...(currentCliente?.tunnel && typeof currentCliente.tunnel === "object" ?currentCliente.tunnel : {}),
        ...payload.tunnel,
        updated_at: now,
      }
    : currentCliente?.tunnel || null;

  const cliente = {
    ...(currentCliente && typeof currentCliente === "object" ?currentCliente : {}),
    id: clienteId,
    nome: currentCliente?.nome || loja.nome || clienteId,
    estado: "ativo",
    activation_code: currentCliente?.activation_code || payload.activationCode || null,
    loja,
    licenca: license,
    instalacao: installation,
    updated_at: now,
    created_at: currentCliente?.created_at || now,
  };

  if (tunnel) {
    cliente.tunnel = tunnel;
  }

  await writeJson(kv, `cliente:${clienteId}`, cliente);
  return cliente;
}

function toInstallerStore(storeId, store) {
  if (!store || typeof store !== "object") return null;

  return {
    id: storeId,
    nome: String(store.nome || storeId),
    url: store.url || null,
    server: store.server || null,
    instance: store.instance || store.db_instance || null,
    database: store.database || null,
    port: Number(store.port || 1433),
    token: store.token || null,
  };
}

function getActivationStoreSetup(body, activationRecord, activationCode, guessedUrl) {
  const rawName = String(
    body?.store_name ||
    body?.storeName ||
    body?.loja_nome ||
    body?.nome_loja ||
    body?.nome ||
    activationRecord?.loja_nome ||
    activationRecord?.nome_loja ||
    ""
  ).trim();
  const rawId = String(
    activationRecord?.loja_id ||
    activationRecord?.loja?.id ||
    (typeof activationRecord?.loja === "string" ?activationRecord.loja : "") ||
    activationRecord?.store_id ||
    body?.loja_id ||
    body?.loja?.id ||
    (typeof body?.loja === "string" ?body.loja : "") ||
    body?.store_id ||
    rawName ||
    activationCode ||
    ""
  ).trim();
  const storeId = normalizeStoreId(rawId);
  if (!storeId) return null;

  const server = String(
    body?.db_server ||
    body?.dbServer ||
    body?.sql_server ||
    body?.server ||
    activationRecord?.db_server ||
    activationRecord?.server ||
    ""
  ).trim();
  const database = String(
    body?.db_database ||
    body?.dbDatabase ||
    body?.database ||
    activationRecord?.db_database ||
    activationRecord?.database ||
    ""
  ).trim();
  const instance = String(
    body?.db_instance ||
    body?.dbInstance ||
    body?.sql_instance ||
    body?.instance ||
    activationRecord?.db_instance ||
    activationRecord?.instance ||
    ""
  ).trim();
  const rawPort = body?.db_port || body?.dbPort || body?.port || activationRecord?.db_port || activationRecord?.port;
  const port = Number(rawPort || 1433) || 1433;
  const token = String(
    body?.store_token ||
    body?.token_loja ||
    activationRecord?.store_token ||
    activationRecord?.token ||
    activationCode ||
    ""
  ).trim();

  return {
    id: storeId,
    nome: rawName || activationRecord?.nome || storeId,
    url: String(body?.url || activationRecord?.url || guessedUrl || "").trim() || null,
    server: server || null,
    instance: instance || null,
    database: database || null,
    port,
    token: token || null,
  };
}

function getLegacyOnlyState(legacyConfig) {
  return buildNormalizedState(legacyConfig || {}, {}, {}, {}, {});
}

async function readStoreDirect(kv, legacyConfig, storeId) {
  const normalizedStoreId = normalizeStoreId(storeId);
  if (!normalizedStoreId) return null;

  const cliente = await readClienteDirect(kv, normalizedStoreId);
  const clienteStore = getClienteStore(normalizedStoreId, cliente);
  if (clienteStore) return clienteStore;

  const directStore = await readJson(kv, `loja:${normalizedStoreId}`);
  if (directStore && typeof directStore === "object") {
    return {
      id: normalizedStoreId,
      ...directStore,
    };
  }

  return getLegacyOnlyState(legacyConfig).lojas[normalizedStoreId] || null;
}

async function readLicenseDirect(kv, legacyConfig, hwid, storeId = "") {
  const normalizedHwid = String(hwid || "").trim();
  if (!normalizedHwid) return null;

  const normalizedStoreId = normalizeStoreId(storeId);
  if (normalizedStoreId) {
    const cliente = await readClienteDirect(kv, normalizedStoreId);
    const clienteLicense = getClienteLicense(normalizedStoreId, cliente);
    if (clienteLicense?.hwid === normalizedHwid) return clienteLicense;
  }

  const directLicense = await readJson(kv, `licenca:${normalizedHwid}`);
  if (directLicense && typeof directLicense === "object") {
    return {
      ...directLicense,
      hwid: directLicense.hwid || normalizedHwid,
    };
  }

  return getLegacyOnlyState(legacyConfig).licencasByHwid[normalizedHwid] || null;
}

async function readLicenseSnapshotDirect(kv, legacyConfig, hwid, requestedStoreId = "") {
  const license = await readLicenseDirect(kv, legacyConfig, hwid, requestedStoreId);
  const storeId = normalizeStoreId(license?.loja_id || license?.loja || requestedStoreId || "");
  const store = storeId ?await readStoreDirect(kv, legacyConfig, storeId) : null;

  return {
    license,
    storeId,
    store,
  };
}

async function upsertStoreFromActivationDirect(env, legacyConfig, storeSetup) {
  if (!storeSetup?.id) return null;

  const kv = getKvNamespace(env);
  if (!kv) throw new Error("KV namespace não configurado");

  const current = (await readStoreDirect(kv, legacyConfig, storeSetup.id)) || {};
  const now = nowIso();
  const store = {
    ...current,
    ...storeSetup,
    id: storeSetup.id,
    nome: storeSetup.nome || current.nome || storeSetup.id,
    url: storeSetup.url || current.url || "",
    server: storeSetup.server || current.server || null,
    instance: storeSetup.instance || current.instance || null,
    database: storeSetup.database || current.database || null,
    port: Number(storeSetup.port || current.port || 1433),
    token: storeSetup.token || current.token || null,
    created_at: current.created_at || now,
    updated_at: now,
  };

  await writeJson(kv, `loja:${store.id}`, store);
  return store;
}

async function updateStoreUrlFromTunnelDirect(env, legacyConfig, lojaId, activationRecord, fallbackStore = null) {
  const tunnelUrl = getTunnelUrlFromActivation(activationRecord);
  const kv = getKvNamespace(env);
  if (!kv) throw new Error("KV namespace não configurado");

  const currentStore =
    fallbackStore ||
    (await readStoreDirect(kv, legacyConfig, lojaId)) ||
    {};

  if (!tunnelUrl) {
    return Object.keys(currentStore).length > 0 ?currentStore : null;
  }

  const updatedStore = {
    ...currentStore,
    id: lojaId,
    nome: currentStore.nome || lojaId,
    url: tunnelUrl,
    updated_at: nowIso(),
  };

  await writeJson(kv, `loja:${lojaId}`, updatedStore);
  return updatedStore;
}

async function updateLegacyConfigDirect(env, legacyConfig, store = null, license = null) {
  clearLegacyConfigCache();
}

async function upsertStoreFromActivation(env, state, storeSetup) {
  if (!storeSetup?.id) return null;

  const kv = getKvNamespace(env);
  if (!kv) throw new Error("KV namespace não configurado");

  const current = state.normalized.lojas[storeSetup.id] || {};
  const now = nowIso();
  const store = {
    ...current,
    ...storeSetup,
    id: storeSetup.id,
    nome: storeSetup.nome || current.nome || storeSetup.id,
    url: storeSetup.url || current.url || "",
    server: storeSetup.server || current.server || null,
    database: storeSetup.database || current.database || null,
    port: Number(storeSetup.port || current.port || 1433),
    token: storeSetup.token || current.token || null,
    created_at: current.created_at || now,
    updated_at: now,
  };

  await writeJson(kv, `loja:${store.id}`, store);

  state.normalized.lojas = {
    ...state.normalized.lojas,
    [store.id]: store,
  };

  clearLegacyConfigCache();
  return store;
}

function toInstallerTunnel(activationRecord, store) {
  if (!activationRecord || typeof activationRecord !== "object") {
    return {
      id: null,
      name: null,
      url: store?.url || null,
      hostname: null,
      service: null,
      token: null,
    };
  }

  const token =
    activationRecord.tunnel_token ||
    activationRecord.tunnelToken ||
    activationRecord.cloudflare_tunnel_token ||
    activationRecord.token ||
    null;
  const looksLikeTunnelRecord = Boolean(
    activationRecord.tunnel_id ||
    activationRecord.tunnel_name ||
    activationRecord.tunnel_hostname ||
    activationRecord.tunnel_url ||
    activationRecord.tunnel_service ||
    activationRecord.hostname ||
    activationRecord.url ||
    activationRecord.service ||
    token
  );

  return {
    id:
      normalizeCloudflareTunnelId(activationRecord.tunnel_id) ||
      normalizeCloudflareTunnelId(activationRecord.id) ||
      getTunnelIdFromToken(token),
    name: activationRecord.tunnel_name || (looksLikeTunnelRecord ?activationRecord.name : null) || null,
    url: activationRecord.tunnel_url || activationRecord.url || store?.url || null,
    hostname: activationRecord.tunnel_hostname || activationRecord.hostname || null,
    service: activationRecord.tunnel_service || activationRecord.service || null,
    token,
    reused: activationRecord.reused === true || activationRecord.reuse_existing === true || activationRecord.reuseExisting === true,
  };
}

function getTunnelUrlFromActivation(activationRecord) {
  const rawUrl = String(
    activationRecord?.tunnel_url ||
    activationRecord?.url ||
    ""
  ).trim();
  if (rawUrl) return rawUrl;

  const hostname = String(
    activationRecord?.tunnel_hostname ||
    activationRecord?.hostname ||
    ""
  ).trim();
  return hostname ?`https://${hostname}` : "";
}

function getEnvValue(env, names) {
  for (const name of names) {
    const value = String(env[name] || "").trim();
    if (value) return value;
  }

  return "";
}

function slugify(value, fallback = "cliente") {
  const slug = String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

  return slug || fallback;
}

function shouldAutoCreateTunnel(activationRecord, env) {
  if (!activationRecord || typeof activationRecord !== "object") return false;
  if (activationRecord.auto_tunnel === true || activationRecord.autoTunnel === true) return true;
  return String(env.AUTO_CREATE_TUNNEL || "").toLowerCase() === "true" &&
    activationRecord.auto_tunnel !== false &&
    activationRecord.autoTunnel !== false;
}

function getActivationTunnelCodeSlug(activationRecord) {
  return slugify(
    activationRecord?.code ||
    activationRecord?.codigo ||
    activationRecord?.activation_code ||
    activationRecord?.codigo_ativacao ||
    "auto",
    "auto"
  );
}

function buildTunnelCleanupPrefix(lojaId, activationRecord) {
  return `ednas-${slugify(lojaId, "loja")}-${getActivationTunnelCodeSlug(activationRecord)}-`;
}

function normalizeCloudflareTunnelId(value) {
  const id = String(value || "").trim();
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)
    ?id
    : null;
}

function getTunnelIdFromToken(token) {
  try {
    const raw = String(token || "").trim();
    if (!raw) return null;
    const decoded = JSON.parse(atob(raw));
    return String(decoded?.t || "").trim() || null;
  } catch {
    return null;
  }
}

async function cloudflareApi(env, method, path, body = null) {
  const apiToken = getEnvValue(env, [
    "CLOUDFLARE_API_TOKEN",
    "CF_API_TOKEN",
  ]);
  if (!apiToken) {
    throw new Error("CLOUDFLARE_API_TOKEN não configurado no Worker.");
  }

  const init = {
    method,
    headers: {
      "Authorization": `Bearer ${apiToken}`,
      "Accept": "application/json",
    },
  };

  if (body) {
    init.headers["Content-Type"] = "application/json";
    init.body = JSON.stringify(body);
  }

  const res = await fetch(`https://api.cloudflare.com/client/v4${path}`, init);
  const text = await res.text();
  let data = null;
  try {
    data = text ?JSON.parse(text) : null;
  } catch {
    data = null;
  }
  if (!res.ok || !data?.success) {
    const errors = Array.isArray(data?.errors)
      ?data.errors
          .map((err) => {
            const code = err?.code ?`CF${err.code}: ` : "";
            const pointer = err?.source?.pointer ?` (${err.source.pointer})` : "";
            return `${code}${err?.message || JSON.stringify(err)}${pointer}`;
          })
          .filter(Boolean)
      : [];
    const messages = Array.isArray(data?.messages)
      ?data.messages
          .map((msg) => msg?.message || JSON.stringify(msg))
          .filter(Boolean)
      : [];
    const detail = [...errors, ...messages].join(" | ");
    throw new Error(
      detail ||
      `Erro Cloudflare API ${method} ${path}: ${res.status} ${text || JSON.stringify(data || {})}`
    );
  }

  return data.result;
}

async function cleanupOldTunnelsForActivation(env, accountId, currentTunnelId, cleanupPrefix) {
  const prefix = String(cleanupPrefix || "").trim();
  if (!accountId || !currentTunnelId || prefix.length < 8) return;
  if (String(env.DISABLE_TUNNEL_CLEANUP || "").toLowerCase() === "true") return;

  try {
    const tunnels = await cloudflareApi(
      env,
      "GET",
      `/accounts/${accountId}/cfd_tunnel?per_page=100`
    );
    const items = Array.isArray(tunnels) ?tunnels : [];
    for (const tunnel of items) {
      const tunnelId = String(tunnel?.id || "").trim();
      const tunnelName = String(tunnel?.name || "").trim();
      if (!tunnelId || tunnelId === currentTunnelId) continue;
      if (!tunnelName.startsWith(prefix)) continue;

      try {
        await cloudflareApi(env, "DELETE", `/accounts/${accountId}/cfd_tunnel/${tunnelId}`);
      } catch (err) {
        console.warn("Falha ao apagar tunnel antigo:", tunnelName, err?.message || err);
      }
    }
  } catch (err) {
    console.warn("Falha ao listar tunnels antigos:", err?.message || err);
  }
}

async function cloudflareTunnelExists(env, accountId, tunnelId) {
  const id = normalizeCloudflareTunnelId(tunnelId);
  if (!accountId || !id) return false;

  try {
    await cloudflareApi(env, "GET", `/accounts/${accountId}/cfd_tunnel/${id}`);
    return true;
  } catch {
    return false;
  }
}

async function getCloudflareTunnelInfo(env, accountId, tunnelId) {
  const id = normalizeCloudflareTunnelId(tunnelId);
  if (!accountId || !id) return null;

  try {
    return await cloudflareApi(env, "GET", `/accounts/${accountId}/cfd_tunnel/${id}`);
  } catch {
    return null;
  }
}

async function getCloudflareTunnelToken(env, accountId, tunnelId, fallbackToken = "") {
  const id = normalizeCloudflareTunnelId(tunnelId);
  if (!accountId || !id) {
    throw new Error("Nao foi possivel identificar o tunnel para obter token.");
  }

  try {
    const tokenResult = await cloudflareApi(
      env,
      "GET",
      `/accounts/${accountId}/cfd_tunnel/${id}/token`
    );
    const freshToken =
      typeof tokenResult === "string"
        ?tokenResult
        : String(tokenResult?.token || "").trim();

    if (freshToken) return freshToken;
  } catch (err) {
    throw new Error(`Falha ao obter token fresco do tunnel ${id}: ${err?.message || err}`);
  }

  const fallback = String(fallbackToken || "").trim();
  if (fallback && getTunnelIdFromToken(fallback) === id) {
    return fallback;
  }

  throw new Error(`Cloudflare nao devolveu token valido para o tunnel ${id}.`);
}

function normalizeConnectorHostname(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .split(".")[0];
}

function tunnelStatusIsHealthy(tunnel) {
  const status = String(tunnel?.status || tunnel?.status_code || "").trim().toLowerCase();
  return status === "healthy" || status === "active";
}

async function getCloudflareTunnelConnections(env, accountId, tunnelId) {
  const id = normalizeCloudflareTunnelId(tunnelId);
  if (!accountId || !id) return [];

  try {
    const result = await cloudflareApi(
      env,
      "GET",
      `/accounts/${accountId}/cfd_tunnel/${id}/connections`
    );

    if (Array.isArray(result)) return result;
    if (Array.isArray(result?.connections)) return result.connections;
    return [];
  } catch (err) {
    console.warn("Falha ao listar connectors do tunnel:", id, err?.message || err);
    return [];
  }
}

function connectionMatchesHost(connection, host) {
  const expectedHost = normalizeConnectorHostname(host);
  if (!expectedHost) return false;

  const candidates = [
    connection?.hostname,
    connection?.host,
    connection?.client_hostname,
    connection?.clientHostname,
    connection?.machine_name,
    connection?.machineName,
    connection?.metadata?.hostname,
    connection?.metadata?.host,
  ];

  return candidates.some((candidate) => normalizeConnectorHostname(candidate) === expectedHost);
}

async function findReusableTunnelForHost(env, accountId, host, cleanupPrefix) {
  const expectedHost = normalizeConnectorHostname(host);
  if (!accountId || !expectedHost) return null;

  try {
    const tunnels = await cloudflareApi(
      env,
      "GET",
      `/accounts/${accountId}/cfd_tunnel?per_page=100`
    );
    const items = Array.isArray(tunnels) ?tunnels : [];

    for (const tunnel of items) {
      const tunnelId = normalizeCloudflareTunnelId(tunnel?.id);
      const tunnelName = String(tunnel?.name || "").trim();
      if (!tunnelId || tunnel?.deleted_at) continue;
      if (cleanupPrefix && tunnelName.startsWith(cleanupPrefix)) continue;
      if (!tunnelStatusIsHealthy(tunnel)) continue;

      const connections = await getCloudflareTunnelConnections(env, accountId, tunnelId);
      if (connections.some((connection) => connectionMatchesHost(connection, expectedHost))) {
        return {
          id: tunnelId,
          name: tunnelName,
        };
      }
    }
  } catch (err) {
    console.warn("Falha ao procurar tunnel existente da maquina:", err?.message || err);
  }

  return null;
}

async function listCloudflareTunnels(env, accountId) {
  if (!accountId) return [];

  const tunnels = await cloudflareApi(
    env,
    "GET",
    `/accounts/${accountId}/cfd_tunnel?per_page=100`
  );
  return Array.isArray(tunnels) ?tunnels : [];
}

async function findTunnelByExactName(env, accountId, name) {
  const expectedName = String(name || "").trim();
  if (!accountId || !expectedName) return null;

  try {
    const tunnels = await listCloudflareTunnels(env, accountId);
    return tunnels.find((tunnel) => {
      const tunnelId = normalizeCloudflareTunnelId(tunnel?.id);
      const tunnelName = String(tunnel?.name || "").trim();
      return tunnelId && !tunnel?.deleted_at && tunnelName === expectedName;
    }) || null;
  } catch (err) {
    console.warn("Falha ao procurar tunnel por nome:", expectedName, err?.message || err);
    return null;
  }
}

async function ensureTunnelDnsRecord(env, zoneId, hostname, tunnelId) {
  const encodedHostname = encodeURIComponent(hostname);
  const existingRecords = await cloudflareApi(
    env,
    "GET",
    `/zones/${zoneId}/dns_records?type=CNAME&name=${encodedHostname}`
  );
  const dnsBody = {
    type: "CNAME",
    name: hostname,
    content: `${tunnelId}.cfargotunnel.com`,
    proxied: true,
    ttl: 1,
  };

  if (Array.isArray(existingRecords) && existingRecords.length > 0) {
    await cloudflareApi(
      env,
      "PUT",
      `/zones/${zoneId}/dns_records/${existingRecords[0].id}`,
      dnsBody
    );
  } else {
    await cloudflareApi(env, "POST", `/zones/${zoneId}/dns_records`, dnsBody);
  }
}

function mergeTunnelIngress(existingConfig, hostname, service) {
  const currentConfig =
    existingConfig?.config && typeof existingConfig.config === "object"
      ?existingConfig.config
      : {};
  const currentIngress = Array.isArray(currentConfig.ingress)
    ?currentConfig.ingress
    : [];

  const appRule = {
    hostname,
    service,
    originRequest: {},
  };

  const fallbackRules = currentIngress.filter(
    (rule) => String(rule?.service || "").startsWith("http_status:")
  );
  const normalRules = currentIngress.filter((rule) => {
    if (String(rule?.service || "").startsWith("http_status:")) return false;
    return String(rule?.hostname || "").toLowerCase() !== hostname.toLowerCase();
  });

  const fallback = fallbackRules[0] || { service: "http_status:404" };

  return {
    config: {
      ...currentConfig,
      ingress: [appRule, ...normalRules, fallback],
    },
  };
}

async function addHostnameRouteToExistingTunnel(env, accountId, zoneId, tunnelId, hostname, service) {
  const existingConfig = await cloudflareApi(
    env,
    "GET",
    `/accounts/${accountId}/cfd_tunnel/${tunnelId}/configurations`
  );
  const mergedConfig = mergeTunnelIngress(existingConfig, hostname, service);

  await cloudflareApi(
    env,
    "PUT",
    `/accounts/${accountId}/cfd_tunnel/${tunnelId}/configurations`,
    mergedConfig
  );

  await ensureTunnelDnsRecord(env, zoneId, hostname, tunnelId);
}

function buildTunnelHostname(env, activationRecord, lojaId, hwid) {
  const explicitHostname = String(
    activationRecord?.tunnel_hostname ||
    activationRecord?.hostname ||
    ""
  ).trim();
  if (explicitHostname) return explicitHostname;

  const domain = getEnvValue(env, [
    "TUNNEL_DOMAIN",
    "CF_TUNNEL_DOMAIN",
  ]);
  if (!domain) {
    throw new Error("TUNNEL_DOMAIN não configurado no Worker.");
  }

  const codeSlug = slugify(
    activationRecord?.code ||
    activationRecord?.codigo ||
    activationRecord?.activation_code ||
    activationRecord?.codigo_ativacao ||
    "",
    ""
  );
  const lojaSlug = slugify(lojaId, "loja");
  const hwidSlug = slugify(String(hwid || "").slice(0, 12), "pc");
  const prefix = codeSlug ?`${lojaSlug}-${codeSlug}` : `${lojaSlug}-${hwidSlug}`;

  return `${prefix}.${domain.replace(/^\.+/, "")}`;
}

async function ensureTunnelForActivation(env, kv, activationKey, activationRecord, lojaId, hwid) {
  const accountId = getEnvValue(env, [
    "CLOUDFLARE_ACCOUNT_ID",
    "CF_ACCOUNT_ID",
  ]);
  const zoneId = getEnvValue(env, [
    "CLOUDFLARE_ZONE_ID",
    "CF_ZONE_ID",
  ]);
  if (!accountId) throw new Error("CLOUDFLARE_ACCOUNT_ID não configurado no Worker.");
  if (!zoneId) throw new Error("CLOUDFLARE_ZONE_ID não configurado no Worker.");

  const existingToken =
    activationRecord?.tunnel_token ||
    activationRecord?.tunnelToken ||
    activationRecord?.cloudflare_tunnel_token ||
    null;
  if (existingToken) {
    const existingTokenTunnelId =
      normalizeCloudflareTunnelId(activationRecord?.tunnel_id) ||
      getTunnelIdFromToken(existingToken);
    if (await cloudflareTunnelExists(env, accountId, existingTokenTunnelId)) {
      return activationRecord;
    }
  }
  if (!shouldAutoCreateTunnel(activationRecord, env)) return activationRecord;

  const embeddedTunnel = activationRecord?.tunnel;
  if (embeddedTunnel?.token) {
    const embeddedTunnelId =
      normalizeCloudflareTunnelId(embeddedTunnel.id) ||
      normalizeCloudflareTunnelId(embeddedTunnel.tunnel_id) ||
      getTunnelIdFromToken(embeddedTunnel.token);
    if (!(await cloudflareTunnelExists(env, accountId, embeddedTunnelId))) {
      if (activationKey && String(activationKey).startsWith("cliente:")) {
        const currentCliente = await readJson(kv, activationKey);
        if (currentCliente && typeof currentCliente === "object") {
          const { tunnel, ...withoutTunnel } = currentCliente;
          await writeJson(kv, activationKey, {
            ...withoutTunnel,
            updated_at: nowIso(),
          });
        }
      }
    } else {
    await cleanupOldTunnelsForActivation(
      env,
      accountId,
      embeddedTunnelId,
      buildTunnelCleanupPrefix(lojaId, activationRecord)
    );

    return {
      ...activationRecord,
      tunnel_id:
        normalizeCloudflareTunnelId(embeddedTunnel.id) ||
        normalizeCloudflareTunnelId(embeddedTunnel.tunnel_id) ||
        getTunnelIdFromToken(embeddedTunnel.token),
      tunnel_name: embeddedTunnel.name || embeddedTunnel.tunnel_name || null,
      tunnel_hostname: embeddedTunnel.hostname || embeddedTunnel.tunnel_hostname || null,
      tunnel_url: embeddedTunnel.url || embeddedTunnel.tunnel_url || null,
      tunnel_service: embeddedTunnel.service || embeddedTunnel.tunnel_service || null,
      tunnel_token: embeddedTunnel.token,
    };
    }
  }

  const tunnelKey = `tunnel:${hwid}`;
  const existingTunnel = await readJson(kv, tunnelKey);
  if (existingTunnel?.token) {
    const existingTunnelId =
      normalizeCloudflareTunnelId(existingTunnel.id) ||
      normalizeCloudflareTunnelId(existingTunnel.tunnel_id) ||
      getTunnelIdFromToken(existingTunnel.token);
    if (!(await cloudflareTunnelExists(env, accountId, existingTunnelId))) {
      await kv.delete(tunnelKey);
    } else {
    await cleanupOldTunnelsForActivation(
      env,
      accountId,
      existingTunnelId,
      buildTunnelCleanupPrefix(lojaId, activationRecord)
    );

    return {
      ...activationRecord,
      tunnel_id:
        normalizeCloudflareTunnelId(existingTunnel.id) ||
        normalizeCloudflareTunnelId(existingTunnel.tunnel_id) ||
        getTunnelIdFromToken(existingTunnel.token),
      tunnel_name: existingTunnel.name || existingTunnel.tunnel_name || null,
      tunnel_hostname: existingTunnel.hostname || existingTunnel.tunnel_hostname || null,
      tunnel_url: existingTunnel.url || existingTunnel.tunnel_url || null,
      tunnel_service: existingTunnel.service || existingTunnel.tunnel_service || null,
      tunnel_token: existingTunnel.token,
    };
    }
  }

  const unusedAccountId = getEnvValue(env, [
    "CLOUDFLARE_ACCOUNT_ID",
    "CF_ACCOUNT_ID",
  ]);
  const unusedZoneId = getEnvValue(env, [
    "CLOUDFLARE_ZONE_ID",
    "CF_ZONE_ID",
  ]);
  if (!accountId) throw new Error("CLOUDFLARE_ACCOUNT_ID não configurado no Worker.");
  if (!zoneId) throw new Error("CLOUDFLARE_ZONE_ID não configurado no Worker.");

  const hostname = buildTunnelHostname(env, activationRecord, lojaId, hwid);
  const service = String(
    activationRecord?.tunnel_service ||
    env.TUNNEL_SERVICE ||
    "http://localhost:3052"
  ).trim();
  const cleanupTunnelPrefix = buildTunnelCleanupPrefix(lojaId, activationRecord);
  const baseTunnelName = String(
    activationRecord?.tunnel_name ||
    `${cleanupTunnelPrefix}${slugify(String(hwid || "").slice(0, 8), "pc")}`
  ).trim();

  let tunnelName = baseTunnelName;
  let tunnel = null;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      tunnel = await cloudflareApi(env, "POST", `/accounts/${accountId}/cfd_tunnel`, {
        name: tunnelName,
        config_src: "cloudflare",
      });
      break;
    } catch (err) {
      const message = String(err?.message || "");
      const duplicatedName =
        message.includes("CF1013") ||
        message.toLowerCase().includes("already have a tunnel with this name");
      if (!duplicatedName || attempt > 0) {
        throw err;
      }

      tunnelName = `${baseTunnelName}-${Date.now().toString(36)}`;
    }
  }

  const tunnelId = String(tunnel?.id || "").trim();
  const tunnelToken = String(tunnel?.token || "").trim();
  if (!tunnelId || !tunnelToken) {
    throw new Error("A Cloudflare criou o tunnel, mas não devolveu id/token.");
  }

  await cloudflareApi(env, "PUT", `/accounts/${accountId}/cfd_tunnel/${tunnelId}/configurations`, {
    config: {
      ingress: [
        {
          hostname,
          service,
          originRequest: {},
        },
        {
          service: "http_status:404",
        },
      ],
    },
  });

  const encodedHostname = encodeURIComponent(hostname);
  const existingRecords = await cloudflareApi(
    env,
    "GET",
    `/zones/${zoneId}/dns_records?type=CNAME&name=${encodedHostname}`
  );
  const dnsBody = {
    type: "CNAME",
    name: hostname,
    content: `${tunnelId}.cfargotunnel.com`,
    proxied: true,
    ttl: 1,
  };

  if (Array.isArray(existingRecords) && existingRecords.length > 0) {
    await cloudflareApi(
      env,
      "PUT",
      `/zones/${zoneId}/dns_records/${existingRecords[0].id}`,
      dnsBody
    );
  } else {
    await cloudflareApi(env, "POST", `/zones/${zoneId}/dns_records`, dnsBody);
  }

  const tunnelRecord = {
    id: tunnelId,
    name: tunnelName,
    hostname,
    url: `https://${hostname}`,
    service,
    token: tunnelToken,
    loja_id: lojaId,
    hwid,
    activation_code:
      activationRecord?.code ||
      activationRecord?.codigo ||
      activationRecord?.activation_code ||
      activationRecord?.codigo_ativacao ||
      null,
    created_at: nowIso(),
    updated_at: nowIso(),
  };

  if (activationKey && String(activationKey).startsWith("cliente:")) {
    const currentCliente = await readJson(kv, activationKey);
    if (currentCliente && typeof currentCliente === "object") {
      await writeJson(kv, activationKey, {
        ...currentCliente,
        tunnel: {
          ...(currentCliente.tunnel && typeof currentCliente.tunnel === "object"
            ?currentCliente.tunnel
            : {}),
          ...tunnelRecord,
        },
        updated_at: nowIso(),
      });
    }
  } else {
    await writeJson(kv, tunnelKey, tunnelRecord);
  }

  if (activationKey && !String(activationKey).startsWith("cliente:")) {
    await writeJson(kv, activationKey, {
      ...activationRecord,
      last_tunnel_id: tunnelId,
      last_tunnel_hostname: hostname,
      updated_at: nowIso(),
    });
  }

  await cleanupOldTunnelsForActivation(env, accountId, tunnelId, cleanupTunnelPrefix);

  return {
    ...activationRecord,
    tunnel_id: tunnelRecord.id,
    tunnel_name: tunnelRecord.name,
    tunnel_hostname: tunnelRecord.hostname,
    tunnel_url: tunnelRecord.url,
    tunnel_service: tunnelRecord.service,
    tunnel_token: tunnelRecord.token,
  };
}

async function ensureTunnelForActivationSafe(env, kv, activationKey, activationRecord, lojaId, hwid) {
  const accountId = getEnvValue(env, [
    "CLOUDFLARE_ACCOUNT_ID",
    "CF_ACCOUNT_ID",
  ]);
  const zoneId = getEnvValue(env, [
    "CLOUDFLARE_ZONE_ID",
    "CF_ZONE_ID",
  ]);
  if (!accountId) throw new Error("CLOUDFLARE_ACCOUNT_ID nao configurado no Worker.");
  if (!zoneId) throw new Error("CLOUDFLARE_ZONE_ID nao configurado no Worker.");

  const cleanupTunnelPrefix = buildTunnelCleanupPrefix(lojaId, activationRecord);
  const tunnelKey = `tunnel:${hwid}`;

  async function reuseTunnelIfAlive(source) {
    if (!source?.token) return null;
    const explicitTunnelId =
      normalizeCloudflareTunnelId(source.id) ||
      normalizeCloudflareTunnelId(source.tunnel_id);
    const tokenTunnelId = getTunnelIdFromToken(source.token);
    const tunnelId = explicitTunnelId || tokenTunnelId;

    if (explicitTunnelId && tokenTunnelId && explicitTunnelId !== tokenTunnelId) {
      console.warn(
        "Tunnel guardado com id/token divergentes; a obter token fresco:",
        explicitTunnelId,
        tokenTunnelId
      );
    }

    const tunnelInfo = await getCloudflareTunnelInfo(env, accountId, tunnelId);
    if (!tunnelInfo || !tunnelStatusIsHealthy(tunnelInfo)) {
      return null;
    }

    const tunnelToken = await getCloudflareTunnelToken(env, accountId, tunnelId, source.token);
    await cleanupOldTunnelsForActivation(env, accountId, tunnelId, cleanupTunnelPrefix);
    return {
      ...activationRecord,
      tunnel_id: tunnelId,
      tunnel_name: source.name || source.tunnel_name || null,
      tunnel_hostname: source.hostname || source.tunnel_hostname || null,
      tunnel_url: source.url || source.tunnel_url || null,
      tunnel_service: source.service || source.tunnel_service || null,
      tunnel_token: tunnelToken,
    };
  }

  const existingToken =
    activationRecord?.tunnel_token ||
    activationRecord?.tunnelToken ||
    activationRecord?.cloudflare_tunnel_token ||
    null;
  const reusableDirectTunnel = await reuseTunnelIfAlive({
    id: activationRecord?.tunnel_id,
    name: activationRecord?.tunnel_name,
    hostname: activationRecord?.tunnel_hostname,
    url: activationRecord?.tunnel_url,
    service: activationRecord?.tunnel_service,
    token: existingToken,
  });
  if (reusableDirectTunnel) return reusableDirectTunnel;
  if (!shouldAutoCreateTunnel(activationRecord, env)) return activationRecord;

  const embeddedTunnel = activationRecord?.tunnel;
  const reusableEmbeddedTunnel = await reuseTunnelIfAlive(embeddedTunnel);
  if (reusableEmbeddedTunnel) return reusableEmbeddedTunnel;
  if (embeddedTunnel?.token && activationKey && String(activationKey).startsWith("cliente:")) {
    const currentCliente = await readJson(kv, activationKey);
    if (currentCliente && typeof currentCliente === "object") {
      const { tunnel, ...withoutTunnel } = currentCliente;
      await writeJson(kv, activationKey, {
        ...withoutTunnel,
        updated_at: nowIso(),
      });
    }
  }

  const existingTunnel = await readJson(kv, tunnelKey);
  const reusableLegacyTunnel = await reuseTunnelIfAlive(existingTunnel);
  if (reusableLegacyTunnel) return reusableLegacyTunnel;
  if (existingTunnel?.token) {
    await kv.delete(tunnelKey);
  }

  const hostname = buildTunnelHostname(env, activationRecord, lojaId, hwid);
  const service = String(
    activationRecord?.tunnel_service ||
    env.TUNNEL_SERVICE ||
    "http://localhost:3052"
  ).trim();
  const baseTunnelName = String(
    activationRecord?.tunnel_name ||
    `${cleanupTunnelPrefix}${slugify(String(hwid || "").slice(0, 8), "pc")}`
  ).trim();

  async function useExistingNamedTunnel(existingTunnel) {
    const tunnelId = normalizeCloudflareTunnelId(existingTunnel?.id);
    if (!tunnelId || existingTunnel?.deleted_at) return null;

    await addHostnameRouteToExistingTunnel(
      env,
      accountId,
      zoneId,
      tunnelId,
      hostname,
      service
    );
    const tunnelToken = await getCloudflareTunnelToken(
      env,
      accountId,
      tunnelId,
      null
    );
    const tunnelRecord = {
      id: tunnelId,
      name: String(existingTunnel?.name || baseTunnelName),
      hostname,
      url: `https://${hostname}`,
      service,
      token: tunnelToken,
      reused: true,
      reuse_existing: true,
      loja_id: lojaId,
      hwid,
      activation_code:
        activationRecord?.code ||
        activationRecord?.codigo ||
        activationRecord?.activation_code ||
        activationRecord?.codigo_ativacao ||
        null,
      created_at: nowIso(),
      updated_at: nowIso(),
    };

    if (activationKey && String(activationKey).startsWith("cliente:")) {
      const currentCliente = await readJson(kv, activationKey);
      if (currentCliente && typeof currentCliente === "object") {
        await writeJson(kv, activationKey, {
          ...currentCliente,
          tunnel: {
            ...(currentCliente.tunnel && typeof currentCliente.tunnel === "object"
              ?currentCliente.tunnel
              : {}),
            ...tunnelRecord,
          },
          updated_at: nowIso(),
        });
      }
    } else {
      await writeJson(kv, tunnelKey, tunnelRecord);
    }

    return {
      ...activationRecord,
      tunnel_id: tunnelRecord.id,
      tunnel_name: tunnelRecord.name,
      tunnel_hostname: tunnelRecord.hostname,
      tunnel_url: tunnelRecord.url,
      tunnel_service: tunnelRecord.service,
      tunnel_token: tunnelRecord.token,
      reused: true,
      reuse_existing: true,
    };
  }

  const existingNamedTunnel = await findTunnelByExactName(env, accountId, baseTunnelName);
  const reusableNamedTunnel = await useExistingNamedTunnel(existingNamedTunnel);
  if (reusableNamedTunnel) return reusableNamedTunnel;

  const reusableHostTunnel = await findReusableTunnelForHost(
    env,
    accountId,
    activationRecord?.host || activationRecord?.hostname || "",
    cleanupTunnelPrefix
  );
  if (reusableHostTunnel?.id) {
    await addHostnameRouteToExistingTunnel(
      env,
      accountId,
      zoneId,
      reusableHostTunnel.id,
      hostname,
      service
    );

    const tunnelRecord = {
      id: reusableHostTunnel.id,
      name: reusableHostTunnel.name || null,
      hostname,
      url: `https://${hostname}`,
      service,
      token: null,
      reused: true,
      reuse_existing: true,
      loja_id: lojaId,
      hwid,
      activation_code:
        activationRecord?.code ||
        activationRecord?.codigo ||
        activationRecord?.activation_code ||
        activationRecord?.codigo_ativacao ||
        null,
      created_at: nowIso(),
      updated_at: nowIso(),
    };

    if (activationKey && String(activationKey).startsWith("cliente:")) {
      const currentCliente = await readJson(kv, activationKey);
      if (currentCliente && typeof currentCliente === "object") {
        await writeJson(kv, activationKey, {
          ...currentCliente,
          tunnel: {
            ...(currentCliente.tunnel && typeof currentCliente.tunnel === "object"
              ?currentCliente.tunnel
              : {}),
            ...tunnelRecord,
          },
          updated_at: nowIso(),
        });
      }
    } else {
      await writeJson(kv, tunnelKey, tunnelRecord);
    }

    return {
      ...activationRecord,
      tunnel_id: tunnelRecord.id,
      tunnel_name: tunnelRecord.name,
      tunnel_hostname: tunnelRecord.hostname,
      tunnel_url: tunnelRecord.url,
      tunnel_service: tunnelRecord.service,
      tunnel_token: null,
      reused: true,
      reuse_existing: true,
    };
  }

  let tunnelName = baseTunnelName;
  let tunnel = null;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      tunnel = await cloudflareApi(env, "POST", `/accounts/${accountId}/cfd_tunnel`, {
        name: tunnelName,
        config_src: "cloudflare",
      });
      break;
    } catch (err) {
      const message = String(err?.message || "");
      const duplicatedName =
        message.includes("CF1013") ||
        message.toLowerCase().includes("already have a tunnel with this name");
      if (!duplicatedName || attempt > 0) {
        throw err;
      }

      const existingAfterDuplicate = await findTunnelByExactName(env, accountId, baseTunnelName);
      const reusableAfterDuplicate = await useExistingNamedTunnel(existingAfterDuplicate);
      if (reusableAfterDuplicate) return reusableAfterDuplicate;

      tunnelName = `${baseTunnelName}-${Date.now().toString(36)}`;
    }
  }

  const tunnelId = String(tunnel?.id || "").trim();
  const tunnelToken = await getCloudflareTunnelToken(
    env,
    accountId,
    tunnelId,
    tunnel?.token
  );
  if (!tunnelId || !tunnelToken) {
    throw new Error("A Cloudflare criou o tunnel, mas nao devolveu id/token.");
  }

  await cloudflareApi(env, "PUT", `/accounts/${accountId}/cfd_tunnel/${tunnelId}/configurations`, {
    config: {
      ingress: [
        {
          hostname,
          service,
          originRequest: {},
        },
        {
          service: "http_status:404",
        },
      ],
    },
  });

  const encodedHostname = encodeURIComponent(hostname);
  const existingRecords = await cloudflareApi(
    env,
    "GET",
    `/zones/${zoneId}/dns_records?type=CNAME&name=${encodedHostname}`
  );
  const dnsBody = {
    type: "CNAME",
    name: hostname,
    content: `${tunnelId}.cfargotunnel.com`,
    proxied: true,
    ttl: 1,
  };

  if (Array.isArray(existingRecords) && existingRecords.length > 0) {
    await cloudflareApi(
      env,
      "PUT",
      `/zones/${zoneId}/dns_records/${existingRecords[0].id}`,
      dnsBody
    );
  } else {
    await cloudflareApi(env, "POST", `/zones/${zoneId}/dns_records`, dnsBody);
  }

  const tunnelRecord = {
    id: tunnelId,
    name: tunnelName,
    hostname,
    url: `https://${hostname}`,
    service,
    token: tunnelToken,
    loja_id: lojaId,
    hwid,
    activation_code:
      activationRecord?.code ||
      activationRecord?.codigo ||
      activationRecord?.activation_code ||
      activationRecord?.codigo_ativacao ||
      null,
    created_at: nowIso(),
    updated_at: nowIso(),
  };

  if (activationKey && String(activationKey).startsWith("cliente:")) {
    const currentCliente = await readJson(kv, activationKey);
    if (currentCliente && typeof currentCliente === "object") {
      await writeJson(kv, activationKey, {
        ...currentCliente,
        tunnel: {
          ...(currentCliente.tunnel && typeof currentCliente.tunnel === "object"
            ?currentCliente.tunnel
            : {}),
          ...tunnelRecord,
        },
        updated_at: nowIso(),
      });
    }
  } else {
    await writeJson(kv, tunnelKey, tunnelRecord);
  }

  if (activationKey && !String(activationKey).startsWith("cliente:")) {
    await writeJson(kv, activationKey, {
      ...activationRecord,
      last_tunnel_id: tunnelId,
      last_tunnel_hostname: hostname,
      updated_at: nowIso(),
    });
  }

  await cleanupOldTunnelsForActivation(env, accountId, tunnelId, cleanupTunnelPrefix);

  return {
    ...activationRecord,
    tunnel_id: tunnelRecord.id,
    tunnel_name: tunnelRecord.name,
    tunnel_hostname: tunnelRecord.hostname,
    tunnel_url: tunnelRecord.url,
    tunnel_service: tunnelRecord.service,
    tunnel_token: tunnelRecord.token,
  };
}

async function updateStoreUrlFromTunnel(env, state, lojaId, activationRecord) {
  const tunnelUrl = getTunnelUrlFromActivation(activationRecord);
  if (!tunnelUrl) {
    return state.normalized.lojas[lojaId] || null;
  }

  const kv = getKvNamespace(env);
  if (!kv) throw new Error("KV namespace não configurado");

  const currentStore = state.normalized.lojas[lojaId] || {};
  const updatedStore = {
    ...currentStore,
    id: lojaId,
    nome: currentStore.nome || lojaId,
    url: tunnelUrl,
    updated_at: nowIso(),
  };

  await writeJson(kv, `loja:${lojaId}`, updatedStore);
  clearLegacyConfigCache();

  return updatedStore;
}

function isActivationCodeActive(activationRecord) {
  return !activationRecord.estado || activationRecord.estado === "ativo";
}

function isActivationCodeExpired(activationRecord, now = new Date()) {
  const rawExpiresAt = activationRecord.expires_at || activationRecord.expira_em || null;
  if (!rawExpiresAt) return false;

  const expiresAt = new Date(rawExpiresAt);
  if (Number.isNaN(expiresAt.getTime())) return false;
  return expiresAt < now;
}

export default {
  async fetch(request, env) {
    const corsHeaders = buildCorsHeaders(request, env);

    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: corsHeaders });
    }

    const url = new URL(request.url);
    const pathname = url.pathname;
    const legacyAdminRoutes = new Set([
      "/listar-lojas",
      "/listar-licencas",
      "/ativar-licenca",
    ]);
    const publicActivationRoutes = new Set([
      "/activation/start",
      "/activation/finish",
    ]);

    if (pathname === "/health") {
      return jsonResponse(
        { ok: true, service: "ednas-worker", time: nowIso() },
        200,
        corsHeaders
      );
    }

    if (pathname === "/config-lojas" && request.method === "GET") {
      return jsonResponse(
        {
          schema: "v2-public",
          modo: "token",
          lojas: {},
          resolver: "/resolver-loja",
        },
        200,
        corsHeaders
      );
    }

    if (pathname === "/resolver-loja" && request.method === "POST") {
      const body = await request.json().catch(() => null);
      const token = String(
        body?.token ||
        body?.store_token ||
        body?.token_loja ||
        ""
      ).trim();

      if (!token) {
        return jsonResponse(
          { success: false, error: "Token obrigatório" },
          400,
          corsHeaders
        );
      }

      const kv = getKvNamespace(env);
      if (!kv) {
        return jsonResponse({ success: false, error: "KV namespace nÃ£o configurado" }, 500, corsHeaders);
      }

      const { storeId, store, cliente } = await resolveStoreByDirectToken(kv, token);
      if (!storeId || !store) {
        return jsonResponse(
          { success: false, error: "Token inválido" },
          404,
          corsHeaders
        );
      }

      if (isClienteAccessBlocked(cliente)) {
        return clienteBlockedResponse(cliente, corsHeaders);
      }

      const publicStore = toPublicStore(storeId, store, cliente);
      if (!publicStore?.url) {
        return jsonResponse(
          { success: false, error: "Loja sem URL pública configurada" },
          409,
          corsHeaders
        );
      }

      return jsonResponse(
        {
          success: true,
          schema: "v2-public",
          loja: publicStore,
        },
        200,
        corsHeaders
      );
    }

    if (pathname.startsWith("/api-proxy/") || pathname.startsWith("/api_proxy/")) {
      const token = getProxyTokenFromPath(pathname);
      if (!token) {
        return jsonResponse(
          { success: false, error: "Token obrigatório" },
          400,
          corsHeaders
        );
      }

      const kv = getKvNamespace(env);
      if (!kv) {
        return jsonResponse({ success: false, error: "KV namespace nÃ£o configurado" }, 500, corsHeaders);
      }

      const { store, storeId, cliente } = await resolveStoreByDirectToken(kv, token);
      const storeUrl = getPublicStoreUrl(store, cliente).replace(/\/+$/, "");
      if (!storeId || !store || !storeUrl) {
        return jsonResponse(
          { success: false, error: "Loja não encontrada" },
          404,
          corsHeaders
        );
      }

      if (isClienteAccessBlocked(cliente)) {
        return clienteBlockedResponse(cliente, corsHeaders);
      }

      const proxyPath = getProxyPath(pathname);
      if (request.method === "GET" && proxyPath === "/bootstrap") {
        try {
          return await bootstrapProxyResponse(storeUrl, request, url, corsHeaders);
        } catch (err) {
          return jsonResponse(
            {
              success: false,
              error: "Bootstrap da loja indisponivel",
              detalhe: err?.message || null,
              loja: storeId,
              url: storeUrl,
            },
            502,
            corsHeaders
          );
        }
      }

      const targetUrl = new URL(`${storeUrl}${proxyPath}`);
      targetUrl.search = url.search;

      const proxyResponse = await fetch(targetUrl.toString(), {
        method: request.method,
        headers: buildProxyHeaders(request),
        body: ["GET", "HEAD"].includes(request.method) ? undefined : request.body,
        redirect: "manual",
      });

      const proxyContentType = proxyResponse.headers.get("content-type") || "";
      if (!proxyResponse.ok && !proxyContentType.toLowerCase().includes("application/json")) {
        return jsonResponse(
          {
            success: false,
            error: "Tunnel da loja indisponivel",
            upstream_status: proxyResponse.status,
            loja: storeId,
            url: storeUrl,
          },
          proxyResponse.status === 404 ?404 : 502,
          corsHeaders
        );
      }

      return new Response(proxyResponse.body, {
        status: proxyResponse.status,
        statusText: proxyResponse.statusText,
        headers: copyProxyResponseHeaders(proxyResponse, corsHeaders),
      });
    }

    const expectedAppKey = String(env.APP_KEY || "").trim();
    const authorizedByHeader = isAuthorized(request, env);
    const authorizedByLegacyQuery =
      Boolean(expectedAppKey) &&
      legacyAdminRoutes.has(pathname) &&
      String(url.searchParams.get("admin_key") || "").trim() === expectedAppKey;
    const authorizedByActivationCode = publicActivationRoutes.has(pathname);

    if (!authorizedByHeader && !authorizedByLegacyQuery && !authorizedByActivationCode) {
      return jsonResponse(
        { success: false, error: "Não autorizado" },
        401,
        corsHeaders
      );
    }

    if (pathname === "/config" && request.method === "GET") {
      const state = await loadState(env, { bypassCache: true });
      const config = toLegacyConfig(state.normalized, state.legacyConfig);
      return jsonResponse(config, 200, corsHeaders);
    }

    if (pathname === "/cloudflare/test" && request.method === "GET") {
      const accountId = getEnvValue(env, [
        "CLOUDFLARE_ACCOUNT_ID",
        "CF_ACCOUNT_ID",
      ]);
      const zoneId = getEnvValue(env, [
        "CLOUDFLARE_ZONE_ID",
        "CF_ZONE_ID",
      ]);
      const apiToken = getEnvValue(env, [
        "CLOUDFLARE_API_TOKEN",
        "CF_API_TOKEN",
      ]);
      const result = {
        success: true,
        account_id_configured: Boolean(accountId),
        account_id_length: accountId.length,
        zone_id_configured: Boolean(zoneId),
        zone_id_length: zoneId.length,
        api_token_configured: Boolean(apiToken),
        api_token_looks_like_tunnel_token: apiToken.startsWith("cfut_"),
        api_token_verify_ok: false,
        tunnel_api_ok: false,
        dns_api_ok: false,
        warnings: [],
        errors: [],
      };

      if (apiToken.startsWith("cfut_")) {
        result.warnings.push("CLOUDFLARE_API_TOKEN com prefixo cfut_; aceito porque validou na API da Cloudflare.");
      }

      if (apiToken) {
        try {
          await cloudflareApi(env, "GET", "/user/tokens/verify");
          result.api_token_verify_ok = true;
        } catch (err) {
          result.success = false;
          result.errors.push(`Token verify: ${err?.message || err}`);
        }
      } else {
        result.success = false;
        result.errors.push("CLOUDFLARE_API_TOKEN não configurado");
      }

      if (!accountId) {
        result.success = false;
        result.errors.push("CLOUDFLARE_ACCOUNT_ID não configurado");
      } else if (accountId.length !== 32) {
        result.success = false;
        result.errors.push(`CLOUDFLARE_ACCOUNT_ID inválido: esperado 32 caracteres, recebido ${accountId.length}`);
      } else {
        try {
          await cloudflareApi(env, "GET", `/accounts/${accountId}/cfd_tunnel`);
          result.tunnel_api_ok = true;
        } catch (err) {
          result.success = false;
          result.errors.push(`Tunnel API: ${err?.message || err}`);
        }
      }

      if (!zoneId) {
        result.success = false;
        result.errors.push("CLOUDFLARE_ZONE_ID não configurado");
      } else if (zoneId.length !== 32) {
        result.success = false;
        result.errors.push(`CLOUDFLARE_ZONE_ID inválido: esperado 32 caracteres, recebido ${zoneId.length}`);
      } else {
        try {
          await cloudflareApi(env, "GET", `/zones/${zoneId}/dns_records?per_page=1`);
          result.dns_api_ok = true;
        } catch (err) {
          result.success = false;
          result.errors.push(`DNS API: ${err?.message || err}`);
        }
      }

      return jsonResponse(result, result.success ?200 : 500, corsHeaders);
    }

    if (pathname === "/listar-lojas" && request.method === "GET") {
      const state = await loadState(env, { bypassCache: true });
      const config = toLegacyConfig(state.normalized, state.legacyConfig);
      return jsonResponse(config.lojas || {}, 200, corsHeaders);
    }

    if (pathname === "/listar-licencas" && request.method === "GET") {
      const state = await loadState(env);
      const config = toLegacyConfig(state.normalized, state.legacyConfig);
      return jsonResponse(config.licencas || {}, 200, corsHeaders);
    }

    if (pathname === "/auto-registar-loja" && request.method === "POST") {
      const body = await request.json().catch(() => null);
      if (!body || typeof body !== "object") {
        return jsonResponse({ success: false, error: "Body inválido" }, 400, corsHeaders);
      }

      const nome = normalizeStoreId(body.nome);
      if (!nome) {
        return jsonResponse({ success: false, error: "Nome da loja é obrigatório" }, 400, corsHeaders);
      }

      const state = await loadState(env, { bypassCache: true });
      if (state.normalized.lojas[nome]) {
        return jsonResponse({ success: false, error: "Loja já existe" }, 409, corsHeaders);
      }

      const loja = {
        id: nome,
        nome,
        url: body.url || null,
        server: body.server || null,
        database: body.database || null,
        port: Number(body.port) || 1433,
        token: body.token || null,
        created_at: nowIso(),
        updated_at: nowIso(),
      };

      const kv = getKvNamespace(env);
      if (!kv) {
        return jsonResponse({ success: false, error: "KV namespace não configurado" }, 500, corsHeaders);
      }

      await writeJson(kv, `loja:${nome}`, loja);

      clearLegacyConfigCache();

      return jsonResponse({ success: true, loja }, 200, corsHeaders);
    }

    if (pathname === "/guardar-loja" && request.method === "POST") {
      const body = await request.json().catch(() => null);
      if (!body || typeof body !== "object") {
        return jsonResponse({ success: false, error: "Body inválido" }, 400, corsHeaders);
      }

      const id = normalizeStoreId(body.id);
      const token = String(body.token || "").trim();
      const lojaUrl = String(body.url || "").trim();

      if (!id || !token) {
        return jsonResponse({ success: false, error: "Campos incompletos" }, 400, corsHeaders);
      }

      const state = await loadState(env, { bypassCache: true });
      const existing = state.normalized.lojas[id] || {};

      const loja = {
        ...existing,
        id,
        token,
        url: lojaUrl || existing.url || "",
        server: body.server || existing.server || "ENCOMENDAS",
        database: body.database || existing.database || "DEMOZS",
        port: Number(body.port || existing.port || 1433),
        updated_at: nowIso(),
      };

      const kv = getKvNamespace(env);
      if (!kv) {
        return jsonResponse({ success: false, error: "KV namespace não configurado" }, 500, corsHeaders);
      }

      await writeJson(kv, `loja:${id}`, loja);

      clearLegacyConfigCache();

      return jsonResponse({ success: true, loja }, 200, corsHeaders);
    }

    if (pathname === "/update-tunnel" && request.method === "POST") {
      const body = await request.json().catch(() => null);
      if (!body || typeof body !== "object") {
        return jsonResponse({ success: false, error: "Body inválido" }, 400, corsHeaders);
      }

      const id = normalizeStoreId(body.id);
      const tunnelUrl = String(body.tunnel_url || "").trim();
      if (!id || !tunnelUrl) {
        return jsonResponse({ success: false, error: "Campos incompletos" }, 400, corsHeaders);
      }

      const state = await loadState(env, { bypassCache: true });
      const store = state.normalized.lojas[id];
      if (!store) {
        return jsonResponse({ success: false, error: "Loja não existe" }, 404, corsHeaders);
      }

      const updated = {
        ...store,
        url: tunnelUrl,
        updated_at: nowIso(),
      };

      const kv = getKvNamespace(env);
      if (!kv) {
        return jsonResponse({ success: false, error: "KV namespace não configurado" }, 500, corsHeaders);
      }

      await writeJson(kv, `loja:${id}`, updated);

      clearLegacyConfigCache();

      return jsonResponse({ success: true, loja: updated }, 200, corsHeaders);
    }

    if (pathname === "/activation/start" && request.method === "POST") {
      const body = await request.json().catch(() => ({}));
      const hwid = String(body?.hwid || "").trim();
      const guessedUrl = String(body?.guessedUrl || "").trim();
      const host = String(body?.host || "").trim();

      const kv = getKvNamespace(env);
      if (!kv) {
        return jsonResponse({ success: false, error: "KV namespace não configurado" }, 500, corsHeaders);
      }

      const state = await loadState(env);
      const existingLicense = hwid ?await readLicenseDirect(kv, state.legacyConfig, hwid) : null;
      const storeByHost = findStoreByGuessedUrl(state.normalized.lojas, guessedUrl, host);

      return jsonResponse(
        {
          success: true,
          schema: "v2",
          hwid: hwid || null,
          guessedUrl: guessedUrl || null,
          host: host || null,
          lojaDetetada: storeByHost.storeId
            ?toInstallerStore(storeByHost.storeId, storeByHost.store)
            : null,
          licencaAtiva: Boolean(existingLicense),
          precisaAtivacao: !existingLicense,
          licenca: existingLicense
            ?{
                loja: existingLicense.loja_id || existingLicense.loja || null,
                estado: existingLicense.estado || "ativa",
              }
            : null,
        },
        200,
        corsHeaders
      );
    }

    if (pathname === "/activation/finish" && request.method === "POST") {
      try {
        const body = await request.json().catch(() => null);
        if (!body || typeof body !== "object") {
          return jsonResponse({ success: false, error: "Body inválido" }, 400, corsHeaders);
        }

        const hwid = String(body.hwid || "").trim();
        if (!hwid) {
          return jsonResponse({ success: false, error: "HWID é obrigatório" }, 400, corsHeaders);
        }

        const guessedUrl = String(body.guessedUrl || "").trim();
        const host = String(body.host || "").trim();
        const activationCode = getActivationCode(body);

        if (!authorizedByHeader && !activationCode) {
          return jsonResponse(
            { success: false, error: "Código de ativação obrigatório" },
            400,
            corsHeaders
          );
        }

        let lojaId = null;
        let activationRecord = null;
        let activationKey = null;
        let activationIsCliente = false;
        let activationClienteId = null;
        let activationClienteRecord = null;
        let storeSetup = null;
        let store = null;

        const kv = getKvNamespace(env);
        if (!kv) {
          return jsonResponse({ success: false, error: "KV namespace não configurado" }, 500, corsHeaders);
        }

        const currentState = await loadState(env, { bypassCache: true });
        const legacyConfig = currentState.legacyConfig;
        const legacyState = currentState.normalized;

        if (activationCode) {
          activationKey = `activation-code:${activationCode}`;
          activationRecord = await readJson(kv, activationKey);
          if (!activationRecord || typeof activationRecord !== "object") {
            const clienteMatch = await findClienteByActivationCode(kv, activationCode);
            if (clienteMatch.cliente) {
              activationIsCliente = true;
              activationClienteId = clienteMatch.clienteId;
              activationClienteRecord = clienteMatch.cliente;
              activationKey = clienteMatch.key;
              activationRecord = clienteMatch.cliente;
            }
          }

          if (!activationRecord || typeof activationRecord !== "object") {
            const existingLicenseForMissingCode = await readLicenseDirect(kv, legacyConfig, hwid);
            if (existingLicenseForMissingCode) {
              const existingStoreId = normalizeStoreId(
                existingLicenseForMissingCode.loja_id ||
                existingLicenseForMissingCode.loja ||
                ""
              );
              const existingStore = existingStoreId
                ?await readStoreDirect(kv, legacyConfig, existingStoreId)
                : null;

              if (existingStore) {
                const existingCliente = existingStoreId
                  ?await readClienteDirect(kv, existingStoreId)
                  : null;
                const existingTunnel =
                  existingCliente?.tunnel ||
                  await readJson(kv, `tunnel:${hwid}`);
                return jsonResponse(
                  {
                    success: true,
                    schema: "v2",
                    already_active: true,
                    activation_code_deleted: true,
                    license: existingLicenseForMissingCode,
                    installation: existingLicenseForMissingCode.instalacao_id
                      ?await readJson(kv, `instalacao:${existingLicenseForMissingCode.instalacao_id}`)
                      : null,
                    loja: toInstallerStore(existingStoreId, existingStore),
                    tunnel: toInstallerTunnel(existingTunnel, existingStore),
                  },
                  200,
                  corsHeaders
                );
              }
            }

            return jsonResponse(
              { success: false, error: "Código de ativação inválido" },
              404,
              corsHeaders
            );
          }

          if (!isActivationCodeActive(activationRecord)) {
            return jsonResponse(
              { success: false, error: "Código de ativação bloqueado" },
              403,
              corsHeaders
            );
          }

          if (isActivationCodeExpired(activationRecord)) {
            return jsonResponse(
              { success: false, error: "Código de ativação expirado" },
              403,
              corsHeaders
            );
          }

          lojaId = activationIsCliente
            ?activationClienteId || normalizeStoreId(
                activationRecord.loja_id ||
                activationRecord.loja?.id ||
                activationRecord.store_id
              )
            : normalizeStoreId(
                activationRecord.loja_id ||
                activationRecord.loja ||
                activationRecord.store_id
              );

          const expectedStoreToken = String(
            activationRecord.store_token ||
            activationRecord.token_loja ||
            activationRecord.loja?.store_token ||
            activationRecord.loja?.token_loja ||
            ""
          ).trim();
          const providedStoreToken = String(
            body.store_token ||
            body.token_loja ||
            ""
          ).trim();
          if (expectedStoreToken && !providedStoreToken) {
            return jsonResponse(
              { success: false, error: "Token de entrada da loja obrigatório" },
              400,
              corsHeaders
            );
          }
          if (expectedStoreToken && !(await tokensMatch(providedStoreToken, expectedStoreToken))) {
            return jsonResponse(
              { success: false, error: "Token de entrada da loja inválido" },
              403,
              corsHeaders
            );
          }
        }

        storeSetup = getActivationStoreSetup(body, activationRecord, activationCode, guessedUrl);
        if (!lojaId && storeSetup?.id) {
          lojaId = storeSetup.id;
        }

        if (activationIsCliente) {
          if (!lojaId) {
            return jsonResponse(
              { success: false, error: "Cliente não encontrado para ativação" },
              404,
              corsHeaders
            );
          }

          const maxUses = Number(activationRecord.max_uses || 0);
          const uses = Number(activationRecord.uses || 0);
          const currentCliente = activationClienteRecord || (await readClienteDirect(kv, lojaId)) || {};
          const currentStore = getClienteStore(lojaId, currentCliente) || {};
          const existingLicenseForCliente = getClienteLicense(lojaId, currentCliente);
          const isSameInstallation = existingLicenseForCliente?.hwid === hwid;

          if (!isSameInstallation && maxUses > 0 && uses >= maxUses) {
            return jsonResponse(
              { success: false, error: "Código de ativação esgotado" },
              409,
              corsHeaders
            );
          }

          const now = nowIso();
          const installationId =
            currentCliente?.instalacao?.id ||
            existingLicenseForCliente?.instalacao_id ||
            `hwid-${hwid}`;
          const explicitStoreUrl = String(
            body?.url ||
            body?.api_url ||
            body?.apiUrl ||
            body?.base_url ||
            body?.baseUrl ||
            ""
          ).trim();
          const explicitPort = Number(
            body?.port ||
            body?.db_port ||
            body?.dbPort ||
            body?.sql_port ||
            body?.sqlPort ||
            0
          );
          const storePayload = {
            ...currentStore,
            ...(storeSetup || {}),
            id: lojaId,
            nome:
              storeSetup?.nome ||
              currentStore.nome ||
              currentCliente.nome ||
              lojaId,
            url: explicitStoreUrl || currentStore.url || storeSetup?.url || guessedUrl || null,
            server: storeSetup?.server || currentStore.server || null,
            instance: storeSetup?.instance || currentStore.instance || null,
            database: storeSetup?.database || currentStore.database || null,
            port: Number(explicitPort || currentStore.port || storeSetup?.port || 1433),
            token: storeSetup?.token || currentStore.token || activationCode || null,
          };
          const installationPayload = {
            id: installationId,
            loja_id: lojaId,
            hwid,
            host: host || null,
            guessed_url: guessedUrl || null,
            estado: "ativo",
            created_at: currentCliente?.instalacao?.created_at || now,
            last_seen_at: now,
          };
          const licensePayload = {
            hwid,
            loja_id: lojaId,
            loja: lojaId,
            instalacao_id: installationId,
            estado: "ativa",
            token: activationCode || null,
            ativada_em: currentCliente?.licenca?.ativada_em || now,
          };
          const activationRecordWithTunnel = await ensureTunnelForActivationSafe(
            env,
            kv,
            activationKey,
            {
              ...activationRecord,
              code: activationRecord.code || activationRecord.activation_code || activationCode || null,
              host,
            },
            lojaId,
            hwid
          );
          const tunnelSource =
            activationRecordWithTunnel?.tunnel_token ||
            activationRecordWithTunnel?.tunnelToken ||
            activationRecordWithTunnel?.cloudflare_tunnel_token ||
            activationRecordWithTunnel?.tunnel_url ||
            activationRecordWithTunnel?.reused
              ?activationRecordWithTunnel
              : currentCliente?.tunnel || activationRecordWithTunnel;
          const tunnelPayload = toInstallerTunnel(tunnelSource, storePayload);
          const hasTunnelPayload = Boolean(
            tunnelPayload?.url ||
            tunnelPayload?.hostname ||
            tunnelPayload?.token
          );

          const updatedCliente = await writeClienteInstallRecord(kv, lojaId, currentCliente, {
            activationCode: activationCode || null,
            store: storePayload,
            installation: installationPayload,
            license: licensePayload,
            tunnel: hasTunnelPayload ?tunnelPayload : null,
          });
          const updatedClienteWithUsage = {
            ...updatedCliente,
            uses: isSameInstallation ?uses : uses + 1,
            last_hwid: hwid,
            updated_at: now,
          };
          await writeJson(kv, `cliente:${lojaId}`, updatedClienteWithUsage);
          clearLegacyConfigCache();

          return jsonResponse(
            {
              success: true,
              schema: "cliente-v1",
              already_active: isSameInstallation,
              license: licensePayload,
              installation: installationPayload,
              loja: toInstallerStore(lojaId, storePayload),
              tunnel: hasTunnelPayload ?tunnelPayload : toInstallerTunnel(null, storePayload),
            },
            200,
            corsHeaders
          );
        }

        const existingLicense = await readLicenseDirect(kv, legacyConfig, hwid);
        if (existingLicense) {
          const existingStoreId = normalizeStoreId(
            existingLicense.loja_id || existingLicense.loja || lojaId || storeSetup?.id
          );
          if (storeSetup && existingStoreId) {
            storeSetup.id = existingStoreId;
            store = await upsertStoreFromActivationDirect(env, legacyConfig, storeSetup);
          }
          if (activationRecord && activationKey && existingStoreId) {
            activationRecord = await ensureTunnelForActivationSafe(
              env,
              kv,
              activationKey,
              {
                ...activationRecord,
                host,
              },
              existingStoreId,
              hwid
            );
          }

          const existingStore = activationRecord && existingStoreId
            ?await updateStoreUrlFromTunnelDirect(
                env,
                legacyConfig,
                existingStoreId,
                activationRecord,
                store
              )
            : store || (await readStoreDirect(kv, legacyConfig, existingStoreId));
          await updateLegacyConfigDirect(env, legacyConfig, existingStore, existingLicense);

          return jsonResponse(
            {
              success: true,
              schema: "v2",
              already_active: true,
              license: existingLicense,
              installation: existingLicense.instalacao_id
                ?await readJson(kv, `instalacao:${existingLicense.instalacao_id}`)
                : null,
              loja: toInstallerStore(existingStoreId, existingStore),
              tunnel: toInstallerTunnel(activationRecord, existingStore),
            },
            200,
            corsHeaders
          );
        }

        if (activationRecord) {
          const maxUses = Number(activationRecord.max_uses || 1);
          const uses = Number(activationRecord.uses || 0);
          if (maxUses > 0 && uses >= maxUses) {
            return jsonResponse(
              { success: false, error: "Código de ativação esgotado" },
              409,
              corsHeaders
            );
          }
        }

        if (!lojaId) {
          const storeByHost = findStoreByGuessedUrl(legacyState.lojas, guessedUrl, host);
          lojaId = storeByHost.storeId;
        }

        if (!lojaId && storeSetup?.id) {
          lojaId = storeSetup.id;
        }

        if (!lojaId) {
          return jsonResponse(
            { success: false, error: "Loja não encontrada para ativação" },
            404,
            corsHeaders
          );
        }

        if (storeSetup) {
          storeSetup.id = lojaId;
          store = await upsertStoreFromActivationDirect(env, legacyConfig, storeSetup);
        }

        if (!store) {
          store = await readStoreDirect(kv, legacyConfig, lojaId);
        }

        if (!store) {
          return jsonResponse(
            { success: false, error: "Loja não existe e os dados da instalação não foram enviados" },
            404,
            corsHeaders
          );
        }

        if (activationRecord && activationKey) {
          activationRecord = await ensureTunnelForActivationSafe(
            env,
            kv,
            activationKey,
            {
              ...activationRecord,
              host,
            },
            lojaId,
            hwid
          );
        }

        const persisted = await persistLicenseAndInstallation(env, {
          hwid,
          lojaId,
          activationCode: activationCode || null,
          host,
          guessedUrl,
        });
        const updatedStore = activationRecord
          ?await updateStoreUrlFromTunnelDirect(env, legacyConfig, lojaId, activationRecord, store)
          : store;

        if (activationRecord) {
          const updatedUses = Number(activationRecord.uses || 0) + 1;
          const maxUses = Number(activationRecord.max_uses || 1);
          const updatedActivationRecord = {
            ...activationRecord,
            uses: updatedUses,
            last_hwid: hwid,
            updated_at: nowIso(),
          };

          if (activationKey && maxUses > 0 && updatedUses >= maxUses) {
            await kv.delete(activationKey);
          } else if (activationKey) {
            await writeJson(kv, activationKey, updatedActivationRecord);
          }
        }

        await updateLegacyConfigDirect(env, legacyConfig, updatedStore, persisted.license);

        return jsonResponse(
          {
            success: true,
            schema: "v2",
            license: persisted.license,
            installation: persisted.installation,
            loja: toInstallerStore(lojaId, updatedStore),
            tunnel: toInstallerTunnel(activationRecord, updatedStore),
          },
          200,
          corsHeaders
        );
      } catch (err) {
        return jsonResponse(
          {
            success: false,
            schema: "v2",
            error: err?.message || "Erro interno na ativação",
            stage: "activation_finish",
          },
          500,
          corsHeaders
        );
      }
    }

    if (pathname === "/ativar-licenca" && request.method === "POST") {
      const body = await request.json().catch(() => null);
      if (!body || typeof body !== "object") {
        return jsonResponse({ success: false, error: "Body inválido" }, 400, corsHeaders);
      }

      const codigo = String(body.codigo || "").trim();
      const loja = normalizeStoreId(body.loja);
      const token = String(body.token || "").trim();
      const hwid = String(body.hwid || "").trim();

      if (!codigo || !loja || !token || !hwid) {
        return jsonResponse({ success: false, error: "Campos incompletos" }, 400, corsHeaders);
      }

      const state = await loadState(env, { bypassCache: true });
      if (!state.normalized.lojas[loja]) {
        return jsonResponse({ success: false, error: "Loja não existe" }, 404, corsHeaders);
      }

      const license = {
        hwid,
        loja_id: loja,
        loja,
        token,
        estado: "ativa",
        ativada_em: nowIso(),
        updated_at: nowIso(),
        _legacy_key: codigo,
      };

      const kv = getKvNamespace(env);
      if (!kv) {
        return jsonResponse({ success: false, error: "KV namespace não configurado" }, 500, corsHeaders);
      }

      await writeJson(kv, `licenca:${hwid}`, license);
      await updateLegacyConfigLicense(env, state.legacyConfig, state.normalized, license);

      return jsonResponse({ success: true, licenca: license }, 200, corsHeaders);
    }

    if (pathname === "/validar-licenca" && request.method === "POST") {
      const body = await request.json().catch(() => null);
      if (!body || typeof body !== "object") {
        return jsonResponse({ success: false, error: "Body inválido" }, 400, corsHeaders);
      }

      const codigo = String(body.licenca || "").trim();
      const loja = normalizeStoreId(body.loja);
      const token = String(body.token || "").trim();
      const hwid = String(body.hwid || "").trim();

      if (!codigo || !loja || !token || !hwid) {
        return jsonResponse({ success: false, error: "Campos incompletos" }, 400, corsHeaders);
      }

      const kv = getKvNamespace(env);
      if (!kv) {
        return jsonResponse({ success: false, error: "KV namespace não configurado" }, 500, corsHeaders);
      }

      const legacyConfig = await readLegacyConfigFromKv(kv);
      const { license, storeId, store } = await readLicenseSnapshotDirect(kv, legacyConfig, hwid);
      if (!license) {
        return jsonResponse({ success: false, error: "Licença não existe." }, 404, corsHeaders);
      }

      if (storeId !== loja) {
        return jsonResponse({ success: false, error: "Loja incorreta." }, 403, corsHeaders);
      }

      if (String(license.token || "") !== token) {
        return jsonResponse({ success: false, error: "Token inválido." }, 403, corsHeaders);
      }

      if (codigo && license._legacy_key && codigo !== license._legacy_key) {
        return jsonResponse({ success: false, error: "Licença inválida." }, 403, corsHeaders);
      }

      return jsonResponse(
        {
          success: true,
          url: store?.url || null,
        },
        200,
        corsHeaders
      );
    }

    if (pathname === "/pedir-licenca" && request.method === "POST") {
      const body = await request.json().catch(() => null);
      if (!body || typeof body !== "object") {
        return jsonResponse({ success: false, error: "Body inválido" }, 400, corsHeaders);
      }

      const loja = normalizeStoreId(body.loja);
      const hwid = String(body.hwid || "").trim();
      if (!loja || !hwid) {
        return jsonResponse({ success: false, error: "Campos incompletos" }, 400, corsHeaders);
      }

      const kv = getKvNamespace(env);
      if (!kv) {
        return jsonResponse({ success: false, error: "KV namespace não configurado" }, 500, corsHeaders);
      }

      const legacyConfig = await readLegacyConfigFromKv(kv);
      const store = await readStoreDirect(kv, legacyConfig, loja);
      if (!store) {
        return jsonResponse({ success: false, error: "Loja não encontrada" }, 404, corsHeaders);
      }

      return jsonResponse(
        {
          success: true,
          loja,
          url: store.url || null,
          server: store.server || null,
          database: store.database || null,
          port: Number(store.port || 1433),
          hwid,
        },
        200,
        corsHeaders
      );
    }

    if (pathname === "/pedir-licenca" && request.method === "GET") {
      const loja = normalizeStoreId(url.searchParams.get("loja"));
      const hwid = String(url.searchParams.get("hwid") || "").trim();

      if (!loja || !hwid) {
        return jsonResponse({ success: false, error: "Campos incompletos" }, 400, corsHeaders);
      }

      const kv = getKvNamespace(env);
      if (!kv) {
        return jsonResponse({ success: false, error: "KV namespace não configurado" }, 500, corsHeaders);
      }

      const legacyConfig = await readLegacyConfigFromKv(kv);
      const store = await readStoreDirect(kv, legacyConfig, loja);
      if (!store) {
        return jsonResponse({ success: false, error: "Loja não encontrada" }, 404, corsHeaders);
      }

      return jsonResponse(
        {
          success: true,
          loja,
          url: store.url || null,
          server: store.server || null,
          database: store.database || null,
          port: Number(store.port || 1433),
          hwid,
        },
        200,
        corsHeaders
      );
    }

    if (pathname === "/license/check" && request.method === "POST") {
      const body = await request.json().catch(() => ({}));
      const hwid = String(body?.hwid || "").trim();
      const requestedStoreId = normalizeStoreId(
        body?.store_token ||
        body?.token_loja ||
        body?.store_id ||
        body?.store_name ||
        body?.loja_id ||
        body?.loja ||
        ""
      );

      if (!hwid) {
        return jsonResponse(
          { success: false, error: "HWID é obrigatório" },
          400,
          corsHeaders
        );
      }

      const kv = getKvNamespace(env);
      if (!kv) {
        return jsonResponse({ success: false, error: "KV namespace não configurado" }, 500, corsHeaders);
      }

      const legacyConfig = await readLegacyConfigFromKv(kv);
      const { license, storeId, store } = await readLicenseSnapshotDirect(kv, legacyConfig, hwid, requestedStoreId);
      const isActive = Boolean(license && store && (license.estado || "ativa") === "ativa");

      return jsonResponse(
        {
          success: true,
          schema: "v2",
          hwid,
          ativa: isActive,
          precisaAtivacao: !license,
          loja: storeId || null,
          store: store ?toInstallerStore(storeId, store) : null,
          license: license || null,
          checkedAt: nowIso(),
        },
        200,
        corsHeaders
      );
    }

    if (pathname === "/heartbeat" && request.method === "POST") {
      const body = await request.json().catch(() => ({}));
      const hwid = String(body?.hwid || "").trim();
      const requestedStoreId = normalizeStoreId(
        body?.store_token ||
        body?.token_loja ||
        body?.store_id ||
        body?.store_name ||
        body?.loja_id ||
        body?.loja ||
        ""
      );

      if (!hwid) {
        return jsonResponse(
          { success: false, error: "HWID é obrigatório" },
          400,
          corsHeaders
        );
      }

      const kv = getKvNamespace(env);
      if (!kv) {
        return jsonResponse({ success: false, error: "KV namespace não configurado" }, 500, corsHeaders);
      }

      const legacyConfig = await readLegacyConfigFromKv(kv);
      const { license, storeId, store } = await readLicenseSnapshotDirect(kv, legacyConfig, hwid, requestedStoreId);
      const isActive = Boolean(license && store && (license.estado || "ativa") === "ativa");

      if (license?.instalacao_id) {
        const installationKey = `instalacao:${license.instalacao_id}`;
        const installation = await readJson(kv, installationKey);
        if (installation && typeof installation === "object" && shouldWriteHeartbeat(installation)) {
          installation.last_seen_at = nowIso();
          installation.updated_at = nowIso();
          installation.last_meta = body?.meta || null;
          await writeJson(kv, installationKey, installation);
        }
      }

      return jsonResponse(
        {
          success: true,
          schema: "v2",
          hwid,
          ativa: isActive,
          loja: storeId || null,
          serverTime: nowIso(),
          commands: [],
        },
        200,
        corsHeaders
      );
    }

    return jsonResponse({ success: false, error: "Not found" }, 404, corsHeaders);
  },
};
