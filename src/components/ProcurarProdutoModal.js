import React, { useEffect, useState } from "react";
import { Modal, Button } from "react-bootstrap";

export default function ProcurarProdutoModal({
    show,
    onClose,
    apiUrl,
    onSelecionarProduto,
}) {
    const [termo, setTermo] = useState("");
    const [resultados, setResultados] = useState([]);
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        if (!termo) {
            setResultados([]);
            return;
        }

        const timer = setTimeout(async () => {
            try {
                setLoading(true);
                const res = await fetch(
                    `${apiUrl}/produtos/pesquisa?q=${encodeURIComponent(termo)}`
                );
                const data = await res.json();
                setResultados(data || []);
            } catch {
                setResultados([]);
            } finally {
                setLoading(false);
            }
        }, 300);

        return () => clearTimeout(timer);
    }, [termo, apiUrl]);

    return (
        <Modal show={show} onHide={onClose} centered size="lg">
            <Modal.Header closeButton className="bg-primary text-white">
                <Modal.Title>🔎 Procurar Produto por Nome</Modal.Title>
            </Modal.Header>

            <Modal.Body>
                <input
                    className="form-control mb-3"
                    placeholder="Digite o nome do produto..."
                    value={termo}
                    onChange={(e) => setTermo(e.target.value)}
                    autoFocus
                />

                {loading && <p className="text-muted">A pesquisar...</p>}

                {!loading && resultados.length === 0 && termo.length >= 2 && (
                    <p className="text-muted fst-italic">Nenhum produto encontrado.</p>
                )}

                <div className="list-group">
                    {resultados.map((p) => {
                        const preco =
                            p.precovenda != null
                                ? Number(p.precovenda).toFixed(2)
                                : "--";

                        return (
                            <button
                                key={p.codbarras || p.codigo}
                                className="list-group-item list-group-item-action d-flex justify-content-between align-items-center"
                                onClick={() => {
                                    onSelecionarProduto(p);
<<<<<<< HEAD
=======

                                    // 🔥 limpar estado
                                    setTermo("");
                                    setResultados([]);

>>>>>>> 58a1fb4 (alterações novas)
                                    onClose();
                                }}


<<<<<<< HEAD
=======

>>>>>>> 58a1fb4 (alterações novas)
                            >
                                {/* 🔹 Nome + código */}
                                <div className="text-start">
                                    <div className="fw-semibold">{p.descricao}</div>
                                    <small className="text-muted">
                                        {p.codbarras || "Sem código"}
                                    </small>

                                </div>

                                {/* 💰 Preço */}
                                <div className="fw-bold text-primary">
                                    {preco} €
                                </div>
                            </button>
                        );
                    })}
                </div>

            </Modal.Body>

            <Modal.Footer>
                <Button variant="secondary" onClick={onClose}>
                    Fechar
                </Button>
            </Modal.Footer>
        </Modal>
    );
}
