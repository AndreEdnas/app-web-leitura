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
    "access-control-allow-methods": "GET,POST,OPTIONS",
    "access-control-allow-headers": "Content-Type, X-App-Key",
    vary: "Origin",
  };
}

function toPublicStores(lojas) {
  const result = {};

  for (const [storeId, store] of Object.entries(lojas || {})) {
    if (!store || typeof store !== "object") continue;
    const url = String(store.url || "").trim();
    if (!url) continue;

    result[storeId] = {
      id: storeId,
      nome: String(store.nome || storeId),
      url,
      token: store.token || null,
    };
  }

  return result;
}

function isAuthorized(request, env) {
  const expected = (env.APP_KEY || "").trim();
  if (!expected) return true;

  const provided = (request.headers.get("x-app-key") || "").trim();
  return provided === expected;
}

async function readJson(kv, key) {
  const raw = await kv.get(key);
  if (!raw) return null;

  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

async function writeJson(kv, key, value) {
  await kv.put(key, JSON.stringify(value));
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

function buildNormalizedState(legacyConfig, lojasV2, licencasV2, instalacoesV2, tunnelsV2) {
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

  return {
    lojas,
    licencasByHwid,
    instalacoesById: instalacoesV2 || {},
    tunnelsByInstalacaoId: tunnelsV2 || {},
  };
}

function toLegacyConfig(normalized, originalLegacyConfig) {
  const legacy = originalLegacyConfig && typeof originalLegacyConfig === "object"
    ? { ...originalLegacyConfig }
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

async function loadState(env) {
  const kv = getKvNamespace(env);
  if (!kv) {
    throw new Error("KV namespace nao configurado (LOJAS_DB/CONFIG)");
  }

  const legacyConfig = (await readJson(kv, "config")) || {};
  const lojasV2 = await readPrefixMap(kv, "loja:");
  const licencasV2 = await readPrefixMap(kv, "licenca:");
  const instalacoesV2 = await readPrefixMap(kv, "instalacao:");
  const tunnelsV2 = await readPrefixMap(kv, "tunnel:");

  const normalized = buildNormalizedState(
    legacyConfig,
    lojasV2,
    licencasV2,
    instalacoesV2,
    tunnelsV2
  );

  return {
    legacyConfig,
    normalized,
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
  if (!kv) throw new Error("KV namespace nao configurado");

  const {
    hwid,
    lojaId,
    activationCode,
    host,
    guessedUrl,
  } = payload;

  const installationId = crypto.randomUUID();
  const activatedAt = nowIso();

  const installation = {
    id: installationId,
    loja_id: lojaId,
    hwid,
    host: host || null,
    guessed_url: guessedUrl || null,
    estado: "ativo",
    created_at: activatedAt,
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
    ativada_em: activatedAt,
    updated_at: activatedAt,
  };

  await writeJson(kv, `instalacao:${installationId}`, installation);
  await writeJson(kv, `licenca:${hwid}`, license);

  return { installation, license };
}

async function updateLegacyConfigLicense(env, oldLegacyConfig, normalizedState, license) {
  const kv = getKvNamespace(env);
  if (!kv) throw new Error("KV namespace nao configurado");

  const merged = {
    ...normalizedState,
    licencasByHwid: {
      ...normalizedState.licencasByHwid,
      [license.hwid]: license,
    },
  };

  const legacy = toLegacyConfig(merged, oldLegacyConfig);
  await writeJson(kv, "config", legacy);
}

function getActivationCode(rawBody) {
  return String(
    rawBody?.activation_code ||
    rawBody?.codigo_ativacao ||
    rawBody?.codigoAtivacao ||
    ""
  ).trim();
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

    if (pathname === "/health") {
      return jsonResponse(
        { ok: true, service: "ednas-worker", time: nowIso() },
        200,
        corsHeaders
      );
    }

    if (pathname === "/config-lojas" && request.method === "GET") {
      const state = await loadState(env);
      return jsonResponse(
        {
          schema: "v2-public",
          lojas: toPublicStores(state.normalized.lojas),
        },
        200,
        corsHeaders
      );
    }

    const authorizedByHeader = isAuthorized(request, env);
    const authorizedByLegacyQuery =
      legacyAdminRoutes.has(pathname) &&
      String(url.searchParams.get("admin_key") || "").trim() === String(env.APP_KEY || "").trim();

    if (!authorizedByHeader && !authorizedByLegacyQuery) {
      return jsonResponse(
        { success: false, error: "Nao autorizado" },
        401,
        corsHeaders
      );
    }

    if (pathname === "/config" && request.method === "GET") {
      const state = await loadState(env);
      const config = toLegacyConfig(state.normalized, state.legacyConfig);
      return jsonResponse(config, 200, corsHeaders);
    }

    if (pathname === "/listar-lojas" && request.method === "GET") {
      const state = await loadState(env);
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
        return jsonResponse({ success: false, error: "Body invalido" }, 400, corsHeaders);
      }

      const nome = normalizeStoreId(body.nome);
      if (!nome) {
        return jsonResponse({ success: false, error: "Nome da loja e obrigatorio" }, 400, corsHeaders);
      }

      const state = await loadState(env);
      if (state.normalized.lojas[nome]) {
        return jsonResponse({ success: false, error: "Loja ja existe" }, 409, corsHeaders);
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
        return jsonResponse({ success: false, error: "KV namespace nao configurado" }, 500, corsHeaders);
      }

      await writeJson(kv, `loja:${nome}`, loja);

      const merged = {
        ...state.normalized,
        lojas: {
          ...state.normalized.lojas,
          [nome]: loja,
        },
      };
      const legacy = toLegacyConfig(merged, state.legacyConfig);
      await writeJson(kv, "config", legacy);

      return jsonResponse({ success: true, loja }, 200, corsHeaders);
    }

    if (pathname === "/guardar-loja" && request.method === "POST") {
      const body = await request.json().catch(() => null);
      if (!body || typeof body !== "object") {
        return jsonResponse({ success: false, error: "Body invalido" }, 400, corsHeaders);
      }

      const id = normalizeStoreId(body.id);
      const token = String(body.token || "").trim();
      const lojaUrl = String(body.url || "").trim();

      if (!id || !token) {
        return jsonResponse({ success: false, error: "Campos incompletos" }, 400, corsHeaders);
      }

      const state = await loadState(env);
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
        return jsonResponse({ success: false, error: "KV namespace nao configurado" }, 500, corsHeaders);
      }

      await writeJson(kv, `loja:${id}`, loja);

      const merged = {
        ...state.normalized,
        lojas: {
          ...state.normalized.lojas,
          [id]: loja,
        },
      };
      const legacy = toLegacyConfig(merged, state.legacyConfig);
      await writeJson(kv, "config", legacy);

      return jsonResponse({ success: true, loja }, 200, corsHeaders);
    }

    if (pathname === "/update-tunnel" && request.method === "POST") {
      const body = await request.json().catch(() => null);
      if (!body || typeof body !== "object") {
        return jsonResponse({ success: false, error: "Body invalido" }, 400, corsHeaders);
      }

      const id = normalizeStoreId(body.id);
      const tunnelUrl = String(body.tunnel_url || "").trim();
      if (!id || !tunnelUrl) {
        return jsonResponse({ success: false, error: "Campos incompletos" }, 400, corsHeaders);
      }

      const state = await loadState(env);
      const store = state.normalized.lojas[id];
      if (!store) {
        return jsonResponse({ success: false, error: "Loja nao existe" }, 404, corsHeaders);
      }

      const updated = {
        ...store,
        url: tunnelUrl,
        updated_at: nowIso(),
      };

      const kv = getKvNamespace(env);
      if (!kv) {
        return jsonResponse({ success: false, error: "KV namespace nao configurado" }, 500, corsHeaders);
      }

      await writeJson(kv, `loja:${id}`, updated);

      const merged = {
        ...state.normalized,
        lojas: {
          ...state.normalized.lojas,
          [id]: updated,
        },
      };
      const legacy = toLegacyConfig(merged, state.legacyConfig);
      await writeJson(kv, "config", legacy);

      return jsonResponse({ success: true, loja: updated }, 200, corsHeaders);
    }

    if (pathname === "/activation/start" && request.method === "POST") {
      const body = await request.json().catch(() => ({}));
      const hwid = String(body?.hwid || "").trim();
      const guessedUrl = String(body?.guessedUrl || "").trim();
      const host = String(body?.host || "").trim();

      const state = await loadState(env);
      const existingLicense = hwid ? state.normalized.licencasByHwid[hwid] || null : null;
      const storeByHost = findStoreByGuessedUrl(state.normalized.lojas, guessedUrl, host);

      return jsonResponse(
        {
          success: true,
          schema: "v2",
          hwid: hwid || null,
          guessedUrl: guessedUrl || null,
          host: host || null,
          lojaDetetada: storeByHost.storeId
            ? { id: storeByHost.storeId, ...storeByHost.store }
            : null,
          licencaAtiva: Boolean(existingLicense),
          precisaAtivacao: !existingLicense,
          licenca: existingLicense,
        },
        200,
        corsHeaders
      );
    }

    if (pathname === "/activation/finish" && request.method === "POST") {
      const body = await request.json().catch(() => null);
      if (!body || typeof body !== "object") {
        return jsonResponse({ success: false, error: "Body invalido" }, 400, corsHeaders);
      }

      const hwid = String(body.hwid || "").trim();
      if (!hwid) {
        return jsonResponse({ success: false, error: "HWID e obrigatorio" }, 400, corsHeaders);
      }

      const guessedUrl = String(body.guessedUrl || "").trim();
      const host = String(body.host || "").trim();
      const activationCode = getActivationCode(body);

      const state = await loadState(env);
      const existingLicense = state.normalized.licencasByHwid[hwid] || null;
      if (existingLicense) {
        return jsonResponse(
          {
            success: true,
            schema: "v2",
            already_active: true,
            license: existingLicense,
          },
          200,
          corsHeaders
        );
      }

      let lojaId = null;
      let activationRecord = null;

      const kv = getKvNamespace(env);
      if (!kv) {
        return jsonResponse({ success: false, error: "KV namespace nao configurado" }, 500, corsHeaders);
      }

      if (activationCode) {
        activationRecord = await readJson(kv, `activation-code:${activationCode}`);
        if (!activationRecord || typeof activationRecord !== "object") {
          return jsonResponse(
            { success: false, error: "Codigo de ativacao invalido" },
            404,
            corsHeaders
          );
        }

        if (activationRecord.estado && activationRecord.estado !== "ativo") {
          return jsonResponse(
            { success: false, error: "Codigo de ativacao bloqueado" },
            403,
            corsHeaders
          );
        }

        const maxUses = Number(activationRecord.max_uses || 1);
        const uses = Number(activationRecord.uses || 0);
        if (maxUses > 0 && uses >= maxUses) {
          return jsonResponse(
            { success: false, error: "Codigo de ativacao esgotado" },
            409,
            corsHeaders
          );
        }

        lojaId = normalizeStoreId(
          activationRecord.loja_id || activationRecord.loja || activationRecord.store_id
        );
      }

      if (!lojaId) {
        const storeByHost = findStoreByGuessedUrl(state.normalized.lojas, guessedUrl, host);
        lojaId = storeByHost.storeId;
      }

      if (!lojaId || !state.normalized.lojas[lojaId]) {
        return jsonResponse(
          { success: false, error: "Loja nao encontrada para ativacao" },
          404,
          corsHeaders
        );
      }

      const persisted = await persistLicenseAndInstallation(env, {
        hwid,
        lojaId,
        activationCode: activationCode || null,
        host,
        guessedUrl,
      });

      if (activationRecord) {
        const updatedActivationRecord = {
          ...activationRecord,
          uses: Number(activationRecord.uses || 0) + 1,
          last_hwid: hwid,
          updated_at: nowIso(),
        };
        await writeJson(kv, `activation-code:${activationCode}`, updatedActivationRecord);
      }

      await updateLegacyConfigLicense(
        env,
        state.legacyConfig,
        state.normalized,
        persisted.license
      );

      return jsonResponse(
        {
          success: true,
          schema: "v2",
          license: persisted.license,
          installation: persisted.installation,
        },
        200,
        corsHeaders
      );
    }

    if (pathname === "/ativar-licenca" && request.method === "POST") {
      const body = await request.json().catch(() => null);
      if (!body || typeof body !== "object") {
        return jsonResponse({ success: false, error: "Body invalido" }, 400, corsHeaders);
      }

      const codigo = String(body.codigo || "").trim();
      const loja = normalizeStoreId(body.loja);
      const token = String(body.token || "").trim();
      const hwid = String(body.hwid || "").trim();

      if (!codigo || !loja || !token || !hwid) {
        return jsonResponse({ success: false, error: "Campos incompletos" }, 400, corsHeaders);
      }

      const state = await loadState(env);
      if (!state.normalized.lojas[loja]) {
        return jsonResponse({ success: false, error: "Loja nao existe" }, 404, corsHeaders);
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
        return jsonResponse({ success: false, error: "KV namespace nao configurado" }, 500, corsHeaders);
      }

      await writeJson(kv, `licenca:${hwid}`, license);
      await updateLegacyConfigLicense(env, state.legacyConfig, state.normalized, license);

      return jsonResponse({ success: true, licenca: license }, 200, corsHeaders);
    }

    if (pathname === "/validar-licenca" && request.method === "POST") {
      const body = await request.json().catch(() => null);
      if (!body || typeof body !== "object") {
        return jsonResponse({ success: false, error: "Body invalido" }, 400, corsHeaders);
      }

      const codigo = String(body.licenca || "").trim();
      const loja = normalizeStoreId(body.loja);
      const token = String(body.token || "").trim();
      const hwid = String(body.hwid || "").trim();

      if (!codigo || !loja || !token || !hwid) {
        return jsonResponse({ success: false, error: "Campos incompletos" }, 400, corsHeaders);
      }

      const state = await loadState(env);
      const license = state.normalized.licencasByHwid[hwid] || null;
      if (!license) {
        return jsonResponse({ success: false, error: "Licenca nao existe." }, 404, corsHeaders);
      }

      const storeId = normalizeStoreId(license.loja_id || license.loja);
      if (storeId !== loja) {
        return jsonResponse({ success: false, error: "Loja incorreta." }, 403, corsHeaders);
      }

      if (String(license.token || "") !== token) {
        return jsonResponse({ success: false, error: "Token incorreto." }, 403, corsHeaders);
      }

      if (codigo && license._legacy_key && codigo !== license._legacy_key) {
        return jsonResponse({ success: false, error: "Licenca incorreta." }, 403, corsHeaders);
      }

      const store = state.normalized.lojas[storeId] || null;
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
        return jsonResponse({ success: false, error: "Body invalido" }, 400, corsHeaders);
      }

      const loja = normalizeStoreId(body.loja);
      const hwid = String(body.hwid || "").trim();
      if (!loja || !hwid) {
        return jsonResponse({ success: false, error: "Campos incompletos" }, 400, corsHeaders);
      }

      const state = await loadState(env);
      const store = state.normalized.lojas[loja];
      if (!store) {
        return jsonResponse({ success: false, error: "Loja nao encontrada" }, 404, corsHeaders);
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

      const state = await loadState(env);
      const store = state.normalized.lojas[loja];
      if (!store) {
        return jsonResponse({ success: false, error: "Loja nao encontrada" }, 404, corsHeaders);
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

      if (!hwid) {
        return jsonResponse(
          { success: false, error: "HWID e obrigatorio" },
          400,
          corsHeaders
        );
      }

      const state = await loadState(env);
      const license = state.normalized.licencasByHwid[hwid] || null;
      const storeId = normalizeStoreId(license?.loja_id || license?.loja || "");
      const store = storeId ? state.normalized.lojas[storeId] || null : null;
      const isActive = Boolean(license && store && (license.estado || "ativa") === "ativa");

      return jsonResponse(
        {
          success: true,
          schema: "v2",
          hwid,
          ativa: isActive,
          precisaAtivacao: !license,
          loja: storeId || null,
          checkedAt: nowIso(),
        },
        200,
        corsHeaders
      );
    }

    if (pathname === "/heartbeat" && request.method === "POST") {
      const body = await request.json().catch(() => ({}));
      const hwid = String(body?.hwid || "").trim();

      if (!hwid) {
        return jsonResponse(
          { success: false, error: "HWID e obrigatorio" },
          400,
          corsHeaders
        );
      }

      const state = await loadState(env);
      const license = state.normalized.licencasByHwid[hwid] || null;
      const storeId = normalizeStoreId(license?.loja_id || license?.loja || "");
      const isActive = Boolean(license && storeId && state.normalized.lojas[storeId]);

      const kv = getKvNamespace(env);
      if (!kv) {
        return jsonResponse({ success: false, error: "KV namespace nao configurado" }, 500, corsHeaders);
      }

      if (license?.instalacao_id) {
        const installationKey = `instalacao:${license.instalacao_id}`;
        const installation = await readJson(kv, installationKey);
        if (installation && typeof installation === "object") {
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
