import { normalizarTextoPt } from "./texto";
import { getBrowserPublicUrl } from "./backendConfig";

let API_BASE = "";

// setter
export function setApiBaseUrl(url) {
  API_BASE = url;
}

// getter
export function getApiBaseUrl() {
  return API_BASE;
}

function trimTrailingSlash(url) {
  return String(url || "").replace(/\/+$/, "");
}

function getPublicFallbackBase() {
  if (typeof window === "undefined") return "";
  const fallbackBase = getBrowserPublicUrl(window.localStorage.getItem("apiUrlPublic") || "");
  if (!fallbackBase) {
    window.localStorage.removeItem("apiUrlPublic");
  }
  return fallbackBase;
}

function buildFallbackUrl(url) {
  const fallbackBase = getPublicFallbackBase();
  const apiBase = trimTrailingSlash(API_BASE);
  const currentUrl = String(url || "");

  if (!fallbackBase || !apiBase || fallbackBase === apiBase) return "";
  if (!currentUrl.startsWith(apiBase)) return "";

  return `${fallbackBase}${currentUrl.slice(apiBase.length)}`;
}

function shouldTryPublicFallback(res) {
  return [502, 503, 504].includes(Number(res?.status || 0));
}

function getRequestMethod(options = {}) {
  return String(options.method || "GET").trim().toUpperCase();
}

function shouldRetryRead(res, options = {}) {
  return getRequestMethod(options) === "GET" && [502, 503, 504].includes(Number(res?.status || 0));
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function fetchWithPublicFallback(url, options = {}) {
  const requestOptions = withDefaultHeaders(options);
  let response = await fetch(url, requestOptions);

  if (shouldRetryRead(response, requestOptions)) {
    await delay(800);
    response = await fetch(url, requestOptions);
  }

  const fallbackUrl = buildFallbackUrl(url);

  if (!fallbackUrl || !shouldTryPublicFallback(response)) {
    return response;
  }

  return fetch(fallbackUrl, requestOptions);
}

const DEFAULT_HEADERS = {
  "Accept": "application/json"
};

function withDefaultHeaders(options = {}) {
  return {
    ...options,
    headers: {
      ...DEFAULT_HEADERS,
      ...(options.headers || {})
    }
  };
}

function parseJsonSafe(text) {
  if (!text || text.trim() === "") return null;

  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function isLicensePayload(payload) {
  return Boolean(payload?.precisaLicenca || payload?.precisaAtivacao);
}

function getApiErrorMessage(res, text, payload) {
  if (isLicensePayload(payload)) {
    return normalizarTextoPt("Máquina não licenciada. A aguardar ativação.");
  }

  const mensagem =
    payload?.erro ||
    payload?.error ||
    payload?.mensagem ||
    payload?.message;

  if (mensagem) return normalizarTextoPt(mensagem);

  return normalizarTextoPt(`Erro HTTP: ${res.status} - ${String(text || "").slice(0, 100)}`);
}

async function pedirLicencaSilencioso() {
  if (!API_BASE) return false;

  try {
    const res = await fetch(`${API_BASE}/pedir-licenca`, withDefaultHeaders());
    const text = await res.text();
    const data = parseJsonSafe(text);

    return res.ok && data?.success !== false;
  } catch {
    return false;
  }
}


// Escuto a resposta, seu som no ar,
// Clono o texto para poder guardar.
// Cabeçalhos busco para me informar,
// Se o JSON vier, eu vou celebrar.
async function logResponse(res) {
  // Só loga erros, não loga mais JSON gigante
  return {
    res,
    text: await res.clone().text(),
    contentType: res.headers.get('content-type') || ''
  };
}


// Se a resposta não é JSON, é confusão,
// Levanto um erro com toda a precisão.
// Se o status não for OK, há frustração,
// Caso contrário, retorno a conversação.
async function checkJsonResponse(resObj) {
  const { res, text, contentType } = resObj;
  const payload = parseJsonSafe(text);

  if (!res.ok) {
    const error = new Error(getApiErrorMessage(res, text, payload));
    error.status = res.status;
    error.body = text;
    error.data = payload;
    error.precisaLicenca = isLicensePayload(payload);
    throw error;
  }

  if (!text || text.trim() === "") {
    // ✅ backend não devolveu nada → não crasha
    return null;
  }

  if (!contentType.includes('application/json')) {
    throw new Error(normalizarTextoPt(`Resposta inesperada da API (não é JSON): ${text.slice(0, 100)}`));
  }

  return payload ?? JSON.parse(text);
}

async function fetchJson(url, options = {}, { retryLicenca = true } = {}) {
  const requestOptions = withDefaultHeaders(options);

  try {
    const resObj = await logResponse(await fetchWithPublicFallback(url, requestOptions));
    return await checkJsonResponse(resObj);
  } catch (err) {
    if (!retryLicenca || !err?.precisaLicenca) {
      throw err;
    }

    const licencaOk = await pedirLicencaSilencioso();
    if (!licencaOk) {
      throw err;
    }

    const resObj = await logResponse(await fetchWithPublicFallback(url, requestOptions));
    return checkJsonResponse(resObj);
  }
}


/* Fornecedores vêm na mão,
Com nomes e identificação,
Busco-os com dedicação,
Para a app ganhar direção. */
export async function fetchFornecedores() {
  const url = `${API_BASE}/fornecedores`;
  return fetchJson(url);
}

export async function criarFornecedor(fornecedor) {
  const url = `${API_BASE}/fornecedores`;
  return fetchJson(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(fornecedor)
  });
}

/* Famílias vêm em sequência,
Categorias com essência,
Busco-as com paciência,
Pra dar ao código presença. */
export async function fetchFamilias() {
  const url = `${API_BASE}/familias`;
  return fetchJson(url);
}

/* Subfamílias a detalhar,
Dentro do todo a explicar,
Busco dados para mostrar,
E o sistema aprimorar. */
export async function fetchSubfamilias() {
  const url = `${API_BASE}/subfamilias`;
  return fetchJson(url);
}

/* Produto busco pelo código e fornecedor,
Se não pertencer, lança-se o torpor,
Se não existir, erro com vigor,
Se JSON chegar, é puro amor. */


export async function fetchProdutoPorCodigo(codigo) {
  const baseUrl = getApiBaseUrl();
  if (!baseUrl) throw new Error("API_BASE ainda não foi definido!");

  return fetchJson(`${baseUrl}/produto/${encodeURIComponent(codigo)}`);
}






/* Atualizar stock com precisão,
Soma ou subtração,
PATCH no coração,
Pra manter a informação. */
export async function atualizarStock(codbarras, quantidadeAdd) {
  const url = `${API_BASE}/produto/${codbarras}/stock`;
  return fetchJson(url, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ quantidade: Number(quantidadeAdd) }),
  });
}

