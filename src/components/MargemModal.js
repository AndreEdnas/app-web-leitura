import React, { useEffect, useState } from "react";

export default function MargemModal({ produto, onFechar, onConfirmar }) {
  const [novaMargem, setNovaMargem] = useState("");

  useEffect(() => {
    if (!produto) return;

    // 👉 margem vem SEMPRE do produto (fonte da verdade)
    if (produto.margembruta != null) {
      setNovaMargem(
        String(produto.margembruta).replace(".", ",")
      );
    }
  }, [produto]);

  function handleSubmit(e) {
    e.preventDefault();

    // normalizar vírgula → ponto
    const valor = Number(novaMargem.replace(",", "."));

    if (!Number.isFinite(valor) || valor < 0) {
      alert("Insere uma margem válida.");
      return;
    }

    // 👉 enviar o valor REAL, sem arredondar
    onConfirmar(produto.__uid, valor);
  }

  return (
    <div
      className="modal show d-block"
      tabIndex="-1"
      role="dialog"
      aria-modal="true"
      style={{ backgroundColor: "rgba(0,0,0,0.5)" }}
    >
      <div className="modal-dialog modal-dialog-centered" role="document">
        <div className="modal-content text-start">
          <form onSubmit={handleSubmit}>
            <div className="modal-header">
              <h5 className="modal-title">Editar Margem Bruta</h5>
              <button type="button" className="btn-close" onClick={onFechar}></button>
            </div>

            <div className="modal-body">
              <p><strong>{produto.descricao}</strong></p>

              <label className="form-label">Nova Margem (%)</label>
              <input
                type="text"
                inputMode="decimal"
                className="form-control"
                value={novaMargem}
                onChange={(e) =>
                  setNovaMargem(e.target.value.replace(".", ","))
                }
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
