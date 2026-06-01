// src/components/LojaSelectPage.js
import React, { useState } from "react";
import "bootstrap/dist/css/bootstrap.min.css";
import "bootstrap-icons/font/bootstrap-icons.css";

export default function LojaSelectPage({ lojasJson, onLojaConfirmada }) {
  const [lojaSelecionada, setLojaSelecionada] = useState(null);
  const [tokenLoja, setTokenLoja] = useState("");
  const [erro, setErro] = useState("");

  // Validar token da loja selecionada
  function validarToken() {
    if (!lojasJson || !lojaSelecionada) return;

    const lojaData = lojasJson.lojas[lojaSelecionada];
    if (lojaData && lojaData.token === tokenLoja) {
      localStorage.setItem("tokenLoja", tokenLoja);
      localStorage.setItem("lojaSelecionada", lojaSelecionada);

      // Devolve decisao final ao App
      onLojaConfirmada(lojaSelecionada, lojaData.url);
    } else {
      setErro("❌ Token inválido. Tente novamente.");
      setTokenLoja("");
    }
  }

  return (
    <div className="d-flex flex-column align-items-center justify-content-center vh-100 bg-warning bg-gradient">
      <div
        className="bg-white rounded-4 shadow p-4 text-center"
        style={{ width: 360 }}
      >
        <h4 className="fw-bold text-primary mb-3">Seleção de Loja</h4>

        {!lojaSelecionada ? (
          <>
            <p className="mb-3">Escolha a sua loja:</p>
            {lojasJson?.lojas ? (
              <div className="list-group">
                {Object.keys(lojasJson.lojas).map((nome) => (
                  <button
                    key={nome}
                    className="list-group-item list-group-item-action fw-bold"
                    onClick={() => {
                      setLojaSelecionada(nome);
                      setErro("");
                    }}
                  >
                    🏪 {nome}
                  </button>
                ))}
              </div>
            ) : (
              <p className="text-muted fst-italic">
                A carregar lista de lojas...
              </p>
            )}
          </>
        ) : (
          <>
            <h5 className="fw-semibold text-primary mb-2">
              {lojaSelecionada}
            </h5>

            <input
              type="text"
              className="form-control text-center mb-3"
              placeholder="Token da loja"
              value={tokenLoja}
              onChange={(e) => setTokenLoja(e.target.value)}
            />

            {erro && <p className="text-danger small mb-2">{erro}</p>}

            <div className="d-flex gap-2">
              <button
                className="btn btn-outline-secondary w-50"
                onClick={() => {
                  setLojaSelecionada(null);
                  setTokenLoja("");
                  setErro("");
                }}
              >
                Voltar
              </button>
              <button
                className="btn btn-success w-50"
                onClick={validarToken}
              >
                Confirmar
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
