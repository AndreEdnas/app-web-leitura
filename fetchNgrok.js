// fetchNgrok.js
const fetch = require("node-fetch");

async function fetchNgrokUrl() {
  const res = await fetch("http://localhost:3051/ngrok-url");
  const data = await res.json();
  if (!data.url) throw new Error("Não foi encontrado nenhum URL do ngrok na resposta.");
  return data.url;
}

module.exports = fetchNgrokUrl;
