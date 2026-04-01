// Importa o erro customizado para recursos não encontrados
const { NotFoundError } = require("../utils/errors");

// Importa o cache compartilhado do projeto
const { getCache, setCache } = require("../cache/cache");

// Importa o scraper do módulo de anime
const animeScraper = require("../utils/anime.scraper");


// ===============================
// CONFIGURAÇÕES DO MÓDULO
// ===============================

// Define um prefixo fixo e limpo para o cache do módulo de anime
const ANIME_CACHE_PREFIX = "anime_module";


// Monta a chave de cache da lista de animes
const getAnimesCacheKey = () => {
  // Retorna a chave da lista principal
  return `${ANIME_CACHE_PREFIX}_list`;
};


// Monta a chave de cache dos detalhes do anime
const getAnimeDetailsCacheKey = (slug) => {
  // Retorna a chave dos detalhes
  return `${ANIME_CACHE_PREFIX}_details_${slug}`;
};


// Monta a chave de cache dos episódios do anime
const getAnimeEpisodesCacheKey = (slug) => {
  // Retorna a chave dos episódios
  return `${ANIME_CACHE_PREFIX}_episodes_${slug}`;
};


// Monta a chave de cache do player do episódio
const getAnimePlayerCacheKey = (slug, episodeNumber) => {
  // Retorna a chave do player
  return `${ANIME_CACHE_PREFIX}_player_${slug}_${episodeNumber}`;
};


// Valida se o slug foi informado
const validateSlug = (slug) => {
  // Se não existir slug, lança erro
  if (!slug || !String(slug).trim()) {
    throw new NotFoundError(
      "Slug do anime não informado."
    );
  }
};


// Valida se o número do episódio foi informado
const validateEpisodeNumber = (episodeNumber) => {
  // Se não existir número do episódio, lança erro
  if (!episodeNumber || !String(episodeNumber).trim()) {
    throw new NotFoundError(
      "Número do episódio não informado."
    );
  }
};


// ===============================
// LISTAR ANIMES
// ===============================
const fetchAnimes = async () => {
  // Monta a chave de cache
  const cacheKey = getAnimesCacheKey();

  // Tenta ler do cache
  const cachedData = getCache(cacheKey);

  // Se encontrou no cache, retorna direto
  if (cachedData) {
    return cachedData;
  }

  // Busca a lista no scraper
  const animes = await animeScraper.scrapeHome();

  // Se não encontrou nada, lança erro
  if (!animes || !Array.isArray(animes) || animes.length === 0) {
    throw new NotFoundError(
      "Nenhum anime encontrado no site."
    );
  }

  // Salva no cache
  setCache(cacheKey, animes);

  // Retorna a lista
  return animes;
};


// ===============================
// DETALHES DO ANIME
// ===============================
const fetchAnimeDetails = async (slug) => {
  // Valida o slug
  validateSlug(slug);

  // Monta a chave de cache
  const cacheKey = getAnimeDetailsCacheKey(slug);

  // Tenta ler do cache
  const cachedData = getCache(cacheKey);

  // Se encontrou no cache, retorna direto
  if (cachedData) {
    return cachedData;
  }

  // Busca os detalhes no scraper
  const details = await animeScraper.scrapeAnimeDetails(slug);

  // Se não encontrou detalhes, lança erro
  if (!details || typeof details !== "object") {
    throw new NotFoundError(
      "Detalhes do anime não encontrados."
    );
  }

  // Salva no cache
  setCache(cacheKey, details);

  // Retorna os detalhes
  return details;
};


// ===============================
// EPISÓDIOS DO ANIME
// ===============================
const fetchAnimeEpisodes = async (slug) => {
  // Valida o slug
  validateSlug(slug);

  // Monta a chave de cache
  const cacheKey = getAnimeEpisodesCacheKey(slug);

  // Tenta ler do cache
  const cachedData = getCache(cacheKey);

  // Se encontrou no cache, retorna direto
  if (cachedData) {
    return cachedData;
  }

  // Busca os episódios no scraper
  const episodes = await animeScraper.scrapeAnimeEpisodes(slug);

  // Se não encontrou episódios, lança erro
  if (!episodes || !Array.isArray(episodes) || episodes.length === 0) {
    throw new NotFoundError(
      "Nenhum episódio encontrado."
    );
  }

  // Salva no cache
  setCache(cacheKey, episodes);

  // Retorna os episódios
  return episodes;
};


// ===============================
// PLAYER DO EPISÓDIO
// ===============================
const fetchAnimeEpisodePlayer = async (
  slug,
  episodeNumber
) => {
  // Valida o slug
  validateSlug(slug);

  // Valida o número do episódio
  validateEpisodeNumber(episodeNumber);

  // Monta a chave de cache
  const cacheKey = getAnimePlayerCacheKey(
    slug,
    episodeNumber
  );

  // Tenta ler do cache
  const cachedData = getCache(cacheKey);

  // Se encontrou no cache, retorna direto
  if (cachedData) {
    return cachedData;
  }

  // Busca o player no scraper
  const player = await animeScraper.scrapeAnimeEpisodePlayer(
    slug,
    episodeNumber
  );

  // Se o scraper não retornou estrutura válida, lança erro
  if (!player || typeof player !== "object") {
    throw new NotFoundError(
      "Player do episódio não encontrado."
    );
  }

  // Garante estrutura mínima segura
  const normalizedPlayer = {
    title: player.title || `Episódio ${episodeNumber}`,
    slug: player.slug || slug,
    episodeNumber: Number(player.episodeNumber || episodeNumber),
    episodeUrl: player.episodeUrl || "",
    players: Array.isArray(player.players) ? player.players : []
  };

  // Salva no cache
  setCache(cacheKey, normalizedPlayer);

  // Retorna o player normalizado
  return normalizedPlayer;
};


// ===============================
// EXPORTAÇÃO
// ===============================
module.exports = {
  fetchAnimes,
  fetchAnimeDetails,
  fetchAnimeEpisodes,
  fetchAnimeEpisodePlayer
};