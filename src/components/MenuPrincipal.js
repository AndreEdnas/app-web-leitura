import React from "react";

export default function MenuPrincipal({
  empregado,
  lojaSelecionada,
  onIrScanner,
  onIrInventario,
  onIrGestaoCaixa,
  onIrConfiguracoes,
  onLogout,
  onTrocarLoja
}) {
  const opcoes = [
    {
      label: "Picagem / Scanner",
      help: "Produtos, stock, preços e documentos",
      icon: "bi-upc-scan",
      onClick: onIrScanner
    },
    {
      label: "Inventário",
      help: "Contagem e acerto de stock",
      icon: "bi-box-seam",
      onClick: onIrInventario
    },
    {
      label: "Gestão de caixa",
      help: "Módulo em preparação",
      icon: "bi-cash-coin",
      onClick: onIrGestaoCaixa,
      disabled: true
    },
    {
      label: "Configurações",
      help: "Preferências e parâmetros",
      icon: "bi-gear",
      onClick: onIrConfiguracoes,
      disabled: true
    }
  ];

  return (
    <main className="app-menu-page">
      <section className="app-menu-shell">
        <header className="app-menu-header">
          <div>
            <p className="app-menu-kicker">{lojaSelecionada}</p>
            <h1 className="app-menu-title">Bem-vindo, {empregado?.nome}</h1>
          </div>
          <div className="text-muted small">
            Sessão ativa
          </div>
        </header>

        <div className="app-menu-grid">
          {opcoes.map((opcao) => (
            <button
              key={opcao.label}
              type="button"
              className="app-menu-button"
              onClick={opcao.disabled ?undefined : opcao.onClick}
              disabled={opcao.disabled}
              aria-disabled={opcao.disabled}
            >
              <span className="app-menu-icon">
                <i className={`bi ${opcao.icon}`} aria-hidden="true"></i>
              </span>
              <span>
                <span className="app-menu-label">{opcao.label}</span>
                <span className="app-menu-help">{opcao.help}</span>
              </span>
            </button>
          ))}
        </div>

        <div className="app-menu-actions">
          <button type="button" className="btn btn-outline-secondary" onClick={onTrocarLoja}>
            <i className="bi bi-arrow-repeat me-1" aria-hidden="true"></i>
            Trocar loja
          </button>
          <button type="button" className="btn btn-outline-danger" onClick={onLogout}>
            <i className="bi bi-box-arrow-right me-1" aria-hidden="true"></i>
            Terminar sessão
          </button>
        </div>
      </section>
    </main>
  );
}
