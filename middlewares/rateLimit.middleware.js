// Importa o pacote responsável por limitar requisições
const rateLimit = require("express-rate-limit");


// Cria o middleware de rate limit
const limiter = rateLimit({

  // Define a janela de tempo do rate limit
  // Primeiro tenta ler do .env
  // Se não existir, usa 15 minutos como padrão
  windowMs:
    (process.env.RATE_LIMIT_WINDOW || 15)
    * 60
    * 1000,

  // Define o número máximo de requisições permitidas por IP
  // Primeiro tenta ler do .env
  // Se não existir, usa 100 requisições como padrão
  max:
    process.env.RATE_LIMIT_MAX || 100,

  // Define a resposta padrão quando o limite for ultrapassado
  message: {

    // Indica que a requisição falhou
    success: false,

    // Mensagem retornada ao cliente
    error: "Muitas requisições. Tente novamente mais tarde."

  },

  // Envia os headers modernos de rate limit
  standardHeaders: true,

  // Desativa headers antigos
  legacyHeaders: false

});


// Exporta o middleware para uso no servidor
module.exports = limiter;