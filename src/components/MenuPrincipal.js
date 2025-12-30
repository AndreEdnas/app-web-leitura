// src/components/MenuPrincipal.jsx
import React from "react";

export default function MenuPrincipal({
  empregado,
  lojaSelecionada,
  onIrScanner,
  onIrInventario,
  onIrGestaoCaixa,
  onIrConfiguracoes,
  onLogout,
  onTrocarLoja,
}) {

  return (
    <div className="min-vh-100 bg-light d-flex flex-column justify-content-center align-items-center text-center">
      <div className="mb-5">
        <h5 className="text-uppercase text-muted mb-1">{lojaSelecionada}</h5>
        <h2 className="fw-bold text-primary">Bem-vindo, {empregado?.nome}</h2>
      </div>

      <div
        className="d-flex flex-column gap-3 w-100 px-3"
        style={{ maxWidth: "500px" }}
      >
        <button className="btn btn-primary btn-lg" onClick={onIrScanner}>
          📦 Picagem / Scanner de Produtos
        </button>

        <button className="btn btn-outline-primary btn-lg" onClick={onIrInventario}>
          📦 Inventário
        </button>


        <button className="btn btn-outline-success btn-lg" onClick={onIrGestaoCaixa}>
          💰 Gestão de Caixa
        </button>

        <button className="btn btn-outline-dark btn-lg" onClick={onIrConfiguracoes}>
          ⚙️ Configurações
        </button>

        <hr className="my-4" />

        <div className="d-flex justify-content-center gap-2 flex-wrap">
          <button className="btn btn-outline-secondary" onClick={onTrocarLoja}>
            🔁 Trocar Loja
          </button>
          <button className="btn btn-outline-danger" onClick={onLogout}>
            🚪 Terminar Sessão
          </button>
        </div>
      </div>
    </div>
  );
}
