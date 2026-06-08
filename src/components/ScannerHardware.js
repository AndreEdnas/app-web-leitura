import React, { useEffect, useRef } from "react";
import { Modal, Button } from "react-bootstrap";

export default function ScannerHardware({ show, onClose, onDetected }) {
  const inputRef = useRef(null);

  useEffect(() => {
    if (show && inputRef.current) inputRef.current.focus();
  }, [show]);

  const handleKeyDown = (e) => {
    if (e.key !== "Enter") return;

    const codigo = e.target.value.trim();
    if (codigo === "") return;

    onDetected(codigo);
    e.target.value = "";
    onClose();
  };

  return (
    <Modal show={show} onHide={onClose} centered backdrop="static">
      <Modal.Header closeButton className="bg-primary text-white">
        <Modal.Title>
          <i className="bi bi-upc-scan me-2" aria-hidden="true"></i>
          Fazer Scan
        </Modal.Title>
      </Modal.Header>
      <Modal.Body>
        <label className="fw-bold d-block mb-2" htmlFor="scannerHardwareInput">
          Código lido pelo scanner
        </label>
        <input
          ref={inputRef}
          id="scannerHardwareInput"
          type="text"
          className="form-control text-center fs-5"
          placeholder="A aguardar leitura..."
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
