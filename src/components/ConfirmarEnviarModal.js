import React, { useState } from "react";
import { Modal, Button, Alert } from "react-bootstrap";

export default function ConfirmarEnviarModal({
  show,
  onClose,
  onConfirmar,
  disabled,
  fornecedorSelecionado,
  tipoDocSelecionado,
}) {
  const [erro, setErro] = useState(null);

  const validarEnvio = (criarDocumento) => {
    // 🔎 Valida fornecedor
    if (!fornecedorSelecionado) {
      setErro("⚠️ Tem de selecionar um fornecedor antes de enviar as alterações.");
      return;
    }

    // 🔎 Valida tipo de documento (apenas se for criar)
    if (criarDocumento && !tipoDocSelecionado) {
      setErro("⚠️ Tem de selecionar um tipo de documento antes de criar o documento fornecedor.");
      return;
    }

    // ✅ Tudo certo — limpa o erro e confirma
    setErro(null);
    onConfirmar(criarDocumento);
  };

  return (
    <Modal show={show} onHide={onClose} backdrop="static" centered>
      <Modal.Header closeButton className="bg-primary text-white">
        <Modal.Title>Enviar Alterações</Modal.Title>
      </Modal.Header>

      <Modal.Body className="text-center">
        <p className="fw-bold mb-3">O que pretende fazer?</p>

        {/* 🔔 Mensagem de erro visual */}
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
          <Button
            variant="success"
            onClick={() => validarEnvio(false)}
            disabled={disabled}
          >
            🔄 Só atualizar produtos
          </Button>

          <Button
            variant="outline-primary"
            onClick={() => validarEnvio(true)}
            disabled={disabled}
          >
            🧾 Atualizar produtos e criar documento fornecedor
          </Button>

          <Button
            variant="secondary"
            className="mt-2"
            onClick={() => {
              setErro(null);
              onClose();
            }}
          >
            ❌ Cancelar
          </Button>
        </div>
      </Modal.Body>
    </Modal>
  );
}
