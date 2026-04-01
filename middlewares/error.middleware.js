// Importa o logger de erro
const { logError } =
require("../utils/logger");


// Middleware global de tratamento de erros
const errorHandler = (error, req, res, next) => {
  // Se a resposta já foi enviada, delega para o Express
  if (res.headersSent) {
    return next(error);
  }

  // Se a requisição expirou, não responde de novo
  if (req.timedout) {
    return;
  }

  // Define status padrão
  let statusCode =
    error.statusCode ||
    error.status ||
    500;

  // Define mensagem padrão
  let message =
    error.message ||
    "Erro interno do servidor";

  // Trata JSON inválido
  if (
    error instanceof SyntaxError &&
    error.status === 400 &&
    "body" in error
  ) {
    statusCode = 400;
    message = "JSON inválido na requisição.";
  }

  // Trata timeout explícito
  if (
    error.code === "ETIMEDOUT" ||
    error.code === "ECONNABORTED"
  ) {
    statusCode = 408;
    message = "Tempo limite excedido";
  }

  // Garante faixa correta de status HTTP
  if (statusCode < 400 || statusCode > 599) {
    statusCode = 500;
  }

  // Loga no terminal
  console.error(
    `[${new Date().toISOString()}] ERROR:`,
    {
      method: req.method,
      url: req.originalUrl,
      statusCode,
      message,
      stack: error.stack
    }
  );

  // Loga no arquivo
  logError({
    method: req.method,
    url: req.originalUrl,
    statusCode,
    message,
    stack: error.stack,
    code: error.code || ""
  });

  // Monta resposta base
  const response = {
    success: false,
    error: message
  };

  // Em desenvolvimento, inclui detalhes extras
  if (process.env.NODE_ENV !== "production") {
    response.details = {
      type: error.name || "Error",
      code: error.code || null
    };

    response.stack =
      error.stack || null;
  }

  // Retorna resposta padronizada
  return res.status(statusCode).json(response);
};


// Exporta o middleware
module.exports = errorHandler;