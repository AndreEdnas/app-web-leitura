import React, { useState } from "react";
import ScannerHardware from "../components/ScannerHardware";
import ProdutoTable from "../components/ProdutoTable";
import StockModal from "../components/StockModal";
import AlertaMensagem from "../components/AlertaMensagem";
import { fetchProdutoPorCodigo, atualizarStock } from "../services/api";

export default function InventarioPage({ lojaSelecionada, empregado, onVoltar }) {
    const [produtos, setProdutos] = useState([]);
    const [produtoParaStock, setProdutoParaStock] = useState(null);
    const [mostrarScanner, setMostrarScanner] = useState(false);
    const [alerta, setAlerta] = useState(null);
    const [enviando, setEnviando] = useState(false);

    // 🔎 Scan
    async function onDetected(codigo) {
        try {
            const produto = await fetchProdutoPorCodigo(codigo);

            // duplicado?
            const jaExiste = produtos.find(
                p =>
                    (p.codbarras && p.codbarras === produto.codbarras) ||
                    (p.codigo && p.codigo === produto.codigo)
            );

            if (jaExiste) {
                setAlerta({
                    tipo: "aviso",
                    mensagem: "⚠️ Este produto já foi picado no inventário."
                });
                return;
            }

            // 🔑 UM ÚNICO OBJETO
            const produtoInventario = {
                ...produto,
                __uid: crypto.randomUUID(),
                inventarioQtd: Number(produto.qtdstock) || 0
            };

            // 1️⃣ adiciona à tabela
            setProdutos(prev => [...prev, produtoInventario]);

            // 2️⃣ abre modal COM O MESMO OBJETO
            setProdutoParaStock(produtoInventario);

        } catch (err) {
            setAlerta({ tipo: "erro", mensagem: err.message });
        }
    }


    // 🧮 Atualizar stock TOTAL
    function confirmarStock(uid, total) {
        setProdutos(prev =>
            prev.map(p =>
                p.__uid === uid
                    ? { ...p, inventarioQtd: total }
                    : p
            )
        );
        setProdutoParaStock(null);
    }

    // 🚀 Enviar inventário
    async function enviarInventario() {
        try {
            setEnviando(true);

            for (const p of produtos) {
                const atual = Number(p.qtdstock) || 0;
                const novo = Number(p.inventarioQtd) || 0;
                const delta = novo - atual;

                if (delta !== 0) {
                    await atualizarStock(p.codigo, delta);
                }
            }

            setProdutos([]);
            setAlerta({ tipo: "sucesso", mensagem: "Inventário enviado com sucesso!" });

        } catch (err) {
            setAlerta({ tipo: "erro", mensagem: err.message });
        } finally {
            setEnviando(false);
        }
    }

    return (
        <div className="bg-light min-vh-100 d-flex flex-column">
            {/* 🔹 Barra superior (igual à picagem) */}
            <nav className="navbar navbar-expand-lg navbar-dark bg-primary shadow-sm">
                <div className="container-fluid">

                    {/* ESQUERDA */}
                    <div className="d-flex flex-column text-white">
                        <h5 className="fw-bold mb-0">
                            {lojaSelecionada?.toUpperCase()}
                        </h5>
                        <small>{empregado?.nome}</small>
                    </div>

                    {/* BOTÃO HAMBURGUER */}
                    <button
                        className="navbar-toggler"
                        type="button"
                        data-bs-toggle="collapse"
                        data-bs-target="#navbarInventario"
                    >
                        <span className="navbar-toggler-icon"></span>
                    </button>

                    {/* DIREITA */}
                    <div
                        className="collapse navbar-collapse justify-content-end"
                        id="navbarInventario"
                    >
                        <ul className="navbar-nav gap-2">

                            <li className="nav-item">
                                <button
                                    className="btn btn-outline-light btn-sm"
                                    onClick={onVoltar}
                                >
                                    <i className="bi bi-house-door me-1"></i> Menu
                                </button>
                            </li>

                            <li className="nav-item">
                                <button
                                    className="btn btn-outline-light btn-sm"
                                    onClick={() => window.location.reload()}
                                >
                                    <i className="bi bi-arrow-repeat me-1"></i> Trocar Loja
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
                                    <i className="bi bi-box-arrow-right me-1"></i> Terminar
                                </button>
                            </li>

                        </ul>
                    </div>
                </div>
            </nav>


            {/* 🔸 Conteúdo */}
            <div className="container my-4 p-4 bg-white rounded shadow flex-grow-1">

                <h2 className="fw-bold text-primary mb-4 text-center">

                    📦 Inventário
                </h2>

                {alerta && (
                    <AlertaMensagem
                        tipo={alerta.tipo}
                        mensagem={alerta.mensagem}
                        onFechar={() => setAlerta(null)}
                    />
                )}

                {/* 🔹 Botões */}
                <div className="mb-4 d-flex justify-content-center gap-3 flex-wrap">

                    <button
                        className="btn btn-outline-primary"
                        onClick={() => setMostrarScanner(true)}
                        disabled={enviando}
                    >
                        <i className="bi bi-upc-scan me-1"></i> Picar Produto
                    </button>

                </div>

                {/* 🔹 Scanner */}
                <ScannerHardware
                    show={mostrarScanner}
                    onClose={() => setMostrarScanner(false)}
                    onDetected={onDetected}
                />

                {/* 🔹 Tabela simples de inventário */}
                {produtos.length > 0 ? (
                    <div className="table-responsive mx-auto" style={{ maxWidth: "1100px" }}>

                        <table className="table table-bordered align-middle">
                            <thead className="table-light">
                                <tr>
                                    <th>Descrição</th>
                                    <th style={{ width: 180 }}>Código de Barras</th>
                                    <th style={{ width: 140, textAlign: "center" }}>Stock</th>
                                    <th style={{ width: 80, textAlign: "center" }}>Apagar</th>
                                </tr>
                            </thead>
                            <tbody>
                                {produtos.map(p => (
                                    <tr key={p.__uid}>
                                        <td>{p.descricao}</td>
                                        <td>{p.codbarras || "—"}</td>

                                        {/* Stock clicável */}
                                        <td
                                            className="fw-bold text-primary text-center"
                                            style={{ cursor: "pointer" }}
                                            title="Clique para alterar stock"
                                            onClick={() => setProdutoParaStock(p)}
                                        >
                                            {p.inventarioQtd}
                                        </td>

                                        <td className="text-center">
                                            <button
                                                className="btn btn-sm btn-outline-danger"
                                                onClick={() =>
                                                    setProdutos(prev =>
                                                        prev.filter(x => x.__uid !== p.__uid)
                                                    )
                                                }
                                            >
                                                <i className="bi bi-trash"></i>
                                            </button>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                ) : (
                    <p className="text-muted fst-italic">
                        Nenhum produto no inventário.
                    </p>
                )}

                {produtos.length > 0 && (
                    <div className="d-flex justify-content-center mt-4">
                        <button
                            className="btn btn-success px-4"
                            onClick={enviarInventario}
                            disabled={enviando}
                        >
                            <i className="bi bi-upload me-1"></i>
                            Enviar Inventário
                        </button>
                    </div>
                )}


                {/* 🔹 Modal de stock TOTAL */}
                {produtoParaStock && (
                    <StockModal
                        produto={produtoParaStock}
                        quantidadeInicial={produtoParaStock.inventarioQtd}
                        onFechar={() => setProdutoParaStock(null)}
                        onConfirmar={(uid, qtd) => {
                            setProdutos(prev =>
                                prev.map(p =>
                                    p.__uid === uid
                                        ? { ...p, inventarioQtd: Number(qtd) }
                                        : p
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
