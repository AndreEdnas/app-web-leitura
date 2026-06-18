import React, { useEffect, useState } from "react";

export default function StockModal({
  produto,
  quantidadeInicial = 0,
  onFechar,
  onConfirmar
}) {
  const [quantidade, setQuantidade] = useState(0);
  const [erro, setErro] = useState("");

  useEffect(() => {
    setQuantidade(Number(quantidadeInicial) || 0);
    setErro("");
  }, [quantidadeInicial]);

  function aumentar() {
    setQuantidade((q) => q + 1);
    setErro("");
  }

  function diminuir() {
    setQuantidade((q) => (q > 0 ? q - 1 : 0));
    setErro("");
  }

  function confirmar() {
    if (quantidade < 0) {
      setErro("Introduza uma quantidade valida.");
      return;
    }

    onConfirmar(produto.__uid, quantidade);
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
          <div className="modal-header bg-primary text-white">
            <h5 className="modal-title">
              <i className="bi bi-box-seam me-2" aria-hidden="true"></i>
              Atualizar Stock
            </h5>
            <button type="button" className="btn-close btn-close-white" aria-label="Fechar" onClick={onFechar}></button>
          </div>
          <div className="modal-body">
            <p className="fw-bold mb-3">{produto.descricao}</p>
            <label className="form-label fw-semibold">Quantidade</label>
            <div className="d-flex align-items-center gap-2">
              <button type="button" className="btn btn-outline-danger px-3" onClick={diminuir} disabled={quantidade <= 0}>
                -
              </button>
              <input
                type="number"
                className={`form-control text-center ${erro ? "is-invalid" : ""}`}
                value={quantidade}
                onChange={(e) => {
                  const val = Number(e.target.value);
                  if (!Number.isNaN(val)) {
                    setQuantidade(val);
                    setErro("");
                  }
                }}
                min={0}
              />
              <button type="button" className="btn btn-outline-success px-3" onClick={aumentar}>
                +
              </button>
            </div>
            {erro && <div className="text-danger small fw-semibold mt-2">{erro}</div>}
          </div>
          <div className="modal-footer">
            <button type="button" className="btn btn-secondary" onClick={onFechar}>Cancelar</button>
            <button type="button" className="btn btn-primary" onClick={confirmar}>Confirmar</button>
          </div>
        </div>
      </div>
    </div>
  );
}
