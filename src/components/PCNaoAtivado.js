import React, { useState } from "react";
import "bootstrap/dist/css/bootstrap.min.css";

export default function PCNaoAtivado({ dados, onRevalidar }) {
  const [copiado, setCopiado] = useState(false);

  function copiar() {
    const tudo =
      `Chave de ativação: ${dados.chave}\n` +
      `Loja: ${dados.loja}\n` +
      `Token: ${dados.token}\n` +
      `Servidor SQL: ${dados.server}\n` +
      `Base de dados: ${dados.database}\n` +
      `Porta SQL: ${dados.port}\n` +
      `URL / túnel: ${dados.url || window.location.origin}`;

    navigator.clipboard.writeText(tudo);
    setCopiado(true);
    setTimeout(() => setCopiado(false), 2000);
  }

  function enviarEmail() {
    const subject = `Ativação de licença - loja ${dados.loja}`;
    const body =
      `Olá,\n\nSeguem os dados desta máquina para ativação:\n\n` +
      `Loja: ${dados.loja}\n` +
      `Token: ${dados.token}\n` +
      `Chave de ativação: ${dados.chave}\n\n` +
      `Servidor SQL: ${dados.server}\n` +
      `Base de dados: ${dados.database}\n` +
      `Porta SQL: ${dados.port}\n` +
      `URL / túnel: ${dados.url || window.location.origin}\n\n` +
      `Obrigado.`;

    window.location.href = `mailto:suporte@ednas.pt?subject=${encodeURIComponent(
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
          <h1 className="app-auth-title">Máquina não ativada</h1>
          <p className="app-auth-subtitle">
            Envie estes dados para o suporte EDNAS para ativar a licença.
          </p>
        </div>

        <div className="bg-light p-3 rounded mb-3 small">
          <p><strong>Loja:</strong> {dados.loja}</p>
          <p><strong>Token:</strong> {dados.token}</p>
          <p>
            <strong>Chave de ativação:</strong>
            <br />
            <code>{dados.chave}</code>
          </p>
          <hr />
          <p><strong>Servidor SQL:</strong> {dados.server}</p>
          <p><strong>Base de dados:</strong> {dados.database}</p>
          <p><strong>Porta SQL:</strong> {dados.port}</p>
          <p><strong>URL / túnel:</strong> {dados.url || window.location.origin}</p>
        </div>

        <div className="d-grid gap-2">
          <button type="button" className="btn btn-primary" onClick={copiar}>
            <i className="bi bi-clipboard me-1" aria-hidden="true"></i>
            {copiado ?"Copiado" : "Copiar dados"}
          </button>

          <button type="button" className="btn btn-outline-secondary" onClick={enviarEmail}>
            <i className="bi bi-envelope me-1" aria-hidden="true"></i>
            Enviar para suporte
          </button>

          <button type="button" className="btn btn-success" onClick={onRevalidar}>
            <i className="bi bi-arrow-repeat me-1" aria-hidden="true"></i>
            Tentar novamente
          </button>
        </div>
      </section>
    </main>
  );
}
