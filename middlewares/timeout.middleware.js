// Importa nada porque este middleware usa apenas recursos nativos do Node/Express


// Middleware de timeout global da aplicação
const timeoutMiddleware = (req, res, next) => {
  // Lê o tempo limite vindo do .env em segundos
  const timeoutInSeconds =
    Number(process.env.REQUEST_TIMEOUT) || 15;

  // Converte o tempo para milissegundos
  const timeoutInMilliseconds =
    timeoutInSeconds * 1000;

  // Marca inicialmente que a requisição ainda não expirou
  req.timedout = false;

  // Cria o timer que vai encerrar a requisição se passar do limite
  const timeoutId = setTimeout(() => {
    // Marca a requisição como expirada
    req.timedout = true;

    // Se a resposta já tiver sido enviada, não faz nada
    if (res.headersSent) {
      return;
    }

    // Retorna erro padronizado de timeout
    res.status(408).json({
      success: false,
      error: "Tempo limite excedido"
    });
  }, timeoutInMilliseconds);

  // Função auxiliar para limpar o timer com segurança
  const clearRequestTimeout = () => {
    // Limpa o timer para evitar vazamento de memória
    clearTimeout(timeoutId);
  };

  // Quando a resposta terminar normalmente, limpa o timer
  res.on("finish", clearRequestTimeout);

  // Quando a conexão for fechada antes do fim, limpa o timer
  res.on("close", clearRequestTimeout);

  // Passa para o próximo middleware/controller
  next();
};


// Exporta o middleware para uso no server.js
module.exports = timeoutMiddleware;