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

// Importa service de anime
const animeService =
require("./services/anime.service");

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

app.use(express.json({
  limit: "1mb"
}));

// Permite que o Express confie em proxy (Render, Cloudflare, etc)
// Necessário para o rate limiter funcionar corretamente
app.set("trust proxy", 1);

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
// CONFIGURAÇÃO DOS INTERVALOS
// ===============================

// Popular sidebar atualiza 1 vez por dia
const POPULAR_SIDEBAR_REFRESH_INTERVAL_MS =
  24 * 60 * 60 * 1000;

// Home agora atualiza de 20 em 20 minutos
const HOME_REFRESH_INTERVAL_MS =
  20 * 60 * 1000;

// Páginas rápidas do catálogo agora atualizam de 20 em 20 minutos
const FAST_PAGES_REFRESH_INTERVAL_MS =
  20 * 60 * 1000;

// Índice global completo atualiza de 24 em 24 horas
// 3 dias
const FULL_CATALOG_INDEX_REFRESH_INTERVAL_MS =
  3 * 24 * 60 * 60 * 1000;
const INCREMENTAL_CATALOG_INDEX_REFRESH_INTERVAL_MS =
  24 * 60 * 60 * 1000;
// ===============================
// TRAVAS DE REFRESH
// ===============================

// Evita múltiplas atualizações simultâneas da home
let isRefreshingHomeCache = false;

// Evita múltiplas atualizações simultâneas das páginas rápidas
let isRefreshingFastPagesCache = false;

// Evita múltiplas reconstruções simultâneas do índice global
let isRefreshingFullCatalogIndex = false;

// ===============================
// REFRESH DO POPULAR SIDEBAR
// ===============================

let isRefreshingPopularSidebar = false;

const refreshAnimePopularSidebar = async (reason = "manual") => {
  if (isRefreshingPopularSidebar) {
    console.log(
      `[POPULAR SIDEBAR] atualização ignorada (${reason}) porque já existe uma em andamento`
    );
    return;
  }

  isRefreshingPopularSidebar = true;

  const start = Date.now();

  try {
    console.log(
      `[POPULAR SIDEBAR] iniciando atualização (${reason})...`
    );

    const data =
      await animeService.refreshPopularSidebar();

    const duration =
      Date.now() - start;

    console.log(
      `[POPULAR SIDEBAR] atualização concluída (${reason}) em ${duration}ms`
    );

    console.log(
      `[POPULAR SIDEBAR] total=${Array.isArray(data) ? data.length : 0}`
    );
  } catch (error) {
    console.error(
      `[POPULAR SIDEBAR] erro ao atualizar (${reason}):`,
      error.message
    );
  } finally {
    isRefreshingPopularSidebar = false;
  }
};

// ===============================
// REFRESH DA HOME
// ===============================

// Atualiza o cache da home com segurança
const refreshAnimeHomeCache = async (reason = "manual") => {
  // Se já estiver atualizando, evita duplicação
  if (isRefreshingHomeCache) {
    console.log(
      `[HOME CACHE] atualização ignorada (${reason}) porque já existe uma em andamento`
    );
    return;
  }

  // Marca como em andamento
  isRefreshingHomeCache = true;

  // Guarda início
  const start = Date.now();

  try {
    console.log(
      `[HOME CACHE] aguardando atualizações recentes antes da home (${reason})...`
    );

    // Garante que as atualizações recentes rodem antes da home
    await refreshAnimeRecentUpdatesCache(
      `${reason}-before-home`
    );

    console.log(
      `[HOME CACHE] iniciando atualização (${reason})...`
    );

    // Busca e salva a home via service
    const data =
      await animeService.fetchAnimeHomeSections();

    // Calcula duração
    const duration =
      Date.now() - start;

    // Loga sucesso
    console.log(
      `[HOME CACHE] atualização concluída (${reason}) em ${duration}ms`
    );

    console.log(
      `[HOME CACHE] mostViewed=${Array.isArray(data?.mostViewed) ? data.mostViewed.length : 0} | latestEpisodes=${Array.isArray(data?.latestEpisodes) ? data.latestEpisodes.length : 0} | recentAnimes=${Array.isArray(data?.recentAnimes) ? data.recentAnimes.length : 0} | popularSidebar=${Array.isArray(data?.popularSidebar) ? data.popularSidebar.length : 0}`
    );
  } catch (error) {
    // Loga falha sem derrubar o servidor
    console.error(
      `[HOME CACHE] erro ao atualizar (${reason}):`,
      error.message
    );
  } finally {
    // Libera trava
    isRefreshingHomeCache = false;
  }
};

