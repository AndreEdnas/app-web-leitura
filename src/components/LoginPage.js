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
        body: JSON.stringify({ codigo: empregadoSelecionado.codigo, pin }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "PIN incorreto");

      localStorage.setItem("empregado", JSON.stringify(data));
      onLoginSuccess(data);
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

  );
}
