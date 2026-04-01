// Importa o service responsável pelas regras de negócio do módulo de anime
const animeService = require("../services/anime.service");


// =========================
// LISTAR ANIMES
// =========================

// Controller para listar todos os animes disponíveis
const getAnimes = async (req, res) => {

  // Busca a lista de animes no service
  const data = await animeService.fetchAnimes();

  // Retorna resposta padronizada da API
  res.status(200).json({
    success: true,
    type: "anime",
    total: data.length,
    data: data
  });

};


// =========================
// DETALHES DO ANIME
// =========================

// Controller para buscar os detalhes completos de um anime pelo slug
const getAnimeDetails = async (req, res) => {

  // Obtém o slug enviado na URL
  const { slug } = req.params;

  // Busca os detalhes completos do anime
  const data = await animeService.fetchAnimeDetails(slug);

  // Retorna resposta padronizada da API
  res.status(200).json({
    success: true,
    type: "anime",
    data: data
  });

};


// =========================
// LISTAR EPISÓDIOS DO ANIME
// =========================

// Controller para listar episódios de um anime pelo slug
const getAnimeEpisodes = async (req, res) => {

  // Obtém o slug enviado na URL
  const { slug } = req.params;

  // Busca a lista de episódios no service
  const data = await animeService.fetchAnimeEpisodes(slug);

  // Retorna resposta padronizada da API
  res.status(200).json({
    success: true,
    type: "anime",
    total: data.length,
    data: data
  });

};


// =========================
// PLAYER / PROVEDORES DO EPISÓDIO
// =========================

// Controller para buscar os players ou provedores de um episódio específico
const getAnimeEpisodePlayer = async (req, res) => {

  // Obtém o slug do anime enviado na URL
  const { slug } = req.params;

  // Obtém o número do episódio enviado na URL
  const { episodeNumber } = req.params;

  // Busca os dados do player no service
  const data = await animeService.fetchAnimeEpisodePlayer(
    slug,
    episodeNumber
  );

  // Retorna resposta padronizada da API
  res.status(200).json({
    success: true,
    type: "anime",
    data: data
  });

};


// =========================
// HEALTH CHECK DO MÓDULO
// =========================

// Controller para verificar o estado do módulo de anime
const getAnimeHealth = async (req, res) => {

  // Retorna informações básicas do módulo
  res.status(200).json({
    success: true,
    module: "anime",
    data: {
      status: "ok",
      source: process.env.ANIME_SOURCE_BASE_URL || "https://animefire.io",
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