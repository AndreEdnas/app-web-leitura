import React from "react";
import Select from "react-select";

export default function FornecedorSelect({
  fornecedores,
  fornecedorSelecionado,
  setFornecedorSelecionado,
  disabled,
}) {
  const options = fornecedores.map((f) => ({
    value: f.codigo,
    label: f.nome
  }));
  const selectedOption =
    options.find((option) => String(option.value) === String(fornecedorSelecionado)) || null;

  return (
    <Select
      inputId="fornecedorSelect"
      className="app-work-react-select"
      classNamePrefix="app-select"
      value={selectedOption}
      options={options}
      placeholder="Escolher fornecedor"
      noOptionsMessage={() => "Nenhum fornecedor encontrado"}
      onChange={(selected) => setFornecedorSelecionado(selected?.value || "")}
      isDisabled={disabled}
      isClearable
      isSearchable
      menuPortalTarget={typeof document !== "undefined" ? document.body : null}
    />
  );
}
