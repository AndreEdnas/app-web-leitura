import React from "react";

function formatMoney(value) {
  const number = Number(value);
  return Number.isFinite(number) ?`${number.toFixed(2)} EUR` : "N/D";
}

function formatPercent(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return "N/D";

  const rounded = Number(number.toFixed(2));
  return `${String(rounded).replace(".", ",")}%`;
}

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
  const pendente = alteracoesPendentesStock[produto.__uid] ?? 0;
  const stockTotal = (Number(produto.qtdstock) || 0) + Number(pendente);
  const precoCompra = Number(produto.precocompra) || 0;
  const iva = Number(produto.iva) || 0;

  const pvp1sivaNum =
    produto.pvp1siva != null && produto.pvp1siva !== ""
      ?Number(produto.pvp1siva)
      : NaN;

  const precovendaNum =
    produto.precovenda != null && produto.precovenda !== ""
      ?Number(produto.precovenda)
      : 0;

  const precoVendaSemIvaNum =
    Number.isFinite(pvp1sivaNum) && pvp1sivaNum > 0
      ?pvp1sivaNum
      : precovendaNum / (1 + iva / 100);

  const precoVendaComIvaNum =
    precovendaNum > 0
      ?precovendaNum
      : precoVendaSemIvaNum * (1 + iva / 100);

  const margem = produto.margembruta != null ?produto.margembruta : null;

  return (
    <tr className={produto.novo ?"app-product-row app-product-row-new" : "app-product-row"}>
      <td className="app-product-name">{produto.descricao}</td>
      <td className="app-product-code">{produto.codbarras || "-"}</td>

      <td
        className="app-product-value app-product-value-clickable text-center"
        style={{ cursor: precoCompra ?"pointer" : "default" }}
        title="Editar margem"
        onClick={() => {
          if (!precoCompra) {
            setAlerta({
              tipo: "aviso",
              mensagem: "Defina primeiro o preço de compra para calcular a margem."
            });
            return;
          }
          onAbrirMargem(produto);
        }}
      >
        {precoCompra && margem != null ?formatPercent(margem) : "N/D"}
      </td>

      <td
        className="app-product-value app-product-value-clickable text-center"
        style={{ cursor: "pointer" }}
        title="Editar stock"
        onClick={() => onAbrirStock({ ...produto, stockTotal })}
      >
        {Number(produto.qtdstock) || 0}
        {Number(pendente) > 0 && <span className="app-stock-delta"> +{Number(pendente)}</span>}
      </td>

      <td
        className="app-product-value app-product-value-clickable text-center"
        style={{ cursor: "pointer" }}
        title="Editar preço de compra"
        onClick={() => onAbrirPrecoCompra(produto)}
      >
        {precoCompra ?formatMoney(precoCompra) : "N/D"}
      </td>

      <td className="app-product-value text-center">
        {Number.isFinite(precoVendaSemIvaNum) && precoVendaSemIvaNum > 0
          ?formatMoney(precoVendaSemIvaNum)
          : "N/D"}
      </td>

      <td
        className="app-product-value app-product-value-clickable text-center"
        style={{ cursor: "pointer" }}
        title="Editar preço de venda"
        onClick={() => onAbrirPrecoVenda(produto)}
      >
        {Number.isFinite(precoVendaComIvaNum) ?formatMoney(precoVendaComIvaNum) : "N/D"}
      </td>

      <td className="text-center">
        <button
          type="button"
          className="btn btn-sm btn-outline-danger app-delete-button"
          title="Apagar produto"
          onClick={() => onPedirConfirmacaoApagar(produto)}
        >
          <i className="bi bi-trash" aria-hidden="true"></i>
        </button>
      </td>
    </tr>
  );
}
