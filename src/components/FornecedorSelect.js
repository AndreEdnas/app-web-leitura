import React from "react";

export default function FornecedorSelect({
  fornecedores,
  fornecedorSelecionado,
  setFornecedorSelecionado,
  disabled,
}) {
  return (
    <select
      id="fornecedorSelect"
      className="form-select text-center"
      value={fornecedorSelecionado || ""}
      onChange={(e) => setFornecedorSelecionado(e.target.value || "")}
      disabled={disabled}
    >
      <option value="">-- Escolher um fornecedor --</option>
      {fornecedores.map((f) => (
        <option key={f.codigo} value={f.codigo}>
          {f.nome}
        </option>
      ))}
    </select>
  );
}
