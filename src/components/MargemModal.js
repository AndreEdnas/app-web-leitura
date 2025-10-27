import React, { useState } from 'react';

export default function MargemModal({ produto, onFechar, onConfirmar }) {
  const [novaMargem, setNovaMargem] = useState(produto.margembruta ?? 0);

  function handleSubmit(e) {
    e.preventDefault();
    if (isNaN(novaMargem) || novaMargem < 0) {
      alert('Insere uma margem válida (>= 0).');
      return;
    }
    onConfirmar(produto.codbarras, parseFloat(novaMargem));
  }

  return (
    <div className="modal show d-block" tabIndex="-1" role="dialog" aria-modal="true" style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}>
      <div className="modal-dialog modal-dialog-centered" role="document">
        <div className="modal-content text-start">
          <form onSubmit={handleSubmit}>
            <div className="modal-header">
              <h5 className="modal-title">Editar Margem Bruta</h5>
              <button type="button" className="btn-close" onClick={onFechar}></button>
            </div>
            <div className="modal-body">
              <p><strong>{produto.descricao}</strong></p>
              <label htmlFor="margem" className="form-label">Nova Margem (%)</label>
              <input
                type="number"
                step="0.01"
                min="0"
                className="form-control"
                id="margem"
                value={novaMargem}
                onChange={e => setNovaMargem(e.target.value)}
              />
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
