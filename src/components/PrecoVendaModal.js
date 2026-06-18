import React, { useEffect, useState } from "react";

export default function PrecoVendaModal({ produto, onFechar, onConfirmar }) {
  const [precoVenda, setPrecoVenda] = useState(produto.precovenda ?? 0);
  const [erro, setErro] = useState("");

  useEffect(() => {
    setPrecoVenda(produto.precovenda ?? 0);
    setErro("");
  }, [produto]);

  function handleSubmit(e) {
    e.preventDefault();
    const novoPreco = Number(precoVenda);

    if (Number.isNaN(novoPreco) || novoPreco <= 0) {
      setErro("Introduza um preco valido.");
      return;
    }

    onConfirmar(produto.__uid, novoPreco);
    onFechar();
  }

  return (
    <div className="modal show d-block" tabIndex="-1" role="dialog" aria-modal="true" style={{ backgroundColor: "rgba(15, 23, 42, 0.48)" }}>
      <div className="modal-dialog modal-dialog-centered" role="document">
        <div className="modal-content text-start">
          <form onSubmit={handleSubmit}>
            <div className="modal-header bg-primary text-white">
              <h5 className="modal-title">
                <i className="bi bi-currency-euro me-2" aria-hidden="true"></i>
                Preco de venda
              </h5>
              <button type="button" className="btn-close btn-close-white" aria-label="Fechar" onClick={onFechar}></button>
            </div>
            <div className="modal-body">
              <p className="fw-bold mb-3">{produto.descricao}</p>
              <label htmlFor="precoVenda" className="form-label fw-semibold">Preco de venda com IVA</label>
              <input
                type="number"
                step="0.01"
                min="0"
                className={`form-control ${erro ? "is-invalid" : ""}`}
                id="precoVenda"
                value={precoVenda}
                onChange={(e) => {
                  setPrecoVenda(e.target.value);
                  setErro("");
                }}
                autoFocus
              />
              {erro && <div className="text-danger small fw-semibold mt-2">{erro}</div>}
            </div>
            <div className="modal-footer">
              <button type="button" className="btn btn-secondary" onClick={onFechar}>Cancelar</button>
              <button type="submit" className="btn btn-success">Atualizar</button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
