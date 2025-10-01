import React, { useState, useEffect } from 'react';
import FornecedorSelect from './components/FornecedorSelect';
import Scanner from './components/Scanner';
import ProdutoTable from './components/ProdutoTable';
import useFornecedores from './hooks/useFornecedores';
import useSubfamilias from './hooks/useSubfamilias';
import useFamilias from './hooks/useFamilias';
import {
  fetchProdutoPorCodigo,
  criarProduto,
  atualizarStock,
  atualizarPrecoCompra,
  atualizarMargemBruta,
} from './services/api';
import StockModal from './components/StockModal';
import PrecoCompraModal from './components/PrecoCompraModal';
import PrecoVendaModal from './components/PrecoVendaModal';

import MargemModal from './components/MargemModal';
import AlertaMensagem from './components/AlertaMensagem';
import NovoProdutoModal from './components/NovoProdutoModal';
import ConfirmarApagarModal from './components/ConfirmarApagarModal';
import ConfirmarEnviarModal from './components/ConfirmarEnviarModal';
import 'bootstrap/dist/css/bootstrap.min.css';
import 'bootstrap-icons/font/bootstrap-icons.css';
import { setApiBaseUrl, fetchFornecedores, fetchFamilias, fetchSubfamilias } from "./services/api";
import * as apiModule from "./services/api";
function useStickyState(defaultValue, key) {
  const [value, setValue] = useState(() => {
    try {
      const stickyValue = window.localStorage.getItem(key);
      return stickyValue !== null ? JSON.parse(stickyValue) : defaultValue;
    } catch {
      return defaultValue;
    }
  });

  useEffect(() => {
    try {
      window.localStorage.setItem(key, JSON.stringify(value));
    } catch {

    }
  }, [key, value]);

  return [value, setValue];
}

