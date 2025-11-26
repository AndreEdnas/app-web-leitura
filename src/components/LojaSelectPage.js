// src/components/LojaSelectPage.js
import React, { useState, useEffect } from "react";
import "bootstrap/dist/css/bootstrap.min.css";
import "bootstrap-icons/font/bootstrap-icons.css";

export default function LojaSelectPage({ onLojaConfirmada }) {
  const [lojasJson, setLojasJson] = useState(null);
  const [lojaSelecionada, setLojaSelecionada] = useState(null);
  const [tokenLoja, setTokenLoja] = useState("");
  const [erro, setErro] = useState("");

  // 🔹 Buscar lojas do JSONBin
  useEffect(() => {
    async function fetchLojas() {
      try {
        const res = await fetch("https://ednas-cloud.andre-86d.workers.dev/config?appkey=3dNas");

        const data = await res.json();
        setLojasJson(data); // NÃO é data.record

      } catch (err) {
        console.error("Erro ao buscar JSON das lojas:", err);
      }
    }
    fetchLojas();
  }, []);

  // 🔹 Validar token da loja
  function validarToken() {
    if (!lojasJson || !lojaSelecionada) return;

    const lojaData = lojasJson.lojas[lojaSelecionada];
    if (lojaData && lojaData.token === tokenLoja) {
      // Guarda dados localmente
      localStorage.setItem("tokenLoja", tokenLoja);
      localStorage.setItem("lojaSelecionada", lojaSelecionada);

      onLojaConfirmada(lojaSelecionada, lojaData.url);
    } else {
      setErro("❌ Token inválido. Tente novamente.");
      setTokenLoja("");
    }
  }

  return (
    <div className="d-flex flex-column align-items-center justify-content-center vh-100 bg-warning bg-gradient">
      <div className="bg-white rounded-4 shadow p-4 text-center" style={{ width: 360 }}>
        <h4 className="fw-bold text-primary mb-3">Seleção de Loja</h4>

        {/* 🔹 Etapa 1 - Escolher loja */}
        {!lojaSelecionada ? (
          <>
            <p className="mb-3">Escolha a sua loja:</p>
            {lojasJson && lojasJson.lojas ? (
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
              <p className="text-muted fst-italic">A carregar lista de lojas...</p>
            )}
          </>
        ) : (
          <>
            {/* 🔹 Etapa 2 - Inserir token */}
            <h5 className="fw-semibold text-primary mb-2">{lojaSelecionada}</h5>
            <p className="text-muted small mb-3">Introduza o token para continuar:</p>

            <input
              type="text"
              className="form-control text-center mb-3"
              placeholder="Token da loja"
              value={tokenLoja}
              onChange={(e) => setTokenLoja(e.target.value)}
            />

            {erro && <p className="text-danger small mb-2">{erro}</p>}

            <div className="d-flex justify-content-between">
              <button
                className="btn btn-outline-secondary w-50 me-2"
                onClick={() => {
                  setLojaSelecionada(null);
                  setTokenLoja("");
                  setErro("");
                }}
              >
                <i className="bi bi-arrow-left"></i> Voltar
              </button>
              <button className="btn btn-success w-50" onClick={validarToken}>
                <i className="bi bi-check-lg"></i> Confirmar
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
