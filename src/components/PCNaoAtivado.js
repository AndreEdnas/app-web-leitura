import React, { useState } from "react";
import "bootstrap/dist/css/bootstrap.min.css";

function valorVisivel(valor) {
  const texto = String(valor || "").trim();
  return texto || null;
}

function LinhaDiagnostico({ label, value, mono = false }) {
  const texto = valorVisivel(value);
  if (!texto) return null;

  return (
    <div className="mb-3">
      <div className="fw-bold text-dark">{label}</div>
      {mono ? (
        <code className="d-block text-break small">{texto}</code>
      ) : (
        <div className="text-break">{texto}</div>
      )}
    </div>
  );
}

export default function PCNaoAtivado({ dados, onRevalidar, onTrocarLoja }) {
  const [copiado, setCopiado] = useState(false);

  const loja = valorVisivel(dados.loja) || "Loja selecionada";
  const identificadorMaquina = valorVisivel(dados.chave);
  const erro = valorVisivel(dados.erro) || valorVisivel(dados.error);
  const contaInativa = dados.tipo === "conta_inativa";
  const mostrarDiagnostico = !contaInativa;
  const temDadosSql = mostrarDiagnostico && (dados.server || dados.database || dados.port);

  const linhas = [
    ["Loja", loja],
    ["Identificador da máquina", identificadorMaquina],
    ["Servidor SQL", dados.server],
    ["Base de dados", dados.database],
    ["Porta SQL", dados.port],
    ["Detalhe", erro],
  ].filter(([, value]) => valorVisivel(value));
  const linhasSeguras = mostrarDiagnostico ? linhas : [];

  function copiar() {
    const texto = linhasSeguras
      .map(([label, value]) => `${label}: ${valorVisivel(value)}`)
      .join("\n");

    navigator.clipboard.writeText(texto);
    setCopiado(true);
    setTimeout(() => setCopiado(false), 2000);
  }

  function enviarEmail() {
    const subject = `Diagnóstico de licença - ${loja}`;
    const body =
      `Olá,\n\nA aplicação não conseguiu validar a licença desta instalação.\n\n` +
      linhasSeguras.map(([label, value]) => `${label}: ${valorVisivel(value)}`).join("\n") +
      `\n\nObrigado.`;

    window.location.href = `mailto:andre@ednas.pt?subject=${encodeURIComponent(
      subject
    )}&body=${encodeURIComponent(body)}`;
  }

  return (
    <main className="app-auth-page">
      <section className="app-auth-card">
        <div className="app-auth-header">
          <div className="app-brand-badge text-danger">
            <i className="bi bi-shield-exclamation" aria-hidden="true"></i>
          </div>
          <h1 className="app-auth-title">Licença não ativa</h1>
          <p className="app-auth-subtitle">
            Esta loja ainda não conseguiu validar a licença nesta máquina.
          </p>
        </div>

        {contaInativa && (
          <div className="alert alert-danger py-2 small" role="alert">
            Esta conta está inativa. O acesso foi bloqueado no servidor.
          </div>
        )}

        {erro && mostrarDiagnostico && (
          <div className="alert alert-warning py-2 small" role="alert">
            {erro}
          </div>
        )}

        {mostrarDiagnostico && (
        <div className="bg-light p-3 rounded mb-3 small">
          <LinhaDiagnostico label="Loja" value={loja} />
          <LinhaDiagnostico
            label="Identificador da máquina"
            value={identificadorMaquina}
            mono
          />

          {temDadosSql && <hr />}
          <LinhaDiagnostico label="Servidor SQL" value={dados.server} />
          <LinhaDiagnostico label="Base de dados" value={dados.database} />
          <LinhaDiagnostico label="Porta SQL" value={dados.port} />
        </div>
        )}

        <div className="d-grid gap-2">
          <button type="button" className="btn btn-success" onClick={onRevalidar}>
            <i className="bi bi-arrow-repeat me-1" aria-hidden="true"></i>
            Tentar novamente
          </button>

          {onTrocarLoja && (
            <button type="button" className="btn btn-outline-primary" onClick={onTrocarLoja}>
              <i className="bi bi-arrow-left-right me-1" aria-hidden="true"></i>
              Trocar loja
            </button>
          )}

          <button type="button" className="btn btn-outline-secondary" onClick={copiar} hidden={!mostrarDiagnostico}>
            <i className="bi bi-clipboard me-1" aria-hidden="true"></i>
            {copiado ? "Diagnóstico copiado" : "Copiar diagnóstico"}
          </button>

          <button type="button" className="btn btn-outline-secondary" onClick={enviarEmail} hidden={!mostrarDiagnostico}>
            <i className="bi bi-envelope me-1" aria-hidden="true"></i>
            Enviar para suporte
          </button>
        </div>
      </section>
    </main>
  );
}
