let API_BASE = "";

// setter
export function setApiBaseUrl(url) {
  API_BASE = url;
}

// getter
export function getApiBaseUrl() {
  return API_BASE;
}

const DEFAULT_HEADERS = {
  "Accept": "application/json"
};


// Escuto a resposta, seu som no ar,
// Clono o texto para poder guardar.
// Cabeçalhos busco para me informar,
// Se o JSON vier, eu vou celebrar.
async function logResponse(res) {
  // Só loga erros, não loga mais JSON gigante
  if (!res.ok) {
    const text = await res.clone().text();

  }

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

  if (!res.ok) {
    throw new Error(`Erro HTTP: ${res.status} - ${text.slice(0, 100)}`);
  }

  if (!text || text.trim() === "") {
    // ✅ backend não devolveu nada → não crasha
    return null;
  }

  if (!contentType.includes('application/json')) {
    throw new Error(`Resposta inesperada da API (não é JSON): ${text.slice(0, 100)}`);
  }

  return JSON.parse(text);
}


/* Fornecedores vêm na mão,
Com nomes e identificação,
Busco-os com dedicação,
Para a app ganhar direção. */
export async function fetchFornecedores() {
  const url = `${API_BASE}/fornecedores`;
  //console.log('Fetching:', url);
  const resObj = await logResponse(await fetch(url, {
    headers: DEFAULT_HEADERS

  }));
  return checkJsonResponse(resObj);
}

/* Famílias vêm em sequência,
Categorias com essência,
Busco-as com paciência,
Pra dar ao código presença. */
export async function fetchFamilias() {
  const url = `${API_BASE}/familias`;
  //console.log('Fetching:', url);
  const resObj = await logResponse(await fetch(url, {
    headers: DEFAULT_HEADERS

  }));
  return checkJsonResponse(resObj);
}

/* Subfamílias a detalhar,
Dentro do todo a explicar,
Busco dados para mostrar,
E o sistema aprimorar. */
export async function fetchSubfamilias() {
  const url = `${API_BASE}/subfamilias`;
  //console.log('Fetching:', url);
  const resObj = await logResponse(await fetch(url, {
    headers: DEFAULT_HEADERS

  }));
  return checkJsonResponse(resObj);
}

/* Produto busco pelo código e fornecedor,
Se não pertencer, lança-se o torpor,
Se não existir, erro com vigor,
Se JSON chegar, é puro amor. */


export async function fetchProdutoPorCodigo(codigo, fornecedorId = null) {
  const baseUrl = getApiBaseUrl();
  if (!baseUrl) throw new Error("API_BASE ainda não foi definido!");

  const qs = fornecedorId ? `?fornecedor=${encodeURIComponent(fornecedorId)}` : "";
  const res = await fetch(`${baseUrl}/produto/${encodeURIComponent(codigo)}${qs}`, {
    headers: { "Accept": "application/json" },
  });

  if (!res.ok) throw new Error("Erro ao buscar produto");
  return res.json();
}





/* Atualizar stock com precisão,
Soma ou subtração,
PATCH no coração,
Pra manter a informação. */
export async function atualizarStock(codbarras, quantidadeAdd) {
  const url = `${API_BASE}/produto/${codbarras}/stock`;
  //console.log('PATCH:', url, 'Body:', { quantidade: Number(quantidadeAdd) });
  const resObj = await logResponse(await fetch(url, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ quantidade: Number(quantidadeAdd) }),
  }));
  return checkJsonResponse(resObj);
}

/* Preço novo a definir,
Valor para atribuir,
PATCH para transmitir,
Dados que vão fluir. */
export async function atualizarPreco(codbarras, novoPreco) {
  const url = `${API_BASE}/produto/${codbarras}/preco`;
  //console.log('PATCH:', url, 'Body:', { preco: parseFloat(novoPreco) });
  const resObj = await logResponse(await fetch(url, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json'
    }
    ,
    body: JSON.stringify({ preco: parseFloat(novoPreco) }),
  }));
  return checkJsonResponse(resObj);
}

/* Preço de compra a atualizar,
Valor certo pra calcular,
PATCH para enviar,
O sistema vai ajustar. */
export async function atualizarPrecoCompra(codbarras, novoPrecoCompra) {
  const url = `${API_BASE}/produto/${codbarras}/precocompra`;
  //console.log('PATCH:', url, 'Body:', { preco: parseFloat(novoPrecoCompra) });
  const resObj = await logResponse(await fetch(url, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json'
    }
    ,
    body: JSON.stringify({ preco: parseFloat(novoPrecoCompra) }),
  }));
  return checkJsonResponse(resObj);
}

/* Margem bruta a alterar,
Para o lucro equilibrar,
PATCH para enviar,
Dados para atualizar. */
export async function atualizarMargemBruta(codbarras, novaMargem) {
  const url = `${API_BASE}/produto/${codbarras}/margembruta`;
  //console.log('PATCH:', url, 'Body:', { margembruta: parseFloat(novaMargem) });
  const resObj = await logResponse(await fetch(url, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ margembruta: parseFloat(novaMargem) }),
  }));
  return checkJsonResponse(resObj);
}

/* Produto novo a criar,
Dados para enviar,
POST para gravar,
Novo item a brilhar. */
export async function criarProduto(produto) {
  const url = `${API_BASE}/produto`;
  //console.log('POST:', url, 'Body:', produto);
  const resObj = await logResponse(await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    }
    ,
    body: JSON.stringify(produto),
  }));
  return checkJsonResponse(resObj);
}

export async function atualizarFornecedor(codigo, fornecedor) {
  const url = `${API_BASE}/produto/${codigo}/fornecedor`;

  const res = await fetch(url, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ fornecedor })
  });

  if (!res.ok) {
    throw new Error("Erro ao atualizar fornecedor");
  }
}



/* Preço de venda a ajustar,
Com IVA a calcular,
PATCH para atualizar,
Lucro a confirmar. */
export async function atualizarPrecoVenda(codbarras, novoPrecoVenda) {
  const url = `${API_BASE}/produto/${codbarras}/preco`;
  const resObj = await logResponse(await fetch(url, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json'
    }
    ,
    body: JSON.stringify({ preco: parseFloat(novoPrecoVenda) }),
  }));
  return checkJsonResponse(resObj);
}
