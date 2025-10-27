import React from 'react';

export default function ProdutoRow({
  produto,
  alteracoesPendentesStock = {},
  onAbrirStock,
  onAbrirPrecoCompra,
  onAbrirMargem,
  onApagarProduto,
  onAbrirPrecoVenda,
  onPedirConfirmacaoApagar,
  setAlerta
}) {
  const margem = Number(produto.margembruta);
  const precoCompra = Number(produto.precocompra);

  // Stock total = base + alterações pendentes
  const stockTotal = alteracoesPendentesStock[produto.codbarras] ?? produto.qtdstock;


  const iva = Number(produto.iva) || 0;

  // Preço venda sem IVA
  const precoVendaSemIva =
    !isNaN(margem) && !isNaN(precoCompra)
      ? (precoCompra * (1 + margem / 100)).toFixed(2)
      : null;

  // Preço venda com IVA
  const precoVendaComIva =
    !isNaN(margem) && !isNaN(precoCompra)
      ? (precoCompra * (1 + margem / 100) * (1 + iva / 100)).toFixed(2)
      : null;



  return (
    <tr>
      <td>{produto.descricao}</td>
      <td>{produto.codbarras}</td>
      <td
        className="text-primary fw-bold"
        style={{ cursor: 'pointer' }}
        onClick={() => onAbrirMargem(produto)}
      >
        {!isNaN(margem) ? `${margem}%` : 'N/D'}
      </td>

      <td
        className="text-primary fw-bold"
        style={{ cursor: 'pointer', textAlign: 'center' }}
        title={produto.novo ? "Produto novo: apaga e cria de novo para alterar stock" : ""}
        onClick={() => {
          if (produto.novo) {
            // Substitui o alert nativo
            setAlerta({
              tipo: 'erro',
              mensagem: '⚠️ Produto criado recentemente. Para alterar o stock, apaga e cria de novo.'
            });
            return;
          }
          onAbrirStock({ ...produto, stockTotal });
        }}
      >
        {produto.qtdstock} → (+{stockTotal})
      </td>




      <td
        className="text-primary fw-bold"
        style={{ cursor: 'pointer' }}
        onClick={() => onAbrirPrecoCompra(produto)}
      >
        {!isNaN(precoCompra) ? precoCompra.toFixed(2) + '€' : 'N/D'}
      </td>

      <td
        className="text-primary fw-bold"
        style={{ textAlign: 'center' }}
      >
        {precoVendaSemIva ? `${precoVendaSemIva}€` : 'N/D'}
      </td>

      <td
        className="text-primary fw-bold"
        style={{ cursor: 'pointer', textAlign: 'center' }}
        onClick={() => onAbrirPrecoVenda({ ...produto })}
      >
        {precoVendaComIva ? `${precoVendaComIva}€` : 'N/D'}
      </td>





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
