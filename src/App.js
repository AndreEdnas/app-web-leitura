import React, { useState, useEffect } from 'react';
import 'bootstrap/dist/js/bootstrap.bundle.min.js';
import FornecedorSelect from './components/FornecedorSelect';
import Scanner from './components/Scanner';
import ScannerHardware from './components/ScannerHardware';
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
  atualizarPrecoVenda,
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
import LoginPage from './components/LoginPage';
import MenuPrincipal from "./components/MenuPrincipal";
import LojaSelectPage from "./components/LojaSelectPage";
import PCNaoAtivado from "./components/PCNaoAtivado";

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
  const [naoLicenciado, setNaoLicenciado] = useState(null);
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

  const [mostrarScannerHardware, setMostrarScannerHardware] = useState(false);

  const [alerta, setAlerta] = useState(null);
  const [enviando, setEnviando] = useState(false);

  const [apiUrl, setApiUrl] = useState(null);


  const [mostrarModalToken, setMostrarModalToken] = useState(true);
  const [tokenLoja, setTokenLoja] = useState("");
  const [lojasJson, setLojasJson] = useState(null);
  const [lojaSelecionada, setLojaSelecionada] = useState(null);
  // Tipo de documento selecionado (CFA ou CFS)
  const [tipoDocSelecionado, setTipoDocSelecionado] = useState(null);

  const [tiposDoc, setTiposDoc] = useState([]);


  const [empregado, setEmpregado] = useState(() => {
    const saved = localStorage.getItem('empregado');
    return saved ? JSON.parse(saved) : null;
  });

  const [paginaAtual, setPaginaAtual] = useState("menu");

  useEffect(() => {
    async function testarLicenca() {
      try {
        const res = await fetch("https://api.ednas.pt/pedir-licenca");
        if (!res.ok) throw new Error();
        const data = await res.json();

        if (data.success === false) {
          setNaoLicenciado(data);
        }
      } catch {
        // backend não está disponível ou não licenciado
      }
    }

    testarLicenca();
  }, []);



  useEffect(() => {
    const savedToken = localStorage.getItem("tokenLoja");
    const savedLoja = localStorage.getItem("lojaSelecionada");

    if (savedToken && savedLoja) {
      setTokenLoja(savedToken);
      setLojaSelecionada(savedLoja);
      setMostrarModalToken(false); // ✅ não mostra o modal
    }
  }, []);


  useEffect(() => {
    async function fetchTipos() {
      if (!apiUrl) return;
      try {
        const res = await fetch(`${apiUrl}/tiposdocumento`);


        const data = await res.json();
        if (data.length > 0) {
          setTiposDoc(data);
          // não define automaticamente o tipo selecionado
        }
      } catch (err) {
        console.error("Erro ao buscar tipos de documento:", err);
      }
    }
    fetchTipos();
  }, [apiUrl]);



  useEffect(() => {
    const fetchLojas = async () => {
      try {
        const res = await fetch("https://ednas-cloud.andre-86d.workers.dev/config", {
          headers: {
            "X-App-Key": "3dNas"
          }
        });

        

        const data = await res.json();
        setLojasJson(data);


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
      const lojaNome = loja[0];
      setLojaSelecionada(lojaNome);
      setMostrarModalToken(false);

      // ✅ Guardar loja e token localmente
      localStorage.setItem("tokenLoja", tokenLoja);
      localStorage.setItem("lojaSelecionada", lojaNome);
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





  if (naoLicenciado) {
    return (
      <PCNaoAtivado
        dados={naoLicenciado}
        onRevalidar={() => window.location.reload()}
      />
    );
  }




  async function onDetected(code) {
    setAlerta(null);

    try {
      const dataProduto = await fetchProdutoPorCodigo(code, fornecedorSelecionado);

      // Se o produto já foi lido, só avisa
      if (produtos.find(p => p.codbarras === dataProduto.codbarras)) {
        setAlerta({ tipo: 'erro', mensagem: 'Produto já lido.' });
        return;
      }

      // ✅ Guarda o produto para o modal de confirmação
      setProdutoParaConfirmar(dataProduto);

      // ✅ Abre automaticamente o modal de quantidade
      setQuantidadeStock(1); // podes mudar para 0 se quiser começar vazio

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
      prev.map(p => {
        if (p.codbarras === codbarras) {
          return recalcularProduto(p, 'precocompra', novoPrecoCompra);
        }
        return p;
      })
    );

    setAlteracoesPendentes(prev => ({
      ...prev,
      precoCompra: {
        ...prev.precoCompra,
        [codbarras]: novoPrecoCompra,
      },
    }));

    setProdutoParaPrecoCompra(null);
    setAlerta({ tipo: 'info', mensagem: 'Preço de compra atualizado' });
  }



  function handleAtualizarMargemLocal(codbarras, novaMargem) {
    setProdutos(prev =>
      prev.map(p => {
        if (p.codbarras === codbarras) {
          return recalcularProduto(p, 'margembruta', novaMargem);
        }
        return p;
      })
    );

    setAlteracoesPendentes(prev => ({
      ...prev,
      margem: {
        ...prev.margem,
        [codbarras]: novaMargem,
      },
    }));

    setProdutoParaMargem(null);
    setAlerta({ tipo: 'info', mensagem: 'Margem atualizada' });
  }




  function handleAtualizarPrecoVendaLocal(codbarras, novoPrecoVenda) {
    setProdutos(prev =>
      prev.map(p => {
        if (p.codbarras === codbarras) {
          return recalcularProduto(p, 'precovenda', novoPrecoVenda);
        }
        return p;
      })
    );

    setAlteracoesPendentes(prev => ({
      ...prev,
      precoVenda: {
        ...prev.precoVenda,
        [codbarras]: novoPrecoVenda,
      },
    }));

  }



  function handleCriarProdutoLocal(produto) {
    // Respeita o fornecedor do modal se existir
    const fornecedorFinal = fornecedorSelecionado;

    const produtoComCampos = {
      codigo: produto.codigo || Date.now(),
      descricao: produto.descricao?.trim() || "Sem descrição",
      codbarras: produto.codbarras?.trim() || String(Date.now()),
      fornecedor: Number(fornecedorFinal),
      familia: produto.familia?.value || produto.familia || null,
      subfam: produto.subfamilia?.value || produto.subfam || null,
      precocompra: Number(produto.precocompra) || 0,
      margembruta: Number(produto.margembruta) || 0,
      iva: Number(produto.iva) || 0,
      plu: produto.plu || null,
      qtdstock: Number(produto.qtdstock) || 1,
    };

    console.log("🆕 Produto criado (fornecedor selecionado):", fornecedorSelecionado);


    setProdutos(prev => [...prev, produtoComCampos]);
    setAlteracoesPendentes(prev => ({
      ...prev,
      criarProdutos: [...prev.criarProdutos, produtoComCampos],
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


  async function handleCriarDocumentoCompra() {
    if (!tipoDocSelecionado) {
      setAlerta({
        tipo: "erro",
        mensagem: "Escolhe um tipo de documento antes de criar o documento de compra."
      });
      return;
    }

    if (!fornecedorSelecionado) {
      setAlerta({
        tipo: "erro",
        mensagem: "Seleciona um fornecedor antes de criar o documento de compra."
      });
      return;
    }

    if (!produtos.length) {
      setAlerta({
        tipo: "erro",
        mensagem: "Não há produtos para incluir no documento."
      });
      return;
    }

    try {
      const produtosFormatados = produtos.map(p => ({
        codigo: p.codigo,
        codbarras: p.codbarras,
        descricao: p.descricao,
        qtd: alteracoesPendentes.stock[p.codbarras] || p.qtd || 1,
        precoCompra: p.precocompra || 0,
        iva: p.iva || 0,
        margembruta: p.margembruta || 0,
        familia: p.familia,
        subfam: p.subfam
      }));

      const fornecedorNome =
        fornecedores.find(f => f.codigo === fornecedorSelecionado)?.nome || "Fornecedor";

      const body = {
        fornecedorId: fornecedorSelecionado,
        fornecedorNome,
        tipoDoc: tipoDocSelecionado.doc,
        serie: tipoDocSelecionado.serie,
        produtos: produtosFormatados
      };

      console.log("📦 ENVIANDO DOCUMENTO PARA O BACKEND:", body);

      const resp = await fetch(`${apiUrl}/criarDocumentoCompra`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body)
      });

      const data = await resp.json();
      if (!resp.ok) throw new Error(data.error || "Erro ao criar documento de compra.");

      console.log("✅ Documento de compra criado:", data);
      setAlerta({
        tipo: "sucesso",
        mensagem: `Documento ${tipoDocSelecionado.doc}/${data.serie} nº ${data.numero} criado com sucesso!`
      });
    } catch (err) {
      console.error("Erro ao criar documento:", err);
      setAlerta({ tipo: "erro", mensagem: err.message });
    }
  }



  async function enviarTodasAlteracoes(criarDocumento = false) {
    setEnviando(true);
    setMostrarModalConfirmarEnvio(false);
    try {
      console.log("📤 ENVIANDO TODAS AS ALTERAÇÕES:", alteracoesPendentes);

      for (const novoProd of alteracoesPendentes.criarProdutos) {
        await criarProduto({
          ...novoProd,
          fornecedor: fornecedorSelecionado,
        });
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

      for (const [codbarras, preco] of Object.entries(alteracoesPendentes.precoVenda || {})) {
        await atualizarPrecoVenda(codbarras, preco);
      }

      // Criar documento só se o utilizador escolheu essa opção
      if (criarDocumento) {
        await handleCriarDocumentoCompra();
      }

      // ✅ Limpar dados locais
      setAlteracoesPendentes({ stock: {}, precoCompra: {}, margem: {}, criarProdutos: [] });
      setProdutos([]);
      window.localStorage.removeItem('produtos');
      window.localStorage.removeItem('alteracoesPendentes');

      // 🧹 Limpar seleção de fornecedor e tipo de documento
      setFornecedorSelecionado('');
      setTipoDocSelecionado(null);

      // ✅ Alerta final
      setAlerta({
        tipo: "sucesso",
        mensagem: criarDocumento
          ? "Alterações enviadas e documento criado com sucesso!"
          : "Alterações de produto enviadas com sucesso!"
      });
    } catch (err) {
      setAlerta({ tipo: "erro", mensagem: "Erro ao enviar alterações: " + err.message });
    } finally {
      setEnviando(false);
    }
  }



  function recalcularProduto(produto, campoAlterado, novoValor) {
    let precocompra = Number(produto.precocompra) || 0;
    let margembruta = Number(produto.margembruta) || 0;
    let iva = Number(produto.iva) || 0;
    let precovenda = Number(produto.precovenda) || 0;
    let pvp1siva = Number(produto.pvp1siva) || 0;

    switch (campoAlterado) {
      case 'precocompra':
        precocompra = Number(novoValor);
        precovenda = precocompra * (1 + margembruta / 100) * (1 + iva / 100);
        pvp1siva = precocompra * (1 + margembruta / 100);
        break;

      case 'margembruta':
        margembruta = Number(novoValor);
        precovenda = precocompra * (1 + margembruta / 100) * (1 + iva / 100);
        pvp1siva = precocompra * (1 + margembruta / 100);
        break;

      case 'precovenda':
        precovenda = Number(novoValor);
        margembruta = ((precovenda / (1 + iva / 100)) / precocompra - 1) * 100;
        pvp1siva = precocompra * (1 + margembruta / 100);
        break;

      case 'iva':
        iva = Number(novoValor);
        precovenda = precocompra * (1 + margembruta / 100) * (1 + iva / 100);
        break;
    }

    return {
      ...produto,
      precocompra: Number(precocompra.toFixed(2)),
      margembruta: Number(margembruta.toFixed(2)),
      precovenda: Number(precovenda.toFixed(2)),
      pvp1siva: Number(pvp1siva.toFixed(2)),
    };
  }


  // 🔹 Mostrar página de seleção de loja antes de qualquer outra coisa
  if (mostrarModalToken) {
    return (
      <LojaSelectPage
        onLojaConfirmada={(nome, url) => {
          setLojaSelecionada(nome);
          setTokenLoja(localStorage.getItem("tokenLoja"));
          setMostrarModalToken(false);
          setApiUrl(url);
        }}
      />
    );
  }


  // 🔐 Se a loja já foi validada mas o empregado ainda não fez login
  if (!empregado && lojaSelecionada && apiUrl) {
    return <LoginPage apiUrl={apiUrl} onLoginSuccess={setEmpregado} />;
  }

  // ✅ Se já fez login e está no menu principal
  if (empregado && lojaSelecionada && apiUrl && paginaAtual === "menu") {
    return (
      <MenuPrincipal
        empregado={empregado}
        lojaSelecionada={lojaSelecionada}
        onIrScanner={() => setPaginaAtual("scanner")}
        onIrRelatorios={() => setPaginaAtual("relatorios")}
        onIrGestaoCaixa={() => setPaginaAtual("caixa")}
        onIrConfiguracoes={() => setPaginaAtual("config")}
        onLogout={() => {
          localStorage.removeItem("empregado");
          setEmpregado(null);
          setPaginaAtual("menu");
        }}
        onTrocarLoja={() => {
          localStorage.removeItem("tokenLoja");
          localStorage.removeItem("lojaSelecionada");
          setMostrarModalToken(true);
          setLojaSelecionada(null);
          setTokenLoja("");
          setPaginaAtual("menu");
        }}
      />
    );
  }


  if (paginaAtual === "scanner") {
    return (
      <div className="bg-light min-vh-100 d-flex flex-column">
        {/* 🔹 Barra superior */}
        <nav className="navbar navbar-expand-lg navbar-dark bg-primary shadow-sm">
          <div className="container-fluid">
            {/* 🔹 Nome da loja e utilizador */}
            <div className="d-flex flex-column text-white">
              <h5 className="fw-bold mb-0">{lojaSelecionada?.toUpperCase() || "Loja não definida"}</h5>
              <small>{empregado?.nome || "Empregado"}</small>
            </div>

            {/* 🔹 Botão hamburguer (só aparece em ecrãs pequenos) */}
            <button
              className="navbar-toggler"
              type="button"
              data-bs-toggle="collapse"
              data-bs-target="#navbarConteudo"
              aria-controls="navbarConteudo"
              aria-expanded="false"
              aria-label="Alternar navegação"
            >
              <span className="navbar-toggler-icon"></span>
            </button>

            {/* 🔹 Área colapsável (hamburguer) */}
            <div className="collapse navbar-collapse justify-content-end" id="navbarConteudo">
              <ul className="navbar-nav mb-2 mb-lg-0 d-flex align-items-center gap-2">

                <li className="nav-item">
                  <button
                    className="btn btn-outline-light btn-sm"
                    onClick={() => setPaginaAtual("menu")}
                  >
                    <i className="bi bi-house-door me-1"></i> Menu
                  </button>
                </li>

                <li className="nav-item">
                  <button
                    className="btn btn-outline-light btn-sm"
                    onClick={() => {
                      localStorage.removeItem("tokenLoja");
                      localStorage.removeItem("lojaSelecionada");
                      setMostrarModalToken(true);
                      setLojaSelecionada(null);
                      setTokenLoja("");
                    }}
                  >
                    <i className="bi bi-arrow-repeat me-1"></i> Trocar Loja
                  </button>
                </li>

                <li className="nav-item">
                  <button
                    className="btn btn-danger btn-sm"
                    onClick={() => {
                      localStorage.removeItem("empregado");
                      setEmpregado(null);
                    }}
                  >
                    <i className="bi bi-box-arrow-right me-1"></i> Terminar
                  </button>
                </li>

              </ul>
            </div>
          </div>
        </nav>


        {/* 🔸 Conteúdo principal */}
        <div className="container my-4 p-4 bg-white rounded shadow text-center flex-grow-1">
          <h2 className="fw-bold text-primary mb-4">📦 Scanner Código de Barras</h2>

          {alerta && (
            <AlertaMensagem
              tipo={alerta.tipo}
              mensagem={alerta.mensagem}
              onFechar={() => setAlerta(null)}
            />
          )}

          {/* 🔹 Botões principais */}
          <div className="mb-4 d-flex justify-content-center gap-3 flex-wrap">
            <button className="btn btn-success" onClick={() => setMostrarModalNovoProduto(true)} disabled={enviando}>
              <i className="bi bi-plus-circle me-1"></i> Adicionar Produto
            </button>

            <button
              className="btn btn-outline-primary"
              onClick={() => setMostrarScannerHardware(true)}
              disabled={enviando}
            >
              <i className="bi bi-upc-scan me-1"></i> Fazer Scan
            </button>

          </div>

          {/* 🔹 Seletores centrados (mobile: empilhados) */}
          <div className="d-flex flex-column align-items-center gap-3 mb-4">
            {/* Fornecedor */}
            <div className="w-100" style={{ maxWidth: 480 }}>
              <label htmlFor="fornecedorSelect" className="form-label fw-bold d-block mb-1">
                Seleciona o Fornecedor:
              </label>
              <FornecedorSelect
                fornecedores={fornecedores}
                fornecedorSelecionado={fornecedorSelecionado}
                setFornecedorSelecionado={(value) => {
                  setFornecedorSelecionado(value);
                  setAlerta(null);
                }}
                disabled={enviando}
              />
            </div>

            {/* Tipo de Documento */}
            <div className="w-100" style={{ maxWidth: 480 }}>
              <label className="form-label fw-bold d-block mb-1">Tipo de Documento:</label>
              <select
                className="form-select text-center"
                value={tipoDocSelecionado?.doc || ""}
                onChange={(e) => {
                  const tipo = tiposDoc.find((t) => t.doc === e.target.value);
                  setTipoDocSelecionado(tipo || null);
                }}
              >
                <option value="">-- Escolher tipo de documento --</option>
                {tiposDoc.map((t) => (
                  <option key={t.doc} value={t.doc}>
                    {t.doc} - Série {t.serie}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* 🔹 Scanner (mantém funcionalidade) */}
          <ScannerHardware
            show={mostrarScannerHardware}
            onClose={() => setMostrarScannerHardware(false)}
            onDetected={onDetected}
          />


          {/* 🔹 Tabela de produtos */}
          {produtos.length > 0 ? (
            <>
              <div className="table-responsive">
                <ProdutoTable
                  produtos={produtos}
                  alteracoesPendentesStock={alteracoesPendentes.stock}
                  onAbrirStock={setProdutoParaStock}
                  onAbrirPrecoCompra={setProdutoParaPrecoCompra}
                  onAbrirMargem={setProdutoParaMargem}
                  onAbrirPrecoVenda={(produto) => {
                    const produtoAtualizado = produtos.find((p) => p.codbarras === produto.codbarras);
                    setProdutoParaPrecoVenda(produtoAtualizado || produto);
                  }}
                  onPedirConfirmacaoApagar={pedirConfirmacaoApagar}
                  disabled={enviando}
                  setAlerta={setAlerta}
                />
              </div>

              {(Object.keys(alteracoesPendentes.stock).length > 0 ||
                Object.keys(alteracoesPendentes.precoCompra).length > 0 ||
                Object.keys(alteracoesPendentes.margem).length > 0 ||
                alteracoesPendentes.criarProdutos.length > 0) && (
                  <div className="text-center mt-4">
                    <button className="btn btn-primary px-4" onClick={abrirModalConfirmarEnvio} disabled={enviando}>
                      <i className="bi bi-upload me-1"></i> Enviar todas as alterações
                    </button>
                  </div>
                )}
            </>
          ) : (
            <p className="text-muted fst-italic mt-4">Nenhum produto lido ainda.</p>
          )}

          {/* 🔹 Modais */}
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
            <div className="modal show d-block" tabIndex="-1" role="dialog" aria-modal="true" style={{ backgroundColor: "rgba(0,0,0,0.5)" }}>
              <div className="modal-dialog modal-dialog-centered" role="document">
                <div className="modal-content text-start">
                  <div className="modal-header">
                    <h5 className="modal-title">Confirmar Adição</h5>
                    <button type="button" className="btn-close" onClick={cancelarAdicao} disabled={enviando}></button>
                  </div>
                  <div className="modal-body">
                    <p><strong>Descrição:</strong> {produtoParaConfirmar.descricao}</p>
                    <p><strong>Código de Barras:</strong> {produtoParaConfirmar.codbarras}</p>
                    <label htmlFor="quantidadeInput" className="form-label mt-3"><strong>Quantidade de Stock:</strong></label>
                    <div className="d-flex align-items-center gap-2">
                      <button className="btn btn-outline-danger" onClick={() => setQuantidadeStock((q) => (q > 0 ? q - 1 : 0))} disabled={quantidadeStock <= 0}>-</button>
                      <input type="number" id="quantidadeInput" className="form-control text-center" value={quantidadeStock}
                        onChange={(e) => { const val = Number(e.target.value); if (!isNaN(val) && val >= 0) setQuantidadeStock(val); }}
                        min={0} />
                      <button className="btn btn-outline-success" onClick={() => setQuantidadeStock((q) => q + 1)}>+</button>
                    </div>
                  </div>
                  <div className="modal-footer">
                    <button type="button" className="btn btn-secondary" onClick={cancelarAdicao} disabled={enviando}>Cancelar</button>
                    <button type="button" className="btn btn-primary" onClick={confirmarAdicaoComStock} disabled={enviando}>Confirmar</button>
                  </div>
                </div>
              </div>
            </div>
          )}

          <ConfirmarEnviarModal
            show={mostrarModalConfirmarEnvio}
            onClose={fecharModalConfirmarEnvio}
            onConfirmar={(criarDocumento) => {
              setMostrarModalConfirmarEnvio(false);
              enviarTodasAlteracoes(criarDocumento);
            }}
            disabled={enviando}
            fornecedorSelecionado={fornecedorSelecionado}
            tipoDocSelecionado={tipoDocSelecionado}
          />
        </div>
      </div>
    );
  }

}
