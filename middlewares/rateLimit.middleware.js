// Importa o pacote responsável por limitar requisições
const rateLimit = require("express-rate-limit");

// Cria o middleware de rate limit
const limiter = rateLimit({

  // Janela de tempo
  windowMs:
    Number(process.env.RATE_LIMIT_WINDOW || 15)
    * 60
    * 1000,

  // Máximo por IP
  max:
    Number(process.env.RATE_LIMIT_MAX || 300),

  // Mensagem quando exceder
  message: {
    success: false,
    error:
      "Muitas requisições. Tente novamente em alguns minutos."
  },

  // Headers modernos
  standardHeaders: true,

  // Remove headers antigos
  legacyHeaders: false,

  // Não conta requisições falhadas
  skipFailedRequests: true,

  // Não conta requisições com erro
  skipSuccessfulRequests: false

});

// Exporta middleware
module.exports = limiter;