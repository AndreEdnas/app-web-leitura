// src/components/ScannerHardware.js
import React, { useEffect, useState, useRef } from "react";

export default function ScannerHardware({ onDetected }) {
  const [codigo, setCodigo] = useState("");
  const inputRef = useRef(null);

  // Focar sempre o input invisível
  useEffect(() => {
    const focusInput = () => {
      if (inputRef.current) inputRef.current.focus();
    };
    focusInput();
    window.addEventListener("click", focusInput);
    return () => window.removeEventListener("click", focusInput);
  }, []);

  // Lógica para capturar o código de barras via teclado (scanner laser)
  useEffect(() => {
    const handleKeyDown = (e) => {
      // Ignorar combinações
      if (e.ctrlKey || e.altKey || e.metaKey) return;

      if (e.key === "Enter") {
        if (codigo.length >= 3) {
          onDetected(codigo.trim());
          setCodigo("");
        }
      } else if (e.key === "Backspace") {
        setCodigo((prev) => prev.slice(0, -1));
      } else if (/^[a-zA-Z0-9]$/.test(e.key)) {
        setCodigo((prev) => prev + e.key);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [codigo, onDetected]);

  return (
    <input
      ref={inputRef}
      type="text"
      value={codigo}
      onChange={() => {}}
      style={{
        position: "absolute",
        top: "-100px",
        opacity: 0,
        pointerEvents: "none",
      }}
    />
  );
}