// Atualiza o cache das atualizações recentes com segurança
// ===============================
// REFRESH DAS ATUALIZAÇÕES RECENTES
// ===============================

// Evita múltiplas atualizações simultâneas das atualizações recentes
let isRefreshingRecentUpdatesCache = false;

// Guarda a promise em andamento para permitir await real
let recentUpdatesRefreshPromise = null;

// Atualiza o cache das atualizações recentes com segurança
const refreshAnimeRecentUpdatesCache = async (reason = "manual") => {
  // Se já estiver atualizando, aguarda a execução atual terminar
  if (isRefreshingRecentUpdatesCache && recentUpdatesRefreshPromise) {
    console.log(
      `[RECENT UPDATES CACHE] aguardando execução já em andamento (${reason})...`
    );

    return recentUpdatesRefreshPromise;
  }

  // Marca como em andamento
  isRefreshingRecentUpdatesCache = true;

  // Guarda início
  const start = Date.now();

  // Cria a promise real da execução atual
  recentUpdatesRefreshPromise = (async () => {
    try {
      console.log(
        `[RECENT UPDATES CACHE] iniciando atualização (${reason})...`
      );

      // Busca e salva as atualizações recentes via service
      const data =
  await animeService.fetchRecentUpdates({
    forceRefresh: true
  });

      // Calcula duração
      const duration =
        Date.now() - start;

      // Loga sucesso
      console.log(
        `[RECENT UPDATES CACHE] atualização concluída (${reason}) em ${duration}ms`
      );

      console.log(
        `[RECENT UPDATES CACHE] total=${Array.isArray(data?.data) ? data.data.length : 0} | pages=${Array.isArray(data?.pages) ? data.pages.join(",") : "n/a"}`
      );

      return data;
    } catch (error) {
      console.error(
        `[RECENT UPDATES CACHE] erro ao atualizar (${reason}):`,
        error.message
      );

      throw error;
    } finally {
      isRefreshingRecentUpdatesCache = false;
      recentUpdatesRefreshPromise = null;
    }
  })();

  return recentUpdatesRefreshPromise;
};

// ===============================
// REFRESH DAS PÁGINAS RÁPIDAS
// ===============================

// Atualiza as páginas 1 a 4 em background
const refreshAnimeFastPagesCache = async (reason = "manual") => {
  // Se já estiver atualizando, evita duplicação
  if (isRefreshingFastPagesCache) {
    console.log(
      `[FAST PAGES CACHE] atualização ignorada (${reason}) porque já existe uma em andamento`
    );
    return;
  }

  // Marca como em andamento
  isRefreshingFastPagesCache = true;

  // Guarda início
  const start = Date.now();

  try {
    console.log(
      `[FAST PAGES CACHE] iniciando atualização (${reason})...`
    );

    // Executa o pré-aquecimento das páginas rápidas
    await animeService.refreshFastCatalogPages();

    // Calcula duração
    const duration =
      Date.now() - start;

    // Loga sucesso
    console.log(
      `[FAST PAGES CACHE] atualização concluída (${reason}) em ${duration}ms`
    );
  } catch (error) {
    // Loga falha sem derrubar o servidor
    console.error(
      `[FAST PAGES CACHE] erro ao atualizar (${reason}):`,
      error.message
    );
  } finally {
    // Libera trava
    isRefreshingFastPagesCache = false;
  }
};

// ===============================
// REFRESH DO ÍNDICE GLOBAL
// ===============================

// Reconstrói o índice global completo do catálogo
const refreshAnimeFullCatalogIndex = async (reason = "manual") => {
  // Se já estiver atualizando, evita duplicação
  if (isRefreshingFullCatalogIndex) {
    console.log(
      `[FULL CATALOG INDEX] atualização ignorada (${reason}) porque já existe uma em andamento`
    );
    return;
  }

  // Marca como em andamento
  isRefreshingFullCatalogIndex = true;

  // Guarda início
  const start = Date.now();

  try {
    console.log(
      `[FULL CATALOG INDEX] iniciando atualização (${reason})...`
    );

    // Reconstrói índice completo
    const data =
      await animeService.buildFullCatalogIndex();

    // Calcula duração
    const duration =
      Date.now() - start;

    // Lê metadata do índice
    const meta =
      animeService.getCachedCatalogIndexMeta();

    // Loga sucesso
    console.log(
      `[FULL CATALOG INDEX] atualização concluída (${reason}) em ${duration}ms`
    );

    console.log(
      `[FULL CATALOG INDEX] totalItems=${Number(data?.totalItems || 0)} | totalPages=${Number(data?.totalPages || 0)} | updatedAt=${meta?.updatedAt || "n/a"}`
    );
  } catch (error) {
    // Loga falha sem derrubar o servidor
    console.error(
      `[FULL CATALOG INDEX] erro ao atualizar (${reason}):`,
      error.message
    );
  } finally {
    // Libera trava
    isRefreshingFullCatalogIndex = false;
  }
};

