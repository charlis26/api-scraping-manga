// Importa o axios para fazer requisições HTTP
const axios = require("axios");

// Importa o cheerio para ler e navegar no HTML
const cheerio = require("cheerio");

// Importa o chromium do Playwright para renderizar páginas dinâmicas
const { chromium } = require("playwright");

// Importa a configuração central do módulo de anime
const { BASE_URL } = require("../config/anime.config");


// ===============================
// FUNÇÕES AUXILIARES
// ===============================

// Remove espaços duplicados e limpa o texto
const cleanText = (text = "") => {
  // Converte para string, remove espaços extras e limpa as pontas
  return String(text).replace(/\s+/g, " ").trim();
};


// Converte URL relativa em absoluta
const toAbsoluteUrl = (url = "") => {
  // Se não existir URL, retorna string vazia
  if (!url) {
    return "";
  }

  // Se já for absoluta, retorna direto
  if (/^https?:\/\//i.test(url)) {
    return url;
  }

  // Se começar com dupla barra, adiciona protocolo
  if (url.startsWith("//")) {
    return `https:${url}`;
  }

  // Se começar com barra, concatena com a base
  if (url.startsWith("/")) {
    return `${BASE_URL}${url}`;
  }

  // Caso contrário, adiciona manualmente
  return `${BASE_URL}/${url}`;
};


