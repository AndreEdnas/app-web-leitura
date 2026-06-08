import React, { useState } from "react";
import { Alert, Button, Modal } from "react-bootstrap";

export default function ConfirmarEnviarModal({
  show,
  onClose,
  onConfirmar,
  disabled,
  fornecedorSelecionado,
  tipoDocSelecionado,
  temStockPendente = false
}) {
  const [erro, setErro] = useState(null);

  const validarEnvio = (criarDocumento) => {
    if (!fornecedorSelecionado) {
      setErro("Tem de selecionar um fornecedor antes de enviar as alterações.");
      return;
    }

    if (criarDocumento && !tipoDocSelecionado) {
      setErro("Tem de selecionar um tipo de documento antes de criar o documento.");
      return;
    }

    if (!criarDocumento && temStockPendente) {
      setErro("Existem entradas de stock pendentes. Tem de criar um documento com uma série real da ZoneSoft.");
      return;
    }

    setErro(null);
    onConfirmar(criarDocumento);
  };

  return (
    <Modal show={show} onHide={onClose} backdrop="static" centered>
      <Modal.Header closeButton className="bg-primary text-white">
        <Modal.Title>
          <i className="bi bi-upload me-2" aria-hidden="true"></i>
          Enviar alterações
        </Modal.Title>
      </Modal.Header>

      <Modal.Body>
        <p className="fw-bold mb-3 text-center">O que pretende fazer?</p>

        {erro && (
          <Alert
            variant="warning"
            onClose={() => setErro(null)}
            dismissible
            className="text-start"
          >
            {erro}
          </Alert>
        )}

        <div className="d-flex flex-column gap-2">
          {!temStockPendente && (
            <Button
              variant="success"
              onClick={() => validarEnvio(false)}
              disabled={disabled}
            >
              Atualizar produtos
            </Button>
          )}

          <Button
            variant="outline-primary"
            onClick={() => validarEnvio(true)}
            disabled={disabled}
          >
            Atualizar produtos e criar documento
          </Button>

          <Button
            variant="secondary"
            className="mt-2"
            onClick={() => {
              setErro(null);
              onClose();
            }}
          >
            Cancelar
          </Button>
        </div>
      </Modal.Body>
    </Modal>
  );
}
