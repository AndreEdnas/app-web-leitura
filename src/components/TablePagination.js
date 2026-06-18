import React from "react";

const PAGE_SIZE_OPTIONS = [10, 25, 50, 100];

export default function TablePagination({
  page,
  pageSize,
  totalItems,
  onPageChange,
  onPageSizeChange,
  pageSizeOptions = PAGE_SIZE_OPTIONS
}) {
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
  if (totalItems <= 0) return null;

  const startItem = (page - 1) * pageSize + 1;
  const endItem = Math.min(totalItems, page * pageSize);

  return (
    <div className="app-table-pagination">
      <div className="app-table-pagination-summary">
        <span className="app-table-pagination-info">
          {startItem}-{endItem} de {totalItems}
        </span>
        {onPageSizeChange && (
          <label className="app-table-page-size">
            <span>Mostrar</span>
            <select
              className="form-select form-select-sm"
              value={pageSize}
              onChange={(e) => onPageSizeChange(Number(e.target.value))}
            >
              {pageSizeOptions.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          </label>
        )}
      </div>
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
