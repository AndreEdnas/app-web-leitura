import React, { useState, useEffect } from 'react';
import Select from "react-select";
import 'bootstrap/dist/js/bootstrap.bundle.min.js';
import FornecedorSelect from './components/FornecedorSelect';
import Scanner from './components/Scanner';
import ScannerHardware from './components/ScannerHardware';
import ProdutoTable from './components/ProdutoTable';
import useFornecedores from './hooks/useFornecedores';
import useSubfamilias from './hooks/useSubfamilias';
import useFamilias from './hooks/useFamilias';
import InventarioPage from "./components/InventarioPage";

import ProcurarProdutoModal from "./components/ProcurarProdutoModal";
import {
  fetchProdutoPorCodigo,
  criarProduto,
  atualizarStock,
  atualizarPrecoCompra,
  atualizarMargemBruta,
  atualizarPrecoVenda,
  atualizarFornecedor,
  criarFornecedor,
  fetchWithPublicFallback,
} from './services/api';
import StockModal from './components/StockModal';
import PrecoCompraModal from './components/PrecoCompraModal';
import PrecoVendaModal from './components/PrecoVendaModal';

import MargemModal from './components/MargemModal';
import AlertaMensagem from './components/AlertaMensagem';
import NovoProdutoModal from './components/NovoProdutoModal';
import NovoFornecedorModal from './components/NovoFornecedorModal';
import ConfirmarApagarModal from './components/ConfirmarApagarModal';
import ConfirmarEnviarModal from './components/ConfirmarEnviarModal';
import 'bootstrap/dist/css/bootstrap.min.css';
import 'bootstrap-icons/font/bootstrap-icons.css';
import './App.css';

import * as apiModule from "./services/api";
import LoginPage from './components/LoginPage';
import MenuPrincipal from "./components/MenuPrincipal";
import LojaSelectPage from "./components/LojaSelectPage";
import PCNaoAtivado from "./components/PCNaoAtivado";
import { getBackendBaseUrl, getBrowserApiBaseUrl, getBrowserPublicUrl, getResolverLojaUrl } from "./services/backendConfig";

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

function getInitialApiUrl() {
  try {
    const savedApiUrl = localStorage.getItem("apiUrl");
    if (!savedApiUrl) return null;

    const browserApiUrl = getBrowserApiBaseUrl(savedApiUrl, localStorage.getItem("tokenLoja") || "");
    if (browserApiUrl !== savedApiUrl) {
      const publicApiUrl = getBrowserPublicUrl(savedApiUrl);
      if (publicApiUrl) {
        localStorage.setItem("apiUrlPublic", publicApiUrl);
      } else {
        localStorage.removeItem("apiUrlPublic");
      }
      localStorage.setItem("apiUrl", browserApiUrl);
    }

    return browserApiUrl;
  } catch {
    return null;
  }
}

function sameBaseUrl(left, right) {
  return String(left || "").replace(/\/+$/, "") === String(right || "").replace(/\/+$/, "");
}

function shouldRestoreLocalApiSession(apiUrl) {
  try {
    if (typeof window === "undefined") return false;
    if (window.location.hostname !== "localhost" && window.location.hostname !== "127.0.0.1") {
      return false;
    }

    if (!apiUrl || !localStorage.getItem("tokenLoja")) return false;
    return sameBaseUrl(getBrowserApiBaseUrl(apiUrl), getBackendBaseUrl());
  } catch {
    return false;
  }
}

function limparSessaoOperador() {
  localStorage.removeItem("empregado");
}

function limparDadosLocaisTrabalho() {
  localStorage.removeItem("produtos");
  localStorage.removeItem("alteracoesPendentes");
}

function limparSessaoLoja() {
  localStorage.removeItem("lojaSelecionada");
  localStorage.removeItem("tokenLoja");
  localStorage.removeItem("apiUrl");
  localStorage.removeItem("apiUrlPublic");

  limparSessaoOperador();
  limparDadosLocaisTrabalho();
}

function limparAcessoLojaPreservandoTrabalho() {
  localStorage.removeItem("lojaSelecionada");
  localStorage.removeItem("tokenLoja");
  localStorage.removeItem("apiUrl");
  localStorage.removeItem("apiUrlPublic");
  limparSessaoOperador();
}

