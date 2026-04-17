// Importa o axios para fazer proxy de vídeo
const axios = require("axios");

// Importa o service responsável pelas regras de negócio do módulo de anime
const animeService = require("../services/anime.service");

// Função auxiliar para evitar resposta duplicada após timeout
const shouldStopResponse = (req, res) => {
  return req.timedout || res.headersSent;
};

// =========================
// HOME ESTRUTURADA
// =========================
const getAnimeHomeSections = async (req, res) => {
  // Impede cache HTTP da home
  res.setHeader("Cache-Control", "no-store");

  // Busca os blocos da home no service
  const data = await animeService.fetchAnimeHomeSections();

  // Se o timeout já respondeu, não responde de novo
  if (shouldStopResponse(req, res)) {
    return;
  }

  // Retorna resposta padronizada
  return res.status(200).json({
    success: true,
    type: "anime_home",
    data: data
  });
};

// =========================
// LISTAR ANIMES COM PAGINAÇÃO / LETRA / GÊNERO / TIPO
// =========================
const getAnimes = async (req, res) => {
  // Impede cache HTTP da listagem
  res.setHeader("Cache-Control", "no-store");

  // Lê página enviada na query
  const page = req.query.page;

  // Lê letra enviada na query
  const letter = req.query.letter;

  // Lê gênero enviado na query
  const genre = req.query.genre;

  // Lê tipo de listagem enviado na query
  const listType = req.query.type;

  // Busca a lista paginada e filtrada
  const result = await animeService.fetchAnimes({
    page,
    letter,
    genre,
    type: listType
  });

  // Se o timeout já respondeu, não responde de novo
  if (shouldStopResponse(req, res)) {
    return;
  }

  // Calcula a quantidade real de itens desta página
  const itemsOnPage = Array.isArray(result.data)
    ? result.data.length
    : 0;

  // Retorna resposta padronizada da API
  return res.status(200).json({
    success: true,
    type: "anime",
    page: result.page,
    totalPages: result.totalPages,
    hasNextPage: result.hasNextPage,
    hasPreviousPage: result.hasPreviousPage,
    filters: {
      letter: result.letter,
      genre: result.genre,
      type: result.type || ""
    },

    // Mantém compatibilidade com o frontend atual
    total: itemsOnPage,

    // Novo campo mais claro para uso profissional
    itemsOnPage: itemsOnPage,

    data: result.data
  });
};

// =========================
// BUSCA DE ANIMES POR NOME
// =========================
const searchAnimes = async (req, res) => {
  // Lê o termo enviado pelo usuário
  const query = req.query.q;

  // Lê a página enviada na query
  const page = req.query.page;

  // Busca os resultados no service
  const result = await animeService.searchAnimes({
    query,
    page
  });

  // Se o timeout já respondeu, não responde de novo
  if (shouldStopResponse(req, res)) {
    return;
  }

  // Calcula a quantidade real de itens desta página
  const itemsOnPage = Array.isArray(result.data)
    ? result.data.length
    : 0;

  // Retorna resposta padronizada
  return res.status(200).json({
    success: true,
    type: "anime_search",
    query: result.query,
    page: result.page,
    totalPages: result.totalPages,
    hasNextPage: result.hasNextPage,
    hasPreviousPage: result.hasPreviousPage,

    // Mantém compatibilidade
    total: itemsOnPage,

    // Campo novo mais claro
    itemsOnPage: itemsOnPage,

    data: result.data
  });
};

// =========================
// LISTA DE GÊNEROS
// =========================
const getAnimeGenres = async (req, res) => {
  // Busca a lista de gêneros no service
  const data = await animeService.fetchAnimeGenres();

  // Se o timeout já respondeu, não responde de novo
  if (shouldStopResponse(req, res)) {
    return;
  }

  // Retorna resposta padronizada
  return res.status(200).json({
    success: true,
    type: "anime_genres",
    total: data.length,
    itemsOnPage: data.length,
    data
  });
};

// =========================
// DETALHES DO ANIME
// =========================
const getAnimeDetails = async (req, res) => {
  // Obtém o slug enviado na URL
  const { slug } = req.params;

  // Busca os detalhes completos do anime
  const data = await animeService.fetchAnimeDetails(slug);

  // Se o timeout já respondeu, não responde de novo
  if (shouldStopResponse(req, res)) {
    return;
  }

  // Retorna resposta padronizada da API
  return res.status(200).json({
    success: true,
    type: "anime",
    data: data
  });
};