export default function App() {

  const [apiBaseUrl, setApiBaseUrl] = useState(null);
  const [loadingApiUrl, setLoadingApiUrl] = useState(true);

  const [fornecedores, setFornecedores] = useState([]);
const [familias, setFamilias] = useState([]);
const [subfamilias, setSubfamilias] = useState([]);

const [produtoParaPrecoVenda, setProdutoParaPrecoVenda] = React.useState(null);

  const [mostrarModalNovoProduto, setMostrarModalNovoProduto] = useState(false);
  const [fornecedorSelecionado, setFornecedorSelecionado] = useState('');
  const [scanning, setScanning] = useState(false);
  const [produtos, setProdutos] = useStickyState([], 'produtos');
  const [alteracoesPendentes, setAlteracoesPendentes] = useStickyState(
    { stock: {}, precoCompra: {}, margem: {}, criarProdutos: [] },
    'alteracoesPendentes'
  );

  const [produtoParaConfirmar, setProdutoParaConfirmar] = useState(null);
  const [produtoParaStock, setProdutoParaStock] = useState(null);
  const [produtoParaPrecoCompra, setProdutoParaPrecoCompra] = useState(null);
  
  const [produtoParaMargem, setProdutoParaMargem] = useState(null);
  const [produtoParaApagar, setProdutoParaApagar] = useState(null);

  const [mostrarModalConfirmarApagar, setMostrarModalConfirmarApagar] = useState(false);
  const [mostrarModalConfirmarEnvio, setMostrarModalConfirmarEnvio] = useState(false);
  const [quantidadeStock, setQuantidadeStock] = useState(0);


  const [alerta, setAlerta] = useState(null);
  const [enviando, setEnviando] = useState(false);

   const [apiUrl, setApiUrl] = useState(null);
  

   const [mostrarModalToken, setMostrarModalToken] = useState(true);
   const [tokenLoja, setTokenLoja] = useState("");
   const [lojasJson, setLojasJson] = useState(null);
   const [lojaSelecionada, setLojaSelecionada] = useState(null);

   
useEffect(() => {
    const fetchLojas = async () => {
      try {
        const res = await fetch(
          "https://api.jsonbin.io/v3/b/68da52d643b1c97be953f81d",
          {
            headers: {
              "X-Master-Key":
                "$2a$10$dFB8X2yaA./aPT1YsAQs/u58X7hDIzfOFUIqq5QoPGzcQHr2E/fz2",
            },
          }
        );
        const data = await res.json();
        setLojasJson(data.record);
      } catch (err) {
        console.error("Erro ao buscar JSON das lojas:", err);
      }
    };
    fetchLojas();
  }, []);

  // Validar token da loja
  function validarToken() {
    if (!lojasJson) return;

    const loja = Object.entries(lojasJson.lojas).find(
      ([_, info]) => info.token === tokenLoja
    );

    if (loja) {
      setLojaSelecionada(loja[0]);
      setMostrarModalToken(false);
    } else {
      alert("Token inválido!");
    }
  }

  // Configurar API ao selecionar loja
  useEffect(() => {
    if (!lojaSelecionada || !lojasJson) return;

    const lojaData = lojasJson.lojas[lojaSelecionada];
    if (lojaData && lojaData.url) {
      
      setApiUrl(lojaData.url);
      apiModule.setApiBaseUrl(lojaData.url);
      
      
      //console.log(
        //`API URL definida para a loja '${lojaSelecionada}':`,
        //lojaData.url
      //);
    } else {
      console.warn(`URL da loja '${lojaSelecionada}' não encontrada.`);
    }
  }, [lojaSelecionada, lojasJson]);


  useEffect(() => {
    async function fetchApiUrl() {
      try {
        const res = await fetch(
          "https://api.jsonbin.io/v3/b/68da52d643b1c97be953f81d",
          {
            headers: {
              "X-Master-Key":
                "$2a$10$dFB8X2yaA./aPT1YsAQs/u58X7hDIzfOFUIqq5QoPGzcQHr2E/fz2",
            },
          }
        );

        const data = await res.json();
        //console.log("Resposta JSONBin:", data);

        if (data.record && data.record.ngrok) {
          const url = data.record.ngrok;
          setApiUrl(url);
          setApiBaseUrl(url); // aplica no módulo api
          //console.log("✅ API Base URL definida:", url);
        } else {
          //console.warn("⚠️ O campo 'ngrok' não existe em data.record", data.record);
        }
      } catch (err) {
        //console.error("Erro a buscar API URL:", err);
      }
    }

    fetchApiUrl();
  }, []);

  // 2º useEffect → só corre QUANDO apiUrl já existir
  useEffect(() => {
  if (!apiUrl) return; // espera até termos a URL válida

  import('./services/api').then(apiModule => {
    apiModule.setApiBaseUrl(apiUrl); // define a URL no módulo

    const carregarDados = async () => {
  try {
    const fornecedoresData = await apiModule.fetchFornecedores();
    setFornecedores(fornecedoresData);
    //console.log("Fornecedores:", fornecedoresData);

    const familiasData = await apiModule.fetchFamilias();
    setFamilias(familiasData);
    //console.log("Familias:", familiasData);

    const subfamiliasData = await apiModule.fetchSubfamilias();
    setSubfamilias(subfamiliasData);
    //console.log("Subfamilias:", subfamiliasData);
  } catch (err) {
    //.error("Erro ao carregar dados da API:", err);
  }
};

    carregarDados();
  });
}, [apiUrl]);


  // 3º useEffect → timeout do alerta
  useEffect(() => {
    if (alerta) {
      const timer = setTimeout(() => setAlerta(null), 3000);
      return () => clearTimeout(timer);
    }
  }, [alerta]);


  useEffect(() => {
  const handleBeforeUnload = (e) => {
    if (
      Object.keys(alteracoesPendentes.stock).length > 0 ||
      Object.keys(alteracoesPendentes.precoCompra).length > 0 ||
      Object.keys(alteracoesPendentes.margem).length > 0 ||
      alteracoesPendentes.criarProdutos.length > 0
    ) {
      e.preventDefault();
      e.returnValue = '';
    }
  };

  window.addEventListener('beforeunload', handleBeforeUnload);
  return () => window.removeEventListener('beforeunload', handleBeforeUnload);
}, [alteracoesPendentes]);








async function onDetected(code) {
  setAlerta(null);
  if (!fornecedorSelecionado) {
    setAlerta({ tipo: 'erro', mensagem: 'Seleciona um fornecedor antes de ler produto.' });
    return;
  }
  try {
    const dataProduto = await fetchProdutoPorCodigo(code, fornecedorSelecionado);
    if (produtos.find(p => p.codbarras === dataProduto.codbarras)) {
      setAlerta({ tipo: 'erro', mensagem: 'Produto já lido.' });
      return;
    }
    setProdutoParaConfirmar(dataProduto);
  } catch (err) {
    setAlerta({ tipo: 'erro', mensagem: err.message });
  }
}

function confirmarAdicaoComStock() {
  if (quantidadeStock <= 0) {
    setAlerta({ tipo: 'erro', mensagem: 'Insira uma quantidade de stock maior que zero.' });
    return;
  }

  if (produtoParaConfirmar) {

    // Adiciona o produto apenas se ainda não estiver na lista
    setProdutos(prev => {
      const exists = prev.find(p => p.codbarras === produtoParaConfirmar.codbarras);
      if (exists) return prev; // já existe, não adiciona de novo
      return [...prev, produtoParaConfirmar];
    });

    // Atualiza apenas o stock pendente
    setAlteracoesPendentes(prev => ({
      ...prev,
      stock: {
        ...prev.stock,
        [produtoParaConfirmar.codbarras]: (prev.stock[produtoParaConfirmar.codbarras] || 0) + quantidadeStock,
      }
    }));

    setProdutoParaConfirmar(null);
    setAlerta({ tipo: 'sucesso', mensagem: 'Produto adicionado com stock!' });
    setQuantidadeStock(0);
  }
}



function cancelarAdicao() {
  setProdutoParaConfirmar(null);
}

function handleAtualizarStockLocal(codbarras, novoStock) {
  setAlteracoesPendentes(prev => ({
    ...prev,
    stock: {
      ...prev.stock,
      [codbarras]: Number(novoStock), // substitui o valor antigo
    },
  }));

  setProdutoParaStock(null);
  setAlerta({ tipo: 'info', mensagem: 'Alteração de stock guardada localmente' });
}




function handleAtualizarPrecoCompraLocal(codbarras, novoPrecoCompra) {
  setProdutos(prev =>
    prev.map(p =>
      p.codbarras === codbarras ? { ...p, precocompra: novoPrecoCompra } : p
    )
  );
  setAlteracoesPendentes(prev => ({
    ...prev,
    precoCompra: {
      ...prev.precoCompra,
      [codbarras]: novoPrecoCompra,
    },
  }));
  setProdutoParaPrecoCompra(null);
  setAlerta({ tipo: 'info', mensagem: 'Alteração de preço de compra guardada localmente' });
}

function handleAtualizarMargemLocal(codbarras, novaMargem) {
  setProdutos(prev =>
    prev.map(p =>
      p.codbarras === codbarras ? { ...p, margembruta: novaMargem } : p
    )
  );
  setAlteracoesPendentes(prev => ({
    ...prev,
    margem: {
      ...prev.margem,
      [codbarras]: novaMargem,
    },
  }));
  setProdutoParaMargem(null);
  setAlerta({ tipo: 'info', mensagem: 'Alteração de margem bruta guardada localmente' });
}


function handleAtualizarPrecoVendaLocal(codbarras, novoPrecoVenda) {
  setProdutos(prev =>
    prev.map(p => {
      if (p.codbarras === codbarras) {
        const precoCompra = Number(p.precocompra);
        const precoVenda = Number(novoPrecoVenda);
        const novaMargem = precoCompra > 0
          ? ((precoVenda - precoCompra) / precoCompra * 100).toFixed(2)
          : 0;
        return { ...p, margembruta: Number(novaMargem), precovenda: precoVenda };
      }
      return p;
    })
  );

  setAlteracoesPendentes(prev => ({
    ...prev,
    margem: {
      ...prev.margem,
      [codbarras]: Number(((novoPrecoVenda - produtos.find(p => p.codbarras === codbarras).precocompra) / produtos.find(p => p.codbarras === codbarras).precocompra * 100).toFixed(2)),
    },
  }));
}


function handleCriarProdutoLocal(produto) {
  setProdutos(prev => [...prev, produto]);
  setAlteracoesPendentes(prev => ({
    ...prev,
    criarProdutos: [...prev.criarProdutos, produto],
  }));
  setMostrarModalNovoProduto(false);
  setAlerta({ tipo: 'info', mensagem: 'Produto novo guardado localmente' });
}

function handleApagarProduto(codbarras) {
  setProdutos(prev => prev.filter(p => p.codbarras !== codbarras));

  setAlteracoesPendentes(prev => ({
    stock: Object.fromEntries(
      Object.entries(prev.stock).filter(([key]) => key !== codbarras)
    ),
    precoCompra: Object.fromEntries(
      Object.entries(prev.precoCompra).filter(([key]) => key !== codbarras)
    ),
    margem: Object.fromEntries(
      Object.entries(prev.margem).filter(([key]) => key !== codbarras)
    ),
    criarProdutos: prev.criarProdutos.filter(p => p.codbarras !== codbarras),
  }));

  setAlerta({ tipo: 'info', mensagem: 'Produto apagado localmente' });
}

function pedirConfirmacaoApagar(produto) {
  setProdutoParaApagar(produto);
  setMostrarModalConfirmarApagar(true);
}

function abrirModalConfirmarEnvio() {
  setMostrarModalConfirmarEnvio(true);
}

function fecharModalConfirmarEnvio() {
  setMostrarModalConfirmarEnvio(false);
}

async function enviarTodasAlteracoes() {
  setEnviando(true);
  setMostrarModalConfirmarEnvio(false);
  try {
    for (const novoProd of alteracoesPendentes.criarProdutos) {
      await criarProduto(novoProd);
    }

    for (const [codbarras, qtd] of Object.entries(alteracoesPendentes.stock)) {
      await atualizarStock(codbarras, qtd);
    }

    for (const [codbarras, preco] of Object.entries(alteracoesPendentes.precoCompra)) {
      await atualizarPrecoCompra(codbarras, preco);
    }

    for (const [codbarras, margem] of Object.entries(alteracoesPendentes.margem)) {
      await atualizarMargemBruta(codbarras, margem);
    }

    setAlteracoesPendentes({ stock: {}, precoCompra: {}, margem: {}, criarProdutos: [] });
    setProdutos([]);
    window.localStorage.removeItem('produtos');
    window.localStorage.removeItem('alteracoesPendentes');

    setAlerta({ tipo: 'sucesso', mensagem: 'Todas as alterações foram enviadas com sucesso!' });
  } catch (err) {
    setAlerta({ tipo: 'erro', mensagem: 'Erro ao enviar alterações: ' + err.message });
  } finally {
    setEnviando(false);
  }
}



return (
  
  <div className="container my-4 p-4 bg-light rounded shadow text-center" style={{ minHeight: '100vh' }}>
{mostrarModalToken && (
        <div
          className="modal d-block fade show"
          tabIndex="-1"
          style={{ backgroundColor: "rgba(0,0,0,0.5)" }}
        >
          <div className="modal-dialog modal-dialog-centered">
            <div className="modal-content shadow-lg">
              <div className="modal-header bg-primary text-white">
                <h5 className="modal-title">Bem-vindo</h5>
              </div>
              <div className="modal-body">
                <p>Insira o token da sua loja para continuar:</p>
                <input
                  type="text"
                  className="form-control"
                  placeholder="Token"
                  value={tokenLoja}
                  onChange={(e) => setTokenLoja(e.target.value)}
                />
              </div>
              <div className="modal-footer">
                <button
                  className="btn btn-success w-100"
                  onClick={validarToken}
                >
                  Confirmar
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
  
    <h1 className="mb-4">Scanner Código de Barras</h1>

    <button
      className="btn btn-success mb-3 me-2"
      onClick={() => setMostrarModalNovoProduto(true)}
      disabled={enviando}
    >
      + Adicionar Produto
    </button>

    {alerta && (
      <AlertaMensagem
        tipo={alerta.tipo}
        mensagem={alerta.mensagem}
        onFechar={() => setAlerta(null)}
      />
    )}

    <FornecedorSelect
  fornecedores={fornecedores}
  fornecedorSelecionado={fornecedorSelecionado}
  setFornecedorSelecionado={value => {
    setFornecedorSelecionado(value);
    setAlerta(null);
  }}
  disabled={enviando}
/>


    {fornecedorSelecionado && (
      <>
        <Scanner scanning={scanning} setScanning={setScanning} onDetected={onDetected} />

        {!scanning ? (
          <button
            className="btn btn-primary mb-3"
            onClick={() => setScanning(true)}
            disabled={enviando}
          >
            Iniciar Scanner
          </button>
        ) : (
          <button
            className="btn btn-danger mb-3"
            onClick={() => setScanning(false)}
            disabled={enviando}
          >
            Parar Scanner
          </button>
        )}
      </>
    )}

    {produtos.length > 0 ? (
      <>
        <ProdutoTable
          produtos={produtos}
          alteracoesPendentesStock={alteracoesPendentes.stock}
          onAbrirStock={setProdutoParaStock}
          onAbrirPrecoCompra={setProdutoParaPrecoCompra}
          onAbrirMargem={setProdutoParaMargem}
          onAbrirPrecoVenda={setProdutoParaPrecoVenda}
          onPedirConfirmacaoApagar={pedirConfirmacaoApagar}
          disabled={enviando}
          setAlerta={setAlerta} 
        />


        {(Object.keys(alteracoesPendentes.stock).length > 0 ||
          Object.keys(alteracoesPendentes.precoCompra).length > 0 ||
          Object.keys(alteracoesPendentes.margem).length > 0 ||
          alteracoesPendentes.criarProdutos.length > 0) && (
            <button className="btn btn-primary mt-3" onClick={abrirModalConfirmarEnvio} disabled={enviando}>
              Enviar todas as alterações
            </button>
          )}
      </>
    ) : (
      <p className="text-muted fst-italic">Nenhum produto lido ainda.</p>
    )}

    {produtoParaStock && (
      <StockModal
        produto={produtoParaStock}
        onFechar={() => setProdutoParaStock(null)}
        onConfirmar={handleAtualizarStockLocal}
        disabled={enviando}
      />
    )}

    {produtoParaPrecoCompra && (
      <PrecoCompraModal
        produto={produtoParaPrecoCompra}
        onFechar={() => setProdutoParaPrecoCompra(null)}
        onConfirmar={handleAtualizarPrecoCompraLocal}
        disabled={enviando}
      />
    )}

    {produtoParaMargem && (
      <MargemModal
        produto={produtoParaMargem}
        onFechar={() => setProdutoParaMargem(null)}
        onConfirmar={handleAtualizarMargemLocal}
        disabled={enviando}
      />
    )}


    {produtoParaPrecoVenda && (
  <PrecoVendaModal
    produto={produtoParaPrecoVenda}
    onFechar={() => setProdutoParaPrecoVenda(null)}
    onConfirmar={handleAtualizarPrecoVendaLocal}
    disabled={enviando}
  />
)}


    {mostrarModalNovoProduto && (
      <NovoProdutoModal
        onFechar={() => setMostrarModalNovoProduto(false)}
        onConfirmar={handleCriarProdutoLocal}
        fornecedores={fornecedores}
        familias={familias}
        subfamilias={subfamilias}
        disabled={enviando}
        apiUrl={apiUrl} 
      />
    )}

    {mostrarModalConfirmarApagar && produtoParaApagar && (
      <ConfirmarApagarModal
        show={mostrarModalConfirmarApagar}
        produto={produtoParaApagar}
        onClose={() => setMostrarModalConfirmarApagar(false)}
        onConfirmar={(codbarras) => {
          handleApagarProduto(codbarras);
          setMostrarModalConfirmarApagar(false);
          setProdutoParaApagar(null);
        }}
        disabled={enviando}
      />
    )}

    {produtoParaConfirmar && (
      <div
        className="modal show d-block"
        tabIndex="-1"
        role="dialog"
        aria-modal="true"
        style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}
      >
        <div className="modal-dialog modal-dialog-centered" role="document">
          <div className="modal-content text-start">
            <div className="modal-header">
              <h5 className="modal-title">Confirmar Adição</h5>
              <button type="button" className="btn-close" onClick={cancelarAdicao} disabled={enviando}></button>
            </div>
            <div className="modal-body">
              <p>
                <strong>Descrição:</strong> {produtoParaConfirmar.descricao}
              </p>
<p>
              <strong>Código de Barras:</strong> {produtoParaConfirmar.codbarras}
</p>
              <label htmlFor="quantidadeInput" className="form-label mt-3"><strong>Quantidade de Stock:</strong></label>
              <div className="d-flex align-items-center gap-2">
                <button
                  className="btn btn-outline-danger"
                  onClick={() => setQuantidadeStock(q => (q > 0 ? q - 1 : 0))}
                  disabled={quantidadeStock <= 0}
                >
                  -
                </button>
                <input
                  type="number"
                  id="quantidadeInput"
                  className="form-control text-center"
                  value={quantidadeStock}
                  onChange={e => {
                    const val = Number(e.target.value);
                    if (!isNaN(val) && val >= 0) setQuantidadeStock(val);
                  }}
                  min={0}

                />
                <button
                  className="btn btn-outline-success"
                  onClick={() => setQuantidadeStock(q => q + 1)}
                >
                  +
                </button>
              </div>
            </div>
            <div className="modal-footer">
              <button
                type="button"
                className="btn btn-secondary"
                onClick={cancelarAdicao}
                disabled={enviando}
              >
                Cancelar
              </button>
              <button
                type="button"
                className="btn btn-primary"
                onClick={() => confirmarAdicaoComStock()}
                disabled={enviando}
              >
                Confirmar
              </button>
            </div>
          </div>
        </div>
      </div>
    )}




    <ConfirmarEnviarModal
      show={mostrarModalConfirmarEnvio}
      onClose={fecharModalConfirmarEnvio}
      onConfirmar={enviarTodasAlteracoes}
      disabled={enviando}
    />
  </div>
);
}