// ===============================
// REFRESH INCREMENTAL DO ÍNDICE GLOBAL
// ===============================

// Evita múltiplos incrementais simultâneos
let isRefreshingIncrementalCatalogIndex = false;

// Atualiza o índice global de forma incremental
const refreshAnimeIncrementalCatalogIndex = async (reason = "manual") => {
  // Se já estiver atualizando, evita duplicação
  if (isRefreshingIncrementalCatalogIndex) {
    console.log(
      `[INCREMENTAL CATALOG INDEX] atualização ignorada (${reason}) porque já existe uma em andamento`
    );
    return;
  }

  // Se o rebuild completo estiver rodando, não disputa com ele
  if (isRefreshingFullCatalogIndex) {
    console.log(
      `[INCREMENTAL CATALOG INDEX] atualização ignorada (${reason}) porque o rebuild completo está em andamento`
    );
    return;
  }

  // Marca como em andamento
  isRefreshingIncrementalCatalogIndex = true;

  // Guarda início
  const start = Date.now();

  try {
    console.log(
      `[INCREMENTAL CATALOG INDEX] iniciando atualização (${reason})...`
    );

    // Executa o refresh incremental via service
    const data =
      await animeService.refreshIncrementalCatalogIndex();

    // Calcula duração
    const duration =
      Date.now() - start;

    // Lê metadata atualizada
    const meta =
      animeService.getCachedCatalogIndexMeta();

    // Loga sucesso
    console.log(
      `[INCREMENTAL CATALOG INDEX] atualização concluída (${reason}) em ${duration}ms`
    );

    console.log(
      `[INCREMENTAL CATALOG INDEX] totalItems=${Number(data?.totalItems || 0)} | totalPages=${Number(data?.totalPages || 0)} | mode=${meta?.mode || "n/a"} | updatedAt=${meta?.updatedAt || "n/a"}`
    );
  } catch (error) {
    // Loga falha sem derrubar o servidor
    console.error(
      `[INCREMENTAL CATALOG INDEX] erro ao atualizar (${reason}):`,
      error.message
    );
  } finally {
    // Libera trava
    isRefreshingIncrementalCatalogIndex = false;
  }
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

app.use(express.json({
  limit: "1mb"
}));

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

  const catalogIndexMeta =
    animeService.getCachedCatalogIndexMeta();

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
      },
      catalogIndex: {
  totalItems:
    Number(catalogIndexMeta?.totalItems || 0),
  totalPages:
    Number(catalogIndexMeta?.totalPages || 0),
  updatedAt:
    catalogIndexMeta?.updatedAt || null,
  durationMs:
    Number(catalogIndexMeta?.durationMs || 0),
  mode:
    catalogIndexMeta?.mode || null,
  buildStatus:
    catalogIndexMeta?.buildStatus || null,
  lastProcessedPage:
    Number(catalogIndexMeta?.lastProcessedPage || 0)
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

  const catalogIndexMeta =
    animeService.getCachedCatalogIndexMeta();

  res.status(200).json({
    success: true,
    data: {
      ...stats,
      catalogIndex: {
  totalItems:
    Number(catalogIndexMeta?.totalItems || 0),
  totalPages:
    Number(catalogIndexMeta?.totalPages || 0),
  updatedAt:
    catalogIndexMeta?.updatedAt || null,
  durationMs:
    Number(catalogIndexMeta?.durationMs || 0),
  mode:
    catalogIndexMeta?.mode || null,
  buildStatus:
    catalogIndexMeta?.buildStatus || null,
  lastProcessedPage:
    Number(catalogIndexMeta?.lastProcessedPage || 0)
}
    }
  });
});

// ===============================
// CACHE CLEAR
// ===============================

