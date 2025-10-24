import React from "react";

export default function ConfirmarEnviarModal({ show, onClose, onConfirmar, disabled }) {
  if (!show) return null; // se não estiver ativo, não renderiza nada

  return (
    <div
      className="modal fade show d-block"
      tabIndex="-1"
      role="dialog"
      style={{ backgroundColor: "rgba(0, 0, 0, 0.5)" }}
    >
      <div className="modal-dialog modal-dialog-centered" role="document">
        <div className="modal-content shadow-lg">
          <div className="modal-header bg-primary text-white">
            <h5 className="modal-title">
              <i className="bi bi-cloud-upload me-2"></i>Enviar Alterações
            </h5>
            <button type="button" className="btn-close" onClick={onClose}></button>
          </div>

          <div className="modal-footer d-flex flex-column gap-2">
            <button
              className="btn btn-success w-100"
              onClick={() => onConfirmar(false)}
              disabled={disabled}
            >
              <i className="bi bi-check2-circle me-2"></i>
              Só enviar alterações
            </button>

            <button
              className="btn btn-primary w-100"
              onClick={() => onConfirmar(true)}
              disabled={disabled}
            >
              <i className="bi bi-receipt-cutoff me-2"></i>
              Enviar e criar documento de compra
            </button>

            <button
              className="btn btn-secondary w-100"
              onClick={onClose}
            >
              <i className="bi bi-x-circle me-2"></i>
              Cancelar
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
