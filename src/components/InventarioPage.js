import React, { useCallback, useEffect, useState } from "react";
import { Button, Modal } from "react-bootstrap";
import ScannerHardware from "../components/ScannerHardware";
import StockModal from "../components/StockModal";
import AlertaMensagem from "../components/AlertaMensagem";
import ProcurarProdutoModal from "../components/ProcurarProdutoModal";
import TablePagination from "../components/TablePagination";
import {
  fetchProdutoPorCodigo,
  fetchInventariosAbertos,
  fetchLinhasInventario,
  gravarLinhasInventario
} from "../services/api";

const DEFAULT_PAGE_SIZE = 10;

export default function InventarioPage({ lojaSelecionada, empregado, apiUrl, onVoltar, onTrocarLoja }) {
  const [produtos, setProdutos] = useState([]);
  const [produtoParaStock, setProdutoParaStock] = useState(null);
  const [mostrarScanner, setMostrarScanner] = useState(false);
  const [mostrarPesquisa, setMostrarPesquisa] = useState(false);
  const [alerta, setAlerta] = useState(null);
  const [enviando, setEnviando] = useState(false);
  const [inventariosAbertos, setInventariosAbertos] = useState([]);
  const [inventarioSelecionado, setInventarioSelecionado] = useState(null);
  const [carregandoInventarios, setCarregandoInventarios] = useState(false);
  const [ultimaAtualizacao, setUltimaAtualizacao] = useState(null);
  const [mostrarConfirmarAtualizacao, setMostrarConfirmarAtualizacao] = useState(false);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE);

  const normalizarLinhasInventario = useCallback((linhas) => {
    return (Array.isArray(linhas) ? linhas : []).map((linha) => ({
      ...linha,
      __uid: crypto.randomUUID(),
      qtdstock: Number(linha.qtdstock) || 0,
      inventarioQtd: Number(linha.inventarioQtd) || 0
    }));
  }, []);

  const carregarInventariosAbertos = useCallback(async ({ manterSelecionado = false } = {}) => {
    setCarregandoInventarios(true);
    const data = await fetchInventariosAbertos();
    const inventarios = Array.isArray(data) ? data : [];
    let selecionado = null;

    setInventariosAbertos(inventarios);
    setInventarioSelecionado((atual) => {
      if (manterSelecionado && atual) {
        const aindaExiste = inventarios.find((item) =>
          item.serie === atual.serie && Number(item.numero) === Number(atual.numero)
        );
        if (aindaExiste) {
          selecionado = aindaExiste;
          return aindaExiste;
        }
      }

      selecionado = inventarios[0] || null;
      return selecionado;
    });
    setUltimaAtualizacao(new Date());
    setCarregandoInventarios(false);
    return selecionado;
  }, []);

  const carregarLinhasSelecionadas = useCallback(async (inventario = inventarioSelecionado) => {
    if (!inventario) {
      setProdutos([]);
      return;
    }

    const linhas = await fetchLinhasInventario(inventario.serie, inventario.numero);
    setProdutos(normalizarLinhasInventario(linhas));
    setUltimaAtualizacao(new Date());
  }, [inventarioSelecionado, normalizarLinhasInventario]);

  useEffect(() => {
    let ativo = true;

    carregarInventariosAbertos().catch((err) => {
      if (ativo) {
        setCarregandoInventarios(false);
        setAlerta({ tipo: "erro", mensagem: err.message });
      }
    });

    return () => {
      ativo = false;
    };
  }, [carregarInventariosAbertos]);

  useEffect(() => {
    let ativo = true;

    carregarLinhasSelecionadas().catch((err) => {
      if (ativo) setAlerta({ tipo: "erro", mensagem: err.message });
    });

    return () => {
      ativo = false;
    };
  }, [carregarLinhasSelecionadas, inventarioSelecionado]);

  useEffect(() => {
    setPage(1);
  }, [produtos.length]);

  function adicionarProdutoAoInventario(produto) {
    const jaExiste = produtos.find(
      (p) =>
        (p.codbarras && produto.codbarras && p.codbarras === produto.codbarras) ||
        (p.codigo && produto.codigo && p.codigo === produto.codigo)
    );

    if (jaExiste) {
      setAlerta({
        tipo: "aviso",
        mensagem: "Este produto ja foi adicionado ao inventario."
      });
      return;
    }

    const produtoInventario = {
      ...produto,
      __uid: crypto.randomUUID(),
      qtdstock: Number(produto.qtdstock) || 0,
      inventarioQtd: Number(produto.qtdstock) || 0
    };

    setProdutos((prev) => [...prev, produtoInventario]);
    setProdutoParaStock(produtoInventario);
  }

  async function onDetected(codigo) {
    try {
      const produto = await fetchProdutoPorCodigo(codigo);
      adicionarProdutoAoInventario(produto);
    } catch (err) {
      setAlerta({ tipo: "erro", mensagem: err.message });
    }
  }

  async function enviarInventario() {
    if (!inventarioSelecionado) {
      setAlerta({
        tipo: "erro",
        mensagem: "Crie e selecione um inventario aberto na ZoneSoft antes de enviar."
      });
      return;
    }

    if (!produtos.length) {
      setAlerta({ tipo: "erro", mensagem: "Nao ha produtos no inventario." });
      return;
    }

    try {
      setEnviando(true);

      const payload = produtos.map((p) => ({
        codigo: p.codigo,
        descricao: p.descricao,
        inventarioQtd: Number(p.inventarioQtd) || 0
      }));

      const resultado = await gravarLinhasInventario({
        serie: inventarioSelecionado.serie,
        numero: inventarioSelecionado.numero,
        produtos: payload,
        empregadoId: empregado?.codigo || empregado?.id || 1
      });

      setAlerta({
        tipo: "sucesso",
        mensagem: `Inventario ${resultado.serie}/${resultado.numero} gravado com ${resultado.linhas} linhas.`
      });
    } catch (err) {
      setAlerta({ tipo: "erro", mensagem: err.message });
    } finally {
      setEnviando(false);
    }
  }

  function diferencaInventario(produto) {
    return (Number(produto.inventarioQtd) || 0) - (Number(produto.qtdstock) || 0);
  }

  function temAlteracoesLocais() {
    return produtos.some((produto) => diferencaInventario(produto) !== 0);
  }

  async function executarAtualizacaoDados() {
    try {
      const inventarioAtualizado = await carregarInventariosAbertos({ manterSelecionado: true });
      await carregarLinhasSelecionadas(inventarioAtualizado);
      setAlerta({ tipo: "sucesso", mensagem: "Dados atualizados." });
      setMostrarConfirmarAtualizacao(false);
    } catch (err) {
      setCarregandoInventarios(false);
      setAlerta({ tipo: "erro", mensagem: err.message });
    }
  }

  async function atualizarDados() {
    if (temAlteracoesLocais()) {
      setMostrarConfirmarAtualizacao(true);
      return;
    }

    await executarAtualizacaoDados();
  }

  const totalPages = Math.max(1, Math.ceil(produtos.length / pageSize));
  const currentPage = Math.min(page, totalPages);
  const produtosPagina = produtos.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  function handlePageSizeChange(nextPageSize) {
    setPageSize(nextPageSize);
    setPage(1);
  }

  return (
    <main className="app-work-page app-inventory-page">
      <section className="app-work-shell app-inventory-shell">
        <header className="app-work-header">
          <div>
            <p className="app-menu-kicker">{lojaSelecionada}</p>
            <h1 className="app-menu-title app-inventory-title">
              <i className="bi bi-box-seam me-2" aria-hidden="true"></i>
              Inventario
            </h1>
            <p className="app-work-subtitle">Contagem e acerto de stock</p>
          </div>
          <div className="app-work-session">
            <span>Sessao ativa</span>
            <strong>{empregado?.nome || "Operador"}</strong>
          </div>
        </header>

        {alerta && (
          <AlertaMensagem
            tipo={alerta.tipo}
            mensagem={alerta.mensagem}
            onFechar={() => setAlerta(null)}
          />
        )}

        <div className="app-work-panel app-inventory-setup-panel">
          <div className="app-inventory-picker">
            <label className="app-work-field-label">
              <i className="bi bi-clipboard-check" aria-hidden="true"></i>
              Inventario aberto
            </label>
            <select
              className="app-work-select"
              value={inventarioSelecionado ? `${inventarioSelecionado.serie}::${inventarioSelecionado.numero}` : ""}
              disabled={carregandoInventarios || !inventariosAbertos.length || enviando}
              onChange={(e) => {
                const inventario = inventariosAbertos.find((item) =>
                  `${item.serie}::${item.numero}` === e.target.value
                );
                setInventarioSelecionado(inventario || null);
              }}
            >
              <option value="">
                {carregandoInventarios
                  ? "A carregar inventarios..."
                  : inventariosAbertos.length
                    ? "Escolher inventario"
                    : "Nenhum inventario aberto na ZoneSoft"}
              </option>
              {inventariosAbertos.map((inventario) => (
                <option
                  key={`${inventario.serie}-${inventario.numero}`}
                  value={`${inventario.serie}::${inventario.numero}`}
                >
                  {inventario.serie}/{inventario.numero}
                </option>
              ))}
            </select>
            <span className="app-inventory-updated">
              {ultimaAtualizacao
                ? `Atualizado as ${ultimaAtualizacao.toLocaleTimeString("pt-PT", {
                    hour: "2-digit",
                    minute: "2-digit"
                  })}`
                : "A aguardar dados"}
            </span>
          </div>
          {produtos.length > 0 && (
            <button
              className="btn btn-success app-inventory-submit-inline"
              onClick={enviarInventario}
              disabled={enviando || !inventarioSelecionado}
            >
              <i className="bi bi-upload me-1" aria-hidden="true"></i>
              Enviar inventario
            </button>
          )}
        </div>

        {!inventariosAbertos.length && !carregandoInventarios && (
          <p className="app-work-empty">
            Para enviar inventario, cria primeiro um Novo Documento em Stocks &gt; Inventarios na ZoneSoft.
          </p>
        )}

        <div className="app-work-top-actions app-inventory-actions">
          <button
            className="app-menu-button"
            onClick={() => setMostrarScanner(true)}
            disabled={enviando}
          >
            <span className="app-menu-icon">
              <i className="bi bi-upc-scan" aria-hidden="true"></i>
            </span>
            <span>
              <span className="app-menu-label">Picar produto</span>
              <span className="app-menu-help">Ler codigo de barras</span>
            </span>
          </button>
          <button
            className="app-menu-button"
            onClick={() => setMostrarPesquisa(true)}
            disabled={enviando || !apiUrl}
          >
            <span className="app-menu-icon">
              <i className="bi bi-search" aria-hidden="true"></i>
            </span>
            <span>
              <span className="app-menu-label">Procurar produto</span>
              <span className="app-menu-help">Pesquisar por nome ou codigo</span>
            </span>
          </button>
          <button
            className="app-menu-button"
            onClick={atualizarDados}
            disabled={enviando || carregandoInventarios}
          >
            <span className="app-menu-icon">
              <i className="bi bi-arrow-clockwise" aria-hidden="true"></i>
            </span>
            <span>
              <span className="app-menu-label">{carregandoInventarios ? "A atualizar..." : "Atualizar dados"}</span>
              <span className="app-menu-help">Recarregar da ZoneSoft</span>
            </span>
          </button>
        </div>

        <ScannerHardware
          show={mostrarScanner}
          onClose={() => setMostrarScanner(false)}
          onDetected={onDetected}
        />

        <ProcurarProdutoModal
          show={mostrarPesquisa}
          onClose={() => setMostrarPesquisa(false)}
          apiUrl={apiUrl}
          onSelecionarProduto={adicionarProdutoAoInventario}
        />

        {produtos.length > 0 ? (
          <div className="app-work-table-card app-inventory-table-wrap">
            <table className="table align-middle app-work-table app-inventory-table">
              <thead>
                <tr>
                  <th>Descricao</th>
                  <th className="app-inventory-code-col">Codigo de barras</th>
                  <th className="text-center app-inventory-number-col">Atual</th>
                  <th className="text-center app-inventory-number-col">Contagem</th>
                  <th className="text-center app-inventory-diff-col">Diferenca</th>
                  <th className="text-center app-inventory-action-col">Apagar</th>
                </tr>
              </thead>
              <tbody>
                {produtosPagina.map((p) => {
                  const diferenca = diferencaInventario(p);

                  return (
                    <tr key={p.__uid}>
                      <td className="fw-semibold">{p.descricao}</td>
                      <td className="text-muted">{p.codbarras || "-"}</td>
                      <td className="text-center">{Number(p.qtdstock) || 0}</td>
                      <td
                        className="fw-bold text-primary text-center app-clickable-cell"
                        title="Clique para alterar contagem"
                        onClick={() => setProdutoParaStock(p)}
                      >
                        {Number(p.inventarioQtd) || 0}
                      </td>
                      <td className={`fw-bold text-center ${diferenca === 0 ? "text-muted" : diferenca > 0 ? "text-success" : "text-danger"}`}>
                        {diferenca > 0 ? `+${diferenca}` : diferenca}
                      </td>
                      <td className="text-center">
                        <button
                          className="btn btn-sm btn-outline-danger"
                          onClick={() =>
                            setProdutos((prev) => prev.filter((x) => x.__uid !== p.__uid))
                          }
                          disabled={enviando}
                        >
                          <i className="bi bi-trash" aria-hidden="true"></i>
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            <TablePagination
              page={currentPage}
              pageSize={pageSize}
              totalItems={produtos.length}
              onPageChange={setPage}
              onPageSizeChange={handlePageSizeChange}
            />
          </div>
        ) : (
          <p className="app-work-empty">
            Nenhum produto no inventario.
          </p>
        )}

        {produtoParaStock && (
          <StockModal
            produto={produtoParaStock}
            quantidadeInicial={produtoParaStock.inventarioQtd}
            onFechar={() => setProdutoParaStock(null)}
            onConfirmar={(uid, qtd) => {
              setProdutos((prev) =>
                prev.map((p) =>
                  p.__uid === uid ? { ...p, inventarioQtd: Number(qtd) } : p
                )
              );
              setProdutoParaStock(null);
            }}
          />
        )}

        <Modal
          show={mostrarConfirmarAtualizacao}
          onHide={() => setMostrarConfirmarAtualizacao(false)}
          centered
        >
          <Modal.Header closeButton>
            <Modal.Title>Atualizar dados?</Modal.Title>
          </Modal.Header>
          <Modal.Body>
            Ha alteracoes por enviar. Atualizar vai substituir os dados atuais.
          </Modal.Body>
          <Modal.Footer>
            <Button
              variant="secondary"
              onClick={() => setMostrarConfirmarAtualizacao(false)}
              disabled={carregandoInventarios}
            >
              Cancelar
            </Button>
            <Button
              variant="primary"
              onClick={executarAtualizacaoDados}
              disabled={carregandoInventarios}
            >
              {carregandoInventarios ? "A atualizar..." : "Atualizar"}
            </Button>
          </Modal.Footer>
        </Modal>

        <div className="app-work-footer-actions app-inventory-footer-actions">
          <button className="btn btn-outline-secondary" onClick={onVoltar}>
            <i className="bi bi-house-door me-1" aria-hidden="true"></i>
            Menu
          </button>
          <button className="btn btn-outline-secondary" onClick={onTrocarLoja}>
            <i className="bi bi-arrow-repeat me-1" aria-hidden="true"></i>
            Trocar loja
          </button>
          <button
            className="btn btn-outline-danger"
            onClick={() => {
              localStorage.removeItem("empregado");
              window.location.reload();
            }}
          >
            <i className="bi bi-box-arrow-right me-1" aria-hidden="true"></i>
            Terminar sessao
          </button>
        </div>
      </section>
    </main>
  );
}
