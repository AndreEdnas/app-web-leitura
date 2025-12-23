import React, { useState } from 'react';

export default function PrecoCompraModal({ produto, onFechar, onConfirmar }) {
  const [novoPreco, setNovoPreco] = useState(produto.precocompra || '');

  function handleSubmit(e) {
    e.preventDefault();
    const precoNum = parseFloat(novoPreco);
    if (isNaN(precoNum) || precoNum < 0) {
      alert('Insira um preço válido (número positivo)');
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
      style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}
    >
      <div className="modal-dialog modal-dialog-centered" role="document">
        <div className="modal-content text-start">
          <form onSubmit={handleSubmit}>
            <div className="modal-header">
              <h5 className="modal-title">Editar Preço de Compra</h5>
              <button
                type="button"
                className="btn-close"
                aria-label="Fechar"
                onClick={onFechar}
              />
            </div>
            <div className="modal-body">
              <p><strong>{produto.descricao}</strong></p>
              <label htmlFor="precoCompra" className="form-label">Novo Preço de Compra</label>
              <input
                id="precoCompra"
                type="number"
                step="0.01"
                min="0"
                className="form-control"
                value={novoPreco}
                onChange={e => setNovoPreco(e.target.value)}
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
