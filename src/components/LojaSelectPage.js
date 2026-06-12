import React, { useState } from "react";
import "bootstrap/dist/css/bootstrap.min.css";
import "bootstrap-icons/font/bootstrap-icons.css";
import { getBrowserApiBaseUrl } from "../services/backendConfig";

export default function LojaSelectPage({ resolverUrl, onLojaConfirmada }) {
  const [tokenLoja, setTokenLoja] = useState("");
  const [erro, setErro] = useState("");
  const [aValidar, setAValidar] = useState(false);

  async function validarToken(event) {
    event?.preventDefault();

    const token = tokenLoja.trim();
    if (!token) {
      setErro("Introduza o token de entrada.");
      return;
    }

    setAValidar(true);
    setErro("");

    try {
      const res = await fetch(resolverUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ token }),
      });

      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.success) {
        throw new Error(data?.error || "Token inválido. Tente novamente.");
      }

      const loja = data.loja || {};
      const lojaId = String(loja.id || loja.nome || "").trim();
      const lojaNome = String(loja.nome || lojaId).trim();
      const apiUrl = String(loja.url || "").trim();
      if (!lojaId || !apiUrl) {
        throw new Error("Loja sem URL pública configurada.");
      }

      const browserApiUrl = getBrowserApiBaseUrl(apiUrl, token);

      localStorage.removeItem("empregado");
      localStorage.removeItem("produtos");
      localStorage.removeItem("alteracoesPendentes");

      localStorage.setItem("tokenLoja", token);
      localStorage.setItem("lojaSelecionada", lojaId);
      localStorage.setItem("apiUrl", browserApiUrl);
      localStorage.setItem("apiUrlPublic", apiUrl);
      onLojaConfirmada(lojaNome || lojaId, apiUrl, loja);
    } catch (err) {
      setErro(err?.message || "Token inválido. Tente novamente.");
      setTokenLoja("");
    } finally {
      setAValidar(false);
    }
  }

  return (
    <main className="app-auth-page">
      <section className="app-auth-card">
        <div className="app-auth-header">
          <div className="app-brand-badge">
            <i className="bi bi-shop" aria-hidden="true"></i>
          </div>
          <h1 className="app-auth-title">Entrada da loja</h1>
          <p className="app-auth-subtitle">
            Introduza o token de acesso da loja.
          </p>
        </div>

        <form onSubmit={validarToken}>
          <input
            type="text"
            className="form-control text-center mb-3"
            placeholder="Token de entrada"
            value={tokenLoja}
            onChange={(e) => {
              setTokenLoja(e.target.value);
              setErro("");
            }}
            autoFocus
            disabled={aValidar}
          />

          {erro && <p className="text-danger small mb-3 text-center">{erro}</p>}

          <button
            type="submit"
            className="btn btn-success w-100"
            disabled={aValidar}
          >
            {aValidar ? "A validar..." : "Entrar"}
          </button>
        </form>
      </section>
    </main>
  );
}
