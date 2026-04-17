// Importa o axios para fazer requisições HTTP
const axios = require("axios");

// Importa o cheerio para ler e navegar no HTML
const cheerio = require("cheerio");

// Importa o chromium do Playwright para renderizar páginas dinâmicas
const { chromium } = require("playwright");

// Importa a configuração central do módulo de anime
const { BASE_URL } = require("../config/anime.config");

// =========================
// CONTROLE DE CONCORRÊNCIA GLOBAL
// =========================

// Quantidade máxima de scraping simultâneo
const MAX_CONCURRENT_SCRAPES =
  Number(process.env.SCRAPER_MAX_CONCURRENT) || 2;

// Contador atual
let activeScrapes = 0;

// Fila de espera
const scrapeQueue = [];

// =========================
// DELAY ALEATÓRIO
// =========================

const randomDelay = async () => {
  // Intervalo mínimo
  const min =
    Number(process.env.SCRAPER_MIN_DELAY_MS) || 900;

  // Intervalo máximo
  const max =
    Number(process.env.SCRAPER_MAX_DELAY_MS) || 2200;

  // Calcula valor aleatório
  const delay =
    Math.floor(
      Math.random() * (max - min + 1)
    ) + min;

  console.log(
    `[SCRAPER] aguardando ${delay}ms`
  );

  return new Promise((resolve) => {
    setTimeout(resolve, delay);
  });
};

// =========================
// CONTROLE DE FILA
// =========================

const acquireSlot = async () => {
  // Se ainda há vaga
  if (activeScrapes < MAX_CONCURRENT_SCRAPES) {
    activeScrapes += 1;
    return;
  }

  // Caso contrário, espera na fila
  await new Promise((resolve) => {
    scrapeQueue.push(resolve);
  });

  activeScrapes += 1;
};

const releaseSlot = () => {
  activeScrapes -= 1;

  // Se há alguém esperando
  if (scrapeQueue.length > 0) {
    const next = scrapeQueue.shift();
    next();
  }
};

// ===============================
// CONSTANTES DE ORIGEM
// ===============================

// Página de top animes da AnimeFire
const MOST_VIEWED_URL = `${BASE_URL}/top-animes`;

// Página de episódios recentes da home antiga/atual
const EPISODES_FEED_URL = `${BASE_URL}`;

// Página de animes atualizados
const ANIME_LIST_URL = `${BASE_URL}/animes-atualizados`;

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

// Escapa texto para uso em regex
const escapeRegex = (text = "") => {
  return String(text).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
};

