import React from "react";
import ProdutoRow from "./ProdutoRow";
import TablePagination from "./TablePagination";

const DEFAULT_PAGE_SIZE = 10;

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
  const [page, setPage] = React.useState(1);
  const [pageSize, setPageSize] = React.useState(DEFAULT_PAGE_SIZE);
  const totalPages = Math.max(1, Math.ceil(produtos.length / pageSize));
  const currentPage = Math.min(page, totalPages);
  const produtosPagina = produtos.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  React.useEffect(() => {
    setPage(1);
  }, [produtos.length]);

  function handlePageSizeChange(nextPageSize) {
    setPageSize(nextPageSize);
    setPage(1);
  }

  return (
    <>
      <table className="table app-product-table align-middle mb-0">
        <thead>
          <tr>
            <th style={{ minWidth: 220 }}>Descricao</th>
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
          {produtosPagina.map((produto) => (
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
      <TablePagination
        page={currentPage}
        pageSize={pageSize}
        totalItems={produtos.length}
        onPageChange={setPage}
        onPageSizeChange={handlePageSizeChange}
      />
    </>
  );
}
