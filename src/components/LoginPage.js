import React, { useState, useEffect } from "react";

export default function LoginPage({ apiUrl, onLoginSuccess }) {
  const [empregados, setEmpregados] = useState([]);
  const [nome, setNome] = useState("");
  const [password, setPassword] = useState("");
  const [erro, setErro] = useState("");

  // 🔹 Carregar lista de empregados ativos
  useEffect(() => {
    async function fetchEmpregados() {
      try {
        const res = await fetch(`${apiUrl}/empregados`, {
          headers: { "ngrok-skip-browser-warning": "true" }
        });
        const data = await res.json();
        setEmpregados(data);
      } catch (err) {
        console.error("Erro ao buscar empregados:", err);
      }
    }
    fetchEmpregados();
  }, [apiUrl]);

  async function handleLogin(e) {
    e.preventDefault();
    setErro("");

    try {
      const resp = await fetch(`${apiUrl}/login`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "ngrok-skip-browser-warning": "true"
        },
        body: JSON.stringify({ nome, password })
      });

      const data = await resp.json();

      if (!resp.ok) throw new Error(data.error || "Erro ao fazer login.");

      localStorage.setItem("empregado", JSON.stringify(data.user));
      onLoginSuccess(data.user);
    } catch (err) {
      setErro(err.message);
    }
  }

  return (
    <div className="d-flex justify-content-center align-items-center vh-100 bg-light">
      <form
        className="bg-white p-4 rounded shadow"
        style={{ width: 350 }}
        onSubmit={handleLogin}
      >
        <h4 className="text-center text-primary mb-4">Login de Empregado</h4>

        <div className="mb-3 text-start">
          <label className="form-label fw-bold">Nome</label>
          <select
            className="form-select"
            value={nome}
            onChange={(e) => setNome(e.target.value)}
          >
            <option value="">-- Escolher Empregado --</option>
            {empregados.map((e, i) => (
              <option key={i} value={e.nome}>
                {e.nome}
              </option>
            ))}
          </select>
        </div>

        <div className="mb-3 text-start">
          <label className="form-label fw-bold">Password</label>
          <input
            type="password"
            className="form-control"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
        </div>

        {erro && (
          <div className="alert alert-danger py-2">{erro}</div>
        )}

        <button type="submit" className="btn btn-primary w-100">
          Entrar
        </button>
      </form>
    </div>
  );
}