// Extrai partes do slug do anime a partir da URL
const getAnimeSlugPartsFromUrl = (url = "") => {
  // Normaliza removendo barras finais
  const normalizedUrl = String(url).replace(/\/+$/, "");

  // Tenta padrão de página de episódio
  const episodeMatch =
    normalizedUrl.match(/\/episodio\/([^/?#]+)/i);

  // Se encontrou rota de episódio
  if (episodeMatch && episodeMatch[1]) {
    // Guarda slug bruto do episódio
    const rawEpisodeSlug = cleanText(episodeMatch[1]);

    // Remove apenas o sufixo do episódio
    const seasonSlug = cleanText(
      rawEpisodeSlug.replace(/-episodio-\d+$/i, "")
    );

    // Remove o número final só para obter o anime-base
    const baseSlug = cleanText(
      seasonSlug.replace(/-\d+$/i, "")
    );

    return {
      seasonSlug,
      baseSlug,
      isEpisodeUrl: true
    };
  }

  // Tenta padrões comuns de página de anime
  const animeMatch =
    normalizedUrl.match(/\/anime\/([^/?#]+)/i) ||
    normalizedUrl.match(/\/animes\/([^/?#]+)/i);

  // Se encontrou
  if (animeMatch && animeMatch[1]) {
    const slug = cleanText(animeMatch[1]);

    return {
      seasonSlug: slug,
      baseSlug: slug.replace(/-\d+$/i, ""),
      isEpisodeUrl: false
    };
  }

  // Fallback
  const parts = normalizedUrl.split("/").filter(Boolean);
  const lastPart = parts[parts.length - 1] || "";

  return {
    seasonSlug: lastPart,
    baseSlug: lastPart.replace(/-\d+$/i, ""),
    isEpisodeUrl: false
  };
};

// Mantém compatibilidade com o resto do código
const getAnimeSlugFromUrl = (url = "") => {
  const slugParts = getAnimeSlugPartsFromUrl(url);

  return slugParts.seasonSlug || "";
};

// Extrai número da temporada a partir do slug da temporada
const getSeasonNumberFromSeasonSlug = (
  baseSlug = "",
  seasonSlug = ""
) => {
  // Normaliza valores
  const normalizedBaseSlug = cleanText(baseSlug);
  const normalizedSeasonSlug = cleanText(seasonSlug);

  // Se não houver slug da temporada, assume 1
  if (!normalizedSeasonSlug) {
    return 1;
  }

  // Se o slug da temporada for igual ao anime-base, é temporada 1
  if (normalizedSeasonSlug === normalizedBaseSlug) {
    return 1;
  }

  // Tenta detectar padrão "anime-2", "anime-3", etc
  const regex = new RegExp(
    `^${escapeRegex(normalizedBaseSlug)}-(\\d+)$`,
    "i"
  );

  const match = normalizedSeasonSlug.match(regex);

  // Se encontrou número de temporada no final
  if (match && match[1]) {
    const parsedSeason = Number(match[1]);

    if (Number.isFinite(parsedSeason) && parsedSeason >= 1) {
      return parsedSeason;
    }
  }

  // Fallback para temporada 1
  return 1;
};

// Extrai número da temporada a partir do link do episódio
const getSeasonNumberFromEpisodeLink = (
  baseSlug = "",
  url = ""
) => {
  // Extrai partes da URL
  const slugParts = getAnimeSlugPartsFromUrl(url);

  // Resolve baseSlug final
  const resolvedBaseSlug =
    cleanText(baseSlug) ||
    cleanText(slugParts.baseSlug);

  // Resolve seasonSlug final
  const resolvedSeasonSlug =
    cleanText(slugParts.seasonSlug);

  // Calcula a temporada
  return getSeasonNumberFromSeasonSlug(
    resolvedBaseSlug,
    resolvedSeasonSlug
  );
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
    .replace(/\/+$/, "") // remove barra final
    .toLowerCase();

  // Segurança básica: precisa existir link
  if (!normalizedLink) {
    return false;
  }

  // Regra principal:
  // Se contém /episodio/, já consideramos válido
  if (normalizedLink.includes("/episodio/")) {
    return true;
  }

  // Outras variações comuns
  if (
    /episodio-\d+/i.test(normalizedLink) ||
    /epis[oó]dio/i.test(normalizedLink) ||
    /episode/i.test(normalizedLink)
  ) {
    return true;
  }

  // Fallback:
  // detecta número no final da URL
  // exemplo:
  // /one-piece-1156
  if (/\/\d+(?:[/?#]|$)/i.test(normalizedLink)) {
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
  // guarda apenas gêneros válidos
  const uniqueGenres = [];

  genres.forEach((genre) => {
    const normalizedGenre = cleanText(genre);

    // ignora inválido
    if (!isValidGenre(normalizedGenre)) {
      return;
    }

    // evita duplicado
    if (!uniqueGenres.includes(normalizedGenre)) {
      uniqueGenres.push(normalizedGenre);
    }
  });

  // limita aos 3 principais
  return uniqueGenres.slice(0, 3);
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


// ===============================
// DETECTA PÁGINA 404 REAL
// ===============================
const isNotFoundPage = ($, html) => {

  // Se não veio HTML
  if (!html) {
    return true;
  }

  // Extrai título e h1
  const title = cleanText($("title").first().text());
  const h1 = cleanText($("h1").first().text());

  // Lista de padrões reais de 404
  const patterns404 = [
    "404",
    "not found",
    "página não encontrada",
    "pagina nao encontrada",
    "erro 404"
  ];

  // Verifica título
  const titleLooks404 = patterns404.some(pattern =>
    title.toLowerCase().includes(pattern)
  );

  // Verifica h1
  const h1Looks404 = patterns404.some(pattern =>
    h1.toLowerCase().includes(pattern)
  );

  // Se ambos indicam erro
  if (titleLooks404 && h1Looks404) {
    return true;
  }

  // Caso contrário, é página válida
  return false;
};

// Tenta encontrar a URL real/canônica da página do anime a partir da página do episódio
const resolveCanonicalAnimeDataFromEpisodeUrl = async (
  episodeUrl = ""
) => {
  // Se não houver URL válida, retorna vazio
  if (!episodeUrl) {
    return null;
  }

  try {
    // Busca HTML da página do episódio
    const html = await fetchHtml(episodeUrl, {
      preferPlaywright: false
    });

    // Se não veio HTML, retorna vazio
    if (!html) {
      return null;
    }

    // Carrega HTML
    const $ = cheerio.load(html);

    // Tenta achar canonical explícita do anime
    const canonicalCandidates = [
      $('link[rel="canonical"]').attr("href"),
      $('meta[property="og:url"]').attr("content"),
      $("a[href*='/anime/']").first().attr("href"),
      $(".breadcrumbs a[href*='/anime/']").last().attr("href"),
      $(".breadcrumb a[href*='/anime/']").last().attr("href"),
      $("nav a[href*='/anime/']").last().attr("href")
    ]
      .map((value) => toAbsoluteUrl(value || ""))
      .filter(Boolean);

    // Procura a primeira URL que realmente pareça página de anime
    const animeLink =
      canonicalCandidates.find((candidate) =>
        looksLikeAnimeLink(candidate)
      ) || "";

    // Se não encontrou link de anime, retorna vazio
    if (!animeLink) {
      return null;
    }

    // Extrai partes do slug real
    const slugParts = getAnimeSlugPartsFromUrl(animeLink);

    // Retorna dados resolvidos
    return {
      animeLink,
      slug: cleanText(slugParts.seasonSlug || ""),
      baseSlug: cleanText(slugParts.baseSlug || "")
    };
  } catch (error) {
    // Se der erro, retorna vazio
    return null;
  }
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

// Extrai nota numérica visível perto do card
const getScoreNearElement = ($, element) => {
  // Lê o texto do container mais próximo
  const containerText =
    cleanText($(element).closest("article").text()) ||
    cleanText($(element).closest("div").text()) ||
    cleanText($(element).parent().text()) ||
    "";

  // Procura padrão simples de nota
  const match = containerText.match(/\b(\d(?:\.\d)?)\b/);

  // Se encontrou, retorna texto da nota
  if (match && match[1]) {
    return cleanText(match[1]);
  }

  // Caso contrário, retorna vazio
  return "";
};

// Verifica se o texto parece lixo de navegação
const isGarbageTitle = (title = "") => {
  // Limpa o título
  const normalizedTitle = cleanText(title);

  // Bloqueia vazio
  if (!normalizedTitle) {
    return true;
  }

  // Bloqueia letras do filtro alfabético
  if (/^[A-Z]$/i.test(normalizedTitle)) {
    return true;
  }

  // Bloqueia palavras de navegação
  const blocked = [
    "ALL",
    "Inicio",
    "Lista de Animes",
    "Episodios",
    "Gêneros",
    "Contato",
    "DMCA",
    "Legendado",
    "Dublado"
  ];

  // Retorna se for bloqueado
  return blocked.includes(normalizedTitle);
};

// Monta um card de anime a partir de um link
const buildAnimeCardFromAnchor = ($, element) => {
  // Lê o href bruto do elemento
  const rawHref = $(element).attr("href") || "";

  // Se não houver href, ignora
  if (!rawHref) {
    return null;
  }

  // Limpa espaços
  let href = rawHref.trim();

  // Normaliza para URL absoluta sem duplicar domínio
  if (/^https?:\/\//i.test(href)) {
    // Já é absoluta, mantém
  } else {
    href = `${BASE_URL}${href.startsWith("/") ? "" : "/"}${href}`;
  }

  // Corrige eventual duplicação do domínio
  href = href.replace(
    /^(https?:\/\/[^/]+)\/\1/i,
    "$1"
  );

  // Extrai slug do anime
  const slugMatch = href.match(/\/animes\/([^/?#]+)/i);

  // Se não houver slug de anime, ignora
  if (!slugMatch) {
    return null;
  }

  const slug = cleanText(slugMatch[1] || "");

  // Se não houver slug válido, ignora
  if (!slug) {
    return null;
  }

  // Obtém título preferindo alt da imagem
  const title =
    cleanText(
      $(element).find("img").attr("alt") ||
      $(element).attr("title") ||
      $(element).text()
    ) || slug;

  // Obtém capa
  let cover =
    $(element).find("img").attr("src") ||
    $(element).find("img").attr("data-src") ||
    $(element).find("source").attr("srcset") ||
    "";

  // Normaliza capa para absoluta
  if (cover && !/^https?:\/\//i.test(cover)) {
    cover = `${BASE_URL}${cover.startsWith("/") ? "" : "/"}${cover}`;
  }

  return {
    title,
    slug,
    link: href,
    cover
  };
};

// Monta um item bruto de episódio a partir de um link
const buildEpisodeFeedItemFromAnchor = ($, element) => {
  // Obtém href bruto
  const href = $(element).attr("href") || "";

  // Converte para absoluta
  const link = toAbsoluteUrl(href);

  // Precisa parecer episódio
  if (!looksLikeEpisodeLink(link)) {
    return null;
  }

  // Extrai título bruto
  const rawTitle =
    cleanText($(element).attr("title")) ||
    cleanText($(element).text()) ||
    cleanText($(element).find("img").attr("alt")) ||
    cleanText($(element).closest("article").find("h3").first().text()) ||
    cleanText($(element).closest("div").find("h3").first().text()) ||
    cleanText($(element).closest("article").text()) ||
    cleanText($(element).closest("div").text());

  // Extrai número do episódio
  const episodeNumber =
    getEpisodeNumberFromText(rawTitle) ||
    getEpisodeNumberFromUrl(link);

  // Se não encontrou número, ignora
  if (!episodeNumber) {
    return null;
  }

  // Extrai slugs do anime
  const slugParts = getAnimeSlugPartsFromUrl(link);

  // Guarda slug da temporada
  const slug = slugParts.seasonSlug;

  // Guarda slug base
  const baseSlug = slugParts.baseSlug;

  // Se não encontrou slug, ignora
  if (!slug) {
    return null;
  }

  // Extrai título do anime
  const title = normalizeAnimeTitle(
    rawTitle.replace(/epis[oó]dio\s*\d+.*$/i, "").trim()
  );

  // Extrai capa
  const cover = getImageFromElement($, element);

  // Detecta idioma simples
  const cardText =
    cleanText($(element).closest("article").text()) ||
    cleanText($(element).closest("div").text()) ||
    rawTitle;

  // Define se é dublado
  const isDubbed = /dublado/i.test(cardText);

  // Retorna item bruto do feed
  return {
    title: title || slug,
    slug,
    baseSlug,
    season: getSeasonNumberFromEpisodeLink(baseSlug, link),
    link,
    cover,
    episodeNumber: Number(episodeNumber),
    isDubbed
  };
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
// Aguarda alguns milissegundos antes da próxima tentativa
const sleep = (ms = 0) => {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
};

// Verifica se o erro parece transitório e merece retry
const isRetryableFetchError = (error) => {
  // Se não houver erro, não tenta novamente
  if (!error) {
    return false;
  }

  // Extrai mensagem normalizada
  const message = String(error.message || "")
    .toLowerCase()
    .trim();

  // Lista de padrões comuns de erro transitório
  const retryablePatterns = [
    "timeout",
    "timed out",
    "network",
    "socket hang up",
    "econnreset",
    "etimedout",
    "eai_again",
    "ecanceled",
    "503",
    "502",
    "504",
    "429"
  ];

  // Retorna true se algum padrão bater
  return retryablePatterns.some((pattern) =>
    message.includes(pattern)
  );
};

// Faz requisição HTTP com axios usando retry inteligente
const fetchHtmlWithAxios = async (url) => {
  // Define quantidade máxima de tentativas
  const maxAttempts = 3;

  // Guarda último erro para relançar no final
  let lastError = null;

  // Tenta algumas vezes antes de desistir
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      // Faz a requisição
      const response = await axios.get(url, {
        timeout: 12000,
        maxRedirects: 5,
        validateStatus: () => true,
        headers: createHeaders()
      });

      // Guarda HTML apenas se vier string
      const html =
        typeof response.data === "string"
          ? response.data
          : "";

      // Se veio HTML minimamente válido, retorna
      if (html && html.trim().length > 0) {
        return html;
      }

      // Se veio vazio, cria erro para retry
      throw new Error(
        `[AXIOS EMPTY HTML] tentativa ${attempt} para ${url}`
      );
    } catch (error) {
      // Guarda erro atual
      lastError = error;

      console.error(
        `[AXIOS FETCH ERROR] tentativa ${attempt}/${maxAttempts} | ${url} | ${error.message}`
      );

      // Se não vale retry ou já é a última tentativa, para
      if (
        attempt === maxAttempts ||
        !isRetryableFetchError(error)
      ) {
        break;
      }

      // Pequeno atraso progressivo antes de tentar de novo
      await sleep(500 * attempt);
    }
  }

  // Relança último erro
  throw lastError || new Error("Falha ao buscar HTML com axios.");
};

// Faz requisição renderizada com Playwright usando retry inteligente
const fetchHtmlWithPlaywright = async (url) => {
  // Define quantidade máxima de tentativas
  const maxAttempts = 2;

  // Guarda último erro
  let lastError = null;

  // Tenta algumas vezes antes de desistir
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    // Guarda referência do browser
    let browser = null;

    try {
      // Abre o browser
      browser = await chromium.launch({
        headless: true,
        args: [
          "--no-sandbox",
          "--disable-setuid-sandbox",
          "--disable-blink-features=AutomationControlled"
        ]
      });

      // Cria contexto
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
          Referer: BASE_URL
        }
      });

      // Cria página
      const page = await context.newPage();

      // Injeta pequenas proteções
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

      // Acessa a página
      await page.goto(url, {
        waitUntil: "domcontentloaded",
        timeout: 30000
      });

      // Espera a página estabilizar
      await page.waitForTimeout(2500);

      // Obtém o HTML final
      const html = await page.content();

      // Fecha contexto
      await context.close();

      // Fecha browser
      await browser.close();

      // Limpa referência
      browser = null;

      // Se veio HTML válido, retorna
      if (html && html.trim().length > 0) {
        return html;
      }

      // Se veio vazio, força retry
      throw new Error(
        `[PLAYWRIGHT EMPTY HTML] tentativa ${attempt} para ${url}`
      );
    } catch (error) {
      // Guarda erro atual
      lastError = error;

      console.error(
        `[PLAYWRIGHT FETCH ERROR] tentativa ${attempt}/${maxAttempts} | ${url} | ${error.message}`
      );

      // Fecha browser se ainda existir
      if (browser) {
        try {
          await browser.close();
        } catch (closeError) {
          // Ignora erro de fechamento
        }
      }

      // Se já esgotou, para
      if (attempt === maxAttempts) {
        break;
      }

      // Pequeno atraso antes da nova tentativa
      await sleep(1000 * attempt);
    }
  }

  // Relança último erro
  throw lastError || new Error("Falha ao buscar HTML com Playwright.");
};

// Escolhe melhor estratégia de fetch com fallback inteligente
const fetchHtml = async (url, options = {}) => {
  // Aguarda vaga de execução
  await acquireSlot();

  try {
    // Aplica delay humano
    await randomDelay();

    const preferPlaywright =
      Boolean(options.preferPlaywright);

    if (preferPlaywright) {
      try {
        return await fetchHtmlWithPlaywright(url);
      } catch (playwrightError) {
        console.error(
          `[FETCH FALLBACK] Playwright falhou para ${url}`
        );

        return fetchHtmlWithAxios(url);
      }
    }

    try {
      const html =
        await fetchHtmlWithAxios(url);

      if (html && html.length > 0) {
        return html;
      }

      return fetchHtmlWithPlaywright(url);
    } catch (axiosError) {
      console.error(
        `[FETCH FALLBACK] Axios falhou para ${url}`
      );

      return fetchHtmlWithPlaywright(url);
    }
  } finally {
    // Libera vaga sempre
    releaseSlot();
  }
};

// Normaliza slug de gênero para URL
const slugifyGenre = (genre = "") => {
  return String(genre || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
};

// Normaliza número da página
const normalizeCatalogPage = (page = 1) => {
  const pageNumber = Number(page || 1);

  if (!Number.isFinite(pageNumber) || pageNumber < 1) {
    return 1;
  }

  return Math.floor(pageNumber);
};

// Normaliza letra do catálogo
const normalizeCatalogLetter = (letter = "") => {
  const normalizedLetter = String(letter || "")
    .trim()
    .toLowerCase();

  if (!/^[a-z]$/.test(normalizedLetter)) {
    return "";
  }

  return normalizedLetter;
};
// Normaliza tipo de catálogo recebido
const normalizeCatalogType = (type = "") => {
  // Normaliza o texto
  const normalizedType = String(type || "")
    .trim()
    .toLowerCase();

  // Se não vier tipo, retorna vazio
  if (!normalizedType) {
    return "";
  }

  // Lista dos tipos suportados
  const allowedTypes = [
    "updated",
    "top",
    "launching",
    "dubbed",
    "subbed"
  ];

  // Se não for um tipo permitido, ignora
  if (!allowedTypes.includes(normalizedType)) {
    return "";
  }

  // Retorna o tipo validado
  return normalizedType;
};

// Monta URL do catálogo com suporte a tipo, gênero e letra
const buildAnimeCatalogUrl = ({
  page = 1,
  letter = "",
  genre = "",
  type = ""
}) => {
  // Normaliza a página
  const normalizedPage = normalizeCatalogPage(page);

  // Normaliza a letra
  const normalizedLetter = normalizeCatalogLetter(letter);

  // Normaliza o gênero
  const normalizedGenre = slugifyGenre(genre);

  // Normaliza o tipo
  const normalizedType = normalizeCatalogType(type);

  // ===============================
  // PRIORIDADE 1: GÊNERO
  // ===============================
  // Exemplo real:
  // /genero/acao
  if (normalizedGenre) {
    if (normalizedPage > 1) {
      return `${BASE_URL}/genero/${normalizedGenre}/${normalizedPage}`;
    }

    return `${BASE_URL}/genero/${normalizedGenre}`;
  }

  // ===============================
  // PRIORIDADE 2: LETRA
  // ===============================
  // Ainda deixamos como fallback futuro
  // até confirmar 100% a rota real da letra
  if (normalizedLetter) {
    if (normalizedPage > 1) {
      return `${BASE_URL}/letra/${normalizedLetter}/${normalizedPage}`;
    }

    return `${BASE_URL}/letra/${normalizedLetter}`;
  }

  // ===============================
  // PRIORIDADE 3: TIPO DE LISTAGEM
  // ===============================
  if (normalizedType === "updated") {
    if (normalizedPage > 1) {
      return `${BASE_URL}/animes-atualizados/${normalizedPage}`;
    }

    return `${BASE_URL}/animes-atualizados`;
  }

  if (normalizedType === "top") {
    if (normalizedPage > 1) {
      return `${BASE_URL}/top-animes/${normalizedPage}`;
    }

    return `${BASE_URL}/top-animes`;
  }

  if (normalizedType === "launching") {
    if (normalizedPage > 1) {
      return `${BASE_URL}/em-lancamento/${normalizedPage}`;
    }

    return `${BASE_URL}/em-lancamento`;
  }

  if (normalizedType === "dubbed") {
    if (normalizedPage > 1) {
      return `${BASE_URL}/lista-de-animes-dublados/${normalizedPage}`;
    }

    return `${BASE_URL}/lista-de-animes-dublados`;
  }

  if (normalizedType === "subbed") {
    if (normalizedPage > 1) {
      return `${BASE_URL}/lista-de-animes-legendados/${normalizedPage}`;
    }

    return `${BASE_URL}/lista-de-animes-legendados`;
  }

  // ===============================
  // FALLBACK PADRÃO
  // ===============================
  // Mantém comportamento atual estável
  if (normalizedPage > 1) {
    return `${BASE_URL}/animes-atualizados/${normalizedPage}`;
  }

  return `${BASE_URL}/animes-atualizados`;
};

// Monta possíveis URLs de busca
const buildAnimeSearchUrls = ({
  query = "",
  page = 1
}) => {
  // Codifica o termo com segurança
  const encodedQuery = encodeURIComponent(String(query || "").trim());

  // Normaliza a página
  const normalizedPage = normalizeCatalogPage(page);

  // Se não houver termo, retorna vazio
  if (!encodedQuery) {
    return [];
  }

  // Primeira página de busca
  if (normalizedPage <= 1) {
    return [
      `${BASE_URL}/?s=${encodedQuery}`,
      `${BASE_URL}/search/${encodedQuery}/`
    ];
  }

  // Busca paginada com possíveis formatos
  return [
    `${BASE_URL}/page/${normalizedPage}/?s=${encodedQuery}`,
    `${BASE_URL}/?s=${encodedQuery}&paged=${normalizedPage}`,
    `${BASE_URL}/search/${encodedQuery}/page/${normalizedPage}/`
  ];
};

// Extrai metadados da paginação com mais segurança
const extractPaginationMeta = ($, currentPage = 1) => {
  // Normaliza a página atual recebida
  const safeCurrentPage = Number(currentPage || 1);

  // Lista de seletores candidatos para a área de paginação
  const paginationSelectors = [
    ".pagination",
    ".paginacao",
    ".page-numbers",
    ".nav-links",
    ".wp-pagenavi"
  ];

  // Guarda textos candidatos encontrados
  const candidateTexts = [];

  // Percorre os seletores possíveis
  paginationSelectors.forEach((selector) => {
    // Busca cada bloco encontrado
    $(selector).each((index, element) => {
      // Lê o texto do bloco
      const text = cleanText($(element).text());

      // Se tiver conteúdo, guarda
      if (text) {
        candidateTexts.push(text);
      }
    });
  });

  // Também tenta pegar textos curtos do body que tenham "Pagina X de Y"
  $("body *").each((index, element) => {
    // Limita a quantidade de elementos percorridos
    if (candidateTexts.length >= 30) {
      return false;
    }

    // Lê o texto do elemento
    const text = cleanText($(element).text());

    // Ignora textos vazios
    if (!text) {
      return;
    }

    // Só guarda textos curtos que realmente pareçam paginação
    if (
      text.length <= 80 &&
      /pagina\s+\d+\s+de\s+\d+/i.test(text)
    ) {
      candidateTexts.push(text);
    }
  });

  // Remove duplicados
  const uniqueCandidateTexts = [...new Set(candidateTexts)];

  // Guarda totalPages encontrado
  let totalPages = safeCurrentPage;

  // Procura o melhor texto de paginação
  for (const text of uniqueCandidateTexts) {
    // Tenta padrão completo: "Pagina 1 de 96"
    const fullMatch = text.match(/pagina\s+(\d+)\s+de\s+(\d+)/i);

    // Se encontrou padrão completo, usa o segundo número
    if (fullMatch && fullMatch[2]) {
      const parsedTotalPages = Number(fullMatch[2]);

      // Só aceita valor plausível
      if (
        Number.isFinite(parsedTotalPages) &&
        parsedTotalPages >= safeCurrentPage &&
        parsedTotalPages <= 1000
      ) {
        totalPages = parsedTotalPages;
        break;
      }
    }

    // Tenta padrão reduzido: "de 96"
    const reducedMatch = text.match(/\bde\s+(\d+)\b/i);

    // Se encontrou padrão reduzido, valida
    if (reducedMatch && reducedMatch[1]) {
      const parsedTotalPages = Number(reducedMatch[1]);

      // Só aceita valor plausível
      if (
        Number.isFinite(parsedTotalPages) &&
        parsedTotalPages >= safeCurrentPage &&
        parsedTotalPages <= 1000
      ) {
        totalPages = parsedTotalPages;
        break;
      }
    }
  }

  // Fallback extra: tenta links numéricos da paginação
  if (totalPages === safeCurrentPage) {
    // Guarda números encontrados em links de paginação
    const pageNumbers = [];

    // Busca links e botões numerados
    $(".pagination a, .paginacao a, .page-numbers, .nav-links a, .wp-pagenavi a").each((index, element) => {
      // Lê o texto visível
      const text = cleanText($(element).text());

      // Se for número puro, adiciona
      if (/^\d+$/.test(text)) {
        pageNumbers.push(Number(text));
      }

      // Também tenta extrair número da URL /page/2/
      const href = $(element).attr("href") || "";
      const hrefMatch = href.match(/\/page\/(\d+)\/?$/i);

      if (hrefMatch && hrefMatch[1]) {
        pageNumbers.push(Number(hrefMatch[1]));
      }
    });

    // Filtra valores plausíveis
    const validPageNumbers = pageNumbers.filter((pageNumber) => {
      return (
        Number.isFinite(pageNumber) &&
        pageNumber >= 1 &&
        pageNumber <= 1000
      );
    });

    // Se encontrou números, pega o maior
    if (validPageNumbers.length > 0) {
      totalPages = Math.max(...validPageNumbers, safeCurrentPage);
    }
  }

  // Proteção final contra valores absurdos
  if (
    !Number.isFinite(totalPages) ||
    totalPages < safeCurrentPage ||
    totalPages > 1000
  ) {
    totalPages = safeCurrentPage;
  }

  // Retorna metadados finais
  return {
    page: safeCurrentPage,
    totalPages,
    hasPreviousPage: safeCurrentPage > 1,
    hasNextPage: safeCurrentPage < totalPages
  };
};

// Descobre o total real de páginas do catálogo sem depender só da paginação visível
const discoverRealCatalogTotalPages = async ({
  letter = "",
  genre = "",
  type = ""
} = {}) => {
  try {
    // Função auxiliar para verificar se uma página do catálogo realmente existe
    const pageExists = async (pageNumber) => {
      // Monta a URL da página alvo
      const url = buildAnimeCatalogUrl({
        page: pageNumber,
        letter,
        genre,
        type
      });

      // Busca o HTML da página
      const html = await fetchHtml(url, {
        preferPlaywright: true
      });

      // Se não veio HTML, considera inexistente
      if (!html || typeof html !== "string") {
        return false;
      }

      // Carrega o HTML
      const $ = cheerio.load(html || "");

      // Se for 404 real e não houver cards, considera inexistente
      const hasPossibleCatalogCards =
        $(".divCardUltimosEps").length > 0 ||
        $("article.cardUltimosEps").length > 0 ||
        $("article.card").length > 0 ||
        $("a[href*='/animes/']").length > 0;

      if (isNotFoundPage($, html) && !hasPossibleCatalogCards) {
        return false;
      }

      // Conta cards reais do catálogo
      let foundItems = 0;

      const localSeen = new Set();

      const cardSelectors = [
        ".divCardUltimosEps",
        "article.cardUltimosEps",
        "article.card",
        ".minWDanime",
        ".col-6.col-sm-4.col-md-3.col-lg-2"
      ];

      const pushLocalItem = (element) => {
        const anchor =
          $(element).is("a")
            ? $(element)
            : $(element).find("a[href*='/animes/']").first();

        if (!anchor.length) {
          return;
        }

        const rawHref = anchor.attr("href") || "";
        const link = normalizeUrl(rawHref);

        if (!looksLikeAnimeLink(link)) {
          return;
        }

        if (localSeen.has(link)) {
          return;
        }

        localSeen.add(link);
        foundItems += 1;
      };

      // Tenta pelos cards reais
      cardSelectors.forEach((selector) => {
        $(selector).each((index, element) => {
          pushLocalItem(element);
        });
      });

      // Fallback por anchors diretos
      if (foundItems === 0) {
        $("a[href*='/animes/']").each((index, element) => {
          pushLocalItem(element);
        });
      }

      // Se encontrou ao menos 1 card real, considera página existente
      return foundItems > 0;
    };

    // Primeiro tenta aproveitar a paginação visível como ponto de partida
    const firstPageUrl = buildAnimeCatalogUrl({
      page: 1,
      letter,
      genre,
      type
    });

    const firstPageHtml = await fetchHtml(firstPageUrl, {
      preferPlaywright: true
    });

    let baseGuess = 1;

    if (firstPageHtml && typeof firstPageHtml === "string") {
      const $ = cheerio.load(firstPageHtml || "");
      const visualPagination = extractPaginationMeta($, 1);

      baseGuess = Math.max(
        1,
        Number(visualPagination?.totalPages || 1)
      );
    }

    // Se nem a página inicial existir, devolve 1
    const firstPageExists = await pageExists(1);

    if (!firstPageExists) {
      return 1;
    }

    // Crescimento exponencial até achar um limite alto inválido
    let low = 1;
    let high = Math.max(2, baseGuess);

    // Se a estimativa visual ainda existir, tenta subir
    while (await pageExists(high)) {
      low = high;
      high = high * 2;

      // Proteção contra loop absurdo
      if (high > 1024) {
        high = 1024;
        break;
      }
    }

    // Busca binária entre o último válido e o primeiro inválido
    let left = low;
    let right = high;
    let bestValid = low;

    while (left <= right) {
      const mid = Math.floor((left + right) / 2);

      const exists = await pageExists(mid);

      if (exists) {
        bestValid = mid;
        left = mid + 1;
      } else {
        right = mid - 1;
      }
    }

    return Math.max(1, bestValid);
  } catch (error) {
    console.error(
      "[CATALOG TOTAL DISCOVERY ERROR]",
      error.message
    );

    // Fallback seguro
    return 1;
  }
};

// Função responsável por montar a home de forma rápida e segura
const scrapeHome = async () => {
  // Função auxiliar para limitar tempo de execução de cada bloco
  const withTimeout = (promise, ms, label) => {
    return Promise.race([
      promise,
      new Promise((resolve) => {
        setTimeout(() => {
          console.error(`[HOME TIMEOUT] ${label} excedeu ${ms}ms`);
          resolve([]);
        }, ms);
      })
    ]);
  };

  // Função auxiliar para buscar uma seção simples da AnimeFire
  const fetchSectionCards = async (url, limit = 12, label = "section") => {
    try {
      // Busca HTML da página
      const html = await fetchHtml(url, {
        preferPlaywright: false
      });

      // Se não veio HTML, retorna vazio
      if (!html || typeof html !== "string") {
        console.error(`[HOME ${label}] HTML vazio`);
        return [];
      }

      // Carrega HTML no Cheerio
      const $ = cheerio.load(html);

      // Array final
      const items = [];

      // Mapa para evitar duplicados
      const seen = new Set();

      // AnimeFire costuma renderizar links de anime em anchors
      $('a[href*="/anime/"], a[href*="/animes/"]').each((index, element) => {
        // Para ao atingir o limite
        if (items.length >= limit) {
          return false;
        }

        // Lê href
        const rawHref = $(element).attr("href") || "";

        // Normaliza link absoluto
        const link = normalizeUrl(rawHref);

        // Ignora link inválido
        if (!link) {
          return;
        }

        // Extrai slug
        const slug = getAnimeSlugFromUrl(link);

        // Ignora se não houver slug
        if (!slug) {
          return;
        }

        // Evita duplicados
        if (seen.has(slug)) {
          return;
        }

        // Busca título em pontos comuns
        const title =
          cleanText($(element).attr("title")) ||
          cleanText($(element).find("img").attr("alt")) ||
          cleanText($(element).find("h2, h3, h4").first().text()) ||
          cleanText($(element).text());

        // Busca imagem em pontos comuns
        const cover =
          normalizeUrl($(element).find("img").attr("src")) ||
          normalizeUrl($(element).find("img").attr("data-src")) ||
          normalizeUrl($(element).find("img").attr("data-lazy-src")) ||
          "";

        // Ignora item sem título
        if (!title) {
          return;
        }

        // Marca como visto
        seen.add(slug);

        // Monta item
        items.push({
          title,
          slug,
          link,
          cover
        });
      });

      console.log(`[HOME ${label}] encontrados:`, items.length);

      return items.slice(0, limit);
    } catch (error) {
      console.error(`[HOME ${label}] erro:`, error.message);
      return [];
    }
  };

  try {
    console.log("[HOME] Iniciando montagem da home...");

    // URLs das 3 seções principais
    const mostViewedUrl = `${BASE_URL}/top-animes`;
    const recentUrl = `${BASE_URL}/animes-atualizados`;
    const latestEpisodesUrl = `${BASE_URL}`;

    // Executa tudo em paralelo, mas com timeout individual
    const [
      mostViewed,
      recent,
      latestEpisodes
    ] = await Promise.all([
      withTimeout(
        fetchSectionCards(mostViewedUrl, 12, "mostViewed"),
        12000,
        "mostViewed"
      ),
      withTimeout(
        fetchSectionCards(recentUrl, 12, "recent"),
        12000,
        "recent"
      ),
      withTimeout(
        fetchSectionCards(latestEpisodesUrl, 12, "latestEpisodes"),
        12000,
        "latestEpisodes"
      )
    ]);

    console.log("[HOME] mostViewed:", mostViewed.length);
    console.log("[HOME] recent:", recent.length);
    console.log("[HOME] latestEpisodes:", latestEpisodes.length);

    // Retorna estrutura final
    return {
      mostViewed,
      recent,
      latestEpisodes
    };
  } catch (error) {
    console.error("[SCRAPE HOME ERROR]", error.message);

    // Retorna vazio em vez de travar tudo
    return {
      mostViewed: [],
      recent: [],
      latestEpisodes: []
    };
  }
};

// Raspa o catálogo paginado de animes
const scrapeAnimeCatalog = async ({
  page = 1,
  letter = "",
  genre = "",
  type = ""
} = {}) => {
  try {
    // Normaliza filtros recebidos
    const normalizedPage = normalizeCatalogPage(page);
    const normalizedLetter = normalizeCatalogLetter(letter);
    const normalizedGenre = cleanText(genre);
    const normalizedType = normalizeCatalogType(type);

    console.log("[CATALOG] Iniciando scraping...");

    // Monta a URL do catálogo usando a função centralizada
    const url = buildAnimeCatalogUrl({
      page: normalizedPage,
      letter: normalizedLetter,
      genre: normalizedGenre,
      type: normalizedType
    });

    console.log("[CATALOG] URL:", url);

    // Busca o HTML da página
    const html = await fetchHtml(url, {
      preferPlaywright: true
    });

    // Se não vier HTML, retorna estrutura segura
    if (!html || typeof html !== "string") {
      console.error("[CATALOG] HTML vazio");

      return {
        page: normalizedPage,
        total: 0,
        totalPages: normalizedPage,
        hasNextPage: false,
        hasPreviousPage: normalizedPage > 1,
        letter: normalizedLetter,
        genre: normalizedGenre,
        type: normalizedType,
        data: []
      };
    }

    // Carrega o HTML no Cheerio
    const $ = cheerio.load(html);

    // Só trata como 404 se realmente não houver nenhum sinal de card na página
    const hasPossibleCatalogCards =
      $(".divCardUltimosEps").length > 0 ||
      $("article.cardUltimosEps").length > 0 ||
      $("article.card").length > 0 ||
      $("a[href*='/animes/']").length > 0;

    if (isNotFoundPage($, html) && !hasPossibleCatalogCards) {
      console.error("[CATALOG] Página 404 detectada");

      return {
        page: normalizedPage,
        total: 0,
        totalPages: normalizedPage,
        hasNextPage: false,
        hasPreviousPage: normalizedPage > 1,
        letter: normalizedLetter,
        genre: normalizedGenre,
        type: normalizedType,
        data: []
      };
    }

    // Guarda itens encontrados
    const items = [];

    // Evita duplicados
    const seenLinks = new Set();
    const seenSlugs = new Set();

    // Seletores reais/fallbacks das páginas de listagem da AnimeFire
    const cardSelectors = [
      ".divCardUltimosEps",
      "article.cardUltimosEps",
      "article.card",
      ".minWDanime",
      ".col-6.col-sm-4.col-md-3.col-lg-2"
    ];

    // Função auxiliar para adicionar item com segurança
    const pushCatalogItem = (element) => {
      // Tenta achar o anchor principal do card
      const anchor =
        $(element).is("a")
          ? $(element)
          : $(element).find("a[href*='/animes/']").first();

      // Se não houver anchor válido, ignora
      if (!anchor.length) {
        return;
      }

      // Obtém href bruto
      const rawHref = anchor.attr("href") || "";

      // Normaliza o link
      const link = normalizeUrl(rawHref);

      // Precisa ser página de anime
      if (!looksLikeAnimeLink(link)) {
        return;
      }

      // Extrai slug
      const slug = getAnimeSlugFromUrl(link);

      // Se não houver slug, ignora
      if (!slug) {
        return;
      }

      // Evita duplicados por link e slug
      if (seenLinks.has(link) || seenSlugs.has(slug)) {
        return;
      }

      // Extrai título dos pontos reais da listagem
      const rawTitle =
        cleanText($(element).attr("title")) ||
        cleanText(anchor.attr("title")) ||
        cleanText(anchor.find("h3.animeTitle").first().text()) ||
        cleanText($(element).find("h3.animeTitle").first().text()) ||
        cleanText(anchor.find("h2, h3, h4").first().text()) ||
        cleanText($(element).find("h2, h3, h4").first().text()) ||
        cleanText(anchor.find("img").attr("alt")) ||
        cleanText($(element).find("img").attr("alt")) ||
        cleanText(anchor.text());

      // Normaliza título
      const title = normalizeAnimeTitle(rawTitle);

      // Se não houver título válido, ignora
      if (!title || isGarbageTitle(title)) {
        return;
      }

      // Extrai capa dos atributos reais
      const cover =
        normalizeUrl(anchor.find("img").attr("data-src")) ||
        normalizeUrl($(element).find("img").attr("data-src")) ||
        normalizeUrl(anchor.find("img").attr("src")) ||
        normalizeUrl($(element).find("img").attr("src")) ||
        normalizeUrl(anchor.find("img").attr("data-lazy-src")) ||
        normalizeUrl($(element).find("img").attr("data-lazy-src")) ||
        "";

      // Extrai score visível perto do card
      const score =
        cleanText($(element).find(".horaUltimosEps").first().text()) ||
        getScoreNearElement($, element) ||
        "";

      // Marca como visto
      seenLinks.add(link);
      seenSlugs.add(slug);

      // Adiciona item final
      items.push({
        title,
        slug,
        link,
        cover,
        score
      });
    };

    // Primeiro tenta pelos cards reais
    cardSelectors.forEach((selector) => {
      $(selector).each((index, element) => {
        pushCatalogItem(element);
      });
    });

    // Fallback extra: se não encontrou nada, varre anchors diretos
    if (items.length === 0) {
      $("a[href*='/animes/']").each((index, element) => {
        pushCatalogItem(element);
      });
    }

    console.log("[CATALOG] encontrados:", items.length);

    // Extrai paginação visual da página atual
const pagination = extractPaginationMeta($, normalizedPage);

// Descobre o total real do catálogo
const realTotalPages = await discoverRealCatalogTotalPages({
  letter: normalizedLetter,
  genre: normalizedGenre,
  type: normalizedType
});

// Usa sempre o maior valor confiável
const finalTotalPages = Math.max(
  Number(pagination.totalPages || 1),
  Number(realTotalPages || 1),
  Number(normalizedPage || 1)
);

// Retorna estrutura final
return {
  page: normalizedPage,
  total: items.length,
  totalPages: finalTotalPages,
  hasNextPage: normalizedPage < finalTotalPages,
  hasPreviousPage: normalizedPage > 1,
  letter: normalizedLetter,
  genre: normalizedGenre,
  type: normalizedType,
  data: items
};
  } catch (error) {
    console.error("[CATALOG ERROR]", error.message);

    // Retorna estrutura segura em caso de falha
    return {
      page: normalizeCatalogPage(page),
      total: 0,
      totalPages: normalizeCatalogPage(page),
      hasNextPage: false,
      hasPreviousPage: normalizeCatalogPage(page) > 1,
      letter: normalizeCatalogLetter(letter),
      genre: cleanText(genre),
      type: normalizeCatalogType(type),
      data: []
    };
  }
};

// Busca animes por nome
const scrapeAnimeSearch = async ({
  query = "",
  page = 1
} = {}) => {
  // Limpa termo recebido
  const normalizedQuery = cleanText(query);

  // Normaliza página
  const normalizedPage = normalizeCatalogPage(page);

  // Valida termo
  if (!normalizedQuery) {
    return {
      query: "",
      page: 1,
      totalPages: 1,
      hasNextPage: false,
      hasPreviousPage: false,
      data: []
    };
  }

  // Monta URLs candidatas
  const possibleUrls = buildAnimeSearchUrls({
    query: normalizedQuery,
    page: normalizedPage
  });

  // Guarda melhor resultado
  let bestResult = null;

  // Tenta cada URL possível
  for (const url of possibleUrls) {
    try {
      // Busca HTML da página
      const html = await fetchHtml(url, {
        preferPlaywright: true
      });

      // Se não veio HTML, tenta próxima
      if (!html) {
        continue;
      }

      // Carrega HTML
      const $ = cheerio.load(html || "");

      // Guarda itens encontrados
      const items = [];

      // Guarda links vistos
      const seen = new Set();

      // Percorre links da página
      $("a[href]").each((index, element) => {
        // Monta card
        const card = buildAnimeCardFromAnchor($, element);

        // Ignora inválido
        if (!card) {
          return;
        }

        // Ignora duplicado
        if (seen.has(card.link)) {
          return;
        }

        // Marca como visto
        seen.add(card.link);

        // Adiciona item
        items.push(card);
      });

      // Extrai paginação
      const pagination = extractPaginationMeta($, normalizedPage);

      // Monta resultado
      const result = {
        query: normalizedQuery,
        page: pagination.page,
        totalPages: pagination.totalPages,
        hasNextPage: pagination.hasNextPage,
        hasPreviousPage: pagination.hasPreviousPage,
        data: uniqueByLink(items)
      };

      // Guarda melhor resultado se achou itens
      if (result.data.length > 0) {
        bestResult = result;
        break;
      }

      // Guarda resultado vazio como fallback
      if (!bestResult) {
        bestResult = result;
      }
    } catch (error) {
      // Continua tentando próxima URL
      continue;
    }
  }

  // Se não achou nada em nenhuma URL, retorna vazio seguro
  if (!bestResult) {
    return {
      query: normalizedQuery,
      page: normalizedPage,
      totalPages: normalizedPage,
      hasNextPage: false,
      hasPreviousPage: normalizedPage > 1,
      data: []
    };
  }

  // Retorna melhor resultado encontrado
  return bestResult;
};

// Raspa a lista de gêneros
const scrapeAnimeGenres = async () => {
  const html = await fetchHtml(`${BASE_URL}/generos/`, {
    preferPlaywright: true
  });

  const $ = cheerio.load(html || "");

  const genres = [];
  const seen = new Set();

  $("a[href*='/genero/']").each((index, element) => {
    const href = $(element).attr("href") || "";
    const link = toAbsoluteUrl(href);
    const name = cleanText($(element).text());

    if (!name) {
      return;
    }

    if (/^letra-/i.test(name)) {
      return;
    }

    if (/^all$/i.test(name)) {
      return;
    }

    if (link.includes("/genero/letra-")) {
      return;
    }

    const slugMatch = link.match(/\/genero\/([^/?#]+)/i);
    const slug = slugMatch && slugMatch[1]
      ? cleanText(slugMatch[1]).toLowerCase()
      : slugifyGenre(name);

    if (!slug) {
      return;
    }

    if (seen.has(slug)) {
      return;
    }

    seen.add(slug);

    genres.push({
      name,
      slug,
      link
    });
  });

  return genres;
};

// ===============================
// HOME - FONTES ESPECÍFICAS
// ===============================

// Busca os animes mais vistos da página correta
const scrapeMostViewed = async () => {
  // Busca HTML da página correta
  const html = await fetchHtml(MOST_VIEWED_URL, {
    preferPlaywright: true
  });

  // Carrega HTML
  const $ = cheerio.load(html || "");

  // Guarda resultados
  const items = [];

  // Guarda links já vistos
  const seen = new Set();

  // Percorre links da página
  $("a[href]").each((index, element) => {
    // Monta card
    const card = buildAnimeCardFromAnchor($, element);

    // Ignora inválido
    if (!card) {
      return;
    }

    // Ignora duplicado
    if (seen.has(card.link)) {
      return;
    }

    // Marca como visto
    seen.add(card.link);

    // Adiciona item
    items.push(card);
  });

  // Retorna lista única
  return uniqueByLink(items);
};

// Busca a lista recente de animes da página correta
// Raspa animes atualizados da página correta da AnimeFire
const scrapeRecentAnimes = async () => {
  const url = ANIME_LIST_URL;

  console.log(
    "[SCRAPER] Buscando animes recentes em:",
    url
  );

  const html = await fetchHtml(url, {
    preferPlaywright: true
  });

  const $ = cheerio.load(html);

  const animes = [];

  // NOVO SELETOR compatível com AnimeFire
  $("a[href*='/animes/']").each(
    (index, element) => {

      // Limite padrão da home
      if (animes.length >= 24)
        return false;

      const href =
        $(element).attr("href");

      if (!href) return;

      // Extrai título
      const title =
        $(element)
          .find("h3")
          .text()
          .trim() ||
        $(element).attr("title") ||
        "Título não disponível";

      // Extrai capa
      const cover =
        $(element)
          .find("img")
          .attr("data-src") ||
        $(element)
          .find("img")
          .attr("src") ||
        null;

      if (!title || !cover)
        return;

      // Extrai slug
      const slug =
        getAnimeSlugFromUrl(href);

      // NORMALIZA LINK
      let safeLink = href;

      if (
        !safeLink.startsWith("http")
      ) {
        safeLink =
          `${BASE_URL}${safeLink}`;
      }

      animes.push({
        title,
        slug,
        link: safeLink,
        cover
      });
    }
  );

  console.log(
    "[SCRAPER] recentAnimes encontrados:",
    animes.length
  );

  return animes;
};

// Busca os últimos episódios diretamente da página do anime-base
const getLatestEpisodesFromAnimePage = async (
  baseSlug = "",
  maxItems = 2,
  seasonNumber = null
) => {
  // Se não houver baseSlug, retorna vazio
  if (!baseSlug) {
    return [];
  }

  // Busca todos os episódios do anime-base
  const episodes = await scrapeAnimeEpisodes(baseSlug);

  // Se não encontrou episódios, retorna vazio
  if (!Array.isArray(episodes) || episodes.length === 0) {
    return [];
  }

  // Filtra por temporada quando informado
  const filteredEpisodes =
    Number.isFinite(Number(seasonNumber))
      ? episodes.filter(
          (episode) =>
            Number(episode.season || 1) ===
            Number(seasonNumber)
        )
      : episodes;

  // Se filtro zerou a lista, retorna vazio
  if (!filteredEpisodes.length) {
    return [];
  }

  // Ordena pelo episódio mais novo
  const sortedEpisodes =
    [...filteredEpisodes].sort(
      (a, b) =>
        Number(b.number || 0) -
        Number(a.number || 0)
    );

  return sortedEpisodes
    .slice(0, maxItems)
    .map((episode, index) => {
      // =========================
      // LINK
      // =========================

      const rawLink =
        episode.link || "";

      const cleanLink =
        rawLink
          .replace(BASE_URL, "")
          .replace(/^\/+/, "")
          .replace(/\/+$/, "");

      const parts =
        cleanLink.split("/");

      let episodeSlug =
        parts.length >= 2
          ? parts[1]
          : "";

      // =========================
      // DETAILS SLUG
      // =========================

      let detailsSlug =
        episodeSlug;

      detailsSlug =
        detailsSlug
          .replace(
            /-episodio-\d+/i,
            ""
          )
          .replace(
            /-\d+$/,
            ""
          );

      // =========================
      // EXTRAIR NÚMERO
      // =========================

      let episodeNumber =
        Number(episode.number);

      // Se vier inválido, tenta extrair do link
      if (!Number.isFinite(episodeNumber)) {
        const match =
          rawLink.match(
            /episodio-(\d+)/i
          );

        if (match) {
          episodeNumber =
            Number(match[1]);
        }
      }

      // Fallback seguro
      if (!Number.isFinite(episodeNumber)) {
        episodeNumber = 1;
      }

      // =========================
      // RETORNO FINAL
      // =========================

      return {
        id: `${baseSlug}_s${
          episode.season || 1
        }_ep_${episodeNumber}`,

        number:
          episodeNumber,

        season:
          Number(
            episode.season || 1
          ),

        url:
          rawLink,

        watchSlug:
          episodeSlug,

        detailsSlug:
          detailsSlug,

        episodeSlug:
          episodeSlug,

        isLatest:
          index === 0
      };
    });
};

// Busca o feed de episódios recentes e agrupa por anime
const scrapeLatestEpisodesFeed = async () => {
  // Quantidade final exibida na home
  const HOME_LIMIT = 10;

  // Busca HTML da página de animes atualizados
  const html = await fetchHtml(ANIME_LIST_URL, {
    preferPlaywright: true
  });

  // Se não veio HTML, retorna vazio
  if (!html) {
    return [];
  }

  // Carrega o HTML
  const $ = cheerio.load(html || "");

  // Guarda cards finais
  const items = [];

  // Evita duplicados
  const seenAnimeSlugs = new Set();

  // Percorre os links da página
  $("a[href]").each((index, element) => {
    // Monta card base do anime
    const card = buildAnimeCardFromAnchor($, element);

    // Ignora inválido
    if (!card) {
      return;
    }

    // Resolve slug
    const animeSlug = cleanText(card.slug || "");

    // Se não houver slug, ignora
    if (!animeSlug) {
      return;
    }

    // Evita duplicado
    if (seenAnimeSlugs.has(animeSlug)) {
      return;
    }

    // Marca como visto
    seenAnimeSlugs.add(animeSlug);

    // Monta card final do bloco de atualizações
    items.push({
      id: animeSlug,
      title: card.title || animeSlug,
      slug: animeSlug,
      baseSlug: animeSlug,
      animeSlug: animeSlug,
      detailsSlug: animeSlug,
      link: card.link || `${BASE_URL}/animes/${animeSlug}`,
      cover: card.cover || "",
      latestEpisodes: [
        {
          id: `${animeSlug}_updated`,
          number: null,
          season: 1,
          link: card.link || `${BASE_URL}/animes/${animeSlug}`,
          url: card.link || `${BASE_URL}/animes/${animeSlug}`,
          isLatest: true,
          slug: animeSlug,
          baseSlug: animeSlug,
          animeSlug: animeSlug,
          detailsSlug: animeSlug,
          label: "Episódio novo"
        }
      ]
    });

    // Para no limite da home
    if (items.length >= HOME_LIMIT) {
      return false;
    }
  });

  // Retorna resultado final
  return items;
};

// Busca itens para a sidebar popular
const scrapePopularSidebar = async () => {
  // Busca a lista de mais vistos
  const mostViewed = await scrapeMostViewed();

  // Retorna apenas os primeiros da sidebar
  return mostViewed.slice(0, 5);
};
// Normaliza links relativos e absolutos usando a BASE_URL atual
const normalizeUrl = (value = "") => {
  // Remove espaços
  const raw = String(value || "").trim();

  // Se estiver vazio, retorna vazio
  if (!raw) {
    return "";
  }

  // Se já for URL absoluta, retorna como está
  if (/^https?:\/\//i.test(raw)) {
    return raw;
  }

  // Se começar com //, adiciona https:
  if (raw.startsWith("//")) {
    return `https:${raw}`;
  }

  // Se começar com /, concatena com a BASE_URL
  if (raw.startsWith("/")) {
    return `${BASE_URL}${raw}`;
  }

  // Caso seja caminho relativo simples
  return `${BASE_URL}/${raw}`;
};

// Função responsável por montar as seções da home sem travar a requisição
const scrapeAnimeHomeSections = async () => {
  // Guarda a promise em andamento da home para evitar scraping duplicado
  if (!global.__HOME_SCRAPE_IN_FLIGHT__) {
    global.__HOME_SCRAPE_IN_FLIGHT__ = (async () => {
      // Função auxiliar para limitar o tempo de cada bloco
      const withTimeout = (promise, ms, label) => {
        return Promise.race([
          promise,
          new Promise((resolve) => {
            setTimeout(() => {
              console.error(`[HOME TIMEOUT] ${label} excedeu ${ms}ms`);

              // Retorna vazio para não quebrar a home
              resolve([]);
            }, ms);
          })
        ]);
      };

      try {
        console.log("[HOME] Iniciando montagem da home...");

        // Timeout padrão da home
        const TIMEOUT_MS = 20000;

        // Executa apenas os blocos que continuam vindo do scraper da home
                const [
          mostViewed,
          popularSidebar
        ] = await Promise.all([
          withTimeout(
            scrapeMostViewed(),
            TIMEOUT_MS,
            "mostViewed"
          ),
          withTimeout(
            scrapePopularSidebar(),
            TIMEOUT_MS,
            "popularSidebar"
          )
        ]);

                console.log(
          "[HOME] mostViewed:",
          Array.isArray(mostViewed) ? mostViewed.length : 0
        );

        console.log(
          "[HOME] popularSidebar:",
          Array.isArray(popularSidebar) ? popularSidebar.length : 0
        );

        // latestEpisodes agora fica vazio aqui,
        // porque esse bloco passa a ser preenchido no service
               return {
          mostViewed: Array.isArray(mostViewed)
            ? mostViewed
            : [],

          latestEpisodes: [],

          recentAnimes: [],

          popularSidebar: Array.isArray(popularSidebar)
            ? popularSidebar
            : []
        };
      } catch (error) {
        console.error("[SCRAPE HOME ERROR]", error.message);

        // Nunca deixa a home travar tudo
        return {
          mostViewed: [],
          latestEpisodes: [],
          recentAnimes: [],
          popularSidebar: []
        };
      } finally {
        // Libera a trava da home ao finalizar
        global.__HOME_SCRAPE_IN_FLIGHT__ = null;
      }
    })();
  }

  // Reaproveita a mesma montagem em andamento
  return global.__HOME_SCRAPE_IN_FLIGHT__;
};


// ===============================
// DETALHES DO ANIME
// ===============================
const scrapeAnimeDetails = async (slug) => {
  // Valida slug
  if (!slug) {
    throw new Error("Slug do anime não informado.");
  }

  // Na AnimeFire o padrão correto é /animes/
  const animeUrl = `${BASE_URL}/animes/${slug}`;

  // Busca HTML da página
  const html = await fetchHtml(animeUrl, {
    preferPlaywright: true
  });

  // Se não veio HTML, retorna null
  if (!html) {
    return null;
  }

  // Carrega HTML
  const $ = cheerio.load(html || "");

  // Detecta 404 real
  const pageLooks404 = isNotFoundPage($, html);

  if (pageLooks404) {
    return null;
  }

  // Extrai título principal
  const title =
    cleanText($("h1").first().text()) ||
    normalizeAnimeTitle(
      getMetaContent($, 'meta[property="og:title"]') ||
      cleanText($("title").first().text())
    );

  // Se não encontrou título válido, aborta
  if (
    !title ||
    /404/i.test(title) ||
    /not found/i.test(title)
  ) {
    return null;
  }

  // Proteção simples:
  // se o slug recebido terminar com "-episodio-X", rejeita
  if (/-episodio-\d+$/i.test(String(slug))) {
    return null;
  }

  // Extrai título alternativo corretamente
  const rawAlternativeTitle =
    cleanText($(".text-gray").first().text()) ||

    cleanText(
      $("h6.text-gray")
        .filter((index, element) => {
          const text = cleanText($(element).text());

          if (!text) return false;
          if (text.toLowerCase() === title.toLowerCase()) return false;
          if (text.length < 3) return false;

          return true;
        })
        .first()
        .text()
    );

  const alternativeTitle = normalizeAlternativeTitle(
    rawAlternativeTitle,
    title
  );

  // Extrai capa
  const cover = toAbsoluteUrl(
    getMetaContent($, 'meta[property="og:image"]') ||
      $(".animeCover img").attr("src") ||
      $(".animeCover img").attr("data-src") ||
      $(".anime-cover img").attr("src") ||
      $(".anime-cover img").attr("data-src") ||
      $(".poster img").attr("src") ||
      $(".poster img").attr("data-src") ||
      $("img").first().attr("src") ||
      $("img").first().attr("data-src") ||
      ""
  );

  // Extrai sinopse corretamente
  const rawSynopsis =
    cleanText($(".divSinopse .spanAnimeInfo").text()) ||

    cleanText($(".divSinopse").text()) ||

    getMetaContent($, 'meta[property="og:description"]') ||

    "";

  const synopsis = cleanSynopsisText(
    rawSynopsis,
    title
  );

  // Extrai gêneros apenas do bloco principal do anime
  const detailsRoot =
    $(".anime_container").first().length
      ? $(".anime_container").first()
      : $(".anime_content").first().length
      ? $(".anime_content").first()
      : $(".anime_infos").first().length
      ? $(".anime_infos").first()
      : $(".anime_info").first().length
      ? $(".anime_info").first()
      : $(".leftAnime").first().length
      ? $(".leftAnime").first()
      : null;

  let rawGenres = [];

  // Busca gêneros só dentro do container principal encontrado
  if (detailsRoot && detailsRoot.length) {
    rawGenres = detailsRoot
      .find("a[href*='/genero/']")
      .map((index, element) => {
        return cleanText($(element).text());
      })
      .get();
  }

  // Fallback seguro e ainda restrito ao bloco de detalhes
  if (!Array.isArray(rawGenres) || rawGenres.length === 0) {
    rawGenres = $(".anime_content, .anime_infos, .anime_info, .leftAnime")
      .find("a[href*='/genero/']")
      .map((index, element) => {
        return cleanText($(element).text());
      })
      .get();
  }

  const genres = normalizeGenres(rawGenres).slice(0, 3);

  // Texto geral da página
  const bodyText = cleanText($("body").text());

  // Regex de metadados mais robusta
  const seasonMatch =
    bodyText.match(
      /Temporada:\s*(.*?)(?=Estúdio|Estúdios|Áudio|Episódios|Status|Dia de Lançamento|Ano|Nota|Score|Escore|$)/i
    );

  const studioMatch =
    bodyText.match(
      /Estúdios?:\s*(.*?)(?=Áudio|Episódios|Status|Dia de Lançamento|Ano|Nota|Score|Escore|$)/i
    );

  const audioMatch =
    bodyText.match(
      /Áudio:\s*(.*?)(?=Episódios|Status|Dia de Lançamento|Ano|Nota|Score|Escore|$)/i
    );

  const totalEpisodesMatch =
    bodyText.match(
      /Episódios:\s*([0-9]+|N\/A|—|-)/i
    );

  const statusMatch =
    bodyText.match(
      /Status(?: do Anime)?:\s*(.*?)(?=Dia de Lançamento|Ano|Nota|Score|Escore|$)/i
    );

  const releaseDayMatch =
    bodyText.match(
      /Dia de Lançamento:\s*(.*?)(?=Ano|Nota|Score|Escore|$)/i
    );

  const yearMatch =
    bodyText.match(/Ano:\s*(\d{4}|N\/A|—|-)/i) ||
    bodyText.match(/\b(19\d{2}|20\d{2})\b/);

  // Extrai score corretamente
  const scoreBySelector = cleanText(
    $("#anime_score").text() ||

      $("[class*='score']").first().text() ||

      $(".nota").first().text() ||

      $(".rating").first().text() ||

      ""
  );

  const scoreRegexMatch =
    bodyText.match(
      /(?:Nota|Score|Escore):\s*([0-9]+(?:\.[0-9]+)?)/i
    );

  const score =
    cleanText(scoreBySelector) ||
    cleanText(scoreRegexMatch?.[1] || "") ||
    "—";

  // Monta retorno final
  return {
    title,
    alternativeTitle,
    cover,
    synopsis:
      synopsis || "Sinopse não disponível.",
    genres,
    year:
      cleanText(yearMatch?.[1] || "") || "—",
    status:
      cleanText(statusMatch?.[1] || "") || "—",
    totalEpisodes:
      cleanText(totalEpisodesMatch?.[1] || "") || "—",
    audio:
      cleanText(audioMatch?.[1] || "") || "—",
    studio:
      cleanText(studioMatch?.[1] || "") || "—",
    score,
    season:
      cleanText(seasonMatch?.[1] || "") || "",
    releaseDay:
      cleanText(releaseDayMatch?.[1] || "") || ""
  };
};


// ===============================
// EPISÓDIOS DO ANIME
// ===============================
const scrapeAnimeEpisodes = async (
  animeSlug = ""
) => {
  try {
    // Se não houver slug, retorna vazio
    if (!animeSlug) {
      return [];
    }

    // Remove sufixo da página de detalhes quando existir
    const detailsSlug = cleanText(animeSlug);
    const baseSlug = detailsSlug.replace(/-todos-os-episodios$/i, "");

    // Monta URL da página do anime
    const url = `${BASE_URL}/animes/${detailsSlug}`;

    // Busca HTML da página
    const html = await fetchHtml(url, {
      preferPlaywright: true
    });

    // Se não encontrou HTML
    if (!html) {
      return [];
    }

    // Carrega HTML
    const $ = cheerio.load(html || "");

    // Se for 404 real, retorna vazio
    if (isNotFoundPage($, html)) {
      return [];
    }

    // Guarda episódios encontrados
    const episodes = [];

    // Evita duplicados
    const seenLinks = new Set();

    // Procura links reais de episódio
    $("a[href]").each((index, element) => {
      const rawHref = $(element).attr("href") || "";
      const link = toAbsoluteUrl(rawHref);

      if (!link) {
        return;
      }

      // Aceita padrão real do projeto/site:
      // /animes/slug-base/1
      const numericMatch = link.match(/\/animes\/([^/]+)\/(\d+)\/?$/i);

      // Aceita também fallback antigo:
      // /episodio/slug-episodio-12
      const episodeSlugMatch = link.match(/\/episodio\/([^/?#]+)$/i);

      let episodeNumber = null;
      let season = 1;
      let finalLink = link;

      // =========================
      // PADRÃO NUMÉRICO REAL
      // =========================
      if (numericMatch) {
        const episodeAnimeSlug = cleanText(numericMatch[1] || "");
        const parsedNumber = Number(numericMatch[2] || 0);

        // Precisa pertencer ao anime-base
        if (episodeAnimeSlug !== baseSlug) {
          return;
        }

        if (!Number.isFinite(parsedNumber) || parsedNumber < 1) {
          return;
        }

        episodeNumber = parsedNumber;
      }

      // =========================
      // FALLBACK PADRÃO /episodio/
      // =========================
      else if (episodeSlugMatch) {
        const episodeSlug = cleanText(episodeSlugMatch[1] || "");
        const parsedNumber = getEpisodeNumberFromUrl(link);

        if (!episodeSlug) {
          return;
        }

        if (!Number.isFinite(parsedNumber) || parsedNumber < 1) {
          return;
        }

        // Confere se o slug do episódio parece pertencer ao anime
        if (
          !episodeSlug.includes(baseSlug) &&
          !episodeSlug.includes(detailsSlug.replace(/-todos-os-episodios$/i, ""))
        ) {
          return;
        }

        episodeNumber = parsedNumber;
      } else {
        return;
      }

      // Detecta temporada pelo slug recebido
      const seasonMatch = detailsSlug.match(/(\d+)(st|nd|rd|th)-season/i);
      if (seasonMatch) {
        season = Number(seasonMatch[1]) || 1;
      }

      // Evita duplicado
      if (seenLinks.has(finalLink)) {
        return;
      }

      seenLinks.add(finalLink);

      episodes.push({
        id: `${baseSlug}_ep_${episodeNumber}`,
        number: episodeNumber,
        season,
        link: finalLink,
        title: `Episódio ${episodeNumber}`
      });
    });

    // Ordena crescente para a tela de detalhes
    return episodes.sort((a, b) => a.number - b.number);
  } catch (error) {
    console.error(
      "[SCRAPER] erro scrapeAnimeEpisodes:",
      error.message
    );

    return [];
  }
};

// ===============================
// PLAYER / FONTES DO EPISÓDIO
// ===============================
const scrapeAnimeEpisodePlayer = async (slug, episodeNumber) => {
  // Valida slug
  if (!slug) {
    throw new Error("Slug do anime não informado.");
  }

  // Valida número do episódio
  const episodeNum = Number(episodeNumber);

  if (!Number.isFinite(episodeNum) || episodeNum < 1) {
    throw new Error("Número do episódio inválido.");
  }

  // Remove o sufixo da página de detalhes
  const baseSlug = cleanText(slug).replace(/-todos-os-episodios$/i, "");

  // URL real do episódio
  const episodeUrl = `${BASE_URL}/animes/${baseSlug}/${episodeNum}`;

  // Busca HTML do episódio
  let html = "";

  try {
    html = await fetchHtml(episodeUrl, {
      preferPlaywright: false
    });
  } catch (error) {
    html = "";
  }

  if (!html || html.length < 1000) {
    try {
      html = await fetchHtml(episodeUrl, {
        preferPlaywright: true
      });
    } catch (error) {
      html = "";
    }
  }

  // Se não veio HTML
  if (!html) {
    return {
      title: `Episódio ${episodeNum}`,
      slug,
      episodeNumber: episodeNum,
      episodeUrl,
      animeSlugReal: slug,
      animeUrlReal: `${BASE_URL}/animes/${slug}`,
      players: []
    };
  }

  // Carrega HTML
  const $ = cheerio.load(html || "");

  // Se for 404 real
  if (isNotFoundPage($, html)) {
    return {
      title: `Episódio ${episodeNum}`,
      slug,
      episodeNumber: episodeNum,
      episodeUrl,
      animeSlugReal: slug,
      animeUrlReal: `${BASE_URL}/animes/${slug}`,
      players: []
    };
  }

  // Título do episódio
  const title =
    cleanText($("h1").first().text()) ||
    `Episódio ${episodeNum}`;

  // =============================
  // NOVO: pegar slug real do anime
  // =============================

  let animeSlugReal = slug;

  const animeLink =
    $("a[href*='-todos-os-episodios']").attr("href");

  if (animeLink) {
    try {
      const url = new URL(toAbsoluteUrl(animeLink));

      const parts =
        url.pathname
          .split("/")
          .filter(Boolean);

      animeSlugReal =
        parts[parts.length - 1] || slug;

    } catch (error) {
      animeSlugReal = slug;
    }
  }

  const animeUrlReal =
    `${BASE_URL}/animes/${animeSlugReal}`;

  // =============================
  // PLAYERS
  // =============================

  const players = [];

  const seenPlayers = new Set();

  const pushPlayer = (name, type, url) => {
    if (!url) return;

    const finalUrl = toAbsoluteUrl(url);

    if (!finalUrl) return;

    if (seenPlayers.has(finalUrl)) return;

    seenPlayers.add(finalUrl);

    players.push({
      name: cleanText(name || "Player"),
      type: cleanText(type || "stream"),
      url: finalUrl
    });
  };

  // PLAYER PRINCIPAL

  const mainVideoSrc =
    $("#my-video").attr("data-video-src") ||
    $("video[data-video-src]").attr("data-video-src") ||
    $("video").attr("data-video-src");

  pushPlayer("AnimeFire", "stream", mainVideoSrc);

  // SOURCES

  $("video source").each((index, element) => {
    const src = $(element).attr("src");
    pushPlayer("AnimeFire", "source", src);
  });

  // DOWNLOAD

  const downloadUrl =
    $("a[href*='/download/']").attr("href");

  pushPlayer("AnimeFire Download", "download", downloadUrl);

  // IFRAMES

  $("iframe").each((index, element) => {
    const src = $(element).attr("src");
    pushPlayer("Iframe", "embed", src);
  });

  // Retorno final

  return {
    title,
    slug,
    episodeNumber: episodeNum,
    episodeUrl,

    // NOVO

    animeSlugReal,
    animeUrlReal,

    players
  };
};

// ===============================
// EXPORTAÇÃO
// ===============================
module.exports = {
  scrapeHome,
  scrapeAnimeCatalog,
  scrapeAnimeSearch,
  scrapeAnimeGenres,
  scrapeAnimeHomeSections,
  scrapeAnimeDetails,
  scrapeAnimeEpisodes,
  scrapeAnimeEpisodePlayer
};