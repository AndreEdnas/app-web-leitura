import React, { useState, useEffect } from 'react';

export default function PrecoVendaModal({ produto, onFechar, onConfirmar }) {
  const [precoVenda, setPrecoVenda] = useState(produto.precovenda ?? 0);

  // Atualiza o campo sempre que o produto mudar
  useEffect(() => {
    setPrecoVenda(produto.precovenda ?? 0);
  }, [produto]);

  function handleSubmit(e) {
    e.preventDefault();
    const novoPreco = Number(precoVenda);
    if (isNaN(novoPreco) || novoPreco <= 0) {
      alert('Insere um preço válido (> 0).');
      return;
    }
    onConfirmar(produto.__uid, novoPreco);

    onFechar();
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
              <h5 className="modal-title">Editar Preço de Venda</h5>
              <button type="button" className="btn-close" onClick={onFechar}></button>
            </div>
            <div className="modal-body">
              <p><strong>{produto.descricao}</strong></p>
              <label htmlFor="precoVenda" className="form-label">Preço de Venda (€)</label>
              <input
                type="number"
                step="0.01"
                min="0"
                className="form-control"
                id="precoVenda"
                value={precoVenda}
                onChange={e => setPrecoVenda(e.target.value)}
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
