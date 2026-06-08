import React, { useState } from "react";

export default function PrecoCompraModal({ produto, onFechar, onConfirmar }) {
  const [novoPreco, setNovoPreco] = useState(produto.precocompra || "");

  function handleSubmit(e) {
    e.preventDefault();
    const precoNum = parseFloat(novoPreco);

    if (isNaN(precoNum) || precoNum < 0) {
      alert("Introduza um preço válido.");
      return;
    }

    onConfirmar(produto.__uid, precoNum);
  }

  return (
    <div
      className="modal show d-block"
      tabIndex="-1"
      role="dialog"
      aria-modal="true"
      style={{ backgroundColor: "rgba(15, 23, 42, 0.48)" }}
    >
      <div className="modal-dialog modal-dialog-centered" role="document">
        <div className="modal-content text-start">
          <form onSubmit={handleSubmit}>
            <div className="modal-header bg-primary text-white">
              <h5 className="modal-title">
                <i className="bi bi-tag me-2" aria-hidden="true"></i>
                Preço de compra
              </h5>
              <button type="button" className="btn-close btn-close-white" aria-label="Fechar" onClick={onFechar}></button>
            </div>
            <div className="modal-body">
              <p className="fw-bold mb-3">{produto.descricao}</p>
              <label htmlFor="precoCompra" className="form-label fw-semibold">Novo preço de compra</label>
              <input
                id="precoCompra"
                type="number"
                step="0.01"
                min="0"
                className="form-control"
                value={novoPreco}
                onChange={(e) => setNovoPreco(e.target.value)}
                autoFocus
              />
            </div>
            <div className="modal-footer">
              <button type="button" className="btn btn-secondary" onClick={onFechar}>Cancelar</button>
              <button type="submit" className="btn btn-success">Confirmar</button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
