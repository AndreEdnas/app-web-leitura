import React from "react";
import ProdutoRow from "./ProdutoRow";

export default function ProdutoTable({
  produtos,
  alteracoesPendentesStock = {},
  onAbrirStock,
  onAbrirPrecoCompra,
  onAbrirPrecoVenda,
  onAbrirMargem,
  onApagarProduto,
  onPedirConfirmacaoApagar,
  setAlerta
}) {
  return (
    <table className="table app-product-table align-middle mb-0">
      <thead>
        <tr>
          <th style={{ minWidth: 220 }}>Descrição</th>
          <th style={{ minWidth: 160 }}>Cod. barras</th>
          <th className="text-center" style={{ minWidth: 140 }}>Margem</th>
          <th className="text-center" style={{ minWidth: 120 }}>Stock</th>
          <th className="text-center" style={{ minWidth: 130 }}>Compra</th>
          <th className="text-center" style={{ minWidth: 140 }}>Venda s/IVA</th>
          <th className="text-center" style={{ minWidth: 140 }}>Venda c/IVA</th>
          <th className="text-center" style={{ minWidth: 90 }}>Apagar</th>
        </tr>
      </thead>
      <tbody>
        {produtos.map((produto) => (
          <ProdutoRow
            key={produto.__uid}
            produto={produto}
            alteracoesPendentesStock={alteracoesPendentesStock}
            onAbrirStock={onAbrirStock}
            onAbrirPrecoVenda={onAbrirPrecoVenda}
            onAbrirPrecoCompra={onAbrirPrecoCompra}
            onAbrirMargem={onAbrirMargem}
            onApagarProduto={onApagarProduto}
            onPedirConfirmacaoApagar={onPedirConfirmacaoApagar}
            setAlerta={setAlerta}
          />
        ))}
      </tbody>
    </table>
  );
}
