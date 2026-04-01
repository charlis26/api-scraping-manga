// Importa o service responsável pelas regras de negócio do módulo de anime
const animeService = require("../services/anime.service");


// =========================
// HELPERS
// =========================

// Garante formato consistente mesmo quando o service mudar a origem dos dados
const normalizeServicePayload = (payload) => {
  if (
    payload &&
    typeof payload === "object" &&
    Object.prototype.hasOwnProperty.call(payload, "data") &&
    Object.prototype.hasOwnProperty.call(payload, "meta")
  ) {
    return payload;
  }

  return {
    data: payload,
    meta: {
      cached: false,
      fallback: false,
      sourceBlocked: false,
      source: "legacy"
    }
  };
};


// =========================
// LISTAR ANIMES
// =========================
const getAnimes = async (req, res) => {
  const servicePayload = await animeService.fetchAnimes();

  const { data, meta } = normalizeServicePayload(servicePayload);

  res.status(200).json({
    success: true,
    type: "anime",
    total: Array.isArray(data) ? data.length : 0,
    cached: meta.cached,
    fallback: meta.fallback,
    sourceBlocked: meta.sourceBlocked,
    source: meta.source,
    data
  });
};


// =========================
// DETALHES DO ANIME
// =========================
const getAnimeDetails = async (req, res) => {
  const { slug } = req.params;

  const servicePayload = await animeService.fetchAnimeDetails(slug);

  const { data, meta } = normalizeServicePayload(servicePayload);

  res.status(200).json({
    success: true,
    type: "anime",
    cached: meta.cached,
    fallback: meta.fallback,
    sourceBlocked: meta.sourceBlocked,
    source: meta.source,
    data
  });
};


// =========================
// LISTAR EPISÓDIOS DO ANIME
// =========================
const getAnimeEpisodes = async (req, res) => {
  const { slug } = req.params;

  const servicePayload = await animeService.fetchAnimeEpisodes(slug);

  const { data, meta } = normalizeServicePayload(servicePayload);

  res.status(200).json({
    success: true,
    type: "anime",
    total: Array.isArray(data) ? data.length : 0,
    cached: meta.cached,
    fallback: meta.fallback,
    sourceBlocked: meta.sourceBlocked,
    source: meta.source,
    data
  });
};


// =========================
// PLAYER / PROVEDORES DO EPISÓDIO
// =========================
const getAnimeEpisodePlayer = async (req, res) => {
  const { slug } = req.params;
  const { episodeNumber } = req.params;

  const servicePayload = await animeService.fetchAnimeEpisodePlayer(
    slug,
    episodeNumber
  );

  const { data, meta } = normalizeServicePayload(servicePayload);

  res.status(200).json({
    success: true,
    type: "anime",
    cached: meta.cached,
    fallback: meta.fallback,
    sourceBlocked: meta.sourceBlocked,
    source: meta.source,
    data
  });
};


// =========================
// HEALTH CHECK DO MÓDULO
// =========================
const getAnimeHealth = async (req, res) => {
  res.status(200).json({
    success: true,
    module: "anime",
    data: {
      status: "ok",
      source: process.env.ANIME_BASE_URL || "não definida",
      environment: process.env.NODE_ENV || "development",
      serverTime: new Date().toISOString()
    }
  });
};


// Exporta todos os controllers do módulo de anime
module.exports = {
  getAnimes,
  getAnimeDetails,
  getAnimeEpisodes,
  getAnimeEpisodePlayer,
  getAnimeHealth
};