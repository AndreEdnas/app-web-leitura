import React, { useState } from "react";
import Select from "react-select";
import { getApiBaseUrl } from "../services/api";

export default function NovoProdutoModal({
  onFechar,
  onConfirmar,
  familias,
  subfamilias,
  produtosExistentes = []
}) {
  const [novoProduto, setNovoProduto] = useState({
    descricao: "",
    codbarras: "",
    qtdstock: 0,
    precocompra: 0,
    margembruta: 0,
    iva: 0,
    familia: null,
    subfamilia: null,
    plu: null
  });

  const [produtoJaExiste, setProdutoJaExiste] = useState(false);
  const [mensagemErro, setMensagemErro] = useState("");
  const [pluJaExiste, setPluJaExiste] = useState(false);
  const [mensagemErroPLU, setMensagemErroPLU] = useState("");

  const optionsFamilias = familias.map((f) => ({
    value: f.codigo,
    label: f.descricao
  }));

  const optionsSubfamilias = (subfamilias || [])
    .filter((sf) => String(sf.familia) === String(novoProduto.familia?.value))
    .map((sf) => ({ value: sf.codigo, label: sf.descricao }));

  function existeCodBarrasLocal(cod) {
    if (!cod || String(cod).trim() === "") return false;

    return produtosExistentes.some(
      (p) => p.codbarras && String(p.codbarras).trim() === String(cod).trim()
    );
  }

  function existePLULocal(plu) {
    if (!plu) return false;

    return produtosExistentes.some((p) => String(p.plu) === String(plu));
  }

  async function verificarProdutoExistente(codigo) {
    if (!codigo) {
      setProdutoJaExiste(false);
      setMensagemErro("");
      return;
    }

    try {
      const baseUrl = getApiBaseUrl();
      if (!baseUrl) return;

      const response = await fetch(`${baseUrl}/produto/${codigo}`);
      if (response.ok) {
        const produtoExistente = await response.json();
        setProdutoJaExiste(true);
        setMensagemErro(`Já existe: ${produtoExistente.descricao}`);
      } else {
        setProdutoJaExiste(false);
        setMensagemErro("");
      }
    } catch {
      setProdutoJaExiste(false);
      setMensagemErro("");
    }
  }

  async function verificarPLUExistente(plu) {
    if (!plu) {
      setPluJaExiste(false);
      setMensagemErroPLU("");
      return;
    }

    try {
      const baseUrl = getApiBaseUrl();
      const res = await fetch(`${baseUrl}/produto/verificar-plu/${plu}`, {
        headers: { Accept: "application/json" }
      });

      if (!res.ok) {
        setPluJaExiste(false);
        setMensagemErroPLU("");
        return;
      }

      const data = await res.json();
      if (!data.disponivel) {
        setPluJaExiste(true);
        setMensagemErroPLU(`PLU pertence a: ${data.produto.descricao}`);
      } else {
        setPluJaExiste(false);
        setMensagemErroPLU("");
      }
    } catch {
      setPluJaExiste(false);
      setMensagemErroPLU("");
    }
  }

  function handleChange(e) {
    const { name, value } = e.target;

    setNovoProduto((prev) => ({ ...prev, [name]: value }));

    if (name !== "codbarras") return;

    const cod = value.trim();
    if (cod === "") {
      setProdutoJaExiste(false);
      setMensagemErro("");
      return;
    }

    if (existeCodBarrasLocal(cod)) {
      setProdutoJaExiste(true);
      setMensagemErro("Já existe na lista atual.");
      return;
    }

    verificarProdutoExistente(cod);
  }

  async function handlePluChange(e) {
    const valor = e.target.value;
    setNovoProduto((prev) => ({ ...prev, plu: valor }));

    if (existePLULocal(valor)) {
      setPluJaExiste(true);
      setMensagemErroPLU("PLU já existe na tabela atual.");
      return;
    }

    await verificarPLUExistente(valor);
  }

  function handleSubmit() {
    if (!novoProduto.descricao.trim()) {
      alert("Preencha a descrição do produto.");
      return;
    }

    if (produtoJaExiste) {
      alert("Já existe um produto com este código de barras.");
      return;
    }

    if (pluJaExiste) {
      alert("Este PLU já está em uso. Escolha outro.");
      return;
    }

    onConfirmar({
      ...novoProduto,
      familia: novoProduto.familia?.value ?? null,
      subfam: novoProduto.subfamilia?.value ?? null,
      plu: novoProduto.plu ?? null,
      novo: true
    });
  }

  return (
    <div
      className="modal show d-block"
      tabIndex="-1"
      role="dialog"
      aria-modal="true"
      style={{ backgroundColor: "rgba(15, 23, 42, 0.52)" }}
    >
      <div className="modal-dialog modal-dialog-centered modal-lg" role="document">
        <div className="modal-content text-start">
          <div className="modal-header bg-primary text-white">
            <h5 className="modal-title">
              <i className="bi bi-plus-circle me-2" aria-hidden="true"></i>
              Adicionar Produto
            </h5>
            <button type="button" className="btn-close btn-close-white" onClick={onFechar} aria-label="Fechar"></button>
          </div>

          <div className="modal-body">
            <div className="app-form-grid">
              <div className="app-form-span-2">
                <label className="form-label fw-semibold">Descrição</label>
                <input
                  type="text"
                  className="form-control"
                  name="descricao"
                  value={novoProduto.descricao}
                  onChange={handleChange}
                  placeholder="Descrição do produto"
                  autoComplete="off"
                  autoFocus
                />
              </div>

              <div>
                <label className="form-label fw-semibold">Código de barras</label>
                <input
                  type="text"
                  className={`form-control ${produtoJaExiste ?"is-invalid" : ""}`}
                  name="codbarras"
                  value={novoProduto.codbarras}
                  onChange={handleChange}
                  placeholder="Código de barras"
                  autoComplete="off"
                />
                {mensagemErro && <div className="invalid-feedback d-block">{mensagemErro}</div>}
              </div>

              <div>
                <label className="form-label fw-semibold">PLU</label>
                <input
                  type="number"
                  className={`form-control ${pluJaExiste ?"is-invalid" : ""}`}
                  value={novoProduto.plu || ""}
                  onChange={handlePluChange}
                  min="0"
                />
                {mensagemErroPLU && <div className="invalid-feedback d-block">{mensagemErroPLU}</div>}
              </div>

              <div>
                <label className="form-label fw-semibold">Stock inicial</label>
                <input
                  type="number"
                  className="form-control"
                  name="qtdstock"
                  value={novoProduto.qtdstock}
                  onChange={handleChange}
                  onFocus={(e) => e.target.select()}
                  min="0"
                  placeholder="0"
                />
              </div>

              <div>
                <label className="form-label fw-semibold">Preço de compra</label>
                <input
                  type="number"
                  className="form-control"
                  name="precocompra"
                  value={novoProduto.precocompra}
                  onChange={handleChange}
                  onFocus={(e) => e.target.select()}
                  min="0"
                  step="0.01"
                  placeholder="0.00"
                />
              </div>

              <div>
                <label className="form-label fw-semibold">Margem bruta (%)</label>
                <input
                  type="number"
                  className="form-control"
                  name="margembruta"
                  value={novoProduto.margembruta}
                  onChange={handleChange}
                  onFocus={(e) => e.target.select()}
                  min="0"
                  step="0.01"
                  placeholder="0.00"
                />
              </div>

              <div>
                <label className="form-label fw-semibold">IVA</label>
                <div className="d-flex gap-2 flex-wrap">
                  {[6, 13, 23].map((valor) => (
                    <button
                      key={valor}
                      type="button"
                      className={`btn ${novoProduto.iva === valor ?"btn-primary" : "btn-outline-primary"}`}
                      onClick={() => setNovoProduto((prev) => ({ ...prev, iva: valor }))}
                    >
                      {valor}%
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="form-label fw-semibold">Familia</label>
                <Select
                  options={optionsFamilias}
                  value={novoProduto.familia}
                  onChange={(selected) =>
                    setNovoProduto((prev) => ({
                      ...prev,
                      familia: selected,
                      subfamilia: null
                    }))
                  }
                  placeholder="Selecionar família..."
                  isClearable
                  isSearchable
                  classNamePrefix="react-select"
                />
              </div>

              <div>
                <label className="form-label fw-semibold">Subfamília</label>
                <Select
                  options={optionsSubfamilias}
                  value={novoProduto.subfamilia}
                  onChange={(selected) =>
                    setNovoProduto((prev) => ({ ...prev, subfamilia: selected }))
                  }
                  placeholder="Selecionar subfamília..."
                  isClearable
                  isSearchable
                  classNamePrefix="react-select"
                  isDisabled={!novoProduto.familia}
                />
              </div>
            </div>
          </div>

          <div className="modal-footer">
            <button type="button" className="btn btn-secondary" onClick={onFechar}>
              Cancelar
            </button>
            <button
              type="button"
              className="btn btn-primary"
              onClick={handleSubmit}
              disabled={produtoJaExiste && novoProduto.codbarras.trim() !== ""}
            >
              Adicionar
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