// =========================
// LISTAR EPISÓDIOS DO ANIME
// =========================
const getAnimeEpisodes = async (req, res) => {
  // Obtém o slug enviado na URL
  const { slug } = req.params;

  // Busca a lista de episódios no service
  const data = await animeService.fetchAnimeEpisodes(slug);

  // Se o timeout já respondeu, não responde de novo
  if (shouldStopResponse(req, res)) {
    return;
  }

  // Calcula a quantidade real de episódios retornados
  const itemsOnPage = Array.isArray(data)
    ? data.length
    : 0;

  // Retorna resposta padronizada da API
  return res.status(200).json({
    success: true,
    type: "anime",
    total: itemsOnPage,
    itemsOnPage: itemsOnPage,
    data: data
  });
};

// =========================
// PLAYER / PROVEDORES DO EPISÓDIO
// =========================
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

  // Se o timeout já respondeu, não responde de novo
  if (shouldStopResponse(req, res)) {
    return;
  }

  // Retorna resposta padronizada da API
  return res.status(200).json({
    success: true,
    type: "anime",
    data: data
  });
};

// Função responsável por fazer o streaming interno do episódio
const streamAnimeEpisode = async (req, res) => {
  try {
    // Extrai slug e número do episódio da rota
    const { slug, episodeNumber } = req.params;

    // Valida dados básicos
    if (!slug || !episodeNumber) {
      return res.status(400).json({
        success: false,
        error: "Slug ou número do episódio inválido."
      });
    }

    // Busca os dados do player usando o service correto
    const data = await animeService.fetchAnimeEpisodePlayer(
      slug,
      episodeNumber
    );

    // Se o timeout já respondeu, não responde de novo
    if (shouldStopResponse(req, res)) {
      return;
    }

    // Extrai lista de players
    const players = data?.players || [];

    // Se não houver players
    if (!players.length) {
      return res.status(404).json({
        success: false,
        error: "Player não encontrado."
      });
    }

    // Tenta primeiro download
    const downloadPlayer =
      players.find(
        (item) =>
          item?.type === "download" &&
          item?.url
      ) || null;

    // Depois tenta stream
    const streamPlayer =
      players.find(
        (item) =>
          item?.type === "stream" &&
          item?.url
      ) || null;

    // Define player inicial
    const initialPlayer =
      downloadPlayer || streamPlayer || null;

    // Se não encontrou URL válida
    if (!initialPlayer?.url) {
      return res.status(404).json({
        success: false,
        error: "URL inicial do vídeo não encontrada."
      });
    }

    // URL que será realmente transmitida
    let finalVideoUrl = initialPlayer.url;

    // Se ainda for uma página HTML do AnimeFire, resolve a qualidade real
    if (
      /animefire\.io/i.test(finalVideoUrl) &&
      !/\.mp4(\?|$)/i.test(finalVideoUrl)
    ) {
      // Busca o HTML da página de qualidade
      const qualityPageResponse = await axios({
        method: "GET",
        url: finalVideoUrl,
        responseType: "text",
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/135.0.0.0 Safari/537.36",
          Referer: "https://animefire.io/",
          Origin: "https://animefire.io",
          Accept:
            "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8"
        },
        validateStatus: () => true
      });

      // Se o timeout já respondeu, não responde de novo
      if (shouldStopResponse(req, res)) {
        return;
      }

      // Se a página de qualidade falhou
      if (qualityPageResponse.status >= 400) {
        return res.status(502).json({
          success: false,
          error: "Falha ao abrir a página de qualidade do vídeo."
        });
      }

      // HTML bruto da página
      const html = String(qualityPageResponse.data || "");

      // Extrai possíveis links mp4 reais
      const mp4Matches = [
        ...html.matchAll(/https?:\/\/[^"'\\\s<>]+\.mp4[^"'\\\s<>]*/gi)
      ].map((match) => match[0]);

      // Remove duplicados
      const uniqueMp4Links = Array.from(new Set(mp4Matches));

      // Se não encontrou nenhum mp4
      if (!uniqueMp4Links.length) {
        return res.status(404).json({
          success: false,
          error: "Não foi possível extrair o link final do vídeo."
        });
      }

      // Prioriza F-HD, depois HD, depois SD
      const fhdLink =
        uniqueMp4Links.find((link) =>
          /\/f-?hd\/|\/fullhd\/|\/1080\//i.test(link)
        ) || null;

      const hdLink =
        uniqueMp4Links.find((link) =>
          /\/hd\/|\/720\//i.test(link)
        ) || null;

      const sdLink =
        uniqueMp4Links.find((link) =>
          /\/sd\/|\/480\/|\/360\//i.test(link)
        ) || null;

      // Define link final priorizando melhor qualidade
      finalVideoUrl =
        fhdLink ||
        hdLink ||
        sdLink ||
        uniqueMp4Links[0];
    }

    // Se mesmo após resolver ainda não houver mp4 válido
    if (!finalVideoUrl || !/^https?:\/\//i.test(finalVideoUrl)) {
      return res.status(404).json({
        success: false,
        error: "Link final do vídeo inválido."
      });
    }

    // Lê range enviado pelo navegador
    const range = req.headers.range;

    // Faz requisição remota do vídeo real como stream
    const response = await axios({
      method: "GET",
      url: finalVideoUrl,
      responseType: "stream",
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/135.0.0.0 Safari/537.36",
        Referer: "https://animefire.io/",
        Origin: "https://animefire.io",
        Accept: "*/*",
        ...(range ? { Range: range } : {})
      },
      validateStatus: () => true
    });

    // Se o timeout já respondeu, não responde de novo
    if (shouldStopResponse(req, res)) {
      return;
    }

    // Se remoto respondeu erro
    if (response.status >= 400) {
      return res.status(502).json({
        success: false,
        error: "Falha ao carregar o vídeo remoto."
      });
    }

    // Libera CORS para o frontend local
    res.setHeader(
      "Access-Control-Allow-Origin",
      "http://localhost:5173"
    );
    res.setHeader(
      "Access-Control-Allow-Methods",
      "GET,HEAD,OPTIONS"
    );
    res.setHeader(
      "Access-Control-Allow-Headers",
      "Range, Content-Type"
    );
    res.setHeader(
      "Access-Control-Expose-Headers",
      "Content-Length, Content-Range, Accept-Ranges, Content-Type"
    );
    res.setHeader(
      "Cross-Origin-Resource-Policy",
      "cross-origin"
    );

    // Define status da resposta
    res.status(response.status);

    // Copia headers importantes
    if (response.headers["content-type"]) {
      res.setHeader(
        "Content-Type",
        response.headers["content-type"]
      );
    } else {
      res.setHeader("Content-Type", "video/mp4");
    }

    if (response.headers["content-length"]) {
      res.setHeader(
        "Content-Length",
        response.headers["content-length"]
      );
    }

    if (response.headers["content-range"]) {
      res.setHeader(
        "Content-Range",
        response.headers["content-range"]
      );
    }

    if (response.headers["accept-ranges"]) {
      res.setHeader(
        "Accept-Ranges",
        response.headers["accept-ranges"]
      );
    } else {
      res.setHeader("Accept-Ranges", "bytes");
    }

    if (response.headers["cache-control"]) {
      res.setHeader(
        "Cache-Control",
        response.headers["cache-control"]
      );
    }

    if (response.headers["last-modified"]) {
      res.setHeader(
        "Last-Modified",
        response.headers["last-modified"]
      );
    }

    if (response.headers["etag"]) {
      res.setHeader(
        "ETag",
        response.headers["etag"]
      );
    }

    // Envia stream do vídeo real para o navegador
    response.data.pipe(res);
  } catch (error) {
    // Se a resposta já foi enviada, não tenta responder de novo
    if (res.headersSent || req.timedout) {
      return;
    }

    console.error("[STREAM ERROR]", error.message);

    return res.status(500).json({
      success: false,
      error: "Erro ao fazer streaming do vídeo."
    });
  }
};

// =========================
// HEALTH CHECK DO MÓDULO
// =========================
const getAnimeHealth = async (req, res) => {
  // Retorna informações básicas do módulo
  return res.status(200).json({
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
  getAnimeHomeSections,
  getAnimes,
  searchAnimes,
  getAnimeGenres,
  getAnimeDetails,
  getAnimeEpisodes,
  getAnimeEpisodePlayer,
  streamAnimeEpisode,
  getAnimeHealth
};