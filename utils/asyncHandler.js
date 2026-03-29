// Middleware responsável por capturar erros em funções async
// Evita precisar usar try/catch em todos os controllers

const asyncHandler = (fn) => {

  // Retorna uma função que executa o controller
  return (req, res, next) => {

    // Resolve a Promise e envia erro para o middleware global
    Promise.resolve(fn(req, res, next)).catch(next);

  };

};

// Exporta o middleware
module.exports = asyncHandler;