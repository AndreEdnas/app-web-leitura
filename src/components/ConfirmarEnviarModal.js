import React from 'react';
import { Modal, Button } from 'react-bootstrap';

export default function ConfirmarEnviarModal({ show, onClose, onConfirmar, disabled }) {
  return (
    <Modal show={show} onHide={onClose} backdrop="static" centered>
      <Modal.Header closeButton className="bg-primary text-white">
        <Modal.Title>Enviar Alterações</Modal.Title>
      </Modal.Header>

      <Modal.Body className="text-center">
        <p className="fw-bold mb-3">O que pretende fazer?</p>

        <div className="d-flex flex-column gap-2">
          <Button
            variant="success"
            onClick={() => onConfirmar(false)} // 👉 só atualizar produtos
            disabled={disabled}
          >
            Só atualizar produtos
          </Button>

          <Button
            variant="outline-primary"
            onClick={() => onConfirmar(true)} // 👉 atualizar e criar documento
            disabled={disabled}
          >
            Atualizar produtos e criar documento fornecedor
          </Button>

          <Button variant="secondary" className="mt-2" onClick={onClose}>
            Cancelar
          </Button>
        </div>
      </Modal.Body>
    </Modal>
  );
}
