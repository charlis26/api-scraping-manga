// Função para pegar data e hora formatada
const getTimestamp = () => {

  const now = new Date();

  return now.toISOString();

};


// Log de informação
const info = (message) => {

  console.log(
    `[${getTimestamp()}] INFO: ${message}`
  );

};


// Log de erro
const error = (message) => {

  console.error(
    `[${getTimestamp()}] ERROR: ${message}`
  );

};


// Exporta as funções
module.exports = {
  info,
  error
};