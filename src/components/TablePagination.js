import React from "react";

export default function TablePagination({ page, pageSize, totalItems, onPageChange }) {
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
  if (totalPages <= 1) return null;

  const startItem = (page - 1) * pageSize + 1;
  const endItem = Math.min(totalItems, page * pageSize);

  return (
    <div className="app-table-pagination">
      <span className="app-table-pagination-info">
        {startItem}-{endItem} de {totalItems}
      </span>
      <div className="app-table-pagination-actions">
        <button
          type="button"
          className="btn btn-outline-secondary btn-sm"
          onClick={() => onPageChange(page - 1)}
          disabled={page <= 1}
        >
          <i className="bi bi-chevron-left" aria-hidden="true"></i>
        </button>
        <span className="app-table-pagination-page">
          {page} / {totalPages}
        </span>
        <button
          type="button"
          className="btn btn-outline-secondary btn-sm"
          onClick={() => onPageChange(page + 1)}
          disabled={page >= totalPages}
        >
          <i className="bi bi-chevron-right" aria-hidden="true"></i>
        </button>
      </div>
    </div>
  );
}
