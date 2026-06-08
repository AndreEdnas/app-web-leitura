import React from "react";
import { Button, Modal } from "react-bootstrap";

export default function ConfirmarApagarModal({ show, onClose, onConfirmar, produto }) {
  if (!produto) return null;

  return (
    <Modal show={show} onHide={onClose} backdrop="static" centered>
      <Modal.Header closeButton className="bg-primary text-white">
        <Modal.Title>
          <i className="bi bi-trash me-2" aria-hidden="true"></i>
          Apagar Produto
        </Modal.Title>
      </Modal.Header>
      <Modal.Body>
        <p className="mb-2">Confirma que pretende apagar este produto da lista?</p>
        <div className="bg-light p-3 rounded small">
          <p className="mb-1"><strong>Descrição:</strong> {produto.descricao}</p>
          <p className="mb-0"><strong>Código de barras:</strong> {produto.codbarras || "-"}</p>
        </div>
      </Modal.Body>
      <Modal.Footer>
        <Button variant="secondary" onClick={onClose}>
          Cancelar
        </Button>
        <Button variant="danger" onClick={() => onConfirmar(produto.__uid)}>
          Apagar
        </Button>
      </Modal.Footer>
    </Modal>
  );
}
