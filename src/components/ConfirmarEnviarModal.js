import React from 'react';
import { Modal, Button } from 'react-bootstrap';

export default function ConfirmarEnviarModal({
  show,
  onClose,
  onConfirmar,
  disabled,
  fornecedorSelecionado,
  tipoDocSelecionado
}) {
  // 🔍 Função de validação antes de confirmar
  const validarEnvio = (criarDocumento) => {
    // Se não houver fornecedor selecionado
    if (!fornecedorSelecionado) {
      alert("⚠️ Tem de selecionar um fornecedor antes de enviar as alterações.");
      return;
    }

    // Se escolher criar documento, também precisa do tipo de documento
    if (criarDocumento && !tipoDocSelecionado) {
      alert("⚠️ Tem de selecionar um tipo de documento antes de criar o documento fornecedor.");
      return;
    }

    // Tudo válido → avança
    onConfirmar(criarDocumento);
  };

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
            onClick={() => validarEnvio(false)} // ✅ só atualizar produtos
            disabled={disabled}
          >
            Só atualizar produtos
          </Button>

          <Button
            variant="outline-primary"
            onClick={() => validarEnvio(true)} // 🧾 atualizar + criar documento
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
