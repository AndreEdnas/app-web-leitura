import React, { useState, useEffect } from "react";
import "bootstrap/dist/css/bootstrap.min.css";
import "bootstrap-icons/font/bootstrap-icons.css";

export default function LoginPage({ apiUrl, onLoginSuccess }) {
  const [empregados, setEmpregados] = useState([]);
  const [empregadoSelecionado, setEmpregadoSelecionado] = useState(null);
  const [pin, setPin] = useState("");
  const [erro, setErro] = useState("");

  // 🔹 Buscar empregados ao backend
  useEffect(() => {
    async function fetchEmpregados() {
      try {
        const res = await fetch(`${apiUrl}/empregados`, {
          headers: { "ngrok-skip-browser-warning": "true" },
        });
        const data = await res.json();
        setEmpregados(data);
      } catch (err) {
        console.error("Erro ao buscar empregados:", err);
      }
    }
    fetchEmpregados();
  }, [apiUrl]);

  // 🔹 Função login
  async function fazerLogin() {
    if (!empregadoSelecionado || !pin) return;
    try {
      const res = await fetch(`${apiUrl}/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          nome: empregadoSelecionado.nome,   // 👈 enviar nome
          password: pin                      // 👈 enviar password (não "pin")
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "PIN incorreto");

      localStorage.setItem("empregado", JSON.stringify(data.user));
      onLoginSuccess(data.user);
    } catch (err) {
      setErro("⚠️ PIN incorreto. Tente novamente.");
      setPin("");
    }
  }


  // 🔹 Teclado
  const adicionarNumero = (num) => setPin((prev) => (prev + num).slice(0, 6));
  const apagarUltimo = () => setPin((prev) => prev.slice(0, -1));
  const limparTudo = () => setPin("");

  return (
    <div className="d-flex flex-column align-items-center justify-content-center vh-100 bg-warning bg-gradient">
      <div className="bg-white rounded-4 shadow p-4" style={{ width: 360 }}>
        <h4 className="text-center mb-3 fw-bold text-primary">Controlo de Operador</h4>

        {/* Lista de empregados */}
        {!empregadoSelecionado ? (
          <div
            className="d-flex overflow-auto gap-3 px-2 py-2"
            style={{
              whiteSpace: "nowrap",
              scrollBehavior: "smooth",
            }}
          >
            {empregados.map((emp) => (
              <div
                key={emp.codigo}
                onClick={() => setEmpregadoSelecionado(emp)}
                className="d-flex flex-column align-items-center p-2 border rounded-3 shadow-sm bg-light flex-shrink-0"
                style={{ width: 100, cursor: "pointer" }}
              >
                <i className="bi bi-person-circle fs-1 text-secondary"></i>
                <small className="mt-1 fw-semibold text-dark">{emp.nome}</small>
              </div>
            ))}
          </div>

        ) : (
          <>
            {/* Empregado selecionado */}
            <div className="text-center mb-3">
              <i className="bi bi-person-circle fs-1 text-primary"></i>
              <h5 className="fw-bold mt-2">{empregadoSelecionado.nome}</h5>
            </div>

            {/* Campo PIN */}
            <input
              type="password"
              className="form-control text-center mb-3 fs-5"
              placeholder="••••"
              value={pin}
              readOnly
            />

            {/* Teclado numérico */}
            <div className="d-grid" style={{ gridTemplateColumns: "repeat(3, 1fr)", gap: "10px" }}>
              {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => (
                <button
                  key={n}
                  className="btn btn-outline-dark fs-4"
                  onClick={() => adicionarNumero(n)}
                >
                  {n}
                </button>
              ))}
              <button className="btn btn-outline-secondary fs-4" onClick={limparTudo}>
                C
              </button>
              <button className="btn btn-outline-dark fs-4" onClick={() => adicionarNumero(0)}>
                0
              </button>
              <button className="btn btn-outline-secondary fs-4" onClick={apagarUltimo}>
                Del
              </button>
            </div>

            {/* Botões OK / Cancelar */}
            <div className="d-flex justify-content-around mt-4">
              <button className="btn btn-success btn-lg px-4" onClick={fazerLogin}>
                <i className="bi bi-check-lg"></i>
              </button>
              <button
                className="btn btn-danger btn-lg px-4"
                onClick={() => {
                  setEmpregadoSelecionado(null);
                  setPin("");
                  setErro("");
                }}
              >
                <i className="bi bi-x-lg"></i>
              </button>
            </div>

            {erro && <div className="text-danger text-center mt-3">{erro}</div>}
          </>
        )}
      </div>
    </div>
  );
}
