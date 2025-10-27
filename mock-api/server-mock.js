const express = require('express');
const cors = require('cors');

const app = express();
app.use(cors());
app.use(express.json());

// Mock em memória
const produtos = {
  '8004800001467': {
    codbarras: '8004800001467',
    nome: 'Água 1L',
    qtdstock: 20
  },
  '5601234567890': {
    codbarras: '5601234567890',
    nome: 'Bolacha Maria',
    qtdstock: 5
  }
};

// Endpoint GET /produto/:codigo
app.get('/produto/:codigo', (req, res) => {
  const codigo = req.params.codigo.trim();
  const produto = produtos[codigo];

  if (produto) {
    res.json(produto);
  } else {
    res.status(404).json({ mensagem: 'Produto não encontrado' });
  }
});

// Endpoint PATCH /produto/:codigo/stock
app.patch('/produto/:codigo/stock', (req, res) => {
  const codigo = req.params.codigo.trim();
  const quantidade = req.body.quantidade;

  if (typeof quantidade !== 'number') {
    return res.status(400).json({ error: 'Quantidade inválida' });
  }

  const produto = produtos[codigo];

  if (!produto) {
    return res.status(404).json({ error: 'Produto não encontrado' });
  }

  produto.qtdstock += quantidade;
  res.json(produto);
});

// Iniciar mock server
const PORT = 3002;
app.listen(PORT, () => {
  console.log(`🚀 Mock API a correr em http://localhost:${PORT}`);
});
