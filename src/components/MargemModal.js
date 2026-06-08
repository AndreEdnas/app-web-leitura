import React, { useEffect, useState } from "react";

export default function MargemModal({ produto, onFechar, onConfirmar }) {
  const [novaMargem, setNovaMargem] = useState("");

  useEffect(() => {
    if (!produto) return;

    if (produto.margembruta != null) {
      setNovaMargem(String(produto.margembruta).replace(".", ","));
    }
  }, [produto]);

  function handleSubmit(e) {
    e.preventDefault();

    const valor = Number(novaMargem.replace(",", "."));
    if (!Number.isFinite(valor) || valor < 0) {
      alert("Introduza uma margem válida.");
      return;
    }

    onConfirmar(produto.__uid, valor);
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
                <i className="bi bi-percent me-2" aria-hidden="true"></i>
                Margem Bruta
              </h5>
              <button type="button" className="btn-close btn-close-white" aria-label="Fechar" onClick={onFechar}></button>
            </div>

            <div className="modal-body">
              <p className="fw-bold mb-3">{produto.descricao}</p>
              <label className="form-label fw-semibold">Nova margem (%)</label>
              <input
                type="text"
                inputMode="decimal"
                className="form-control"
                value={novaMargem}
                onChange={(e) => setNovaMargem(e.target.value.replace(".", ","))}
                autoFocus
              />
            </div>

            <div className="modal-footer">
              <button type="button" className="btn btn-secondary" onClick={onFechar}>
                Cancelar
              </button>
              <button type="submit" className="btn btn-success">
                Atualizar
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
