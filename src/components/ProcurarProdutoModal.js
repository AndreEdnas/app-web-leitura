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
    if (!termo || termo.length < 2) {
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
          {resultados.map((p) => (
            <button
              key={p.codbarras}
              className="list-group-item list-group-item-action"
              onClick={() => {
                onSelecionarProduto(p);
                onClose();
              }}
            >
              <strong>{p.descricao}</strong>
              <br />
              <small className="text-muted">{p.codbarras}</small>
            </button>
          ))}
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
