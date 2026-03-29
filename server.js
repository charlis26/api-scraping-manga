// Importa o middleware de compressão das respostas
const compression = require("compression");

// Carrega as variáveis do arquivo .env
require("dotenv").config();

// Importa o middleware de CORS
const cors = require("cors");

// Importa o middleware global de tratamento de erros
const errorHandler = require("./middlewares/error.middleware");

// Importa o middleware de rate limit
const limiter = require("./middlewares/rateLimit.middleware");

// Importa o framework Express
const express = require("express");

// Importa as rotas de mangás
const mangaRoutes = require("./routes/manga.routes");

// Importa o middleware de segurança HTTP
const helmet = require("helmet");


// Cria a aplicação Express
const app = express();


// =========================
// Segurança
// =========================

// Aplica headers de segurança HTTP
app.use(helmet());


// =========================
// CORS configurável
// =========================

app.use(cors({
  origin: process.env.CORS_ORIGIN || "*"
}));


// =========================
// Performance
// =========================

app.use(compression());


// =========================
// Body parser
// =========================

app.use(express.json());


// =========================
// Rate limit
// =========================

app.use(limiter);


// =========================
// Rotas básicas
// =========================

// Rota principal
app.get("/", (req, res) => {

  res.send("Servidor funcionando 🚀");

});


// Health check
app.get("/health", (req, res) => {

  res.json({

    status: "ok",
    uptime: process.uptime(),
    environment: process.env.NODE_ENV || "development",
    port: process.env.PORT,
    timestamp: new Date().toISOString()

  });

});


// Rotas da API
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