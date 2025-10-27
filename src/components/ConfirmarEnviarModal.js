import React from 'react';
import { Modal, Button } from 'react-bootstrap';

export default function ConfirmarEnviarModal({ show, onClose, onConfirmar, disabled }) {
  return (
    <Modal show={show} onHide={onClose} backdrop="static" centered>
      <Modal.Header closeButton>
        <Modal.Title>Confirmar envio</Modal.Title>
      </Modal.Header>
      <Modal.Body>
        <p>Tem certeza que deseja enviar todas as alterações?</p>
      </Modal.Body>
      <Modal.Footer>
        <Button variant="secondary" onClick={onClose} disabled={disabled}>
          Cancelar
        </Button>
        <Button variant="primary" onClick={onConfirmar} disabled={disabled}>
          Confirmar
        </Button>
      </Modal.Footer>
    </Modal>
  );
}
