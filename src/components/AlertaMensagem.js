import React, { useEffect, useRef } from "react";
import { normalizarTextoPt } from "../services/texto";

const config = {
  info: { className: "alert-primary", icon: "bi-info-circle" },
  erro: { className: "alert-danger", icon: "bi-exclamation-triangle" },
  sucesso: { className: "alert-success", icon: "bi-check-circle" },
  aviso: { className: "alert-warning", icon: "bi-exclamation-circle" }
};

export default function AlertaMensagem({ tipo = "info", mensagem, onFechar, autoFecharMs = 4000 }) {
  const alertConfig = config[tipo] || config.info;
  const mensagemNormalizada = normalizarTextoPt(mensagem);
  const onFecharRef = useRef(onFechar);

  useEffect(() => {
    onFecharRef.current = onFechar;
  }, [onFechar]);

  useEffect(() => {
    if (!onFecharRef.current || !autoFecharMs) return undefined;

    const timer = setTimeout(() => {
      onFecharRef.current?.();
    }, autoFecharMs);
    return () => clearTimeout(timer);
  }, [mensagem, tipo, autoFecharMs]);

  return (
    <div
      className={`alert ${alertConfig.className} alert-dismissible d-flex align-items-start gap-2 mx-auto app-alert-message`}
      role="alert"
    >
      <i className={`bi ${alertConfig.icon} mt-1`} aria-hidden="true"></i>
      <div className="flex-grow-1 text-start">{mensagemNormalizada}</div>
      <button
        type="button"
        className="btn-close"
        aria-label="Fechar alerta"
        onClick={onFechar}
      ></button>
    </div>
  );
}
