import React from 'react';

export default function ProdutoRow({
  produto,
  alteracoesPendentesStock = {},
  onAbrirStock,
  onAbrirPrecoCompra,
  onAbrirMargem,
  onAbrirPrecoVenda,
  onPedirConfirmacaoApagar,
  setAlerta
}) {

  // ------------------------
  // STOCK
  // ------------------------
  const pendente = alteracoesPendentesStock[produto.__uid] ?? 0;
  const stockTotal = (Number(produto.qtdstock) || 0) + Number(pendente);


  // ------------------------
  // DADOS BASE
  // ------------------------
  const precoCompra = Number(produto.precocompra) || 0;
  const iva = Number(produto.iva) || 0;

  // ✅ ZoneSoft usa o preço s/IVA já guardado (pvp1siva) quando existe
  const pvp1sivaNum =
    produto.pvp1siva != null && produto.pvp1siva !== ""
      ? Number(produto.pvp1siva)
      : NaN;

  // fallback: calcula s/IVA a partir do c/IVA
  const precovendaNum =
    produto.precovenda != null && produto.precovenda !== ""
      ? Number(produto.precovenda)
      : 0;

  const precoVendaSemIvaNum =
    Number.isFinite(pvp1sivaNum) && pvp1sivaNum > 0
      ? pvp1sivaNum
      : (precovendaNum / (1 + iva / 100));

  const precoVendaComIvaNum =
    precovendaNum > 0
      ? precovendaNum
      : (precoVendaSemIvaNum * (1 + iva / 100));

  // ✅ Margem estilo ZoneSoft (markup sobre preço compra)
  const margem =
    produto.margembruta != null
      ? produto.margembruta
      : null;


  const precoVendaSemIva =
    Number.isFinite(precoVendaSemIvaNum) && precoVendaSemIvaNum > 0
      ? precoVendaSemIvaNum.toFixed(2)
      : null;


  const precoVendaComIva = Number.isFinite(precoVendaComIvaNum)
    ? precoVendaComIvaNum.toFixed(2)
    : "0.00";


  // ------------------------
  // RENDER
  // ------------------------
  return (
    <tr>
      <td>{produto.descricao}</td>
      <td>{produto.codbarras || "—"}</td>


      {/* Margem */}
      <td
        className="text-primary fw-bold"
        style={{ cursor: precoCompra ? 'pointer' : 'default' }}
        onClick={() => {
          if (!precoCompra) {
            setAlerta({
              tipo: 'aviso',
              mensagem: '⚠️ Defina primeiro o preço de compra para calcular a margem.'
            });
            return;
          }
          onAbrirMargem(produto);
        }}
      >
        {precoCompra && margem != null
          ? `${String(margem).replace(".", ",")}%`
          : 'N/D'}



      </td>

      {/* Stock */}
      <td
        className="text-primary fw-bold"
        style={{ cursor: 'pointer', textAlign: 'center' }}
        title="Clique para alterar stock"
        onClick={() => {
          onAbrirStock({ ...produto, stockTotal });
        }}
      >
        {Number(produto.qtdstock) || 0}
        {Number(pendente) > 0 && <span className="text-success"> +{Number(pendente)}</span>}

      </td>


      {/* Preço Compra */}
      <td
        className="text-primary fw-bold"
        style={{ cursor: 'pointer' }}
        onClick={() => onAbrirPrecoCompra(produto)}
      >
        {precoCompra ? `${precoCompra.toFixed(2)}€` : 'N/D'}
      </td>

      {/* Preço s/ IVA */}
      <td className="text-primary fw-bold text-center">
        {precoVendaSemIva ? `${precoVendaSemIva}€` : 'N/D'}

      </td>

      {/* Preço c/ IVA */}
      <td
        className="text-primary fw-bold text-center"
        style={{ cursor: 'pointer' }}
        onClick={() => onAbrirPrecoVenda(produto)}
      >
        {precoVendaComIva ? `${precoVendaComIva}€` : 'N/D'}
      </td>

      {/* Apagar */}
      <td style={{ textAlign: 'center' }}>
        <button
          type="button"
          className="btn btn-sm btn-outline-danger"
          title="Apagar produto"
          onClick={() => onPedirConfirmacaoApagar(produto)}
        >
          <i className="bi bi-trash"></i>
        </button>
      </td>
    </tr>
  );
}
