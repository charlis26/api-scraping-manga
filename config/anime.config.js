// ===============================
// CONFIGURAÇÃO DO MÓDULO DE ANIME
// ===============================

// Lê a URL base do site pai a partir do .env
const BASE_URL =
  process.env.ANIME_BASE_URL;


// Validação obrigatória da URL
if (!BASE_URL) {
  throw new Error(
    "ANIME_BASE_URL não definida no .env"
  );
}


// Log opcional para debug
console.log(
  "Fonte de anime carregada:",
  BASE_URL
);


// Exporta a configuração
module.exports = {
  BASE_URL
};