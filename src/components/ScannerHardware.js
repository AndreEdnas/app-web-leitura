import React, { useEffect, useRef } from "react";
import { Modal, Button } from "react-bootstrap";

export default function ScannerHardware({ show, onClose, onDetected }) {
  const inputRef = useRef(null);

  useEffect(() => {
    if (show && inputRef.current) inputRef.current.focus();
  }, [show]);

  const handleKeyDown = (e) => {
    if (e.key === "Enter") {
      const codigo = e.target.value.trim();
      if (codigo !== "") {
        onDetected(codigo);
        e.target.value = "";
        onClose();
      }
    }
  };

  return (
    <Modal show={show} onHide={onClose} centered backdrop="static">
      <Modal.Header closeButton className="bg-primary text-white">
        <Modal.Title>Fazer Scan</Modal.Title>
      </Modal.Header>
      <Modal.Body className="text-center">
        <label className="fw-bold d-block mb-2">Aponte o leitor para o código:</label>
        <input
          ref={inputRef}
          type="text"
          className="form-control text-center fs-5"
          placeholder="Aguardando leitura..."
          onKeyDown={handleKeyDown}
        />
      </Modal.Body>
      <Modal.Footer>
        <Button variant="secondary" onClick={onClose}>
          Cancelar
        </Button>
      </Modal.Footer>
    </Modal>
  );
}
