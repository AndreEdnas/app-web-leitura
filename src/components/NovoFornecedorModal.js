import React, { useState } from "react";

const estadoInicial = {
  nome: "",
  nif: "",
  telefone: "",
  email: "",
  morada: "",
  localidade: "",
  codigoPostal: "",
  observacoes: ""
};

export default function NovoFornecedorModal({ onFechar, onConfirmar, disabled }) {
  const [fornecedor, setFornecedor] = useState(estadoInicial);
  const [erro, setErro] = useState("");

  function handleChange(e) {
    const { name, value } = e.target;
    setFornecedor((prev) => ({ ...prev, [name]: value }));
    setErro("");
  }

  function handleSubmit(e) {
    e.preventDefault();

    if (!fornecedor.nome.trim()) {
      setErro("Preencha o nome do fornecedor.");
      return;
    }

    onConfirmar({
      nome: fornecedor.nome.trim(),
      nif: fornecedor.nif.trim(),
      telefone: fornecedor.telefone.trim(),
      email: fornecedor.email.trim(),
      morada: fornecedor.morada.trim(),
      localidade: fornecedor.localidade.trim(),
      codigoPostal: fornecedor.codigoPostal.trim(),
      observacoes: fornecedor.observacoes.trim()
    });
  }

  return (
    <div
      className="modal show d-block"
      tabIndex="-1"
      role="dialog"
      aria-modal="true"
      style={{ backgroundColor: "rgba(15, 23, 42, 0.52)" }}
    >
      <div className="modal-dialog modal-dialog-centered modal-lg" role="document">
        <form className="modal-content text-start" onSubmit={handleSubmit}>
          <div className="modal-header bg-primary text-white">
            <h5 className="modal-title">
              <i className="bi bi-person-plus me-2" aria-hidden="true"></i>
              Novo Fornecedor
            </h5>
            <button
              type="button"
              className="btn-close btn-close-white"
              onClick={onFechar}
              aria-label="Fechar"
              disabled={disabled}
            ></button>
          </div>

          <div className="modal-body">
            {erro && <div className="alert alert-danger py-2">{erro}</div>}

            <div className="app-form-grid">
              <div className="app-form-span-2">
                <label className="form-label fw-semibold">Nome</label>
                <input
                  type="text"
                  className="form-control"
                  name="nome"
                  value={fornecedor.nome}
                  onChange={handleChange}
                  placeholder="Nome do fornecedor"
                  autoComplete="organization"
                  autoFocus
                  disabled={disabled}
                />
              </div>

              <div>
                <label className="form-label fw-semibold">NIF</label>
                <input
                  type="text"
                  className="form-control"
                  name="nif"
                  value={fornecedor.nif}
                  onChange={handleChange}
                  placeholder="NIF"
                  autoComplete="off"
                  disabled={disabled}
                />
              </div>

              <div>
                <label className="form-label fw-semibold">Telefone</label>
                <input
                  type="tel"
                  className="form-control"
                  name="telefone"
                  value={fornecedor.telefone}
                  onChange={handleChange}
                  placeholder="Telefone"
                  autoComplete="tel"
                  disabled={disabled}
                />
              </div>

              <div className="app-form-span-2">
                <label className="form-label fw-semibold">Email</label>
                <input
                  type="email"
                  className="form-control"
                  name="email"
                  value={fornecedor.email}
                  onChange={handleChange}
                  placeholder="Email"
                  autoComplete="email"
                  disabled={disabled}
                />
              </div>

              <div className="app-form-span-2">
                <label className="form-label fw-semibold">Morada</label>
                <input
                  type="text"
                  className="form-control"
                  name="morada"
                  value={fornecedor.morada}
                  onChange={handleChange}
                  placeholder="Morada"
                  autoComplete="street-address"
                  disabled={disabled}
                />
              </div>

              <div>
                <label className="form-label fw-semibold">Localidade</label>
                <input
                  type="text"
                  className="form-control"
                  name="localidade"
                  value={fornecedor.localidade}
                  onChange={handleChange}
                  placeholder="Localidade"
                  autoComplete="address-level2"
                  disabled={disabled}
                />
              </div>

              <div>
                <label className="form-label fw-semibold">Código postal</label>
                <input
                  type="text"
                  className="form-control"
                  name="codigoPostal"
                  value={fornecedor.codigoPostal}
                  onChange={handleChange}
                  placeholder="Código postal"
                  autoComplete="postal-code"
                  disabled={disabled}
                />
              </div>

              <div className="app-form-span-2">
                <label className="form-label fw-semibold">Observacoes</label>
                <textarea
                  className="form-control"
                  name="observacoes"
                  value={fornecedor.observacoes}
                  onChange={handleChange}
                  rows="3"
                  disabled={disabled}
                />
              </div>
            </div>
          </div>

          <div className="modal-footer">
            <button type="button" className="btn btn-secondary" onClick={onFechar} disabled={disabled}>
              Cancelar
            </button>
            <button type="submit" className="btn btn-primary" disabled={disabled}>
              Criar fornecedor
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
