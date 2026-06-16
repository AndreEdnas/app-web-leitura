import React, { useEffect, useState } from "react";
import "bootstrap/dist/css/bootstrap.min.css";
import "bootstrap-icons/font/bootstrap-icons.css";
import { fetchWithPublicFallback } from "../services/api";

export default function LoginPage({ apiUrl, onLoginSuccess }) {
  const [empregados, setEmpregados] = useState([]);
  const [empregadoSelecionado, setEmpregadoSelecionado] = useState(null);
  const [pin, setPin] = useState("");
  const [erro, setErro] = useState("");

  useEffect(() => {
    async function fetchEmpregados() {
      try {
        const res = await fetchWithPublicFallback(`${apiUrl}/empregados`);
        const data = await res.json().catch(() => null);
        if (!res.ok) {
          throw new Error(data?.error || "Não foi possível carregar operadores.");
        }
        setEmpregados(data);
      } catch (err) {
        console.error("Erro ao obter empregados:", err);
        setErro(err?.message || "Não foi possível carregar operadores.");
      }
    }

    fetchEmpregados();
  }, [apiUrl]);

  async function fazerLogin() {
    if (!empregadoSelecionado || !pin) return;

    try {
      const res = await fetchWithPublicFallback(`${apiUrl}/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          nome: empregadoSelecionado.nome,
          password: pin
        })
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "PIN inválido");

      localStorage.setItem("empregado", JSON.stringify(data.user));
      onLoginSuccess(data.user);
    } catch {
      setErro("PIN inválido. Tente novamente.");
      setPin("");
    }
  }

  const adicionarNumero = (num) =>
    setPin((prev) => prev + num);
  const apagarUltimo = () => setPin((prev) => prev.slice(0, -1));
  const limparTudo = () => setPin("");

  function handlePinKeyDown(e) {
    if (!empregadoSelecionado) return;

    if (/^[0-9]$/.test(e.key)) {
      e.preventDefault();
      adicionarNumero(e.key);
      return;
    }

    if (e.key === "Backspace") {
      e.preventDefault();
      apagarUltimo();
      return;
    }

    if (e.key === "Enter") {
      e.preventDefault();
      fazerLogin();
      return;
    }

    if (e.key === "Escape") {
      e.preventDefault();
      setEmpregadoSelecionado(null);
      setPin("");
      setErro("");
    }
  }

  return (
    <main
      className="app-auth-page"
      tabIndex={0}
      onKeyDown={handlePinKeyDown}
    >
      <section className="app-auth-card">
        <div className="app-auth-header">
          <div className="app-brand-badge">
            <i className="bi bi-person-badge" aria-hidden="true"></i>
          </div>
          <h1 className="app-auth-title">Controlo de operador</h1>
          <p className="app-auth-subtitle">
            Selecione o operador e introduza o PIN.
          </p>
        </div>

        {!empregadoSelecionado ? (
          <div className="app-user-strip">
            {empregados.length > 0 ? (
              empregados.map((emp) => (
                <button
                  key={emp.codigo}
                  type="button"
                  className="app-user-button"
                  onClick={() => {
                    setEmpregadoSelecionado(emp);
                    setErro("");
                  }}
                >
                  <i className="bi bi-person-circle fs-3 text-primary" aria-hidden="true"></i>
                  <span className="fw-bold">{emp.nome}</span>
                </button>
              ))
            ) : (
              <p className="text-muted text-center mb-0">A carregar operadores...</p>
            )}
          </div>
        ) : (
          <>
            <div className="d-flex align-items-center gap-3 mb-3">
              <i className="bi bi-person-circle fs-2 text-primary" aria-hidden="true"></i>
              <div>
                <div className="fw-bold">{empregadoSelecionado.nome}</div>
                <small className="text-muted">Operador selecionado</small>
              </div>
            </div>

            <input
              type="password"
              className="form-control text-center mb-3 app-pin-display"
              placeholder="PIN"
              value={pin}
              readOnly
              autoFocus
            />

            <div className="app-keypad">
              {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => (
                <button
                  key={n}
                  type="button"
                  className="btn btn-outline-dark"
                  onClick={() => adicionarNumero(n)}
                >
                  {n}
                </button>
              ))}
              <button
                type="button"
                className="btn btn-outline-secondary"
                onClick={limparTudo}
              >
                C
              </button>
              <button type="button" className="btn btn-outline-dark" onClick={() => adicionarNumero(0)}>
                0
              </button>
              <button
                type="button"
                className="btn btn-outline-secondary"
                onClick={apagarUltimo}
              >
                Apagar
              </button>
            </div>

            <div className="d-flex gap-2 mt-4">
              <button type="button" className="btn btn-success w-50" onClick={fazerLogin}>
                <i className="bi bi-check-lg me-1" aria-hidden="true"></i>
                Entrar
              </button>
              <button
                type="button"
                className="btn btn-outline-danger w-50"
                onClick={() => {
                  setEmpregadoSelecionado(null);
                  setPin("");
                  setErro("");
                }}
              >
                Cancelar
              </button>
            </div>

            {erro && <div className="text-danger text-center mt-3">{erro}</div>}
          </>
        )}
      </section>
    </main>
  );
}
