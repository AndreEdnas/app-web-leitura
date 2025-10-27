// components/AlertaMensagem.jsx
import React from 'react';

export default function AlertaMensagem({ tipo = 'info', mensagem, onFechar }) {
  const cores = {
    info: '#2f86eb',       // azul suave
    erro: '#d9534f',       // vermelho bootstrap
    sucesso: '#5cb85c',    // verde bootstrap
    aviso: '#f0ad4e',      // laranja bootstrap
  };

  const corFundo = cores[tipo] || '#6c757d'; // cinza fallback

  return (
    <div style={{
      padding: '15px 20px',
      margin: '15px 0',
      borderRadius: 8,
      color: 'white',
      backgroundColor: corFundo,
      position: 'relative',
      fontWeight: '500',
      fontSize: '1rem',
      maxWidth: '600px',
      marginLeft: 'auto',
      marginRight: 'auto',
      userSelect: 'none',
      cursor: 'default',
      // sombra removida
    }}>
      {mensagem}
      <button
        onClick={onFechar}
        aria-label="Fechar alerta"
        style={{
          position: 'absolute',
          right: 15,
          top: 15,
          background: 'transparent',
          border: 'none',
          color: 'white',
          fontWeight: 'bold',
          fontSize: 20,
          lineHeight: '20px',
          cursor: 'pointer',
          transition: 'color 0.2s ease',
          padding: 0,
          userSelect: 'none',
        }}
        onMouseEnter={e => (e.currentTarget.style.color = '#ddd')}
        onMouseLeave={e => (e.currentTarget.style.color = 'white')}
      >
        ×
      </button>
    </div>
  );
}
