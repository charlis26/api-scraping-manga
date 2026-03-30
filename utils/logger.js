// ===============================
// LOGGER PROFISSIONAL
// ===============================


// Função para gerar timestamp ISO
const getTimestamp = () => {

  // Retorna data e hora no padrão ISO
  return new Date().toISOString();

};


// Função interna para montar log
const log = (level, message) => {

  // Se estiver em produção e for debug, não loga
  if (
    process.env.NODE_ENV === "production" &&
    level === "DEBUG"
  ) {
    return;
  }

  // Monta mensagem final
  const formattedMessage =
    `[${getTimestamp()}] ${level}: ${message}`;

  // Se for erro, usa console.error
  if (level === "ERROR") {

    console.error(formattedMessage);

    return;

  }

  // Caso contrário usa console.log
  console.log(formattedMessage);

};


// ===============================
// LOGS PÚBLICOS
// ===============================


// Log de informação
const info = (message) => {

  log("INFO", message);

};


// Log de aviso
const warn = (message) => {

  log("WARN", message);

};


// Log de erro
const error = (message) => {

  log("ERROR", message);

};


// Log de debug
const debug = (message) => {

  log("DEBUG", message);

};


// ===============================
// EXPORTAÇÃO
// ===============================

module.exports = {

  info,
  warn,
  error,
  debug

};