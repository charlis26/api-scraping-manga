// Importa o axios para fazer requisições HTTP
const axios = require("axios");

// Importa o cheerio para ler e navegar no HTML
const cheerio = require("cheerio");

// Importa o chromium do Playwright para renderizar páginas dinâmicas
const { chromium } = require("playwright");

// Importa a configuração central do módulo de anime
const { BASE_URL } = require("../config/anime.config");


// ===============================
// CONFIGURAÇÕES DE RESILIÊNCIA
// ===============================

// Define o total máximo de tentativas por estratégia
const MAX_RETRIES = Number(process.env.SCRAPER_MAX_RETRIES || 3);

// Define o timeout padrão das requisições HTTP
const DEFAULT_HTTP_TIMEOUT = Number(process.env.SCRAPER_HTTP_TIMEOUT || 15000);

// Define o timeout padrão do navegador
const DEFAULT_BROWSER_TIMEOUT = Number(process.env.SCRAPER_BROWSER_TIMEOUT || 25000);

// Define o delay mínimo entre tentativas
const MIN_DELAY_MS = Number(process.env.SCRAPER_MIN_DELAY_MS || 900);

// Define o delay máximo entre tentativas
const MAX_DELAY_MS = Number(process.env.SCRAPER_MAX_DELAY_MS || 2200);

// Define o tempo de espera extra após abrir a página no Playwright
const PLAYWRIGHT_WAIT_AFTER_LOAD_MS = Number(process.env.SCRAPER_PLAYWRIGHT_WAIT_MS || 2500);

// Define se o scraper pode usar proxy
const PROXY_URL = String(process.env.PROXY_URL || "").trim();

// Guarda uma instância reutilizável do browser
let sharedBrowser = null;


// ===============================
// USER AGENTS ROTATIVOS
// ===============================

// Lista de user agents realistas para reduzir padrão repetitivo
const USER_AGENTS = [
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/135.0.0.0 Safari/537.36",
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/134.0.0.0 Safari/537.36",
  "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/135.0.0.0 Safari/537.36",
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/134.0.0.0 Safari/537.36",
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:137.0) Gecko/20100101 Firefox/137.0"
];


// ===============================
// FUNÇÕES AUXILIARES GERAIS
// ===============================

// Remove espaços duplicados e limpa o texto
const cleanText = (text = "") => {
  return String(text).replace(/\s+/g, " ").trim();
};


// Faz espera assíncrona
const sleep = async (ms = 0) => {
  return new Promise((resolve) => setTimeout(resolve, ms));
};


// Gera número aleatório inteiro entre mínimo e máximo
const randomBetween = (min, max) => {
  return Math.floor(Math.random() * (max - min + 1)) + min;
};


// Retorna um item aleatório de uma lista
const pickRandom = (items = []) => {
  if (!Array.isArray(items) || items.length === 0) {
    return "";
  }

  return items[Math.floor(Math.random() * items.length)];
};


// Gera atraso com jitter para reduzir padrão robótico
const getRetryDelay = (attempt = 1) => {
  const exponentialBase = Math.min(attempt, 6);
  const exponentialDelay = Math.pow(2, exponentialBase) * 500;
  const jitter = randomBetween(MIN_DELAY_MS, MAX_DELAY_MS);

  return exponentialDelay + jitter;
};


// Gera viewport aleatória para reduzir padrão fixo
const createRandomViewport = () => {
  return {
    width: randomBetween(1280, 1600),
    height: randomBetween(720, 980)
  };
};


// Converte URL relativa em absoluta
const toAbsoluteUrl = (url = "") => {
  if (!url) {
    return "";
  }

  if (/^https?:\/\//i.test(url)) {
    return url;
  }

  if (url.startsWith("//")) {
    return `https:${url}`;
  }

  if (url.startsWith("/")) {
    return `${BASE_URL}${url}`;
  }

  return `${BASE_URL}/${url}`;
};


// Limpa slug sujo do site
const normalizeAnimeSlug = (slug = "") => {
  let normalizedSlug = String(slug)
    .toLowerCase()
    .trim()
    .replace(/\/+$/, "");

  normalizedSlug = normalizedSlug
    .replace(/-todos-os-episodios.*$/i, "")
    .replace(/-todos-episodios.*$/i, "")
    .replace(/-episodios-online.*$/i, "")
    .replace(/-episodio-online.*$/i, "")
    .replace(/-dublado.*$/i, "")
    .replace(/-legendado.*$/i, "")
    .replace(/-online.*$/i, "")
    .trim();

  return normalizedSlug;
};