export default function App() {
  const [naoLicenciado, setNaoLicenciado] = useState(null);
  const [loadingApiUrl, setLoadingApiUrl] = useState(true);

  const [fornecedores, setFornecedores] = useState([]);
  const [familias, setFamilias] = useState([]);
  const [subfamilias, setSubfamilias] = useState([]);

  const [produtoParaPrecoVenda, setProdutoParaPrecoVenda] = React.useState(null);

  const [mostrarModalNovoProduto, setMostrarModalNovoProduto] = useState(false);
  const [mostrarModalNovoFornecedor, setMostrarModalNovoFornecedor] = useState(false);
  const [criandoFornecedor, setCriandoFornecedor] = useState(false);
  const [fornecedorSelecionado, setFornecedorSelecionado] = useState('');
  const [scanning, setScanning] = useState(false);
  const [produtos, setProdutos] = useStickyState([], 'produtos');
  const resolverLojaUrl = getResolverLojaUrl();

  useEffect(() => {
    setProdutos(prev =>
      prev.map(p => ({
        ...normalizarProdutoDaBD(p),
        __uid: p.__uid || crypto.randomUUID(),
      }))
    );

  }, []);

  const [alteracoesPendentes, setAlteracoesPendentes] = useStickyState(
    { stock: {}, precoCompra: {}, margem: {}, precoVenda: {}, criarProdutos: [] },
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

  const [apiUrl, setApiUrl] = useState(getInitialApiUrl);
  const [lojaSelecionada, setLojaSelecionada] = useState(() => localStorage.getItem("lojaSelecionada") || null);
  const [restoringApiSession, setRestoringApiSession] = useState(() =>
    shouldRestoreLocalApiSession(localStorage.getItem("apiUrl"))
  );
  const [mostrarPesquisaNome, setMostrarPesquisaNome] = useState(false);


  // Tipo de documento selecionado (CFA ou CFS)
  const [tipoDocSelecionado, setTipoDocSelecionado] = useState(null);

  const [tiposDoc, setTiposDoc] = useState([]);


  const [empregado, setEmpregado] = useState(() => {
    const saved = localStorage.getItem('empregado');
    return saved ? JSON.parse(saved) : null;
  });

  const [paginaAtual, setPaginaAtual] = useState("menu");



  useEffect(() => {
    if (!restoringApiSession) return;

    let cancelled = false;

    async function restoreApiSession() {
      const token = localStorage.getItem("tokenLoja");
      if (!token) {
        setRestoringApiSession(false);
        return;
      }

      try {
        const res = await fetch(resolverLojaUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ token }),
        });

        const data = await res.json().catch(() => null);
        if (!res.ok || !data?.success) {
          throw new Error(data?.error || "Não foi possível restaurar a loja.");
        }

        const loja = data.loja || {};
        const lojaId = String(loja.id || loja.nome || lojaSelecionada || "").trim();
        const publicApiUrl =
          getBrowserPublicUrl(loja.url) ||
          getBrowserPublicUrl(localStorage.getItem("apiUrlPublic") || "");
        const browserApiUrl = getBrowserApiBaseUrl(publicApiUrl || apiUrl, token);

        if (cancelled) return;

        if (lojaId) {
          setLojaSelecionada(lojaId);
          localStorage.setItem("lojaSelecionada", lojaId);
        }

        if (browserApiUrl) {
          setApiUrl(browserApiUrl);
          localStorage.setItem("apiUrl", browserApiUrl);
        }

        if (publicApiUrl) {
          localStorage.setItem("apiUrlPublic", publicApiUrl);
        } else {
          localStorage.removeItem("apiUrlPublic");
        }
      } catch (err) {
        console.error("Erro ao restaurar loja:", err);
      } finally {
        if (!cancelled) {
          setRestoringApiSession(false);
        }
      }
    }

    restoreApiSession();

    return () => {
      cancelled = true;
    };
  }, [apiUrl, lojaSelecionada, resolverLojaUrl, restoringApiSession]);






  /*
  useEffect(() => {
    async function fetchTipos() {
      if (!apiUrl || restoringApiSession) return;
      try {
        const res = await fetchWithPublicFallback(`${apiUrl}/tiposdocumento`);


        const data = await res.json();
        if (Array.isArray(data)) {
          setTiposDoc(data);
          // não define automaticamente o tipo selecionado
        }
      } catch (err) {
        console.error("Erro ao obter tipos de documento:", err);
      }
    }
    void fetchTipos;
  }, [apiUrl, restoringApiSession]);
  */



  useEffect(() => {
    if (restoringApiSession) return;
    if (apiUrl) {
      apiModule.setApiBaseUrl(apiUrl);
    }
  }, [apiUrl, restoringApiSession]);






  // 🔥 Assim que tivermos a loja selecionada E a URL do túnel, validar licença
  useEffect(() => {
    if (restoringApiSession) return;
    if (!apiUrl || !lojaSelecionada) return;

    async function validarLicenca() {
      try {
        const res = await fetchWithPublicFallback(`${apiUrl}/pedir-licenca`);

        const data = await res.json();

        // Se não está licenciada → guardar info e mostrar página de ativação
        if (!data.success) {
          const tokenLojaAtual = localStorage.getItem("tokenLoja") || lojaSelecionada || "";
          const contaInativa = res.status === 403;
          setNaoLicenciado({
            tipo: contaInativa ? "conta_inativa" : "licenca",
            chave: data.chave,
            loja: data.loja || lojaSelecionada,
            token: data.token || tokenLojaAtual,
            server: data.server,
            database: data.database,
            port: data.port,
            url: getBrowserPublicUrl(data.url) || getBrowserPublicUrl(localStorage.getItem("apiUrlPublic") || "") || apiUrl,
            erro: data.erro || data.error,
          });
          setLoadingApiUrl(false);
          return;
        }

        // Se está OK → continua fluxo normal
        setNaoLicenciado(null);
        setLoadingApiUrl(false);

      } catch (err) {
        console.error("Erro ao validar licença:", err);
        setLoadingApiUrl(false);
      }
    }


    validarLicenca();
  }, [apiUrl, lojaSelecionada, restoringApiSession]);





  // 2º useEffect → só corre QUANDO apiUrl já existir
  useEffect(() => {
    if (!apiUrl || restoringApiSession) return; // espera até termos a URL válida

    import('./services/api').then(apiModule => {
      apiModule.setApiBaseUrl(apiUrl); // define a URL no módulo

      const carregarDados = async () => {
        try {
          try {
            const bootstrapData = await apiModule.fetchBootstrap();
            if (bootstrapData && typeof bootstrapData === "object") {
              setFornecedores(Array.isArray(bootstrapData.fornecedores) ? bootstrapData.fornecedores : []);
              setFamilias(Array.isArray(bootstrapData.familias) ? bootstrapData.familias : []);
              setSubfamilias(Array.isArray(bootstrapData.subfamilias) ? bootstrapData.subfamilias : []);
              setTiposDoc(Array.isArray(bootstrapData.tiposDocumento) ? bootstrapData.tiposDocumento : []);
              return;
            }
          } catch (bootstrapErr) {
            console.warn("Bootstrap inicial indisponivel, a usar endpoints antigos:", bootstrapErr);
          }

          const fornecedoresData = await apiModule.fetchFornecedores();
          setFornecedores(fornecedoresData);
          //console.log("Fornecedores:", fornecedoresData);

          const familiasData = await apiModule.fetchFamilias();
          setFamilias(familiasData);
          //console.log("Familias:", familiasData);

          const subfamiliasData = await apiModule.fetchSubfamilias();
          setSubfamilias(subfamiliasData);
          //console.log("Subfamilias:", subfamiliasData);

          const tiposDocumentoData = await apiModule.fetchTiposDocumento();
          setTiposDoc(Array.isArray(tiposDocumentoData) ? tiposDocumentoData : []);
        } catch (err) {
          //.error("Erro ao carregar dados da API:", err);
        }
      };

      carregarDados();
    });
  }, [apiUrl, restoringApiSession]);


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







  // Se a máquina NÃO estiver licenciada, mostra o ecrã de ativação
  if (naoLicenciado) {
    return (
      <PCNaoAtivado
        dados={naoLicenciado}
        onRevalidar={() => window.location.reload()}
        onTrocarLoja={() => {
          if (naoLicenciado?.tipo === "conta_inativa") {
            limparAcessoLojaPreservandoTrabalho();
          } else {
            limparSessaoLoja();
          }
          setApiUrl(null);
          apiModule.setApiBaseUrl("");
          setLojaSelecionada(null);
          setEmpregado(null);
          setPaginaAtual("menu");
          setNaoLicenciado(null);
        }}
      />
    );
  }

  function normalizarProdutoDaBD(produto) {
    const precocompra = Number(produto.precocompra) || 0;
    const pvp1siva = Number(produto.pvp1siva) || 0;
    const iva = Number(produto.iva) || 0;

    let margembruta = null;

    // 🔑 margem SÓ é calculada se houver dados suficientes
    if (precocompra > 0 && pvp1siva > 0) {
      margembruta = ((pvp1siva / precocompra) - 1) * 100;
    }

    return {
      ...produto,

      // ❌ IGNORAR SEMPRE margem da BD
      margembruta: margembruta !== null
        ? Number(margembruta.toFixed(2))
        : null,

      // 🔹 garantir coerência
      precocompra: Number(precocompra.toFixed(2)),
      pvp1siva: Number(pvp1siva.toFixed(2)),
      precovenda: pvp1siva > 0
        ? Number((pvp1siva * (1 + iva / 100)).toFixed(2))
        : Number(produto.precovenda) || 0,
    };
  }



  async function onDetected(code) {
    setAlerta(null);

    try {
      const dataProduto = await fetchProdutoPorCodigo(code, fornecedorSelecionado);

      const produtoNormalizado = {
        ...normalizarProdutoDaBD(dataProduto),
        __uid: crypto.randomUUID(),
      };



      const chave = getChaveProduto(produtoNormalizado);
      if (chave && produtos.some(p => getChaveProduto(p) === chave)) {
        setAlerta({ tipo: "erro", mensagem: "Produto já adicionado." });
        return;
      }


      setProdutoParaConfirmar(produtoNormalizado);
      setQuantidadeStock(1);

    } catch (err) {
      setAlerta({ tipo: 'erro', mensagem: err.message });
    }
  }




  function confirmarAdicaoComStock() {
    if (quantidadeStock <= 0) {
      setAlerta({ tipo: 'erro', mensagem: 'Introduza uma quantidade de stock superior a zero.' });
      return;
    }

    if (produtoParaConfirmar) {

      // Adiciona o produto apenas se ainda não estiver na lista
      setProdutos(prev => {
        const chave = getChaveProduto(produtoParaConfirmar);
        const exists = prev.some(p => getChaveProduto(p) === chave);


        if (exists) return prev;
        return [...prev, produtoParaConfirmar];
      });

      setAlteracoesPendentes(prev => ({
        ...prev,
        stock: {
          ...prev.stock,
          [produtoParaConfirmar.__uid]:
            (prev.stock[produtoParaConfirmar.__uid] || 0) + quantidadeStock,
        }
      }));


      setProdutoParaConfirmar(null);
      setAlerta({ tipo: 'sucesso', mensagem: 'Produto adicionado com stock.' });
      setQuantidadeStock(0);
    }
  }



  function cancelarAdicao() {
    setProdutoParaConfirmar(null);
  }


  function handleAtualizarStockLocal(uid, valor) {
    const prod = produtos.find(p => p.__uid === uid);
    if (!prod) return;

    // 🆕 Produto novo → TOTAL (qtdstock)
    if (prod.novo) {
      const total = Math.max(0, Number(valor) || 0);

      // 1️⃣ Atualizar tabela
      setProdutos(prev =>
        prev.map(p =>
          p.__uid === uid
            ? { ...p, qtdstock: total }
            : p
        )
      );

      // 2️⃣ Garantir que criarProdutos é SEMPRE a fonte da verdade
      setAlteracoesPendentes(prev => {
        const existe = prev.criarProdutos.find(p => p.__uid === uid);

        if (!existe) {
          return {
            ...prev,
            criarProdutos: [
              ...prev.criarProdutos,
              { ...prod, qtdstock: total }
            ]
          };
        }

        return {
          ...prev,
          criarProdutos: prev.criarProdutos.map(p =>
            p.__uid === uid
              ? { ...p, qtdstock: total }
              : p
          )
        };
      });

      setProdutoParaStock(null);
      setAlerta({ tipo: "info", mensagem: "Stock total atualizado (produto novo)." });
      return;
    }


    // 📦 Produto existente → DELTA
    const delta = Math.max(0, Number(valor) || 0);

    setAlteracoesPendentes(prev => ({
      ...prev,
      stock: { ...prev.stock, [uid]: delta },
    }));

    setProdutoParaStock(null);
    setAlerta({ tipo: "info", mensagem: "Acréscimo de stock guardado (produto existente)." });
  }




  function handleAtualizarPrecoCompraLocal(uid, novoPrecoCompra) {
    setProdutos(prev =>
      prev.map(p =>
        p.__uid === uid
          ? recalcularProduto(p, 'precocompra', novoPrecoCompra)
          : p
      )
    );

    setAlteracoesPendentes(prev => {
      const produtoNovo = prev.criarProdutos.find(p => p.__uid === uid);

      if (produtoNovo) {
        return {
          ...prev,
          criarProdutos: prev.criarProdutos.map(p =>
            p.__uid === uid
              ? recalcularProduto(p, 'precocompra', novoPrecoCompra)
              : p
          )
        };
      }

      return {
        ...prev,
        precoCompra: { ...prev.precoCompra, [uid]: novoPrecoCompra }
      };
    });

    setProdutoParaPrecoCompra(null);
    setAlerta({ tipo: 'info', mensagem: 'Preço de compra atualizado' });
  }




  function handleAtualizarMargemLocal(uid, novaMargem) {
    setProdutos(prev =>
      prev.map(p =>
        p.__uid === uid
          ? recalcularProduto(p, 'margembruta', novaMargem)
          : p
      )
    );

    setAlteracoesPendentes(prev => {
      const produtoNovo = prev.criarProdutos.find(p => p.__uid === uid);

      if (produtoNovo) {
        return {
          ...prev,
          criarProdutos: prev.criarProdutos.map(p =>
            p.__uid === uid
              ? recalcularProduto(p, 'margembruta', novaMargem)
              : p
          )
        };
      }

      return {
        ...prev,
        margem: { ...prev.margem, [uid]: novaMargem }
      };
    });

    setProdutoParaMargem(null);
    setAlerta({ tipo: 'info', mensagem: 'Margem atualizada' });
  }




  function handleAtualizarPrecoVendaLocal(uid, novoPrecoVenda) {
    setProdutos(prev =>
      prev.map(p =>
        p.__uid === uid
          ? recalcularProduto(p, 'precovenda', novoPrecoVenda)
          : p
      )
    );

    setAlteracoesPendentes(prev => {
      const produtoNovo = prev.criarProdutos.find(p => p.__uid === uid);

      if (produtoNovo) {
        return {
          ...prev,
          criarProdutos: prev.criarProdutos.map(p =>
            p.__uid === uid
              ? recalcularProduto(p, 'precovenda', novoPrecoVenda)
              : p
          )
        };
      }

      return {
        ...prev,
        precoVenda: { ...prev.precoVenda, [uid]: novoPrecoVenda }
      };
    });

    setProdutoParaPrecoVenda(null);
    setAlerta({ tipo: 'info', mensagem: 'Preço de venda atualizado' });
  }





  function handleCriarProdutoLocal(produto) {
    const precocompra = Number(produto.precocompra) || 0;
    const margembruta = Number(produto.margembruta) || 0;
    const iva = Number(produto.iva) || 0;

    const pvp1siva = precocompra > 0
      ? precocompra * (1 + margembruta / 100)
      : 0;

    const precovenda = pvp1siva > 0
      ? pvp1siva * (1 + iva / 100)
      : 0;

    const produtoComCampos = {
      codigo: null,
      descricao: produto.descricao?.trim() || "Sem descrição",
      codbarras: produto.codbarras?.trim() || null,
      __uid: crypto.randomUUID(),

      // ❌ SEM fornecedor aqui

      familia: produto.familia?.value || produto.familia || null,
      subfam: produto.subfamilia?.value || produto.subfam || null,

      precocompra: Number(precocompra.toFixed(2)),
      margembruta: Number(margembruta),
      iva,

      pvp1siva: Number(pvp1siva.toFixed(2)),
      precovenda: Number(precovenda.toFixed(2)),

      plu: produto.plu || null,
      qtdstock: Number(produto.qtdstock) || 1,
      novo: true
    };

    setProdutos(prev => [...prev, produtoComCampos]);
    setAlteracoesPendentes(prev => ({
      ...prev,
      criarProdutos: [...prev.criarProdutos, produtoComCampos],
    }));

    setMostrarModalNovoProduto(false);
    setAlerta({ tipo: 'info', mensagem: 'Produto novo guardado localmente' });
  }

  async function handleCriarFornecedor(fornecedor) {
    setCriandoFornecedor(true);

    try {
      const tentarCriarFornecedor = async () => {
        try {
          return await criarFornecedor(fornecedor);
        } catch (err) {
          const precisaLicenca =
            err?.status === 403 &&
            String(err?.body || err?.message || "").includes("precisaLicenca");

          if (!precisaLicenca || !apiUrl) {
            throw err;
          }

          const licencaRes = await fetchWithPublicFallback(`${apiUrl}/pedir-licenca`);
          const licencaData = await licencaRes.json().catch(() => null);

          if (!licencaRes.ok || licencaData?.success === false) {
            throw err;
          }

          return criarFornecedor(fornecedor);
        }
      };

      const criado = await tentarCriarFornecedor();
      const codigoCriado = Number(criado.codigo);
      if (!Number.isFinite(codigoCriado) || codigoCriado <= 0) {
        throw new Error("Fornecedor criado, mas a API não devolveu um código válido.");
      }

      const fornecedorCriado = {
        codigo: codigoCriado,
        nome: criado.nome || fornecedor.nome
      };

      setFornecedores((prev) => {
        const semDuplicado = prev.filter(
          (item) => String(item.codigo) !== String(fornecedorCriado.codigo)
        );

        return [...semDuplicado, fornecedorCriado].sort((a, b) =>
          String(a.nome || "").localeCompare(String(b.nome || ""), "pt")
        );
      });

      if (fornecedorCriado.codigo) {
        setFornecedorSelecionado(fornecedorCriado.codigo);
        setProdutos((prev) =>
          prev.map((p) => ({
            ...p,
            fornecedor: fornecedorCriado.codigo
          }))
        );
      }

      setMostrarModalNovoFornecedor(false);
      setAlerta({
        tipo: "sucesso",
        mensagem: `Fornecedor ${fornecedorCriado.nome} criado com sucesso.`
      });
    } catch (err) {
      console.error("Erro ao criar fornecedor:", err);
      setAlerta({
        tipo: "erro",
        mensagem: err.message || "Erro ao criar fornecedor."
      });
    } finally {
      setCriandoFornecedor(false);
    }
  }




  function handleApagarProduto(uid) {
    setProdutos(prev => prev.filter(p => p.__uid !== uid));

    setAlteracoesPendentes(prev => ({
      stock: Object.fromEntries(Object.entries(prev.stock).filter(([k]) => k !== uid)),
      precoCompra: Object.fromEntries(Object.entries(prev.precoCompra).filter(([k]) => k !== uid)),
      margem: Object.fromEntries(Object.entries(prev.margem).filter(([k]) => k !== uid)),
      precoVenda: Object.fromEntries(Object.entries(prev.precoVenda || {}).filter(([k]) => k !== uid)),
      criarProdutos: prev.criarProdutos.filter(p => p.__uid !== uid),
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
        mensagem: "Escolha um tipo de documento antes de criar o documento de compra."
      });
      return;
    }

    if (!fornecedorSelecionado) {
      setAlerta({
        tipo: "erro",
        mensagem: "Selecione um fornecedor antes de criar o documento de compra."
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
      const produtosFormatados = produtos
        .map(p => {
          const produtoPendente = alteracoesPendentes.criarProdutos
            .find(cp => cp.__uid === p.__uid);

          return {
            codigo: p.codigo,
            codbarras: produtoPendente?.codbarras ?? p.codbarras,
            descricao: produtoPendente?.descricao ?? p.descricao,
            qtd: p.novo
              ? Number(produtoPendente?.qtdstock ?? p.qtdstock ?? 0)
              : Number(alteracoesPendentes.stock[p.__uid] || 0),
            precoCompra: Number(
              alteracoesPendentes.precoCompra[p.__uid]
              ?? produtoPendente?.precocompra
              ?? p.precocompra
              ?? 0
            ),
            iva: Number(produtoPendente?.iva ?? p.iva ?? 0),
            margembruta: Number(
              alteracoesPendentes.margem[p.__uid]
              ?? produtoPendente?.margembruta
              ?? p.margembruta
              ?? 0
            ),
            familia: produtoPendente?.familia ?? p.familia,
            subfam: produtoPendente?.subfam ?? p.subfam
          };
        })
        .filter(p => Number(p.qtd) > 0);


      const fornecedorNome =
        fornecedores.find(f => f.codigo === fornecedorSelecionado)?.nome || "Fornecedor";

      const body = {
        fornecedorId: fornecedorSelecionado,
        fornecedorNome,
        tipoDoc: tipoDocSelecionado.doc,
        serie: tipoDocSelecionado.serie,
        produtos: produtosFormatados
      };



      const resp = await fetchWithPublicFallback(`${apiUrl}/criarDocumentoCompra`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body)
      });

      const data = await resp.json();
      if (!resp.ok) throw new Error(data.error || "Erro ao criar documento de compra.");

      console.log("✅ Documento de compra criado:", data);
      setAlerta({
        tipo: "sucesso",
        mensagem: `Documento ${tipoDocSelecionado.doc}/${data.serie} n.º ${data.numero} criado com sucesso.`
      });
    } catch (err) {
      console.error("Erro ao criar documento:", err);
      setAlerta({ tipo: "erro", mensagem: err.message });
    }
  }

  function getChaveProduto(p) {
    // 1️⃣ código de barras válido
    if (p?.codbarras && String(p.codbarras).trim() !== "") {
      return `CB:${String(p.codbarras).trim()}`;
    }

    // 2️⃣ produto já existente na BD
    if (Number.isInteger(p?.codigo) && p.codigo > 0) {
      return `COD:${p.codigo}`;
    }

    // ❌ NÃO usar descrição para deduplicar
    return null;
  }



  function getIdentificadorProduto(prod) {
    if (Number.isInteger(prod.codigo) && prod.codigo > 0) {
      return prod.codigo;
    }

    throw new Error(
      `Produto sem código interno para atualização: ${prod.descricao}`
    );
  }

  function temEntradasStockPendentes() {
    const stockExistente = Object.values(alteracoesPendentes.stock || {})
      .some(qtd => Number(qtd) !== 0);

    const stockNovosProdutos = (alteracoesPendentes.criarProdutos || [])
      .some(produto => Number(produto.qtdstock || 0) > 0);

    return stockExistente || stockNovosProdutos;
  }




  async function enviarTodasAlteracoes(criarDocumento = false) {
    setEnviando(true);
    setMostrarModalConfirmarEnvio(false);

    try {
      if (temEntradasStockPendentes() && !criarDocumento) {
        throw new Error("As entradas de stock só podem ser enviadas criando um documento com uma série real da ZoneSoft.");
      }

      // =========================
      // 1️⃣ CRIAR PRODUTOS NOVOS
      // =========================
      const novosCriados = [];

      const produtosParaCriarAgora = criarDocumento ? [] : alteracoesPendentes.criarProdutos;

      for (const novoProd of produtosParaCriarAgora) {

        console.log("🧪 DEBUG PRODUTO NOVO (ANTES DO POST):", {
          descricao: novoProd.descricao,
          fornecedorNoProduto: novoProd.fornecedor,
          fornecedorSelecionado,
          produtoCompleto: novoProd
        });
        const criado = await criarProduto({
          ...novoProd,
          fornecedor: Number(fornecedorSelecionado)
        });




        novosCriados.push({
          ...criado,
          __uid: novoProd.__uid, // mantém identidade na UI
          novo: false
        });
      }

      if (novosCriados.length > 0) {
        setProdutos(prev =>
          prev.map(p => {
            const match = novosCriados.find(n => n.__uid === p.__uid);
            return match ? match : p;
          })
        );
      }

      const produtosAtuais = criarDocumento
        ? produtos.filter(p => !p.novo)
        : [
          ...produtos.filter(p => !p.novo),
          ...novosCriados
        ];


      // =========================
      // 2️⃣ ATUALIZAR FORNECEDOR (GLOBAL - vindo da label)
      // =========================
      if (!fornecedorSelecionado || Number(fornecedorSelecionado) <= 0) {
        throw new Error("Selecione um fornecedor antes de enviar.");
      }

      for (const p of produtosAtuais) {
        if (!Number.isInteger(p.codigo) || p.codigo <= 0) {
          console.warn("⏭ Produto ainda sem código, a saltar:", p.descricao);
          continue;
        }

        const id = p.codigo;

        await atualizarFornecedor(id, Number(fornecedorSelecionado));
      }




      // =========================
      // 3️⃣ PREÇO DE COMPRA
      // =========================
      for (const [uid, preco] of Object.entries(alteracoesPendentes.precoCompra)) {
        const prod = produtos.find(p => p.__uid === uid);
        if (!prod || prod.novo) continue;


        await atualizarPrecoCompra(
          getIdentificadorProduto(prod),
          preco
        );
      }


      // =========================
      // 4️⃣ MARGEM
      // =========================
      for (const [uid, margem] of Object.entries(alteracoesPendentes.margem)) {
        const prod = produtos.find(p => p.__uid === uid);
        if (!prod || prod.novo) continue;

        await atualizarMargemBruta(
          getIdentificadorProduto(prod),
          margem
        );
      }


      // =========================
      // 5️⃣ PREÇO DE VENDA
      // =========================
      for (const [uid, preco] of Object.entries(alteracoesPendentes.precoVenda || {})) {
        const prod = produtos.find(p => p.__uid === uid);
        if (!prod || prod.novo) continue;

        await atualizarPrecoVenda(
          getIdentificadorProduto(prod),
          preco
        );
      }

      // =========================
      // 6️⃣ STOCK
      // =========================
      if (!criarDocumento) {

        // 🆕 PRODUTOS NOVOS → STOCK TOTAL (USAR novosCriados)
        for (const criado of novosCriados) {
          const origem = alteracoesPendentes.criarProdutos
            .find(p => p.__uid === criado.__uid);

          const qtdTotal = Number(origem?.qtdstock || 0);

          if (qtdTotal > 0) {
            await atualizarStock(criado.codigo, qtdTotal);
          }
        }

        // 📦 PRODUTOS EXISTENTES → DELTA
        for (const [uid, qtd] of Object.entries(alteracoesPendentes.stock)) {
          const prod = produtos.find(p => p.__uid === uid);
          if (!prod || prod.novo) continue;

          await atualizarStock(
            getIdentificadorProduto(prod),
            Number(qtd)
          );
        }
      }




      // Criar documento só se o utilizador escolheu essa opção
      if (criarDocumento) {
        await handleCriarDocumentoCompra();
      }

      // ✅ Limpar dados locais
      setAlteracoesPendentes({
        stock: {},
        precoCompra: {},
        margem: {},
        precoVenda: {},
        criarProdutos: []
      });

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
          ? "Alterações enviadas e documento criado com sucesso."
          : "Alterações dos produtos enviadas com sucesso."
      });
    } catch (err) {
      setAlerta({ tipo: "erro", mensagem: "Erro ao enviar alterações: " + err.message });
    } finally {
      setEnviando(false);
    }
  }



  function calcularMargemPorPrecos(precocompra, pvp1siva, fallback = 0) {
    if (precocompra > 0 && pvp1siva > 0) {
      return ((pvp1siva / precocompra) - 1) * 100;
    }

    return Number(fallback) || 0;
  }

  function recalcularProduto(produto, campoAlterado, novoValor) {
    let precocompra = Number(produto.precocompra) || 0;
    let margembruta = Number(produto.margembruta) || 0;
    let iva = Number(produto.iva) || 0;
    let precovenda = Number(produto.precovenda) || 0;
    let pvp1siva = Number(produto.pvp1siva) || 0;

    switch (campoAlterado) {
      case "precocompra":
        precocompra = Number(novoValor);
        pvp1siva = precocompra * (1 + margembruta / 100);
        precovenda = pvp1siva * (1 + iva / 100);
        break;

      case "margembruta":
        margembruta = Number(novoValor);
        pvp1siva = precocompra * (1 + margembruta / 100);
        precovenda = pvp1siva * (1 + iva / 100);
        break;

      case "precovenda":
        precovenda = Number(novoValor);
        pvp1siva = precovenda / (1 + iva / 100);
        margembruta = calcularMargemPorPrecos(precocompra, pvp1siva, margembruta);
        break;


      case "iva":
        iva = Number(novoValor);
        pvp1siva = precocompra * (1 + margembruta / 100);
        precovenda = pvp1siva * (1 + iva / 100);
        break;
    }

    return {
      ...produto,

      // 🔹 preços arredondam
      precocompra: Number(precocompra.toFixed(2)),
      precovenda: Number(precovenda.toFixed(2)),
      pvp1siva: Number(pvp1siva.toFixed(2)),

      // ❗ margem NUNCA arredonda
      margembruta: Number(margembruta.toFixed(2)),
    };
  }


  // 🔹 Mostrar página de seleção de loja antes de qualquer outra coisa
  // 🔹 Se ainda não há loja selecionada, mostrar selector
  if (!lojaSelecionada || !apiUrl) {
    return (
      <LojaSelectPage
        resolverUrl={resolverLojaUrl}
        onLojaConfirmada={(nome, url, loja) => {
          const lojaId = loja?.id || nome;
          const token = localStorage.getItem("tokenLoja") || "";

          const browserApiUrl = getBrowserApiBaseUrl(url, token);

          limparDadosLocaisTrabalho();
          limparSessaoOperador();

          setLojaSelecionada(lojaId);
          setApiUrl(browserApiUrl);
          setEmpregado(null);

          localStorage.setItem("tokenLoja", token);
          localStorage.setItem("lojaSelecionada", lojaId);
          localStorage.setItem("apiUrl", browserApiUrl);
          const publicApiUrl = getBrowserPublicUrl(url);
          if (publicApiUrl) {
            localStorage.setItem("apiUrlPublic", publicApiUrl);
          } else {
            localStorage.removeItem("apiUrlPublic");
          }
        }}
      />
    );
  }


  if (loadingApiUrl && !naoLicenciado) {
    return (
      <div className="d-flex flex-column justify-content-center align-items-center vh-100 bg-dark text-white">
        <h3 className="mb-3">A verificar licença...</h3>
        <p className="mb-0">Por favor aguarde um momento.</p>
      </div>
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
        onIrInventario={() => setPaginaAtual("inventario")}
        onIrGestaoCaixa={() => setPaginaAtual("caixa")}
        onIrConfiguracoes={() => setPaginaAtual("config")}
        onLogout={() => {
          limparSessaoOperador();
          setEmpregado(null);
          setPaginaAtual("menu");
        }}
        onTrocarLoja={() => {
          limparSessaoLoja();

          // 🧹 limpar estados React
          setApiUrl(null);
          apiModule.setApiBaseUrl("");
          setLojaSelecionada(null);
          setEmpregado(null);          // 🔥 ISTO É O CRÍTICO
          setPaginaAtual("menu");

          setProdutos([]);
          setAlteracoesPendentes({
            stock: {},
            precoCompra: {},
            margem: {},
            precoVenda: {},
            criarProdutos: []
          });

          setFornecedores([]);
          setFamilias([]);
          setSubfamilias([]);
          setTiposDoc([]);

          setNaoLicenciado(null);
        }}



      />
    );
  }


  if (paginaAtual === "inventario") {
    return (
      <InventarioPage
        lojaSelecionada={lojaSelecionada}
        empregado={empregado}
        apiUrl={apiUrl}
        onVoltar={() => setPaginaAtual("menu")}
      />
    );
  }


  if (paginaAtual === "scanner") {
    const tipoDocumentoOptions = tiposDoc.map((t) => ({
      value: `${t.doc}::${t.serie}`,
      label: `${t.descricao ? `${t.doc} - ${t.descricao}` : t.doc} - Série ${t.serie}`,
      tipo: t
    }));
    const tipoDocumentoValue = tipoDocSelecionado
      ? tipoDocumentoOptions.find((option) => option.value === `${tipoDocSelecionado.doc}::${tipoDocSelecionado.serie}`) || null
      : null;

    return (
      <main className="app-work-page">
        <section className="app-work-shell">
          <header className="app-work-header">
            <div>
              <p className="app-menu-kicker">
                {lojaSelecionada?.toUpperCase() || "LOJA"}
              </p>
              <h1 className="app-menu-title">Picagem de Mercadoria</h1>
              <p className="app-work-subtitle">
                Produtos, stock, preços e documentos
              </p>
            </div>

            <div className="app-work-session">
              <span>Sessão ativa</span>
              <strong>{empregado?.nome || "Empregado"}</strong>
            </div>
          </header>

          <div className="app-work-top-actions">
            <button
              type="button"
              className="app-menu-button"
              onClick={() => setMostrarScannerHardware(true)}
              disabled={enviando}
            >
              <span className="app-menu-icon">
                <i className="bi bi-upc-scan" aria-hidden="true"></i>
              </span>
              <span>
                <span className="app-menu-label">Ler Produto</span>
                <span className="app-menu-help">Usar scanner de código de barras</span>
              </span>
            </button>

            <button
              type="button"
              className="app-menu-button"
              onClick={() => setMostrarPesquisaNome(true)}
              disabled={enviando}
            >
              <span className="app-menu-icon">
                <i className="bi bi-search" aria-hidden="true"></i>
              </span>
              <span>
                <span className="app-menu-label">Procurar Produto</span>
                <span className="app-menu-help">Pesquisar por nome ou código</span>
              </span>
            </button>

            <button
              type="button"
              className="app-menu-button"
              onClick={() => setMostrarModalNovoProduto(true)}
              disabled={enviando}
            >
              <span className="app-menu-icon">
                <i className="bi bi-plus-circle" aria-hidden="true"></i>
              </span>
              <span>
                <span className="app-menu-label">Novo Produto</span>
                <span className="app-menu-help">Criar novo artigo</span>
              </span>
            </button>

            <button
              type="button"
              className="app-menu-button"
              onClick={() => setMostrarModalNovoFornecedor(true)}
              disabled={enviando || criandoFornecedor}
            >
              <span className="app-menu-icon">
                <i className="bi bi-person-plus" aria-hidden="true"></i>
              </span>
              <span>
                <span className="app-menu-label">Novo Fornecedor</span>
                <span className="app-menu-help">Criar fornecedor</span>
              </span>
            </button>
          </div>

          {alerta && (
            <AlertaMensagem
              tipo={alerta.tipo}
              mensagem={alerta.mensagem}
              onFechar={() => setAlerta(null)}
            />
          )}

          <div className="app-work-panel">
            <h2 className="app-work-panel-title">Dados de entrada</h2>

            <div className="app-work-form-grid">
              <div className="app-work-field">
                <label htmlFor="fornecedorSelect" className="app-work-field-label">
                  <i className="bi bi-truck" aria-hidden="true"></i>
                  <span>Fornecedor</span>
                </label>
                <FornecedorSelect
                  fornecedores={fornecedores}
                  fornecedorSelecionado={fornecedorSelecionado}
                  setFornecedorSelecionado={(value) => {
                    const fornecedorNum = Number(value);
                    setFornecedorSelecionado(fornecedorNum);

                    setProdutos(prev =>
                      prev.map(p => ({
                        ...p,
                        fornecedor: fornecedorNum
                      }))
                    );

                    setAlerta(null);
                  }}
                  disabled={enviando}
                />
              </div>

              <div className="app-work-field">
                <label htmlFor="tipoDocumentoSelect" className="app-work-field-label">
                  <i className="bi bi-file-earmark-text" aria-hidden="true"></i>
                  <span>Tipo de Documento</span>
                </label>
                <Select
                  inputId="tipoDocumentoSelect"
                  className="app-work-react-select"
                  classNamePrefix="app-select"
                  value={tipoDocumentoValue}
                  options={tipoDocumentoOptions}
                  placeholder={tiposDoc.length ? "Escolher tipo de documento" : "Nenhuma série configurada na ZoneSoft"}
                  noOptionsMessage={() => "Nenhum tipo de documento encontrado"}
                  onChange={(selected) => setTipoDocSelecionado(selected?.tipo || null)}
                  isDisabled={!tiposDoc.length || enviando}
                  isClearable
                  isSearchable
                  menuPortalTarget={typeof document !== "undefined" ? document.body : null}
                />
              </div>
            </div>
          </div>

          <ScannerHardware
            show={mostrarScannerHardware}
            onClose={() => setMostrarScannerHardware(false)}
            onDetected={onDetected}
          />

          <ProcurarProdutoModal
            show={mostrarPesquisaNome}
            onClose={() => setMostrarPesquisaNome(false)}
            apiUrl={apiUrl}
            onSelecionarProduto={(produto) => {
              setAlerta(null);

              const produtoNormalizado = {
                ...normalizarProdutoDaBD(produto),
                codbarras: produto.codbarras || null,
                __uid: crypto.randomUUID(),
              };

              const chave = getChaveProduto(produtoNormalizado);
              if (chave && produtos.some(p => getChaveProduto(p) === chave)) {
                setAlerta({ tipo: "erro", mensagem: "Produto já adicionado." });
                return;
              }

              setProdutoParaConfirmar(produtoNormalizado);
              setQuantidadeStock(1);
            }}
          />

          {produtos.length > 0 ? (
            <>
              <div className="app-work-table-card table-responsive">
                <ProdutoTable
                  produtos={produtos}
                  alteracoesPendentesStock={alteracoesPendentes.stock}
                  onAbrirStock={(produto) => {
                    setProdutoParaStock({
                      ...produto,
                      __modoStock: produto.novo ? "TOTAL" : "DELTA"
                    });
                  }}
                  onAbrirPrecoCompra={setProdutoParaPrecoCompra}
                  onAbrirMargem={setProdutoParaMargem}
                  onAbrirPrecoVenda={(produto) => {
                    const produtoAtualizado = produtos.find(
                      (p) => p.__uid === produto.__uid
                    );

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
            <div className="app-work-empty">Nenhum produto lido ainda.</div>
          )}

          {produtoParaStock && (
            <StockModal
              produto={produtoParaStock}
              quantidadeInicial={
                produtoParaStock.__modoStock === "TOTAL"
                  ? Number(produtoParaStock.qtdstock || 0)
                  : Number(alteracoesPendentes.stock[produtoParaStock.__uid] || 0)
              }
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
              produtosExistentes={produtos}
              disabled={enviando}
              apiUrl={apiUrl}
            />
          )}

          {mostrarModalNovoFornecedor && (
            <NovoFornecedorModal
              onFechar={() => setMostrarModalNovoFornecedor(false)}
              onConfirmar={handleCriarFornecedor}
              disabled={enviando || criandoFornecedor}
            />
          )}

          {mostrarModalConfirmarApagar && produtoParaApagar && (
            <ConfirmarApagarModal
              show={mostrarModalConfirmarApagar}
              produto={produtoParaApagar}
              onClose={() => setMostrarModalConfirmarApagar(false)}
              onConfirmar={(uid) => {
                handleApagarProduto(uid);
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
                    <p><strong>Código de Barras:</strong> {produtoParaConfirmar.codbarras || "Sem código"}</p>

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
            temStockPendente={temEntradasStockPendentes()}
          />

          <div className="app-work-footer-actions">
            <button type="button" className="btn btn-outline-secondary" onClick={() => setPaginaAtual("menu")}>
              <i className="bi bi-house-door me-1" aria-hidden="true"></i>
              Menu
            </button>
            <button
              type="button"
              className="btn btn-outline-secondary"
              onClick={() => {
                limparSessaoLoja();

                setApiUrl(null);
                apiModule.setApiBaseUrl("");
                setLojaSelecionada(null);
                setEmpregado(null);
                setPaginaAtual("menu");
              }}
            >
              <i className="bi bi-arrow-repeat me-1" aria-hidden="true"></i>
              Trocar loja
            </button>
            <button
              type="button"
              className="btn btn-outline-danger"
              onClick={() => {
                limparSessaoOperador();
                setEmpregado(null);
              }}
            >
              <i className="bi bi-box-arrow-right me-1" aria-hidden="true"></i>
              Terminar sessão
            </button>
          </div>
        </section>
      </main>
    );
  }
}