/* Preço novo a definir,
Valor para atribuir,
PATCH para transmitir,
Dados que vão fluir. */
export async function fetchTiposDocumentoInventario() {
  const url = `${API_BASE}/tiposdocumento/inventario`;
  return fetchJson(url);
}

export async function criarDocumentoInventario({ tipoDoc = "IN", serie, produtos, empregadoId }) {
  const url = `${API_BASE}/criarDocumentoInventario`;
  return fetchJson(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ tipoDoc, serie, produtos, empregadoId })
  });
}

export async function fetchInventariosAbertos() {
  const url = `${API_BASE}/inventarios/abertos`;
  return fetchJson(url);
}

export async function fetchLinhasInventario(serie, numero) {
  const url = `${API_BASE}/inventarios/${encodeURIComponent(serie)}/${encodeURIComponent(numero)}/linhas`;
  return fetchJson(url);
}

export async function gravarLinhasInventario({ serie, numero, produtos, empregadoId }) {
  const url = `${API_BASE}/inventarios/${encodeURIComponent(serie)}/${encodeURIComponent(numero)}/linhas`;
  return fetchJson(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ produtos, empregadoId })
  });
}

export async function atualizarPreco(codbarras, novoPreco) {
  const url = `${API_BASE}/produto/${codbarras}/preco`;
  return fetchJson(url, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json'
    }
    ,
    body: JSON.stringify({ preco: parseFloat(novoPreco) }),
  });
}

/* Preço de compra a atualizar,
Valor certo pra calcular,
PATCH para enviar,
O sistema vai ajustar. */
export async function atualizarPrecoCompra(codbarras, novoPrecoCompra) {
  const url = `${API_BASE}/produto/${codbarras}/precocompra`;
  return fetchJson(url, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json'
    }
    ,
    body: JSON.stringify({ preco: parseFloat(novoPrecoCompra) }),
  });
}

/* Margem bruta a alterar,
Para o lucro equilibrar,
PATCH para enviar,
Dados para atualizar. */
export async function atualizarMargemBruta(codbarras, novaMargem) {
  const url = `${API_BASE}/produto/${codbarras}/margembruta`;
  return fetchJson(url, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ margembruta: parseFloat(novaMargem) }),
  });
}

/* Produto novo a criar,
Dados para enviar,
POST para gravar,
Novo item a brilhar. */
export async function criarProduto(produto) {
  const url = `${API_BASE}/produto`;
  return fetchJson(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    }
    ,
    body: JSON.stringify(produto),
  });
}

export async function atualizarFornecedor(codigo, fornecedor) {
  const url = `${API_BASE}/produto/${codigo}/fornecedor`;

  return fetchJson(url, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ fornecedor })
  });
}



/* Preço de venda a ajustar,
Com IVA a calcular,
PATCH para atualizar,
Lucro a confirmar. */
export async function atualizarPrecoVenda(codbarras, novoPrecoVenda) {
  const url = `${API_BASE}/produto/${codbarras}/preco`;
  return fetchJson(url, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json'
    }
    ,
    body: JSON.stringify({ preco: parseFloat(novoPrecoVenda) }),
  });
}