app.get("/api/cache/clear", async (req, res) => {
  const result =
    clearCache();

  // Após limpar o cache, dispara reaquecer em background
  setTimeout(() => {
    refreshAnimeHomeCache("cache-clear");
    refreshAnimeFastPagesCache("cache-clear");
    refreshAnimeFullCatalogIndex("cache-clear");
  }, 1000);

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

app.listen(PORT, async () => {
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

    // ========================================
  // 1) Atualizações Recentes (imediato)
  // ========================================
  await refreshAnimeRecentUpdatesCache("startup");

    // ========================================
  // 2) Home
  // ========================================
  // Pré-aquece a home no startup após atualizar os recentes
  // para evitar que o primeiro acesso pegue a home "desmontada"
  try {
    console.log(
      "[HOME CACHE] iniciando pré-aquecimento no startup..."
    );

    await refreshAnimeHomeCache("startup");

    await refreshAnimePopularSidebar("startup");

    console.log(
      "[HOME CACHE] pré-aquecimento concluído no startup"
    );
  } catch (error) {
    console.error(
      "[HOME CACHE] erro no pré-aquecimento do startup:",
      error.message
    );
  }

  // ========================================
  // 3) Global automático (delay)
  // ========================================
  // ========================================
// 3) Global automático (delay)
// ========================================
setTimeout(async () => {
  try {
    console.log(
      "[GLOBAL] verificando se precisa retomar rebuild completo..."
    );

    // Lê o estado atual do índice
    const catalogMeta =
      animeService.getCachedCatalogIndexMeta();

    const totalPages =
      Number(catalogMeta?.totalPages || 0);

    const totalItems =
      Number(catalogMeta?.totalItems || 0);

    // Se não existe índice ainda, força rebuild completo
    if (!totalItems || !totalPages) {
      console.log(
        "[GLOBAL] índice ausente. Iniciando rebuild completo..."
      );

      await refreshAnimeFullCatalogIndex(
        "startup-delayed-empty-index"
      );

      console.log(
        "[GLOBAL] rebuild completo concluído"
      );

      return;
    }

    // Se já existe índice salvo, primeiro tenta continuar via full rebuild
    // Isso permite entrar na lógica de last_processed_page do anime.service.js
    console.log(
      "[GLOBAL] índice encontrado. Tentando retomar rebuild completo..."
    );

    await refreshAnimeFullCatalogIndex(
      "startup-delayed-resume"
    );

    console.log(
      "[GLOBAL] verificação de rebuild completo concluída"
    );
  } catch (error) {
    console.error(
      "[GLOBAL] erro ao verificar rebuild completo:",
      error.message
    );
  }
}, 30000);;
  
  
  // ===============================
  // INTERVALOS
  // ==============================

  setInterval(() => {
  refreshAnimePopularSidebar("interval");
  }, POPULAR_SIDEBAR_REFRESH_INTERVAL_MS);
   
  // Atualiza somente o container de Atualizações Recentes de 20 em 20 minutos
  setInterval(async () => {
  try {
    console.log(
      "[INTERVAL] iniciando atualização das atualizações recentes..."
    );

    // Atualiza recentes
    await refreshAnimeRecentUpdatesCache("interval");

    console.log(
      "[INTERVAL] recentes atualizados. Atualizando home..."
    );

    // Atualiza home logo depois
    await refreshAnimeHomeCache("interval-after-recent");

    console.log(
      "[INTERVAL] home atualizada com novos dados"
    );

  } catch (error) {
    console.error(
      "[INTERVAL] erro ao atualizar recentes/home:",
      error.message
    );
  }
}, HOME_REFRESH_INTERVAL_MS);

  // Atualiza as páginas 1 a 4 automaticamente em background de 20 em 20 minutos
  setInterval(() => {
    refreshAnimeFastPagesCache("interval");
  }, FAST_PAGES_REFRESH_INTERVAL_MS);

    // Atualiza o índice global incremental automaticamente em background de 1 em 1 dia
  setInterval(() => {
    refreshAnimeIncrementalCatalogIndex("interval");
  }, INCREMENTAL_CATALOG_INDEX_REFRESH_INTERVAL_MS);

  // Atualiza o índice global completo automaticamente em background de 24 em 24 horas
  setInterval(() => {
    refreshAnimeFullCatalogIndex("interval");
  }, FULL_CATALOG_INDEX_REFRESH_INTERVAL_MS);


});