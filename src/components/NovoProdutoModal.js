import React, { useState, useEffect, useRef } from 'react';
import Quagga from 'quagga';
import Select from 'react-select';
import { getApiBaseUrl } from "../services/api";

const apiUrl = getApiBaseUrl();


export default function NovoProdutoModal({ onFechar, onConfirmar, fornecedores, familias, subfamilias }) {
  const [novoProduto, setNovoProduto] = useState({
    descricao: '',
    codbarras: '',
    qtdstock: 0,
    precocompra: 0,
    margembruta: 0,
    iva: 0,
    fornecedor: null,
    familia: null,
    subfamilia: null,
    plu: null,
    apiUrl,

  });

  const NGROK_HEADERS = {
    'ngrok-skip-browser-warning': 'true'
  };




  const optionsSubfamilias = (subfamilias || []).filter(sf => {

    return String(sf.familia) === String(novoProduto.familia?.value);
  }).map(sf => ({ value: sf.codigo, label: sf.descricao }));

  const [pluJaExiste, setPluJaExiste] = useState(false);
  const [mensagemErroPLU, setMensagemErroPLU] = useState('');


  const [scannerAberto, setScannerAberto] = useState(false);
  const scannerRef = useRef(null);

  const [produtoJaExiste, setProdutoJaExiste] = useState(false);
  const [mensagemErro, setMensagemErro] = useState('');

  function handleChange(e) {
    const { name, value } = e.target;
    setNovoProduto(prev => ({ ...prev, [name]: value }));

    // Se for o campo codbarras, verifica também se já existe
    if (name === 'codbarras') {
      verificarProdutoExistente(value.trim());
    }
  }

  function onDetected(result) {
    if (result && result.codeResult && result.codeResult.code) {
      const code = result.codeResult.code;
      setNovoProduto(prev => ({ ...prev, codbarras: code }));
      setScannerAberto(false);
      Quagga.stop();

      verificarProdutoExistente(code);
    }
  }

  useEffect(() => {
    if (!scannerAberto || !scannerRef.current) return;

    Quagga.init({
      inputStream: {
        name: 'Live',
        type: 'LiveStream',
        target: scannerRef.current,
        constraints: { facingMode: 'environment' },
      },
      decoder: { readers: ['ean_reader', 'code_128_reader', 'upc_reader'] },
    }, err => {
      if (err) {
        console.error('Erro ao inicializar Quagga:', err);
        return;
      }
      Quagga.start();
    });

    Quagga.onDetected(onDetected);

    return () => {
      try {
        Quagga.offDetected(onDetected);
        Quagga.stop();
      } catch (e) {
        console.warn('Erro ao parar o Quagga:', e);
      }
    };
  }, [scannerAberto]);

  async function verificarProdutoExistente(codigo) {
    if (!codigo) {
      setProdutoJaExiste(false);
      setMensagemErro('');
      return;
    }

    try {
      const baseUrl = getApiBaseUrl(); // 👈 pega sempre o valor atualizado
      if (!baseUrl) {
        console.warn("⚠️ API_BASE ainda não definido!");
        return;
      }

      const response = await fetch(`${baseUrl}/produto/${codigo}`, {
        headers: {
          ...NGROK_HEADERS,
        }
      });

      if (response.ok) {
        const produtoExistente = await response.json();
        setProdutoJaExiste(true);
        setMensagemErro(`⚠️ Já existe: ${produtoExistente.descricao}`);
      } else {
        setProdutoJaExiste(false);
        setMensagemErro('');
      }
    } catch (err) {
      console.error("Erro ao verificar produto existente:", err);
      setProdutoJaExiste(false);
      setMensagemErro('');
    }
  }


  async function verificarPLUExistente(plu) {
    if (!plu) {
      setPluJaExiste(false);
      setMensagemErroPLU('');
      return;
    }

    try {
      const baseUrl = getApiBaseUrl();
      const res = await fetch(`${baseUrl}/produto/verificar-plu/${plu}`, {
        headers: {
          'ngrok-skip-browser-warning': 'true',
          'Accept': 'application/json'
        }
      });

      if (res.ok) {
        const data = await res.json();

        if (!data.disponivel) {
          setPluJaExiste(true);
          setMensagemErroPLU(`⚠️ PLU pertence a: ${data.produto.descricao}`);
        } else {
          setPluJaExiste(false);
          setMensagemErroPLU('');
        }
      } else {
        console.error("Erro na resposta do servidor:", res.status);
        setPluJaExiste(false);
        setMensagemErroPLU('');
      }
    } catch (err) {
      console.error("Erro ao verificar PLU:", err);
      setPluJaExiste(false);
      setMensagemErroPLU('');
    }
  }




  function handleSubmit() {
   if (!novoProduto.descricao || !novoProduto.codbarras) {
      alert('Preenche todos os campos obrigatórios.');
      return;
    }

    if (produtoJaExiste) {
      alert('⚠️ Já existe um produto com este código de barras.');
      return;
    }

    if (pluJaExiste) {
      alert('⚠️ Este PLU já está em uso. Escolhe outro.');
      return;
    }

    onConfirmar({
      ...novoProduto,
      fornecedor: novoProduto.fornecedor?.value ?? 1,
      familia: novoProduto.familia?.value ?? null,
      subfam: novoProduto.subfamilia?.value ?? null,
      plu: novoProduto.plu ?? null,
      novo: true,
    });
  }


  const optionsFornecedores = fornecedores.map(f => ({
    value: f.id,
    label: f.nome,
  }));

  const optionsFamilias = familias.map(f => ({
    value: f.codigo,
    label: f.descricao,
  }));


  return (
    <div className="modal show d-block" tabIndex="-1" role="dialog" style={{ backgroundColor: 'rgba(0,0,0,0.6)' }}>
      <div className="modal-dialog modal-dialog-centered" role="document" style={{ maxWidth: '420px', width: '90%' }}>
        <div className="modal-content p-4 rounded shadow-sm">
          <div className="modal-header border-0 pb-0">
            <h5 className="modal-title fw-bold">Adicionar Novo Produto</h5>
            <button type="button" className="btn-close" onClick={onFechar} aria-label="Fechar"></button>
          </div>

          <div className="modal-body pt-2">
            {/* Descrição */}
            <div className="mb-3">
              <label className="form-label fw-semibold">Descrição</label>
              <input
                type="text"
                className="form-control form-control-lg"
                name="descricao"
                value={novoProduto.descricao}
                onChange={handleChange}
                placeholder="Descrição do produto"
                autoComplete="off"
              />
            </div>

            {/* Código de Barras */}
            <div className="mb-3 position-relative">
              <label className="form-label fw-semibold">Código de Barras</label>
              <input
                type="text"
                className={`form-control form-control-lg pe-5 ${produtoJaExiste ? 'is-invalid' : ''}`}
                name="codbarras"
                value={novoProduto.codbarras}
                onChange={handleChange}
                placeholder="Código de barras"
                autoComplete="off"
              />
              {mensagemErro && (
                <div className="invalid-feedback d-block">
                  {mensagemErro}
                </div>
              )}
              <button
                type="button"
                onClick={() => setScannerAberto(true)}
                style={{
                  position: 'absolute',
                  right: '10px',
                  top: '38px',
                  border: 'none',
                  backgroundColor: '#0d6efd',
                  color: 'white',
                  borderRadius: '50%',
                  width: '38px',
                  height: '38px',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  boxShadow: '0 2px 6px rgba(0,123,255,0.5)',
                  transition: 'background-color 0.3s',
                }}
                aria-label="Abrir scanner de código de barras"
                title="Scan código de barras"
                onMouseEnter={e => e.currentTarget.style.backgroundColor = '#0b5ed7'}
                onMouseLeave={e => e.currentTarget.style.backgroundColor = '#0d6efd'}
              >
                <i className="bi bi-upc-scan"></i>
              </button>

              {scannerAberto && (
                <div className="border rounded shadow-sm p-2 mt-3 position-relative" style={{
                  width: '100%',
                  height: '300px',
                  backgroundColor: '#222',
                  borderRadius: '6px',
                  overflow: 'hidden',
                }}>
                  <div ref={scannerRef} style={{ width: '100%', height: '100%' }} />
                  <button
                    type="button"
                    className="btn btn-danger position-absolute"
                    style={{ top: '10px', right: '10px', zIndex: 10 }}
                    onClick={() => setScannerAberto(false)}
                  >
                    ✕
                  </button>
                </div>
              )}
            </div>

            {/* Stock Inicial */}
            <div className="mb-3">
              <label className="form-label fw-semibold">Stock Inicial</label>
              <input
                type="number"
                className="form-control form-control-lg"
                name="qtdstock"
                value={novoProduto.qtdstock}
                onChange={handleChange}
                onFocus={(e) => { if (e.target.value === 0 || e.target.value === '0') e.target.select(); }}
                min="0"
                placeholder="0"
              />

            </div>

            {/* Preço de Compra */}
            <div className="mb-3">
              <label className="form-label fw-semibold">Preço de Compra</label>
              <input
                type="number"
                className="form-control form-control-lg"
                name="precocompra"
                value={novoProduto.precocompra}
                onChange={handleChange}
                onFocus={(e) => { if (e.target.value === 0 || e.target.value === '0') e.target.select(); }}
                min="0"
                step="0.01"
                placeholder="0.00"
              />
            </div>

            {/* Margem Bruta */}
            <div className="mb-3">
              <label className="form-label fw-semibold">Margem Bruta (%)</label>
              <input
                type="number"
                className="form-control form-control-lg"
                name="margembruta"
                value={novoProduto.margembruta}
                onChange={handleChange}
                onFocus={(e) => { if (e.target.value === 0 || e.target.value === '0') e.target.select(); }}
                min="0"
                step="0.01"
                placeholder="0.00"
              />
            </div>

            {/* IVA */}
            <div className="mb-3">
              <label className="form-label fw-semibold">IVA</label>
              <div className="d-flex justify-content-center gap-2">
                {[6, 13, 23].map(valor => (
                  <button
                    key={valor}
                    type="button"
                    className={`btn ${novoProduto.iva === valor ? 'btn-primary' : 'btn-outline-primary'}`}
                    onClick={() => setNovoProduto(prev => ({ ...prev, iva: valor }))}
                  >
                    {valor}%
                  </button>
                ))}
              </div>
            </div>



          </div>

          <div className="mb-3">
            <label className="form-label fw-semibold">Família</label>
            <Select
              options={optionsFamilias}
              value={novoProduto.familia}
              onChange={selected => setNovoProduto(prev => ({
                ...prev,
                familia: selected,
                subfamilia: null
              }))}
              placeholder="Seleciona uma família..."
              isClearable
              isSearchable
              classNamePrefix="react-select"
            />

          </div>

          <div className="mb-3">
            <label className="form-label fw-semibold">Subfamília</label>
            <Select
              options={optionsSubfamilias}
              value={novoProduto.subfamilia}
              onChange={selected => setNovoProduto(prev => ({ ...prev, subfamilia: selected }))}
              placeholder="Seleciona uma subfamília..."
              isClearable
              isSearchable
              classNamePrefix="react-select"
              isDisabled={!novoProduto.familia} // só ativa se família selecionada
            />
          </div>


          {/* PLU */}
          <div className="mb-3">
            <label className="form-label fw-semibold">PLU</label>
            <input
              type="number"
              className={`form-control form-control-lg ${pluJaExiste ? 'is-invalid' : ''}`}
              value={novoProduto.plu || ''}
              onChange={async (e) => {
                const valor = e.target.value;
                setNovoProduto(prev => ({ ...prev, plu: valor }));
                await verificarPLUExistente(valor);
              }}
            />
            {mensagemErroPLU && (
              <div className="invalid-feedback d-block">
                {mensagemErroPLU}
              </div>
            )}
          </div>



          <div className="modal-footer border-0 pt-0">
            <button className="btn btn-secondary btn-lg" onClick={onFechar}>Cancelar</button>
            <button className="btn btn-primary btn-lg" onClick={handleSubmit} disabled={produtoJaExiste}>
              Adicionar
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
