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


// ===============================
// BACKUP EM MEMÓRIA
// ===============================

// Guarda o último resultado válido em memória
// Isso protege a API quando a fonte externa bloquear temporariamente
const memoryBackup = {
  animes: null,
  animeDetails: new Map(),
  animeEpisodes: new Map(),
  animePlayers: new Map()
};


// ===============================
// HELPERS DE CACHE
// ===============================

// Monta a chave de cache da lista de animes
const getAnimesCacheKey = () => {
  return `${ANIME_CACHE_PREFIX}_list`;
};


// Monta a chave de cache dos detalhes do anime
const getAnimeDetailsCacheKey = (slug) => {
  return `${ANIME_CACHE_PREFIX}_details_${slug}`;
};


// Monta a chave de cache dos episódios do anime
const getAnimeEpisodesCacheKey = (slug) => {
  return `${ANIME_CACHE_PREFIX}_episodes_${slug}`;
};


// Monta a chave de cache do player do episódio
const getAnimePlayerCacheKey = (slug, episodeNumber) => {
  return `${ANIME_CACHE_PREFIX}_player_${slug}_${episodeNumber}`;
};


// Valida se o slug foi informado
const validateSlug = (slug) => {
  if (!slug || !String(slug).trim()) {
    throw new NotFoundError("Slug do anime não informado.");
  }
};


// Valida se o número do episódio foi informado
const validateEpisodeNumber = (episodeNumber) => {
  if (!episodeNumber || !String(episodeNumber).trim()) {
    throw new NotFoundError("Número do episódio não informado.");
  }
};


// Detecta se o erro atual parece bloqueio da fonte
const isSourceBlockedError = (error) => {
  const message = String(error?.message || "").toLowerCase();

  return (
    message.includes("html inválido") ||
    message.includes("bloqueado") ||
    message.includes("incompleto para a url") ||
    message.includes("cloudflare") ||
    message.includes("access denied") ||
    message.includes("request blocked")
  );
};


// Monta resposta padronizada com metadados internos
const buildServiceResponse = (data, options = {}) => {
  return {
    data,
    meta: {
      cached: Boolean(options.cached),
      fallback: Boolean(options.fallback),
      sourceBlocked: Boolean(options.sourceBlocked),
      source: options.source || "live"
    }
  };
};


// ===============================
// LISTAR ANIMES
// ===============================
const fetchAnimes = async () => {
  const cacheKey = getAnimesCacheKey();

  const cachedData = getCache(cacheKey);

  if (cachedData) {
    return buildServiceResponse(cachedData, {
      cached: true,
      fallback: false,
      sourceBlocked: false,
      source: "cache"
    });
  }

  try {
    const animes = await animeScraper.scrapeHome();

    if (!animes || !Array.isArray(animes) || animes.length === 0) {
      throw new NotFoundError("Nenhum anime encontrado no site.");
    }

    setCache(cacheKey, animes);

    memoryBackup.animes = animes;

    return buildServiceResponse(animes, {
      cached: false,
      fallback: false,
      sourceBlocked: false,
      source: "live"
    });
  } catch (error) {
    if (memoryBackup.animes && Array.isArray(memoryBackup.animes) && memoryBackup.animes.length > 0) {
      return buildServiceResponse(memoryBackup.animes, {
        cached: false,
        fallback: true,
        sourceBlocked: isSourceBlockedError(error),
        source: "memory_backup"
      });
    }

    throw error;
  }
};


// ===============================
// DETALHES DO ANIME
// ===============================
const fetchAnimeDetails = async (slug) => {
  validateSlug(slug);

  const cacheKey = getAnimeDetailsCacheKey(slug);

  const cachedData = getCache(cacheKey);

  if (cachedData) {
    return buildServiceResponse(cachedData, {
      cached: true,
      fallback: false,
      sourceBlocked: false,
      source: "cache"
    });
  }

  try {
    const details = await animeScraper.scrapeAnimeDetails(slug);

    if (!details || typeof details !== "object") {
      throw new NotFoundError("Detalhes do anime não encontrados.");
    }

    setCache(cacheKey, details);

    memoryBackup.animeDetails.set(slug, details);

    return buildServiceResponse(details, {
      cached: false,
      fallback: false,
      sourceBlocked: false,
      source: "live"
    });
  } catch (error) {
    const backup = memoryBackup.animeDetails.get(slug);

    if (backup) {
      return buildServiceResponse(backup, {
        cached: false,
        fallback: true,
        sourceBlocked: isSourceBlockedError(error),
        source: "memory_backup"
      });
    }

    throw error;
  }
};


// ===============================
// EPISÓDIOS DO ANIME
// ===============================
const fetchAnimeEpisodes = async (slug) => {
  validateSlug(slug);

  const cacheKey = getAnimeEpisodesCacheKey(slug);

  const cachedData = getCache(cacheKey);

  if (cachedData) {
    return buildServiceResponse(cachedData, {
      cached: true,
      fallback: false,
      sourceBlocked: false,
      source: "cache"
    });
  }

  try {
    const episodes = await animeScraper.scrapeAnimeEpisodes(slug);

    if (!episodes || !Array.isArray(episodes) || episodes.length === 0) {
      throw new NotFoundError("Nenhum episódio encontrado.");
    }

    setCache(cacheKey, episodes);

    memoryBackup.animeEpisodes.set(slug, episodes);

    return buildServiceResponse(episodes, {
      cached: false,
      fallback: false,
      sourceBlocked: false,
      source: "live"
    });
  } catch (error) {
    const backup = memoryBackup.animeEpisodes.get(slug);

    if (backup && Array.isArray(backup) && backup.length > 0) {
      return buildServiceResponse(backup, {
        cached: false,
        fallback: true,
        sourceBlocked: isSourceBlockedError(error),
        source: "memory_backup"
      });
    }

    throw error;
  }
};


// ===============================
// PLAYER DO EPISÓDIO
// ===============================
const fetchAnimeEpisodePlayer = async (slug, episodeNumber) => {
  validateSlug(slug);
  validateEpisodeNumber(episodeNumber);

  const cacheKey = getAnimePlayerCacheKey(slug, episodeNumber);

  const cachedData = getCache(cacheKey);

  if (cachedData) {
    return buildServiceResponse(cachedData, {
      cached: true,
      fallback: false,
      sourceBlocked: false,
      source: "cache"
    });
  }

  try {
    const player = await animeScraper.scrapeAnimeEpisodePlayer(slug, episodeNumber);

    if (!player || typeof player !== "object") {
      throw new NotFoundError("Player do episódio não encontrado.");
    }

    const normalizedPlayer = {
      title: player.title || `Episódio ${episodeNumber}`,
      slug: player.slug || slug,
      episodeNumber: Number(player.episodeNumber || episodeNumber),
      episodeUrl: player.episodeUrl || "",
      players: Array.isArray(player.players) ? player.players : []
    };

    setCache(cacheKey, normalizedPlayer);

    memoryBackup.animePlayers.set(`${slug}_${episodeNumber}`, normalizedPlayer);

    return buildServiceResponse(normalizedPlayer, {
      cached: false,
      fallback: false,
      sourceBlocked: false,
      source: "live"
    });
  } catch (error) {
    const backup = memoryBackup.animePlayers.get(`${slug}_${episodeNumber}`);

    if (backup) {
      return buildServiceResponse(backup, {
        cached: false,
        fallback: true,
        sourceBlocked: isSourceBlockedError(error),
        source: "memory_backup"
      });
    }

    throw error;
  }
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