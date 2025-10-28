import React, { useState } from 'react';
import 'bootstrap/dist/css/bootstrap.min.css';

export default function LoginPage({ apiUrl, onLoginSuccess }) {
  const [identificacao, setIdentificacao] = useState('');
  const [password, setPassword] = useState('');
  const [erro, setErro] = useState(null);
  const [loading, setLoading] = useState(false);

  async function handleLogin(e) {
    e.preventDefault();
    setErro(null);
    setLoading(true);

    try {
      const resp = await fetch(`${apiUrl}/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ identificacao, password })
      });

      const data = await resp.json();
      if (!resp.ok) throw new Error(data.error || 'Credenciais inválidas');

      localStorage.setItem('empregado', JSON.stringify(data.user));
      onLoginSuccess(data.user);
    } catch (err) {
      setErro(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="d-flex align-items-center justify-content-center vh-100 bg-light">
      <div className="card shadow p-4" style={{ width: '100%', maxWidth: 400 }}>
        <h4 className="mb-3 text-center text-primary">Login de Empregado</h4>
        <form onSubmit={handleLogin}>
          <div className="mb-3">
            <label className="form-label">Identificação</label>
            <input
              type="text"
              className="form-control"
              value={identificacao}
              onChange={(e) => setIdentificacao(e.target.value)}
              required
            />
          </div>
          <div className="mb-3">
            <label className="form-label">Password</label>
            <input
              type="password"
              className="form-control"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </div>
          {erro && <div className="alert alert-danger text-center">{erro}</div>}
          <button type="submit" className="btn btn-primary w-100" disabled={loading}>
            {loading ? 'A autenticar...' : 'Entrar'}
          </button>
        </form>
      </div>
    </div>
  );
}
