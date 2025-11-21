import React, { useState } from "react";
import "bootstrap/dist/css/bootstrap.min.css";

export default function PCNaoAtivado({ dados, onRevalidar }) {
  const [copiado, setCopiado] = useState(false);

  function copiar() {
    const tudo =
      `Chave de Ativação: ${dados.chave}\n` +
      `Loja: ${dados.loja}\n` +
      `Token: ${dados.token}\n` +
      `Servidor SQL: ${dados.server}\n` +
      `Base de Dados: ${dados.database}\n` +
      `Porta SQL: ${dados.port}`;

    navigator.clipboard.writeText(tudo);
    setCopiado(true);
    setTimeout(() => setCopiado(false), 2000);
  }

  function enviarEmail() {
    const subject = `Ativação de Licença - Loja ${dados.loja}`;
    const body =
      `Olá,\n\nSegue os dados desta máquina para ativação:\n\n` +
      `Loja: ${dados.loja}\n` +
      `Token: ${dados.token}\n` +
      `Chave de Ativação: ${dados.chave}\n\n` +
      `Servidor SQL: ${dados.server}\n` +
      `Base de Dados: ${dados.database}\n` +
      `Porta SQL: ${dados.port}\n\n` +
      `Obrigado.`;

    window.location.href =
      `mailto:suporte@ednas.pt?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
  }

  return (
    <div className="d-flex vh-100 justify-content-center align-items-center bg-warning bg-gradient">
      <div className="bg-white shadow rounded-4 p-4 text-center" style={{ width: 380 }}>
        
        <h3 className="text-danger fw-bold mb-2">❌ Máquina Não Ativada</h3>

        <p className="text-muted mb-3">
          Esta máquina ainda não tem licença ativa.<br/>
          Envie os dados abaixo para o suporte Ednas.
        </p>

        <div className="text-start bg-light p-3 rounded-3 mb-3 small">
          <p><strong>Loja:</strong> {dados.loja}</p>
          <p><strong>Token:</strong> {dados.token}</p>
          <p><strong>Chave de Ativação:</strong><br />
            <code>{dados.chave}</code>
          </p>
          <hr />
          <p><strong>Servidor SQL:</strong> {dados.server}</p>
          <p><strong>Base de Dados:</strong> {dados.database}</p>
          <p><strong>Porta SQL:</strong> {dados.port}</p>
        </div>

        <div className="d-grid gap-2">
          <button className="btn btn-primary" onClick={copiar}>
            {copiado ? "✔ Copiado!" : "📋 Copiar Dados"}
          </button>

          <button className="btn btn-secondary" onClick={enviarEmail}>
            ✉ Enviar para Suporte
          </button>

          <button className="btn btn-success" onClick={onRevalidar}>
            🔄 Tentar Novamente
          </button>
        </div>
      </div>
    </div>
  );
}
