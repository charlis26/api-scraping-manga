
// REQUEST TIMEOUT MIDDLEWARE

// Tempo máximo de resposta em milissegundos
// Primeiro tenta ler do .env
// Se não existir usa 15 segundos
const TIMEOUT =
  (process.env.REQUEST_TIMEOUT || 15)
  * 1000;


// Middleware de timeout
const timeoutMiddleware = (req, res, next) => {

  // Marca se já respondeu
  let finished = false;

  // Inicia o timer
  const timer = setTimeout(() => {

    // Se ainda não respondeu
    if (!finished) {

      // Marca como finalizado
      finished = true;

      // Retorna erro de timeout
      res.status(408).json({

        success: false,

        error: "Tempo limite excedido"

      });

    }

  }, TIMEOUT);


  // Quando a resposta terminar
  res.on("finish", () => {

    // Marca como finalizado
    finished = true;

    // Cancela o timer
    clearTimeout(timer);

  });


  // Continua fluxo
  next();

};


// Exporta middleware
module.exports = timeoutMiddleware;