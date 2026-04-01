// Importa middleware de timeout
const timeoutMiddleware =
require("./middlewares/timeout.middleware");

// Importa compressão
const compression =
require("compression");

// Carrega .env
require("dotenv").config();

// Importa CORS
const cors =
require("cors");

// Importa Express
const express =
require("express");

// Importa Helmet
const helmet =
require("helmet");

// Importa rotas
const mangaRoutes =
require("./routes/manga.routes");

const animeRoutes =
require("./routes/anime.routes");

// Importa cache global
const {
  clearCache,
  getCacheStats
} = require("./cache/cache");

// Importa logger
const {
  logAccess
} = require("./utils/logger");

// Importa middlewares
let limiter =
require("./middlewares/rateLimit.middleware");

let errorHandler =
require("./middlewares/error.middleware");


// Garante funções válidas
if (typeof limiter !== "function") {
  limiter =
    limiter.default ||
    limiter.limiter ||
    limiter;
}

if (typeof errorHandler !== "function") {
  errorHandler =
    errorHandler.default ||
    errorHandler.errorHandler ||
    errorHandler;
}


// Cria app
const app = express();


// ===============================
// FUNÇÃO AUXILIAR
// ===============================

const formatMemoryInMB = (bytes = 0) => {
  return `${(
    bytes /
    1024 /
    1024
  ).toFixed(2)} MB`;
};


// ===============================
// MIDDLEWARES
// ===============================

app.use(helmet());

app.use(
  cors({
    origin:
      process.env.CORS_ORIGIN || "*"
  })
);

app.use(compression());

app.use(express.json());

app.use(timeoutMiddleware);

app.use(limiter);


// ===============================
// LOGGER DE ACESSO
// ===============================

app.use((req, res, next) => {
  const start =
    Date.now();

  res.on("finish", () => {
    const duration =
      Date.now() - start;

    const ip =
      req.headers["x-forwarded-for"] ||
      req.socket.remoteAddress ||
      req.ip ||
      "unknown";

    // Log no terminal
    console.log(
      `${req.method} ${req.originalUrl} ${res.statusCode} - ${duration}ms`
    );

    // Log em arquivo
    logAccess({
      method: req.method,
      url: req.originalUrl,
      statusCode: res.statusCode,
      durationMs: duration,
      ip
    });
  });

  next();
});


// ===============================
// ROTAS
// ===============================

app.get("/", (req, res) => {
  res.send(
    "Servidor funcionando 🚀"
  );
});


// ===============================
// HEALTH
// ===============================

app.get("/health", (req, res) => {
  const memoryUsage =
    process.memoryUsage();

  res.status(200).json({
    success: true,
    data: {
      status: "ok",
      service:
        "api-scraping-animes-e-mangas",
      uptimeSeconds:
        Number(
          process.uptime()
            .toFixed(2)
        ),
      environment:
        process.env.NODE_ENV ||
        "development",
      port:
        Number(
          process.env.PORT
        ) || 3000,
      timestamp:
        new Date()
          .toISOString(),
      memory: {
        rss:
          formatMemoryInMB(
            memoryUsage.rss
          ),
        heapTotal:
          formatMemoryInMB(
            memoryUsage.heapTotal
          ),
        heapUsed:
          formatMemoryInMB(
            memoryUsage.heapUsed
          ),
        external:
          formatMemoryInMB(
            memoryUsage.external
          )
      }
    }
  });
});


// ===============================
// CACHE STATUS
// ===============================

app.get("/api/cache/status", (req, res) => {
  const stats =
    getCacheStats();

  res.status(200).json({
    success: true,
    data: stats
  });
});


// ===============================
// CACHE CLEAR
// ===============================

app.get("/api/cache/clear", (req, res) => {
  const result =
    clearCache();

  res.status(200).json({
    success: true,
    message:
      "Cache limpo com sucesso.",
    data: result
  });
});


// ===============================
// API ROUTES
// ===============================

app.use(
  "/api/mangas",
  mangaRoutes
);

app.use(
  "/api/animes",
  animeRoutes
);


// ===============================
// 404
// ===============================

app.use((req, res) => {
  if (res.headersSent) {
    return;
  }

  res.status(404).json({
    success: false,
    error:
      "Rota não encontrada"
  });
});


// ===============================
// ERROR HANDLER
// ===============================

app.use(errorHandler);


// ===============================
// START
// ===============================

const PORT =
  process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`

Servidor iniciado

Port: ${PORT}

Health:
http://localhost:${PORT}/health

Cache status:
http://localhost:${PORT}/api/cache/status

Cache clear:
http://localhost:${PORT}/api/cache/clear

`);
});