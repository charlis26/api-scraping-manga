// Importa o Express para criar as rotas
const express = require("express");

// Cria o router do módulo de anime
const router = express.Router();

// Importa os controllers do módulo de anime
const {
  getAnimeHomeSections,
  getAnimes,
  searchAnimes,
  getAnimeGenres,
  getAnimeDetails,
  getAnimeEpisodes,
  getAnimeEpisodePlayer,
  streamAnimeEpisode,
  getAnimeHealth
} = require("../controllers/anime.controller");

// Importa o asyncHandler para tratar erros assíncronos sem quebrar a aplicação
const asyncHandler = require("../utils/asyncHandler");

// =========================
// HEALTH CHECK DO MÓDULO
// =========================
router.get(
  "/health",
  asyncHandler(getAnimeHealth)
);

// =========================
// HOME ESTRUTURADA
// =========================
router.get(
  "/home",
  asyncHandler(getAnimeHomeSections)
);

// =========================
// BUSCA POR NOME
// =========================
router.get(
  "/search",
  asyncHandler(searchAnimes)
);

// =========================
// LISTA DE GÊNEROS
// =========================
router.get(
  "/genres",
  asyncHandler(getAnimeGenres)
);

// =========================
// LISTA DE ANIMES
// =========================
router.get(
  "/",
  asyncHandler(getAnimes)
);

// =========================
// DETALHES DO ANIME
// =========================
router.get(
  "/:slug",
  asyncHandler(getAnimeDetails)
);

// =========================
// EPISÓDIOS DO ANIME
// =========================
router.get(
  "/:slug/episodes",
  asyncHandler(getAnimeEpisodes)
);

// =========================
// PLAYER / FONTES DO EPISÓDIO
// =========================
router.get(
  "/:slug/episode/:episodeNumber",
  asyncHandler(getAnimeEpisodePlayer)
);

// =========================
// STREAM INTERNO DO EPISÓDIO
// =========================
router.get(
  "/:slug/episode/:episodeNumber/stream",
  asyncHandler(streamAnimeEpisode)
);

// Exporta o router para ser usado no server.js
module.exports = router;