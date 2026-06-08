import React, { useEffect, useState } from "react";
import ScannerHardware from "../components/ScannerHardware";
import StockModal from "../components/StockModal";
import AlertaMensagem from "../components/AlertaMensagem";
import {
  fetchProdutoPorCodigo,
  fetchInventariosAbertos,
  fetchLinhasInventario,
  gravarLinhasInventario
} from "../services/api";

export default function InventarioPage({ lojaSelecionada, empregado, onVoltar }) {
  const [produtos, setProdutos] = useState([]);
  const [produtoParaStock, setProdutoParaStock] = useState(null);
  const [mostrarScanner, setMostrarScanner] = useState(false);
  const [alerta, setAlerta] = useState(null);
  const [enviando, setEnviando] = useState(false);
  const [inventariosAbertos, setInventariosAbertos] = useState([]);
  const [inventarioSelecionado, setInventarioSelecionado] = useState(null);
  const [carregandoInventarios, setCarregandoInventarios] = useState(false);

  useEffect(() => {
    let ativo = true;

    async function carregarInventariosAbertos() {
      try {
        setCarregandoInventarios(true);
        const data = await fetchInventariosAbertos();
        const inventarios = Array.isArray(data) ? data : [];

        if (!ativo) return;

        setInventariosAbertos(inventarios);
        setInventarioSelecionado(inventarios[0] || null);
      } catch (err) {
        if (ativo) {
          setAlerta({ tipo: "erro", mensagem: err.message });
        }
      } finally {
        if (ativo) setCarregandoInventarios(false);
      }
    }

    carregarInventariosAbertos();

    return () => {
      ativo = false;
    };
  }, []);

  useEffect(() => {
    let ativo = true;

    async function carregarLinhas() {
      if (!inventarioSelecionado) {
        setProdutos([]);
        return;
      }

      try {
        const linhas = await fetchLinhasInventario(
          inventarioSelecionado.serie,
          inventarioSelecionado.numero
        );

        if (!ativo) return;

        setProdutos(
          (Array.isArray(linhas) ? linhas : []).map((linha) => ({
            ...linha,
            __uid: crypto.randomUUID(),
            qtdstock: Number(linha.qtdstock) || 0,
            inventarioQtd: Number(linha.inventarioQtd) || 0
          }))
        );
      } catch (err) {
        if (ativo) setAlerta({ tipo: "erro", mensagem: err.message });
      }
    }

    carregarLinhas();

    return () => {
      ativo = false;
    };
  }, [inventarioSelecionado]);

  async function onDetected(codigo) {
    try {
      const produto = await fetchProdutoPorCodigo(codigo);

      const jaExiste = produtos.find(
        (p) =>
          (p.codbarras && p.codbarras === produto.codbarras) ||
          (p.codigo && p.codigo === produto.codigo)
      );

      if (jaExiste) {
        setAlerta({
          tipo: "aviso",
          mensagem: "Este produto já foi picado no inventário."
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
    } catch (err) {
      setAlerta({ tipo: "erro", mensagem: err.message });
    }
  }

  async function enviarInventario() {
    if (!inventarioSelecionado) {
      setAlerta({
        tipo: "erro",
        mensagem: "Crie e selecione um inventário aberto na ZoneSoft antes de enviar."
      });
      return;
    }

    if (!produtos.length) {
      setAlerta({ tipo: "erro", mensagem: "Não há produtos no inventário." });
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
        mensagem: `Inventário ${resultado.serie}/${resultado.numero} gravado com ${resultado.linhas} linhas.`
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

  return (
    <div className="bg-light min-vh-100 d-flex flex-column">
      <nav className="navbar navbar-expand-lg navbar-dark bg-primary shadow-sm">
        <div className="container-fluid">
          <div className="d-flex flex-column text-white">
            <h5 className="fw-bold mb-0">{lojaSelecionada?.toUpperCase()}</h5>
            <small>{empregado?.nome}</small>
          </div>

          <button
            className="navbar-toggler"
            type="button"
            data-bs-toggle="collapse"
            data-bs-target="#navbarInventario"
            aria-controls="navbarInventario"
            aria-expanded="false"
            aria-label="Alternar navegacao"
          >
            <span className="navbar-toggler-icon"></span>
          </button>

          <div className="collapse navbar-collapse justify-content-end" id="navbarInventario">
            <ul className="navbar-nav gap-2">
              <li className="nav-item">
                <button className="btn btn-outline-light btn-sm" onClick={onVoltar}>
                  <i className="bi bi-house-door me-1" aria-hidden="true"></i>
                  Menu
                </button>
              </li>

              <li className="nav-item">
                <button className="btn btn-outline-light btn-sm" onClick={() => window.location.reload()}>
                  <i className="bi bi-arrow-repeat me-1" aria-hidden="true"></i>
                  Trocar loja
                </button>
              </li>

              <li className="nav-item">
                <button
                  className="btn btn-danger btn-sm"
                  onClick={() => {
                    localStorage.removeItem("empregado");
                    window.location.reload();
                  }}
                >
                  <i className="bi bi-box-arrow-right me-1" aria-hidden="true"></i>
                  Terminar
                </button>
              </li>
            </ul>
          </div>
        </div>
      </nav>

      <div className="container my-4 p-4 bg-white rounded shadow flex-grow-1 app-inventory-container">
        <h2 className="fw-bold text-primary mb-4 text-center app-inventory-title">
          <i className="bi bi-box-seam me-2" aria-hidden="true"></i>
          Inventário
        </h2>

        {alerta && (
          <AlertaMensagem
            tipo={alerta.tipo}
            mensagem={alerta.mensagem}
            onFechar={() => setAlerta(null)}
          />
        )}

        <div className="mx-auto mb-4 app-inventory-select-card">
          <label className="form-label fw-bold text-center d-block">Inventário aberto:</label>
          <select
            className="form-select text-center"
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
                ? "A carregar inventários..."
                : inventariosAbertos.length
                  ? "-- Escolher inventário --"
                  : "Nenhum inventário aberto na ZoneSoft"}
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
        </div>

        {!inventariosAbertos.length && !carregandoInventarios && (
          <p className="text-muted text-center">
            Para enviar inventário, crie primeiro um Novo Documento em Stocks &gt; Inventários na ZoneSoft.
          </p>
        )}

        <div className="mb-4 d-flex justify-content-center gap-3 flex-wrap">
          <button
            className="btn btn-outline-primary"
            onClick={() => setMostrarScanner(true)}
            disabled={enviando}
          >
            <i className="bi bi-upc-scan me-1" aria-hidden="true"></i>
            Picar Produto
          </button>
        </div>

        <ScannerHardware
          show={mostrarScanner}
          onClose={() => setMostrarScanner(false)}
          onDetected={onDetected}
        />

        {produtos.length > 0 ? (
          <div className="table-responsive mx-auto app-inventory-table-wrap">
            <table className="table table-bordered align-middle app-work-table app-inventory-table">
              <thead className="table-light">
                <tr>
                  <th>Descrição</th>
                  <th className="app-inventory-code-col">Código de barras</th>
                  <th className="text-center app-inventory-number-col">Atual</th>
                  <th className="text-center app-inventory-number-col">Contagem</th>
                  <th className="text-center app-inventory-diff-col">Diferenca</th>
                  <th className="text-center app-inventory-action-col">Apagar</th>
                </tr>
              </thead>
              <tbody>
                {produtos.map((p) => {
                  const diferenca = diferencaInventario(p);

                  return (
                    <tr key={p.__uid}>
                      <td className="fw-semibold">{p.descricao}</td>
                      <td className="text-muted">{p.codbarras || "-"}</td>
                      <td className="text-center">{Number(p.qtdstock) || 0}</td>
                      <td
                        className="fw-bold text-primary text-center"
                        style={{ cursor: "pointer" }}
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
          </div>
        ) : (
          <p className="text-muted text-center mb-0">
            Nenhum produto no inventário.
          </p>
        )}

        {produtos.length > 0 && (
          <div className="d-flex justify-content-center mt-4">
            <button
              className="btn btn-success px-4"
              onClick={enviarInventario}
              disabled={enviando || !inventarioSelecionado}
            >
              <i className="bi bi-upload me-1" aria-hidden="true"></i>
              Enviar inventário
            </button>
          </div>
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
      </div>
    </div>
  );
}
