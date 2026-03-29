const logger = require("../utils/logger");

const errorHandler = (err, req, res, next) => {

  logger.error(err.message);

  const status = err.statusCode || 500;

  res.status(status).json({
    success: false,
    error: err.message || "Erro interno do servidor"
  });

};

module.exports = errorHandler;