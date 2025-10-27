import React from 'react';
import { Modal, Button } from 'react-bootstrap';

export default function ConfirmarApagarModal({ show, onClose, onConfirmar, produto }) {
  if (!produto) return null;

  return (
    <Modal show={show} onHide={onClose} backdrop="static" centered>
      <Modal.Header closeButton>
        <Modal.Title>Quer apagar alterações ?</Modal.Title>
      </Modal.Header>
      <Modal.Body>
        <p><strong>Descrição:</strong> {produto.descricao} </p>
        <p><strong>Código de barras:</strong> {produto.codbarras}</p>
      </Modal.Body>
      <Modal.Footer>
        <Button variant="secondary" onClick={onClose}>
          Cancelar
        </Button>
        <Button variant="danger" onClick={() => onConfirmar(produto.codbarras)}>
          Apagar
        </Button>
      </Modal.Footer>
    </Modal>
  );
}
