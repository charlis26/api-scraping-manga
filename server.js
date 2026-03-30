const timeoutMiddleware =
require("./middlewares/timeout.middleware");

// Importa o middleware de compressão
const compression = require("compression");

// Carrega variáveis do .env
require("dotenv").config();

// Importa CORS
const cors = require("cors");

// Importa Express
const express = require("express");

// Importa Helmet (segurança)
const helmet = require("helmet");

// Importa rotas
const mangaRoutes = require("./routes/manga.routes");

// Importa rate limit
let limiter = require("./middlewares/rateLimit.middleware");

// Importa error handler
let errorHandler = require("./middlewares/error.middleware");


// =========================
// CORREÇÃO AUTOMÁTICA
// =========================

// Se o middleware veio dentro de objeto
if (typeof limiter !== "function") {
  limiter = limiter.default || limiter.limiter || limiter;
}

if (typeof errorHandler !== "function") {
  errorHandler =
    errorHandler.default ||
    errorHandler.errorHandler ||
    errorHandler;
}


// Cria app
const app = express();


// =========================
// Segurança
// =========================

app.use(helmet());


// =========================
// CORS
// =========================

app.use(
  cors({
    origin: process.env.CORS_ORIGIN || "*"
  })
);


// =========================
// Performance
// =========================

app.use(compression());


// =========================
// JSON
// =========================

app.use(express.json());

//timeout para colocar tempó limite nas requisições
app.use(timeoutMiddleware);

// =========================
// Rate limit
// =========================

app.use(limiter);


// =========================
// Logger simples
// =========================

app.use((req, res, next) => {

  const start = Date.now();

  res.on("finish", () => {

    const duration = Date.now() - start;

    console.log(
      `${req.method} ${req.originalUrl} ${res.statusCode} - ${duration}ms`
    );

  });

  next();

});


// =========================
// Rotas básicas
// =========================

app.get("/", (req, res) => {

  res.send("Servidor funcionando 🚀");

});


// =========================
// Health check
// =========================

app.get("/health", (req, res) => {

  res.json({
    status: "ok",
    uptime: process.uptime(),
    environment:
      process.env.NODE_ENV || "development",
    port: process.env.PORT,
    timestamp: new Date().toISOString()
  });

});


// =========================
// Rotas API
// =========================

app.use("/api", mangaRoutes);


// =========================
// Error handler
// =========================

app.use(errorHandler);


// =========================
// Inicialização
// =========================

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {

  console.log(`

Servidor iniciado com sucesso

Environment: ${process.env.NODE_ENV}
Port: ${PORT}

`);

});