// Extrai slug do anime a partir da URL
const getAnimeSlugFromUrl = (url = "") => {
  const normalizedUrl = String(url).replace(/\/+$/, "");

  const match =
    normalizedUrl.match(/\/anime\/([^/?#]+)/i) ||
    normalizedUrl.match(/\/animes\/([^/?#]+)/i);

  if (match && match[1]) {
    return normalizeAnimeSlug(match[1]);
  }

  const parts = normalizedUrl.split("/").filter(Boolean);

  return normalizeAnimeSlug(parts[parts.length - 1] || "");
};


// Extrai número do episódio a partir da URL
const getEpisodeNumberFromUrl = (url = "") => {
  const normalizedUrl = String(url).replace(/\/+$/, "");

  const match =
    normalizedUrl.match(/episodio-(\d+)(?:[/?#]|$)/i) ||
    normalizedUrl.match(/epis[oó]dio[-\/]?(\d+)(?:[/?#]|$)/i) ||
    normalizedUrl.match(/episode[-\/]?(\d+)(?:[/?#]|$)/i) ||
    normalizedUrl.match(/ep[-\/]?(\d+)(?:[/?#]|$)/i) ||
    normalizedUrl.match(/\/(\d+)(?:[/?#]|$)/i);

  if (match && match[1]) {
    return Number(match[1]);
  }

  return null;
};


// Extrai número do episódio a partir do texto
const getEpisodeNumberFromText = (text = "") => {
  const normalizedText = cleanText(text);

  const match =
    normalizedText.match(/epis[oó]dio\s*(\d+)/i) ||
    normalizedText.match(/\bep\.?\s*(\d+)/i) ||
    normalizedText.match(/\bepis[oó]dio[-\s]*(\d+)/i);

  if (match && match[1]) {
    return Number(match[1]);
  }

  return null;
};


// Busca conteúdo de metatag
const getMetaContent = ($, selector) => {
  const value = $(selector).attr("content");
  return cleanText(value || "");
};


// Remove frases comerciais e sujeira do título
const normalizeAnimeTitle = (title = "") => {
  let normalizedTitle = cleanText(title);

  normalizedTitle = normalizedTitle
    .replace(/\s+Todos\s+os\s+Epis[oó]dios\s+Online.*$/i, "")
    .replace(/\s+Todos\s+epis[oó]dios.*$/i, "")
    .replace(/\s+Assistir\s+.*$/i, "")
    .replace(/\s+Online.*$/i, "")
    .replace(/\s+\|\s+.*$/i, "")
    .replace(/\s+-\s+.*$/i, "")
    .trim();

  return normalizedTitle;
};


// Remove lixo de interface e propaganda da sinopse
const cleanSynopsisText = (text = "", animeTitle = "") => {
  let cleaned = String(text);

  cleaned = cleaned
    .replace(/aclib\.runBanner.*?\);?/gis, "")
    .replace(/window\.[\s\S]*?;/gis, "")
    .replace(/document\.[\s\S]*?;/gis, "")
    .replace(/<script.*?>.*?<\/script>/gis, "");

  cleaned = cleaned
    .replace(/todos\s+os\s+epis[oó]dios\s+online/gi, "")
    .replace(/todos\s+epis[oó]dios.*$/gi, "")
    .replace(/assistir\s+.*?\s+online/gi, "")
    .replace(/anime\s+completo/gi, "")
    .replace(/epis[oó]dios\s+dublados?/gi, "")
    .replace(/epis[oó]dios\s+legendados?/gi, "")
    .replace(/veja\s+online/gi, "")
    .replace(/assista\s+online/gi, "");

  if (animeTitle) {
    const escapedTitle = animeTitle.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

    cleaned = cleaned.replace(
      new RegExp(`${escapedTitle}\\s*,?\\s*\\.?\\s*`, "i"),
      ""
    );
  }

  cleaned = cleanText(cleaned);

  cleaned = cleaned
    .replace(/^[,.;:\- ]+/, "")
    .replace(/\s+[,.;:]/g, (match) => match.trim())
    .replace(/,\s*\./g, ".")
    .replace(/\.\s*,/g, ".")
    .trim();

  if (cleaned.length < 20) {
    return "";
  }

  return cleaned;
};


// Tenta obter imagem por múltiplos atributos
const getImageFromElement = ($, element) => {
  const image =
    $(element).find("img").first().attr("src") ||
    $(element).find("img").first().attr("data-src") ||
    $(element).find("img").first().attr("data-lazy-src") ||
    $(element).find("img").first().attr("data-original") ||
    $(element).closest("article").find("img").first().attr("src") ||
    $(element).closest("div").find("img").first().attr("src") ||
    "";

  return toAbsoluteUrl(image);
};


// Deduplica itens por link
const uniqueByLink = (items = []) => {
  const map = new Map();

  items.forEach((item) => {
    if (!item || !item.link) {
      return;
    }

    if (!map.has(item.link)) {
      map.set(item.link, item);
    }
  });

  return Array.from(map.values());
};


// Verifica se um link parece ser página de anime
const looksLikeAnimeLink = (link = "") => {
  const normalizedLink = String(link).replace(/\/+$/, "").toLowerCase();

  if (!normalizedLink) {
    return false;
  }

  if (
    normalizedLink.includes("/anime/") ||
    normalizedLink.includes("/animes/")
  ) {
    if (
      normalizedLink.includes("/episodio") ||
      normalizedLink.includes("/episode") ||
      /\/\d+$/.test(normalizedLink)
    ) {
      return false;
    }

    return true;
  }

  return false;
};


// Verifica se um link parece episódio
const looksLikeEpisodeLink = (link = "", slug = "") => {
  const normalizedLink = String(link)
    .replace(/\/+$/, "")
    .toLowerCase();

  const normalizedSlug = normalizeAnimeSlug(String(slug).toLowerCase());

  if (normalizedSlug && !normalizedLink.includes(normalizedSlug)) {
    return false;
  }

  if (
    normalizedLink.includes("/episodio/") ||
    /episodio-\d+/i.test(normalizedLink) ||
    /epis[oó]dio/i.test(normalizedLink) ||
    /episode/i.test(normalizedLink) ||
    /\/\d+(?:[/?#]|$)/i.test(normalizedLink)
  ) {
    return true;
  }

  return false;
};


// Verifica se um item parece gênero válido
const isValidGenre = (genre = "") => {
  const normalizedGenre = cleanText(genre);

  if (!normalizedGenre) {
    return false;
  }

  if (/^[A-ZÀ-ÿ]$/i.test(normalizedGenre)) {
    return false;
  }

  if (/^\d+$/.test(normalizedGenre)) {
    return false;
  }

  if (/^letra\s+[a-z]$/i.test(normalizedGenre)) {
    return false;
  }

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

  if (blockedGenres.includes(normalizedGenre)) {
    return false;
  }

  if (normalizedGenre.length > 30) {
    return false;
  }

  return true;
};


// Filtra e normaliza gêneros
const normalizeGenres = (genres = []) => {
  const uniqueGenres = [];

  genres.forEach((genre) => {
    const normalizedGenre = cleanText(genre);

    if (!isValidGenre(normalizedGenre)) {
      return;
    }

    if (!uniqueGenres.includes(normalizedGenre)) {
      uniqueGenres.push(normalizedGenre);
    }
  });

  return uniqueGenres;
};


// Tenta limpar o título alternativo
const normalizeAlternativeTitle = (text = "", mainTitle = "") => {
  let normalizedText = cleanText(text);

  normalizedText = normalizedText
    .replace(/todos\s+epis[oó]dios.*$/i, "")
    .replace(/todos\s+os\s+epis[oó]dios.*$/i, "")
    .replace(/assistir\s+.*$/i, "")
    .replace(/online.*$/i, "")
    .trim();

  if (
    normalizedText &&
    mainTitle &&
    normalizedText.toLowerCase() === mainTitle.toLowerCase()
  ) {
    return "";
  }

  if (normalizedText.length < 2) {
    return "";
  }

  return normalizedText;
};


// Detecta nome melhor para o player
const detectPlayerServerName = (url = "", fallback = "player") => {
  const normalizedUrl = String(url).toLowerCase();

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

  return fallback;
};


// ===============================
// DETECÇÃO DE BLOQUEIO / HTML RUIM
// ===============================

// Detecta se o HTML é vazio ou curto demais
const isHtmlTooWeak = (html = "") => {
  const normalizedHtml = String(html || "").trim();

  return !normalizedHtml || normalizedHtml.length < 400;
};


// Detecta sinais comuns de bloqueio do Cloudflare
const isCloudflareBlocked = (html = "") => {
  const normalizedHtml = String(html || "").toLowerCase();

  return (
    normalizedHtml.includes("cloudflare") &&
    (
      normalizedHtml.includes("attention required") ||
      normalizedHtml.includes("verify you are human") ||
      normalizedHtml.includes("checking your browser") ||
      normalizedHtml.includes("cf-browser-verification") ||
      normalizedHtml.includes("cf_chl_") ||
      normalizedHtml.includes("challenge-platform") ||
      normalizedHtml.includes("just a moment") ||
      normalizedHtml.includes("ddos protection by cloudflare")
    )
  );
};


// Detecta páginas de erro mascaradas
const isProtectedOrErrorPage = (html = "") => {
  const normalizedHtml = String(html || "").toLowerCase();

  return (
    isHtmlTooWeak(normalizedHtml) ||
    isCloudflareBlocked(normalizedHtml) ||
    normalizedHtml.includes("<title>access denied") ||
    normalizedHtml.includes("<title>403") ||
    normalizedHtml.includes("<title>429") ||
    normalizedHtml.includes("too many requests") ||
    normalizedHtml.includes("temporarily unavailable") ||
    normalizedHtml.includes("request blocked")
  );
};


// Valida se o HTML recebido parece uma página real
const assertValidHtml = (html = "", url = "") => {
  if (isProtectedOrErrorPage(html)) {
    throw new Error(`HTML inválido, bloqueado ou incompleto para a URL: ${url}`);
  }

  return html;
};


// ===============================
// HEADERS MAIS REALISTAS
// ===============================

// Monta headers padrão mais próximos de navegador real
const createHeaders = (url = BASE_URL) => {
  const userAgent = pickRandom(USER_AGENTS);

  return {
    "User-Agent": userAgent,
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8",
    "Accept-Language": "pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7",
    "Cache-Control": "no-cache",
    "Pragma": "no-cache",
    "Upgrade-Insecure-Requests": "1",
    "Sec-Fetch-Dest": "document",
    "Sec-Fetch-Mode": "navigate",
    "Sec-Fetch-Site": "same-origin",
    "Sec-Fetch-User": "?1",
    "Referer": BASE_URL,
    "Origin": BASE_URL,
    "Connection": "keep-alive"
  };
};


// ===============================
// AXIOS COM RETRY
// ===============================

// Cria uma instância isolada do axios
const createAxiosClient = () => {
  const config = {
    timeout: DEFAULT_HTTP_TIMEOUT,
    maxRedirects: 5,
    validateStatus: (status) => status >= 200 && status < 400
  };

  if (PROXY_URL) {
    config.proxy = false;
  }

  const client = axios.create(config);

  return client;
};


// Faz requisição HTTP com axios e retry inteligente
const fetchHtmlWithAxios = async (url) => {
  const client = createAxiosClient();

  let lastError = null;

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt += 1) {
    try {
      await sleep(randomBetween(300, 900));

      const response = await client.get(url, {
        headers: createHeaders(url),
        ...(PROXY_URL
          ? {
              httpAgent: undefined,
              httpsAgent: undefined
            }
          : {})
      });

      const html = typeof response.data === "string" ? response.data : "";

      assertValidHtml(html, url);

      return html;
    } catch (error) {
      lastError = error;

      if (attempt < MAX_RETRIES) {
        await sleep(getRetryDelay(attempt));
      }
    }
  }

  throw lastError || new Error(`Falha ao buscar HTML via Axios: ${url}`);
};


// ===============================
// PLAYWRIGHT COM SESSÃO PERSISTENTE
// ===============================

// Retorna instância compartilhada do browser
const getSharedBrowser = async () => {
  if (sharedBrowser) {
    return sharedBrowser;
  }

  const launchOptions = {
    headless: true,
    args: [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-dev-shm-usage",
      "--disable-blink-features=AutomationControlled"
    ]
  };

  if (PROXY_URL) {
    launchOptions.proxy = {
      server: PROXY_URL
    };
  }

  sharedBrowser = await chromium.launch(launchOptions);

  return sharedBrowser;
};


// Aplica pequenos ajustes anti-automação no contexto
const prepareContext = async (context) => {
  await context.addInitScript(() => {
    Object.defineProperty(navigator, "webdriver", {
      get: () => undefined
    });

    Object.defineProperty(navigator, "languages", {
      get: () => ["pt-BR", "pt", "en-US", "en"]
    });

    Object.defineProperty(navigator, "platform", {
      get: () => "Win32"
    });

    Object.defineProperty(navigator, "plugins", {
      get: () => [1, 2, 3, 4, 5]
    });

    window.chrome = {
      runtime: {}
    };
  });
};


// Faz requisição renderizada com Playwright e retry inteligente
const fetchHtmlWithPlaywright = async (url) => {
  let lastError = null;

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt += 1) {
    let context = null;
    let page = null;

    try {
      const browser = await getSharedBrowser();

      context = await browser.newContext({
        userAgent: pickRandom(USER_AGENTS),
        viewport: createRandomViewport(),
        locale: "pt-BR",
        javaScriptEnabled: true,
        extraHTTPHeaders: {
          "Accept-Language": "pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7",
          "Referer": BASE_URL,
          "Origin": BASE_URL,
          "Cache-Control": "no-cache",
          "Pragma": "no-cache"
        }
      });

      await prepareContext(context);

      page = await context.newPage();

      await page.route("**/*", async (route) => {
        const request = route.request();
        const resourceType = request.resourceType();
        const resourceUrl = request.url().toLowerCase();

        if (
          resourceType === "font" ||
          resourceType === "media" ||
          resourceType === "websocket" ||
          resourceUrl.includes("doubleclick") ||
          resourceUrl.includes("googlesyndication") ||
          resourceUrl.includes("google-analytics") ||
          resourceUrl.includes("facebook.com/tr")
        ) {
          await route.abort();
          return;
        }

        await route.continue();
      });

      await page.goto(url, {
        waitUntil: "domcontentloaded",
        timeout: DEFAULT_BROWSER_TIMEOUT
      });

      await page.waitForLoadState("networkidle", {
        timeout: 8000
      }).catch(() => null);

      await page.waitForTimeout(PLAYWRIGHT_WAIT_AFTER_LOAD_MS + randomBetween(400, 1300));

      const html = await page.content();

      assertValidHtml(html, url);

      await context.close();

      return html;
    } catch (error) {
      lastError = error;

      if (context) {
        await context.close().catch(() => null);
      }

      if (attempt < MAX_RETRIES) {
        await sleep(getRetryDelay(attempt));
      }
    }
  }

  throw lastError || new Error(`Falha ao buscar HTML via Playwright: ${url}`);
};


// Fecha o browser compartilhado em encerramento do processo
const closeSharedBrowser = async () => {
  if (!sharedBrowser) {
    return;
  }

  await sharedBrowser.close().catch(() => null);

  sharedBrowser = null;
};


// Registra fechamento limpo do browser ao encerrar a aplicação
process.once("SIGINT", () => {
  closeSharedBrowser().finally(() => process.exit(0));
});

process.once("SIGTERM", () => {
  closeSharedBrowser().finally(() => process.exit(0));
});

process.once("beforeExit", () => {
  return closeSharedBrowser();
});


// ===============================
// ESTRATÉGIA HÍBRIDA DE FETCH
// ===============================

// Escolhe melhor estratégia de fetch com fallback robusto
const fetchHtml = async (url, options = {}) => {
  const preferPlaywright = Boolean(options.preferPlaywright);

  const strategies = preferPlaywright
    ? [fetchHtmlWithPlaywright, fetchHtmlWithAxios, fetchHtmlWithPlaywright]
    : [fetchHtmlWithAxios, fetchHtmlWithPlaywright, fetchHtmlWithAxios];

  let lastError = null;

  for (const strategy of strategies) {
    try {
      const html = await strategy(url);

      assertValidHtml(html, url);

      return html;
    } catch (error) {
      lastError = error;
      await sleep(randomBetween(500, 1400));
    }
  }

  throw lastError || new Error(`Falha total ao buscar HTML da URL: ${url}`);
};


// ===============================
// LISTA DE ANIMES
// ===============================
const scrapeHome = async () => {
  const url = BASE_URL;

  const html = await fetchHtml(url, {
    preferPlaywright: true
  });

  const $ = cheerio.load(html);

  const animes = [];
  const seenLinks = new Set();

  $("a[href]").each((index, element) => {
    const href = $(element).attr("href");
    const link = toAbsoluteUrl(href);

    if (!looksLikeAnimeLink(link)) {
      return;
    }

    if (seenLinks.has(link)) {
      return;
    }

    const title = normalizeAnimeTitle(
      cleanText($(element).attr("title")) ||
      cleanText($(element).find("img").attr("alt")) ||
      cleanText($(element).text()) ||
      cleanText($(element).closest("article").text()) ||
      cleanText($(element).closest("div").text())
    );

    if (!title || title.length < 2) {
      return;
    }

    const cover = getImageFromElement($, element);

    seenLinks.add(link);

    animes.push({
      id: animes.length + 1,
      title,
      slug: getAnimeSlugFromUrl(link),
      link,
      cover
    });
  });

  const uniqueItems = uniqueByLink(animes).map((item, index) => ({
    ...item,
    id: index + 1
  }));

  return uniqueItems;
};


// ===============================
// DETALHES DO ANIME
// ===============================
const scrapeAnimeDetails = async (slug) => {
  if (!slug) {
    throw new Error("Slug do anime não informado.");
  }

  const safeSlug = normalizeAnimeSlug(slug);

  const possibleAnimeUrls = [
    `${BASE_URL}/anime/${safeSlug}`,
    `${BASE_URL}/animes/${safeSlug}`
  ];

  let bestResult = null;

  for (const animeUrl of possibleAnimeUrls) {
    try {
      const html = await fetchHtml(animeUrl, {
        preferPlaywright: false
      });

      if (!html) {
        continue;
      }

      const $ = cheerio.load(html);

      const title = normalizeAnimeTitle(
        cleanText($("h1").first().text()) ||
        getMetaContent($, 'meta[property="og:title"]') ||
        getMetaContent($, 'meta[name="twitter:title"]')
      );

      if (
        !title ||
        /pagina nao encontrada/i.test(title) ||
        /erro 404/i.test(title)
      ) {
        continue;
      }

      const rawAlternativeTitle =
        cleanText($("h2").first().text()) ||
        cleanText($("h6").eq(1).text()) ||
        cleanText($("h6").eq(0).text());

      const alternativeTitle = normalizeAlternativeTitle(rawAlternativeTitle, title);

      const cover = toAbsoluteUrl(
        $(".animeCover img").attr("src") ||
        $(".anime-cover img").attr("src") ||
        $(".capa img").attr("src") ||
        $("img").first().attr("src") ||
        getMetaContent($, 'meta[property="og:image"]')
      );

      const scoreText =
        cleanText($("h4").first().text()) ||
        cleanText($("[class*='score']").first().text());

      const rawSynopsis =
        cleanText($(".sinopse").text()) ||
        cleanText($("[class*='sinopse']").text()) ||
        cleanText($("[class*='synopsis']").text()) ||
        cleanText($(".description").text()) ||
        getMetaContent($, 'meta[property="og:description"]');

      const synopsis = cleanSynopsisText(rawSynopsis, title);

      const rawGenres = [];

      $("a[href*='/genero/'], a[href*='/genre/'], a[href*='/genres/']").each((index, element) => {
        const genre = cleanText($(element).text());

        if (genre) {
          rawGenres.push(genre);
        }
      });

      const genres = normalizeGenres(rawGenres);

      const bodyText = cleanText($("body").text());

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

      bestResult = {
        title,
        alternativeTitle,
        slug: safeSlug,
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

      break;
    } catch (error) {
      continue;
    }
  }

  if (!bestResult) {
    return null;
  }

  return bestResult;
};


// ===============================
// EPISÓDIOS DO ANIME
// ===============================
const scrapeAnimeEpisodes = async (slug) => {
  if (!slug) {
    throw new Error("Slug do anime não informado.");
  }

  const safeSlug = normalizeAnimeSlug(slug);

  const possibleAnimeUrls = [
    `${BASE_URL}/anime/${safeSlug}`,
    `${BASE_URL}/animes/${safeSlug}`
  ];

  const rawEpisodes = [];
  const seenLinks = new Set();

  for (const animeUrl of possibleAnimeUrls) {
    try {
      const html = await fetchHtml(animeUrl, {
        preferPlaywright: false
      });

      if (!html) {
        continue;
      }

      const $ = cheerio.load(html);

      const pageTitle =
        cleanText($("h1").first().text()) ||
        getMetaContent($, 'meta[property="og:title"]');

      if (
        /pagina nao encontrada/i.test(pageTitle) ||
        /erro 404/i.test(pageTitle)
      ) {
        continue;
      }

      $("a[href]").each((index, element) => {
        const href = $(element).attr("href");
        const link = toAbsoluteUrl(href);

        if (!looksLikeEpisodeLink(link, safeSlug)) {
          return;
        }

        if (seenLinks.has(link)) {
          return;
        }

        const rawTitle =
          cleanText($(element).attr("title")) ||
          cleanText($(element).text()) ||
          cleanText($(element).closest("article").text()) ||
          cleanText($(element).closest("div").text());

        const episodeNumber =
          getEpisodeNumberFromText(rawTitle) ||
          getEpisodeNumberFromUrl(link);

        if (!episodeNumber) {
          return;
        }

        seenLinks.add(link);

        rawEpisodes.push({
          id: rawEpisodes.length + 1,
          number: episodeNumber,
          title: `Episódio ${episodeNumber}`,
          slug: safeSlug,
          link
        });
      });

      if (rawEpisodes.length > 0) {
        break;
      }
    } catch (error) {
      continue;
    }
  }

  rawEpisodes.sort((a, b) => a.number - b.number);

  const episodeMap = new Map();

  rawEpisodes.forEach((episode) => {
    const key = `ep_${episode.number}`;

    if (!episodeMap.has(key)) {
      episodeMap.set(key, episode);
    }
  });

  const episodes = Array.from(episodeMap.values()).map((episode, index) => ({
    ...episode,
    id: index + 1
  }));

  return episodes;
};


// ===============================
// PLAYER DO EPISÓDIO
// ===============================
const scrapeAnimeEpisodePlayer = async (slug, episodeNumber) => {
  if (!slug) {
    throw new Error("Slug do anime não informado.");
  }

  if (!episodeNumber) {
    throw new Error("Número do episódio não informado.");
  }

  const safeSlug = normalizeAnimeSlug(slug);

  const realEpisodeUrl =
    `${BASE_URL}/episodio/${safeSlug}-episodio-${episodeNumber}/`;

  const possibleEpisodeUrls = [
    realEpisodeUrl,
    `${BASE_URL}/anime/${safeSlug}/episodio/${episodeNumber}`,
    `${BASE_URL}/animes/${safeSlug}/episodio/${episodeNumber}`,
    `${BASE_URL}/anime/${safeSlug}/${episodeNumber}`,
    `${BASE_URL}/animes/${safeSlug}/${episodeNumber}`
  ];

  const players = [];
  const seen = new Set();

  const pushPlayer = (server, type, url) => {
    if (!url) {
      return;
    }

    const finalUrl = toAbsoluteUrl(url);

    if (seen.has(finalUrl)) {
      return;
    }

    seen.add(finalUrl);

    const detectedServer = detectPlayerServerName(finalUrl, server);

    players.push({
      server: cleanText(detectedServer || "player"),
      type: cleanText(type || "embed"),
      url: finalUrl
    });
  };

  for (const episodeUrl of possibleEpisodeUrls) {
    try {
      const html = await fetchHtml(episodeUrl, {
        preferPlaywright: false
      });

      if (!html) {
        continue;
      }

      const $ = cheerio.load(html);

      $("iframe").each((index, element) => {
        const src = $(element).attr("src");
        pushPlayer(`iframe_${index + 1}`, "iframe", src);
      });

      $("video").each((index, element) => {
        const src = $(element).attr("src");
        pushPlayer(`video_${index + 1}`, "video", src);
      });

      $("video source, source").each((index, element) => {
        const src = $(element).attr("src");
        pushPlayer(`source_${index + 1}`, "video", src);
      });

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

      if (players.length > 0) {
        return {
          title: `Episódio ${episodeNumber}`,
          slug: safeSlug,
          episodeNumber: Number(episodeNumber),
          episodeUrl,
          players
        };
      }
    } catch (error) {
      continue;
    }
  }

  return {
    title: `Episódio ${episodeNumber}`,
    slug: safeSlug,
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