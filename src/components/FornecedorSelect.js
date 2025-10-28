import React from 'react';

export default function FornecedorSelect({ fornecedores, fornecedorSelecionado, setFornecedorSelecionado }) {
  return (
    <div className="mb-3 text-start">
      <label htmlFor="fornecedorSelect" className="form-label">
        <strong>Seleciona o Fornecedor:</strong>
      </label>
      <select
        id="fornecedorSelect"
        className="form-select"
        value={fornecedorSelecionado || ""}  {/* ← força reset visual */}
        onChange={e => setFornecedorSelecionado(e.target.value || "")}
      >
        <option value="">-- Escolhe um fornecedor --</option>
        {fornecedores.map(f => (
          <option key={f.codigo} value={f.codigo}>
            {f.nome}
          </option>
        ))}
      </select>
    </div>
  );
}
