import React, { useEffect, useState } from "react";
import { Modal, Button } from "react-bootstrap";

function formatMoney(value) {
  const number = Number(value);
  return Number.isFinite(number) ? `${number.toFixed(2)} EUR` : "--";
}

export default function ProcurarProdutoModal({
  show,
  onClose,
  apiUrl,
  onSelecionarProduto
}) {
  const [termo, setTermo] = useState("");
  const [resultados, setResultados] = useState([]);
  const [loading, setLoading] = useState(false);
  const [erro, setErro] = useState("");

  useEffect(() => {
    if (!termo) {
      setResultados([]);
      setErro("");
      return;
    }

    const timer = setTimeout(async () => {
      try {
        setLoading(true);
        setErro("");
        const res = await fetch(
          `${apiUrl}/produtos/pesquisa?q=${encodeURIComponent(termo)}`
        );
        const data = await res.json().catch(() => null);
        if (!res.ok) {
          throw new Error(data?.error || data?.message || "Erro ao pesquisar produtos.");
        }
        setResultados(Array.isArray(data) ? data : []);
      } catch (err) {
        setResultados([]);
        setErro(err?.message || "Erro ao pesquisar produtos.");
      } finally {
        setLoading(false);
      }
    }, 300);

    return () => clearTimeout(timer);
  }, [termo, apiUrl]);

  function fechar() {
    setTermo("");
    setResultados([]);
    setErro("");
    onClose();
  }

  function escolherProduto(produto) {
    onSelecionarProduto(produto);
    fechar();
  }

  return (
    <Modal show={show} onHide={fechar} centered size="lg">
      <Modal.Header closeButton className="bg-primary text-white">
        <Modal.Title>
          <i className="bi bi-search me-2" aria-hidden="true"></i>
          Procurar Produto
        </Modal.Title>
      </Modal.Header>

      <Modal.Body>
        <input
          className="form-control mb-3"
          placeholder="Introduza o nome ou codigo do produto..."
          value={termo}
          onChange={(e) => setTermo(e.target.value)}
          autoFocus
        />

        {loading && <p className="text-muted mb-0">A pesquisar...</p>}

        {!loading && erro && (
          <p className="text-danger mb-0">{erro}</p>
        )}

        {!loading && !erro && resultados.length === 0 && termo.length >= 2 && (
          <p className="text-muted mb-0">Nenhum produto encontrado.</p>
        )}

        <div className="list-group">
          {resultados.map((produto) => (
            <button
              key={produto.codbarras || produto.codigo}
              type="button"
              className="list-group-item list-group-item-action d-flex justify-content-between align-items-center gap-3"
              onClick={() => escolherProduto(produto)}
            >
              <span className="text-start">
                <span className="d-block fw-bold">{produto.descricao}</span>
                <small className="text-muted">
                  {produto.codbarras || "Sem codigo"}
                </small>
              </span>
              <span className="fw-bold text-primary text-nowrap">
                {formatMoney(produto.precovenda)}
              </span>
            </button>
          ))}
        </div>
      </Modal.Body>

      <Modal.Footer>
        <Button variant="secondary" onClick={fechar}>
          Fechar
        </Button>
      </Modal.Footer>
    </Modal>
  );
}