// Extrai slug do anime a partir da URL
const getAnimeSlugFromUrl = (url = "") => {
  // Normaliza removendo barras finais
  const normalizedUrl = String(url).replace(/\/+$/, "");

  // Tenta padrões comuns
  const match =
    normalizedUrl.match(/\/anime\/([^/?#]+)/i) ||
    normalizedUrl.match(/\/animes\/([^/?#]+)/i);

  // Se encontrou, retorna o slug
  if (match && match[1]) {
    return cleanText(match[1]);
  }

  // Divide em partes como fallback
  const parts = normalizedUrl.split("/").filter(Boolean);

  // Retorna a última parte
  return parts[parts.length - 1] || "";
};


// Extrai número do episódio a partir da URL
const getEpisodeNumberFromUrl = (url = "") => {
  // Normaliza removendo barras finais
  const normalizedUrl = String(url).replace(/\/+$/, "");

  // Procura padrões mais comuns
  const match =
    normalizedUrl.match(/episodio-(\d+)(?:[/?#]|$)/i) ||
    normalizedUrl.match(/epis[oó]dio[-\/]?(\d+)(?:[/?#]|$)/i) ||
    normalizedUrl.match(/episode[-\/]?(\d+)(?:[/?#]|$)/i) ||
    normalizedUrl.match(/ep[-\/]?(\d+)(?:[/?#]|$)/i) ||
    normalizedUrl.match(/\/(\d+)(?:[/?#]|$)/i);

  // Se encontrou, retorna número
  if (match && match[1]) {
    return Number(match[1]);
  }

  // Se não encontrou, retorna null
  return null;
};


// Extrai número do episódio a partir do texto
const getEpisodeNumberFromText = (text = "") => {
  // Limpa o texto
  const normalizedText = cleanText(text);

  // Procura padrões comuns
  const match =
    normalizedText.match(/epis[oó]dio\s*(\d+)/i) ||
    normalizedText.match(/\bep\.?\s*(\d+)/i) ||
    normalizedText.match(/\bepis[oó]dio[-\s]*(\d+)/i);

  // Se encontrou, retorna número
  if (match && match[1]) {
    return Number(match[1]);
  }

  // Caso contrário, retorna null
  return null;
};


// Busca conteúdo de metatag
const getMetaContent = ($, selector) => {
  // Busca o atributo content
  const value = $(selector).attr("content");

  // Retorna limpo
  return cleanText(value || "");
};


// Remove frases comerciais e sujeira do título
const normalizeAnimeTitle = (title = "") => {
  // Limpa o texto base
  let normalizedTitle = cleanText(title);

  // Remove frases comuns do site
  normalizedTitle = normalizedTitle
    .replace(/\s+Todos\s+os\s+Epis[oó]dios\s+Online.*$/i, "")
    .replace(/\s+Todos\s+epis[oó]dios.*$/i, "")
    .replace(/\s+Assistir\s+.*$/i, "")
    .replace(/\s+Online.*$/i, "")
    .replace(/\s+\|\s+.*$/i, "")
    .replace(/\s+-\s+.*$/i, "")
    .trim();

  // Retorna o título limpo
  return normalizedTitle;
};


// Remove lixo de interface e propaganda da sinopse
// Remove lixo de interface e propaganda da sinopse
const cleanSynopsisText = (text = "", animeTitle = "") => {
  // Guarda texto base
  let cleaned = String(text);

  // Remove scripts e rastros técnicos
  cleaned = cleaned
    .replace(/aclib\.runBanner.*?\);?/gis, "")
    .replace(/window\.[\s\S]*?;/gis, "")
    .replace(/document\.[\s\S]*?;/gis, "")
    .replace(/<script.*?>.*?<\/script>/gis, "");

  // Remove frases comerciais comuns
  cleaned = cleaned
    .replace(/todos\s+os\s+epis[oó]dios\s+online/gi, "")
    .replace(/todos\s+epis[oó]dios.*$/gi, "")
    .replace(/assistir\s+.*?\s+online/gi, "")
    .replace(/anime\s+completo/gi, "")
    .replace(/epis[oó]dios\s+dublados?/gi, "")
    .replace(/epis[oó]dios\s+legendados?/gi, "")
    .replace(/veja\s+online/gi, "")
    .replace(/assista\s+online/gi, "");

  // Remove repetição promocional do título
  if (animeTitle) {
    const escapedTitle = animeTitle.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

    cleaned = cleaned.replace(
      new RegExp(`${escapedTitle}\\s*,?\\s*\\.?\\s*`, "i"),
      ""
    );
  }

  // Normaliza espaços
  cleaned = cleanText(cleaned);

  // Remove pontuação feia no começo
  cleaned = cleaned
    .replace(/^[,.;:\- ]+/, "")
    .replace(/\s+[,.;:]/g, (match) => match.trim())
    .replace(/,\s*\./g, ".")
    .replace(/\.\s*,/g, ".")
    .trim();

  // Se a sinopse ficou muito curta, zera
  if (cleaned.length < 20) {
    return "";
  }

  // Retorna resultado final
  return cleaned;
};


// Tenta obter imagem por múltiplos atributos
const getImageFromElement = ($, element) => {
  // Busca imagem em vários atributos
  const image =
    $(element).find("img").first().attr("src") ||
    $(element).find("img").first().attr("data-src") ||
    $(element).find("img").first().attr("data-lazy-src") ||
    $(element).find("img").first().attr("data-original") ||
    $(element).closest("article").find("img").first().attr("src") ||
    $(element).closest("div").find("img").first().attr("src") ||
    "";

  // Retorna absoluta
  return toAbsoluteUrl(image);
};


// Deduplica itens por link
const uniqueByLink = (items = []) => {
  // Cria mapa auxiliar
  const map = new Map();

  // Percorre os itens
  items.forEach((item) => {
    // Ignora item inválido
    if (!item || !item.link) {
      return;
    }

    // Se ainda não existe, salva
    if (!map.has(item.link)) {
      map.set(item.link, item);
    }
  });

  // Retorna os valores únicos
  return Array.from(map.values());
};


// Verifica se um link parece ser página de anime
const looksLikeAnimeLink = (link = "") => {
  // Normaliza o link
  const normalizedLink = String(link).replace(/\/+$/, "").toLowerCase();

  // Ignora links vazios
  if (!normalizedLink) {
    return false;
  }

  // Precisa parecer rota de anime
  if (
    normalizedLink.includes("/anime/") ||
    normalizedLink.includes("/animes/")
  ) {
    // Não pode parecer episódio
    if (
      normalizedLink.includes("/episodio") ||
      normalizedLink.includes("/episode") ||
      /\/\d+$/.test(normalizedLink)
    ) {
      return false;
    }

    return true;
  }

  // Caso contrário, não parece anime
  return false;
};


// Verifica se um link parece episódio
const looksLikeEpisodeLink = (link = "", slug = "") => {
  // Normaliza o link
  const normalizedLink = String(link)
    .replace(/\/+$/, "")
    .toLowerCase();

  // Normaliza o slug
  const normalizedSlug = String(slug).toLowerCase();

  // Precisa conter slug quando informado
  if (normalizedSlug && !normalizedLink.includes(normalizedSlug)) {
    return false;
  }

  // Precisa parecer episódio
  if (
    normalizedLink.includes("/episodio/") ||
    /episodio-\d+/i.test(normalizedLink) ||
    /epis[oó]dio/i.test(normalizedLink) ||
    /episode/i.test(normalizedLink) ||
    /\/\d+(?:[/?#]|$)/i.test(normalizedLink)
  ) {
    return true;
  }

  // Caso contrário, não parece episódio
  return false;
};


// Verifica se um item parece gênero válido
const isValidGenre = (genre = "") => {
  // Limpa o texto
  const normalizedGenre = cleanText(genre);

  // Bloqueia vazio
  if (!normalizedGenre) {
    return false;
  }

  // Bloqueia letras soltas
  if (/^[A-ZÀ-ÿ]$/i.test(normalizedGenre)) {
    return false;
  }

  // Bloqueia números puros
  if (/^\d+$/.test(normalizedGenre)) {
    return false;
  }

  // Bloqueia padrões de navegação por letra
  if (/^letra\s+[a-z]$/i.test(normalizedGenre)) {
    return false;
  }

  // Bloqueia termos que não são gênero
  const blockedGenres = [
    "A",
    "B",
    "C",
    "D",
    "E",
    "F",
    "G",
    "H",
    "I",
    "J",
    "K",
    "L",
    "M",
    "N",
    "O",
    "P",
    "Q",
    "R",
    "S",
    "T",
    "U",
    "V",
    "W",
    "X",
    "Y",
    "Z",
    "0-9",
    "Legendado",
    "Dublado",
    "Completo",
    "Filme",
    "OVA",
    "ONA",
    "Todos",
    "Online",
    "Assistir"
  ];

  // Bloqueia lista fixa
  if (blockedGenres.includes(normalizedGenre)) {
    return false;
  }

  // Bloqueia textos muito longos
  if (normalizedGenre.length > 30) {
    return false;
  }

  // Se passou, é válido
  return true;
};


// Filtra e normaliza gêneros
const normalizeGenres = (genres = []) => {
  // Guarda gêneros válidos
  const uniqueGenres = [];

  // Percorre todos
  genres.forEach((genre) => {
    // Limpa
    const normalizedGenre = cleanText(genre);

    // Valida
    if (!isValidGenre(normalizedGenre)) {
      return;
    }

    // Evita duplicado
    if (!uniqueGenres.includes(normalizedGenre)) {
      uniqueGenres.push(normalizedGenre);
    }
  });

  // Retorna lista final
  return uniqueGenres;
};


// Tenta limpar o título alternativo
const normalizeAlternativeTitle = (text = "", mainTitle = "") => {
  // Limpa texto base
  let normalizedText = cleanText(text);

  // Remove frases comerciais comuns
  normalizedText = normalizedText
    .replace(/todos\s+epis[oó]dios.*$/i, "")
    .replace(/todos\s+os\s+epis[oó]dios.*$/i, "")
    .replace(/assistir\s+.*$/i, "")
    .replace(/online.*$/i, "")
    .trim();

  // Se ficar igual ao título principal, zera
  if (
    normalizedText &&
    mainTitle &&
    normalizedText.toLowerCase() === mainTitle.toLowerCase()
  ) {
    return "";
  }

  // Se ficar muito curto, ignora
  if (normalizedText.length < 2) {
    return "";
  }

  // Retorna título alternativo limpo
  return normalizedText;
};


// Detecta nome melhor para o player
const detectPlayerServerName = (url = "", fallback = "player") => {
  // Normaliza a URL
  const normalizedUrl = String(url).toLowerCase();

  // Detecta provedores conhecidos
  if (normalizedUrl.includes("blogger.com")) {
    return "blogger";
  }

  if (normalizedUrl.includes("googleusercontent.com")) {
    return "googleusercontent";
  }

  if (normalizedUrl.includes("/wp-json/oembed/")) {
    return "wordpress_oembed";
  }

  if (normalizedUrl.includes("youtube.com") || normalizedUrl.includes("youtu.be")) {
    return "youtube";
  }

  if (normalizedUrl.includes("ok.ru")) {
    return "okru";
  }

  if (normalizedUrl.includes("stream") && normalizedUrl.includes(".m3u8")) {
    return "m3u8_stream";
  }

  if (normalizedUrl.includes(".mp4")) {
    return "mp4_direct";
  }

  // Retorna fallback
  return fallback;
};


// Monta headers padrão
const createHeaders = () => {
  // Retorna headers realistas
  return {
    "User-Agent":
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36",
    "Accept":
      "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8",
    "Accept-Language":
      "pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7",
    "Referer":
      BASE_URL
  };
};


// Faz requisição HTTP com axios
const fetchHtmlWithAxios = async (url) => {
  // Faz a requisição
  const response = await axios.get(url, {
    timeout: 12000,
    maxRedirects: 5,
    validateStatus: () => true,
    headers: createHeaders()
  });

  // Retorna HTML se vier string
  return typeof response.data === "string"
    ? response.data
    : "";
};


// Faz requisição renderizada com Playwright
const fetchHtmlWithPlaywright = async (url) => {
  let browser = null;

  try {
    browser = await chromium.launch({
      headless: true,
      args: [
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--disable-blink-features=AutomationControlled"
      ]
    });

    const context = await browser.newContext({
      userAgent:
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      viewport: {
        width: 1366,
        height: 768
      },
      locale: "pt-BR",
      extraHTTPHeaders: {
        "Accept-Language":
          "pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7",
        "Referer":
          BASE_URL
      }
    });

    const page = await context.newPage();

    await page.addInitScript(() => {
      Object.defineProperty(navigator, "webdriver", {
        get: () => false
      });

      Object.defineProperty(navigator, "languages", {
        get: () => ["pt-BR", "pt", "en-US", "en"]
      });

      Object.defineProperty(navigator, "plugins", {
        get: () => [1, 2, 3, 4, 5]
      });
    });

    await page.goto(url, {
      waitUntil: "networkidle",
      timeout: 60000
    });

    await page.waitForTimeout(3000);

    const html = await page.content();

    await context.close();
    await browser.close();

    browser = null;

    return html;

  } catch (error) {
    if (browser) {
      await browser.close();
    }

    throw error;
  }
};


// Escolhe melhor estratégia de fetch
const fetchHtml = async (url, options = {}) => {
  // Define se deve preferir Playwright
  const preferPlaywright = Boolean(options.preferPlaywright);

  // Se pediu Playwright direto
  if (preferPlaywright) {
    return fetchHtmlWithPlaywright(url);
  }

  try {
    // Tenta primeiro com axios
    const html = await fetchHtmlWithAxios(url);

    // Se veio algo válido, retorna
    if (html && html.length > 0) {
      return html;
    }

    // Fallback para Playwright
    return fetchHtmlWithPlaywright(url);

  } catch (error) {
    // Se axios falhar, tenta Playwright
    return fetchHtmlWithPlaywright(url);
  }
};



const scrapeHome = async () => {
  // Define URL base
  const url = BASE_URL;

  // Busca HTML usando Playwright
  const html = await fetchHtml(url, {
    preferPlaywright: true
  });

  // Carrega HTML no Cheerio
  const $ = cheerio.load(html || "");

  // Array de animes encontrados
  const animes = [];

  // Evita duplicados
  const seenLinks = new Set();

  // Busca todos os links da página
  $("a[href]").each((index, element) => {
    const href = $(element).attr("href");

    if (!href) return;

    const link = toAbsoluteUrl(href);

    if (!looksLikeAnimeLink(link)) return;

    if (seenLinks.has(link)) return;

    seenLinks.add(link);

    const title = cleanText($(element).text());

    if (!title) return;

    animes.push({
      title,
      slug: getAnimeSlugFromUrl(link),
      link
    });
  });

  return animes;
};


// ===============================
// DETALHES DO ANIME
// ===============================
const scrapeAnimeDetails = async (slug) => {
  // Valida slug
  if (!slug) {
    throw new Error("Slug do anime não informado.");
  }

  // Monta possíveis URLs
  const possibleAnimeUrls = [
    `${BASE_URL}/anime/${slug}`,
    `${BASE_URL}/animes/${slug}`
  ];

  // Guarda melhor resultado
  let bestResult = null;

  // Tenta cada URL
  for (const animeUrl of possibleAnimeUrls) {
    try {
      // Busca HTML mais rápido
      const html = await fetchHtml(animeUrl, {
        preferPlaywright: false
      });

      // Se não veio HTML, continua
      if (!html) {
        continue;
      }

      // Carrega HTML
      const $ = cheerio.load(html);

      // Extrai título
      const title =
        normalizeAnimeTitle(
          cleanText($("h1").first().text()) ||
          getMetaContent($, 'meta[property="og:title"]') ||
          getMetaContent($, 'meta[name="twitter:title"]')
        );

      // Se não tem título, continua
      if (!title) {
        continue;
      }

      // Extrai título alternativo bruto
      const rawAlternativeTitle =
        cleanText($("h2").first().text()) ||
        cleanText($("h6").eq(1).text()) ||
        cleanText($("h6").eq(0).text());

      // Limpa título alternativo
      const alternativeTitle =
        normalizeAlternativeTitle(rawAlternativeTitle, title);

      // Extrai capa
      const cover = toAbsoluteUrl(
        $(".animeCover img").attr("src") ||
        $(".anime-cover img").attr("src") ||
        $(".capa img").attr("src") ||
        $("img").first().attr("src") ||
        getMetaContent($, 'meta[property="og:image"]')
      );

      // Extrai score
      const scoreText =
        cleanText($("h4").first().text()) ||
        cleanText($("[class*='score']").first().text());

      // Extrai sinopse bruta
      const rawSynopsis =
        cleanText($(".sinopse").text()) ||
        cleanText($("[class*='sinopse']").text()) ||
        cleanText($("[class*='synopsis']").text()) ||
        cleanText($(".description").text()) ||
        getMetaContent($, 'meta[property="og:description"]');

      // Limpa sinopse
      const synopsis = cleanSynopsisText(rawSynopsis, title);

      // Extrai gêneros
      const rawGenres = [];
      $("a[href*='/genero/'], a[href*='/genre/'], a[href*='/genres/']").each((index, element) => {
        // Lê o gênero bruto
        const genre = cleanText($(element).text());

        // Adiciona à lista bruta
        if (genre) {
          rawGenres.push(genre);
        }
      });

      // Normaliza a lista de gêneros
      const genres = normalizeGenres(rawGenres);

      // Extrai texto do body
      const bodyText = cleanText($("body").text());

      // Extrai metadados
      const seasonMatch =
        bodyText.match(/Temporada:\s*(.*?)(?=Estúdio|Estúdios|Áudio|Episódios|Status|Ano|$)/i);

      const studioMatch =
        bodyText.match(/Estúdios?:\s*(.*?)(?=Áudio|Episódios|Status|Dia de Lançamento|Ano|$)/i);

      const audioMatch =
        bodyText.match(/Áudio:\s*(.*?)(?=Episódios|Status|Dia de Lançamento|Ano|$)/i);

      const totalEpisodesMatch =
        bodyText.match(/Episódios:\s*(\d+)/i);

      const statusMatch =
        bodyText.match(/Status(?: do Anime)?:\s*(.*?)(?=Dia de Lançamento|Ano|$)/i);

      const releaseDayMatch =
        bodyText.match(/Dia de Lançamento:\s*(.*?)(?=Ano|$)/i);

      const yearMatch =
        bodyText.match(/Ano:\s*(\d{4})/i);

      // Monta resultado final
      bestResult = {
        title,
        alternativeTitle,
        slug,
        link: animeUrl,
        cover,
        synopsis,
        score: cleanText(scoreText),
        season: seasonMatch ? cleanText(seasonMatch[1]) : "",
        studio: studioMatch ? cleanText(studioMatch[1]) : "",
        audio: audioMatch ? cleanText(audioMatch[1]) : "",
        totalEpisodes: totalEpisodesMatch ? cleanText(totalEpisodesMatch[1]) : "",
        status: statusMatch ? cleanText(statusMatch[1]) : "",
        releaseDay: releaseDayMatch ? cleanText(releaseDayMatch[1]) : "",
        year: yearMatch ? cleanText(yearMatch[1]) : "",
        genres
      };

      // Se conseguiu, para
      break;

    } catch (error) {
      // Continua tentando próxima URL
      continue;
    }
  }

  // Se não encontrou nada, retorna null
  if (!bestResult) {
    return null;
  }

  // Retorna resultado
  return bestResult;
};


// ===============================
// EPISÓDIOS DO ANIME
// ===============================
const scrapeAnimeEpisodes = async (slug) => {
  // Valida slug
  if (!slug) {
    throw new Error("Slug do anime não informado.");
  }

  // Monta possíveis URLs
  const possibleAnimeUrls = [
    `${BASE_URL}/anime/${slug}`,
    `${BASE_URL}/animes/${slug}`
  ];

  // Guarda episódios encontrados
  const rawEpisodes = [];

  // Guarda links já vistos
  const seenLinks = new Set();

  // Tenta cada URL
  for (const animeUrl of possibleAnimeUrls) {
    try {
      // Busca HTML da página
      const html = await fetchHtml(animeUrl, {
        preferPlaywright: false
      });

      // Se não veio HTML, continua
      if (!html) {
        continue;
      }

      // Carrega HTML
      const $ = cheerio.load(html);

      // Procura links
      $("a[href]").each((index, element) => {
        // Obtém href
        const href = $(element).attr("href");

        // Converte em absoluta
        const link = toAbsoluteUrl(href);

        // Valida se parece episódio
        if (!looksLikeEpisodeLink(link, slug)) {
          return;
        }

        // Ignora duplicado
        if (seenLinks.has(link)) {
          return;
        }

        // Extrai título bruto
        const rawTitle =
          cleanText($(element).attr("title")) ||
          cleanText($(element).text()) ||
          cleanText($(element).closest("article").text()) ||
          cleanText($(element).closest("div").text());

        // Extrai número
        const episodeNumber =
          getEpisodeNumberFromText(rawTitle) ||
          getEpisodeNumberFromUrl(link);

        // Ignora se não achou número
        if (!episodeNumber) {
          return;
        }

        // Marca link como visto
        seenLinks.add(link);

        // Adiciona episódio
        rawEpisodes.push({
          id: rawEpisodes.length + 1,
          number: episodeNumber,
          title: `Episódio ${episodeNumber}`,
          slug,
          link
        });
      });

      // Se encontrou episódios, pode parar
      if (rawEpisodes.length > 0) {
        break;
      }

    } catch (error) {
      // Continua tentando próxima URL
      continue;
    }
  }

  // Ordena por número
  rawEpisodes.sort((a, b) => a.number - b.number);

  // Deduplica por número
  const episodeMap = new Map();

  rawEpisodes.forEach((episode) => {
    // Monta chave
    const key = `ep_${episode.number}`;

    // Salva apenas o primeiro de cada número
    if (!episodeMap.has(key)) {
      episodeMap.set(key, episode);
    }
  });

  // Converte para array final
  const episodes = Array.from(episodeMap.values()).map((episode, index) => ({
    ...episode,
    id: index + 1
  }));

  // Retorna episódios
  return episodes;
};


// ===============================
// PLAYER DO EPISÓDIO
// ===============================
const scrapeAnimeEpisodePlayer = async (
  slug,
  episodeNumber
) => {
  // Valida slug
  if (!slug) {
    throw new Error("Slug do anime não informado.");
  }

  // Valida episódio
  if (!episodeNumber) {
    throw new Error("Número do episódio não informado.");
  }

  // Monta primeiro a URL real
  const realEpisodeUrl =
    `${BASE_URL}/episodio/${slug}-episodio-${episodeNumber}/`;

  // Mantém alguns fallbacks
  const possibleEpisodeUrls = [
    realEpisodeUrl,
    `${BASE_URL}/anime/${slug}/episodio/${episodeNumber}`,
    `${BASE_URL}/animes/${slug}/episodio/${episodeNumber}`,
    `${BASE_URL}/anime/${slug}/${episodeNumber}`,
    `${BASE_URL}/animes/${slug}/${episodeNumber}`
  ];

  // Guarda players
  const players = [];

  // Guarda vistos
  const seen = new Set();

  // Função auxiliar para adicionar player
  const pushPlayer = (server, type, url) => {
    // Ignora vazio
    if (!url) {
      return;
    }

    // Normaliza URL
    const finalUrl = toAbsoluteUrl(url);

    // Ignora duplicado
    if (seen.has(finalUrl)) {
      return;
    }

    // Marca como visto
    seen.add(finalUrl);

    // Detecta nome melhor do servidor
    const detectedServer = detectPlayerServerName(finalUrl, server);

    // Adiciona player
    players.push({
      server: cleanText(detectedServer || "player"),
      type: cleanText(type || "embed"),
      url: finalUrl
    });
  };

  // Tenta cada URL possível
  for (const episodeUrl of possibleEpisodeUrls) {
    try {
      // Busca HTML do episódio
      const html = await fetchHtml(episodeUrl, {
        preferPlaywright: false
      });

      // Se não veio HTML, tenta próxima
      if (!html) {
        continue;
      }

      // Carrega HTML
      const $ = cheerio.load(html);

      // Busca iframes
      $("iframe").each((index, element) => {
        const src = $(element).attr("src");
        pushPlayer(`iframe_${index + 1}`, "iframe", src);
      });

      // Busca vídeos diretos
      $("video").each((index, element) => {
        const src = $(element).attr("src");
        pushPlayer(`video_${index + 1}`, "video", src);
      });

      // Busca tags source
      $("video source, source").each((index, element) => {
        const src = $(element).attr("src");
        pushPlayer(`source_${index + 1}`, "video", src);
      });

      // Busca links em scripts inline
      const pageHtml = String(html);

      const regexMatches = [
        ...pageHtml.matchAll(/https?:\/\/[^\s"'<>]+\.m3u8[^\s"'<>]*/gi),
        ...pageHtml.matchAll(/https?:\/\/[^\s"'<>]+\.mp4[^\s"'<>]*/gi),
        ...pageHtml.matchAll(/https?:\/\/[^\s"'<>]+embed[^\s"'<>]*/gi)
      ];

      regexMatches.forEach((match, index) => {
        const value = match[0];

        if (/\.m3u8/i.test(value)) {
          pushPlayer(`script_${index + 1}`, "m3u8", value);
          return;
        }

        if (/\.mp4/i.test(value)) {
          pushPlayer(`script_${index + 1}`, "mp4", value);
          return;
        }

        pushPlayer(`script_${index + 1}`, "embed", value);
      });

      // Se encontrou players, retorna
      if (players.length > 0) {
        return {
          title: `Episódio ${episodeNumber}`,
          slug,
          episodeNumber: Number(episodeNumber),
          episodeUrl,
          players
        };
      }

    } catch (error) {
      // Continua tentando próxima
      continue;
    }
  }

  // Retorno seguro
  return {
    title: `Episódio ${episodeNumber}`,
    slug,
    episodeNumber: Number(episodeNumber),
    episodeUrl: realEpisodeUrl,
    players: []
  };
};


// ===============================
// EXPORTAÇÃO
// ===============================
module.exports = {
  scrapeHome,
  scrapeAnimeDetails,
  scrapeAnimeEpisodes,
  scrapeAnimeEpisodePlayer
};