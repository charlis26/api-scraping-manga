// Importa o Express para criar as rotas
const express = require("express");

// Cria o router do módulo de anime
const router = express.Router();

// Importa os controllers do módulo de anime
const {
  getAnimes,
  getAnimeDetails,
  getAnimeEpisodes,
  getAnimeEpisodePlayer,
  getAnimeHealth
} = require("../controllers/anime.controller");

// Importa o asyncHandler para tratar erros assíncronos sem quebrar a aplicação
const asyncHandler = require("../utils/asyncHandler");


// =========================
// HEALTH CHECK DO MÓDULO
// =========================

// Rota para verificar se o módulo de anime está respondendo
router.get(
  "/health",
  asyncHandler(getAnimeHealth)
);


// =========================
// LISTA DE ANIMES
// =========================

// Rota para listar os animes disponíveis
router.get(
  "/",
  asyncHandler(getAnimes)
);


// =========================
// DETALHES DO ANIME
// =========================

// Rota para retornar os detalhes de um anime pelo slug
router.get(
  "/:slug",
  asyncHandler(getAnimeDetails)
);


// =========================
// EPISÓDIOS DO ANIME
// =========================

// Rota para listar os episódios de um anime pelo slug
router.get(
  "/:slug/episodes",
  asyncHandler(getAnimeEpisodes)
);


// =========================
// PLAYER / FONTES DO EPISÓDIO
// =========================

// Rota para retornar os players ou provedores de um episódio específico
router.get(
  "/:slug/episode/:episodeNumber",
  asyncHandler(getAnimeEpisodePlayer)
);


// Exporta o router para ser usado no server.js
module.exports = router;