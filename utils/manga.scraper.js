// Importa o axios para fazer requisições HTTP
const axios = require("axios");

// Importa o cheerio para manipular o HTML
const cheerio = require("cheerio");

// Importa o chromium do Playwright para abrir páginas como navegador real
const { chromium } = require("playwright");

// Importa a configuração central da fonte
const SOURCE_CONFIG = require("../config/source.config");

// Define a URL base do site
const BASE_URL = SOURCE_CONFIG.BASE_URL;

// Define o caminho base de mangás
const MANGA_PATH = SOURCE_CONFIG.MANGA_PATH;

// Define o caminho base de capítulos
const CHAPTER_PATH = SOURCE_CONFIG.CHAPTER_PATH;

// Define o referer
const REFERER = SOURCE_CONFIG.REFERER;


// Função auxiliar para converter URL relativa em absoluta
const toAbsoluteUrl = (url) => {
  // Se não existir URL, retorna null
  if (!url) return null;

  // Se já for absoluta, retorna direto
  if (url.startsWith("http")) return url;

  // Se começar com barra, concatena com a base
  if (url.startsWith("/")) {
    return `${BASE_URL}${url}`;
  }

  // Se não começar com barra, adiciona manualmente
  return `${BASE_URL}/${url}`;
};


// Função auxiliar para limpar textos
const cleanText = (text = "") => {
  // Remove espaços duplicados e limpa as pontas
  return String(text).replace(/\s+/g, " ").trim();
};


// Função auxiliar para extrair slug da URL
const getSlugFromUrl = (url = "") => {
  // Se não existir URL, retorna vazio
  if (!url) return "";

  // Remove barras extras do final
  const normalizedUrl = String(url).replace(/\/+$/, "");

  // Divide a URL em partes
  const parts = normalizedUrl.split("/").filter(Boolean);

  // Retorna a última parte
  return parts[parts.length - 1] || "";
};


// Função auxiliar para pegar metadados
const getMetaContent = ($, selector) => {
  // Busca conteúdo da metatag
  const content = $(selector).attr("content");

  // Retorna texto limpo
  return cleanText(content || "");
};


// Função auxiliar de configuração do axios
const createRequestConfig = () => {
  return {
    timeout: 30000,
    maxRedirects: 5,
    validateStatus: () => true,
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
      "Accept":
        "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8",
      "Accept-Language":
        "pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7",
      "Accept-Encoding":
        "gzip, deflate, br",
      "Cache-Control":
        "no-cache",
      "Pragma":
        "no-cache",
      "Upgrade-Insecure-Requests":
        "1",
      "Sec-Fetch-Dest":
        "document",
      "Sec-Fetch-Mode":
        "navigate",
      "Sec-Fetch-Site":
        "none",
      "Sec-Fetch-User":
        "?1",
      "Referer":
        REFERER,
      "Connection":
        "keep-alive",
    },
  };
};


// Função auxiliar para detectar página de bloqueio

const isBlockedResponse = (status, html = "", title = "") => {
  // Normaliza HTML e título em minúsculo
  const lowerHtml = String(html).toLowerCase();
  const lowerTitle = String(title).toLowerCase();

  // Se status for bloqueio clássico, considera bloqueado
  if (status === 403 || status === 429 || status === 503) {
    return true;
  }

  // Termos realmente fortes de challenge/bloqueio
  const strongBlockedTerms = [
    "just a moment",
    "attention required",
    "checking your browser",
    "verify you are human",
    "cf-browser-verification",
    "please enable cookies",
    "captcha challenge",
    "why have i been blocked",
    "sorry, you have been blocked",
    "security check to access",
  ];

  // Se o título tiver cara de bloqueio, bloqueia
  if (strongBlockedTerms.some((term) => lowerTitle.includes(term))) {
    return true;
  }

  // Se o HTML tiver cara de challenge real, bloqueia
  if (strongBlockedTerms.some((term) => lowerHtml.includes(term))) {
    return true;
  }

  // Cloudflare sozinho não prova bloqueio
  // captcha sozinho também não prova bloqueio
  // então aqui retornamos false por padrão
  return false;
};


// Função auxiliar para buscar HTML com axios
const fetchHtmlWithAxios = async (url) => {
  // Faz request
  const response = await axios.get(url, createRequestConfig());

  // Extrai HTML
  const html =
    typeof response.data === "string"
      ? response.data
      : "";

  // Extrai título bruto do HTML
  const titleMatch = html.match(/<title[^>]*>(.*?)<\/title>/i);
  const title = titleMatch ? cleanText(titleMatch[1]) : "";

  // Detecta bloqueio com regra mais confiável
  const blocked = isBlockedResponse(response.status, html, title);

  // Log de debug
  console.log("DEBUG axios fetch:", {
    url,
    status: response.status,
    title,
    blocked,
  });

  // Retorna dados
  return {
    html,
    status: response.status,
    blocked,
    method: "axios",
    title,
  };
};

// Função auxiliar para buscar HTML com Playwright
const fetchHtmlWithPlaywright = async (url) => {
  // Guarda browser
  let browser = null;

  try {
    // Abre navegador chromium
    browser = await chromium.launch({
      headless: true,
    });

    // Cria contexto com user agent mais realista
    const context = await browser.newContext({
      userAgent:
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
      viewport: {
        width: 1366,
        height: 768,
      },
      locale: "pt-BR",
      extraHTTPHeaders: {
        "Accept-Language": "pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7",
        "Referer": REFERER,
      },
    });

    // Cria nova aba
    const page = await context.newPage();

    // Vai para a página
    const response = await page.goto(url, {
      waitUntil: "domcontentloaded",
      timeout: 45000,
    });

    // Aguarda um pouco para a página terminar de montar
    await page.waitForTimeout(5000);

    // Pega HTML final
    const html = await page.content();

    // Pega status se existir resposta
    const status = response ? response.status() : 200;

    // Pega título da página
    const title = cleanText(await page.title());

    // Detecta bloqueio com regra mais confiável
    const blocked = isBlockedResponse(status, html, title);

    // Log de debug
    console.log("DEBUG playwright fetch:", {
      url,
      status,
      title,
      blocked,
    });

    // Fecha contexto
    await context.close();

    // Fecha navegador
    await browser.close();

    // Zera referência
    browser = null;

    // Retorna dados
    return {
      html,
      status,
      blocked,
      method: "playwright",
      title,
    };

  } catch (error) {
    // Se browser estiver aberto, fecha
    if (browser) {
      await browser.close();
    }

    // Repassa erro
    throw error;
  }
};


// Função auxiliar para buscar HTML usando axios primeiro e Playwright como fallback
const fetchHtml = async (url) => {
  try {
    // Tenta via axios primeiro
    const axiosResult = await fetchHtmlWithAxios(url);

    // Se não estiver bloqueado e tiver HTML válido, usa axios
    if (
      !axiosResult.blocked &&
      axiosResult.html &&
      axiosResult.html.length > 0
    ) {
      return axiosResult;
    }

    // Loga fallback
    console.log(`FALLBACK PLAYWRIGHT: ${url}`);

    // Tenta via Playwright
    const playwrightResult = await fetchHtmlWithPlaywright(url);

    // Retorna resultado do Playwright
    return playwrightResult;

  } catch (error) {
    // Se axios falhar, tenta Playwright direto
    console.log(`ERRO AXIOS, TENTANDO PLAYWRIGHT: ${url}`);

    return fetchHtmlWithPlaywright(url);
  }
};


// Função auxiliar para detectar se o texto parece inglês
const looksLikeEnglish = (text = "") => {
  // Lista simples de palavras comuns
  const englishWords = [
    "the",
    "and",
    "of",
    "in",
    "to",
    "is",
    "with",
    "his",
    "her",
    "father",
    "town",
    "living",
    "wealthy",
    "slums",
    "foster",
    "search"
  ];

  // Converte o texto para minúsculo
  const lowerText = String(text).toLowerCase();

  // Contador
  let count = 0;

  // Verifica quantas palavras existem
  englishWords.forEach((word) => {
    if (lowerText.includes(word)) {
      count++;
    }
  });

  // Se tiver muitas palavras em inglês, considera inglês
  return count >= 3;
};


// Função auxiliar para escolher a melhor sinopse
const pickBestSynopsis = ($) => {
  // Lista de possíveis áreas de sinopse
  const synopsisCandidates = [
    cleanText($(".synopsis-content").text()),
    cleanText($(".summary__content").text()),
    cleanText($(".description-summary").text()),
    cleanText($(".manga-excerpt").text()),
    cleanText($(".entry-content").text()),
  ];

  // Guarda sinopse em português
  let portugueseSynopsis = "";

  // Guarda sinopse em inglês
  let englishSynopsis = "";

  // Percorre candidatas
  for (const candidate of synopsisCandidates) {
    // Ignora vazias
    if (!candidate) continue;

    // Se parecer inglês, guarda como fallback
    if (looksLikeEnglish(candidate)) {
      if (!englishSynopsis) {
        englishSynopsis = candidate;
      }
      continue;
    }

    // Se não parecer inglês, usa como principal
    portugueseSynopsis = candidate;
    break;
  }

  // Retorna português se existir
  if (portugueseSynopsis) {
    return cleanText(portugueseSynopsis);
  }

  // Retorna inglês se for o único disponível
  if (englishSynopsis) {
    return cleanText(englishSynopsis);
  }

  // Último fallback via metatag
  const metaDescription =
    getMetaContent($, 'meta[property="og:description"]') ||
    getMetaContent($, 'meta[name="description"]');

  return cleanText(metaDescription);
};


// Função auxiliar para extrair blocos de texto por label
const extractBlockValue = (text = "", startLabels = [], endLabels = []) => {
  // Limpa o texto
  const normalizedText = cleanText(text);

  // Se estiver vazio, retorna vazio
  if (!normalizedText) return "";

  // Percorre os labels iniciais
  for (const startLabel of startLabels) {
    // Escapa o label inicial
    const escapedStart = startLabel.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

    // Escapa labels finais
    const escapedEnds = endLabels
      .map((label) => label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
      .join("|");

    // Monta regex
    const regex = escapedEnds
      ? new RegExp(`${escapedStart}\\s*:?\\s*(.*?)(?=\\s+(?:${escapedEnds})\\s*:|$)`, "i")
      : new RegExp(`${escapedStart}\\s*:?\\s*(.*)$`, "i");

    // Executa regex
    const match = normalizedText.match(regex);

    // Se encontrou, retorna
    if (match && match[1]) {
      return cleanText(match[1]);
    }
  }

  // Se não encontrou, retorna vazio
  return "";
};


// Função auxiliar para remover ruídos de interface
const stripUiNoise = (value = "") => {
  // Remove textos indesejados
  return cleanText(
    value
      .replace(/Iniciar Leitura.*/i, "")
      .replace(/Favoritar.*/i, "")
      .replace(/Compartilhar.*/i, "")
      .replace(/Capítulos Relacionados.*/i, "")
      .replace(/Capítulos.*/i, "")
      .replace(/Lista.*/i, "")
      .replace(/Grid.*/i, "")
      .replace(/Ler Capítulo.*/i, "")
  );
};


// Função auxiliar para extrair metadados
const extractMetadata = ($) => {
  // Fontes de texto possíveis
  const metadataSources = [
    cleanText($(".manga-meta-item").text()),
    cleanText($(".post-status").text()),
    cleanText($(".summary_content").text()),
    cleanText($(".summary_content_wrap").text()),
    cleanText($(".post-content").text()),
    cleanText($(".summary__content").text()),
    cleanText($("body").text()),
  ];

  // Junta tudo
  const combinedText = cleanText(metadataSources.join(" "));

  // Extrai status
  const rawStatus = extractBlockValue(
    combinedText,
    ["Status"],
    ["Autor", "Author", "Artista", "Artist", "Ano", "Year"]
  );

  // Extrai autor
  const rawAuthor = extractBlockValue(
    combinedText,
    ["Autor", "Author"],
    ["Artista", "Artist", "Ano", "Year"]
  );

  // Extrai artista
  const rawArtist = extractBlockValue(
    combinedText,
    ["Artista", "Artist"],
    ["Ano", "Year"]
  );

  // Extrai ano
  const yearMatch = combinedText.match(/(?:Ano|Year)\s*:?\s*(19\d{2}|20\d{2})/i);
  const rawYear = yearMatch && yearMatch[1] ? yearMatch[1] : "";

  // Retorna objeto
  return {
    status: stripUiNoise(rawStatus),
    author: stripUiNoise(rawAuthor),
    artist: stripUiNoise(rawArtist),
    year: stripUiNoise(rawYear),
  };
};


// Função auxiliar para escolher o melhor capítulo duplicado
const chooseBetterChapter = (currentChapter, newChapter) => {
  // Se não existir atual, usa o novo
  if (!currentChapter) {
    return newChapter;
  }

  // Verifica se o slug atual tem sufixo numérico
  const currentHasSuffix = /-\d+$/.test(currentChapter.slug);

  // Verifica se o novo slug tem sufixo numérico
  const newHasSuffix = /-\d+$/.test(newChapter.slug);

  // Prefere o slug sem sufixo
  if (currentHasSuffix && !newHasSuffix) {
    return newChapter;
  }

  // Mantém o atual se ele estiver mais limpo
  if (!currentHasSuffix && newHasSuffix) {
    return currentChapter;
  }

  // Prefere o título maior
  if (newChapter.title.length > currentChapter.title.length) {
    return newChapter;
  }

  // Senão mantém o atual
  return currentChapter;
};


// Função auxiliar para normalizar capítulos
const normalizeChapters = (chapters = []) => {
  // Mapa de capítulos únicos
  const uniqueChaptersMap = new Map();

  // Percorre a lista
  chapters.forEach((chapter) => {
    // Define chave
    const chapterKey =
      chapter.number !== null
        ? `number_${chapter.number}`
        : `slug_${chapter.slug}`;

    // Busca capítulo atual
    const existingChapter = uniqueChaptersMap.get(chapterKey);

    // Escolhe a melhor versão
    const bestChapter = chooseBetterChapter(existingChapter, chapter);

    // Salva
    uniqueChaptersMap.set(chapterKey, bestChapter);
  });

  // Converte para array
  const normalizedChapters = Array.from(uniqueChaptersMap.values());

  // Ordena
  normalizedChapters.sort((a, b) => {
    if (a.number !== null && b.number !== null) {
      return a.number - b.number;
    }

    return a.title.localeCompare(b.title, "pt-BR", { numeric: true });
  });

  // Recria ids
  normalizedChapters.forEach((chapter, index) => {
    chapter.id = index + 1;
  });

  // Retorna
  return normalizedChapters;
};


// Função auxiliar para decidir se link parece de mangá
const isMangaLink = (link = "") => {
  // Se não existir link, retorna false
  if (!link) return false;

  // Normaliza
  const normalizedLink = String(link).toLowerCase();

  // Valida
  return (
    normalizedLink.includes(`${MANGA_PATH}/`) &&
    !normalizedLink.includes(`${CHAPTER_PATH}/`) &&
    !normalizedLink.includes("wp-content") &&
    !normalizedLink.includes("wp-json") &&
    !normalizedLink.includes("#")
  );
};


// Função auxiliar para validar título
const isValidTitle = (title = "") => {
  // Limpa título
  const normalizedTitle = cleanText(title);

  // Valida básico
  if (!normalizedTitle) return false;
  if (normalizedTitle.length < 2) return false;
  if (/^[\d\s.,-]+$/.test(normalizedTitle)) return false;

  // Lista de bloqueio
  const blockedTitles = [
    "Home",
    "Manga",
    "Entrar",
    "Registrar",
    "Capítulo",
    "Capitulo",
    "Leia mais",
    "Ver mais",
    "Próximo",
    "Anterior",
  ];

  // Retorna
  return !blockedTitles.includes(normalizedTitle);
};


// Função auxiliar para tentar extrair capa próxima
const findCoverNearElement = ($, element) => {
  // Tenta vários pontos
  let cover =
    $(element).find("img").first().attr("src") ||
    $(element).find("img").first().attr("data-src") ||
    $(element).find("img").first().attr("data-lazy-src") ||
    $(element).closest("article").find("img").first().attr("src") ||
    $(element).closest("article").find("img").first().attr("data-src") ||
    $(element).closest("div").find("img").first().attr("src") ||
    $(element).closest("div").find("img").first().attr("data-src") ||
    null;

  // Converte para absoluta
  return toAbsoluteUrl(cover);
};



// FUNÇÃO: BUSCAR MANGÁS DA HOME
// USANDO PLAYWRIGHT DIRETO NO DOM
// ===============================
const scrapeHome = async () => {
  // Guarda browser
  let browser = null;

  try {
    // Define URL da home
    const homeUrl = `${BASE_URL}/page/1/`;

    // Loga início
    console.log("SCRAPING HOME:", homeUrl);

    // Tenta primeiro com axios só para diagnóstico
    const axiosResult = await fetchHtmlWithAxios(homeUrl);

    // Se axios sozinho já conseguir retornar algo útil, ainda assim vamos usar Playwright
    // porque queremos ler o DOM final já renderizado
    console.log("DEBUG HOME AXIOS:", {
      status: axiosResult.status,
      title: axiosResult.title,
      blocked: axiosResult.blocked,
    });

    // Abre navegador
    browser = await chromium.launch({
      headless: true,
    });

    // Cria contexto
    const context = await browser.newContext({
      userAgent:
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
      viewport: {
        width: 1366,
        height: 768,
      },
      locale: "pt-BR",
      extraHTTPHeaders: {
        "Accept-Language": "pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7",
        "Referer": REFERER,
      },
    });

    // Cria página
    const page = await context.newPage();

    // Vai para a página
    const response = await page.goto(homeUrl, {
      waitUntil: "domcontentloaded",
      timeout: 45000,
    });

    // Aguarda renderização
    await page.waitForTimeout(6000);

    // Tenta rolar um pouco para disparar lazy load
    await page.mouse.wheel(0, 1500);
    await page.waitForTimeout(2000);

    // Lista de seletores candidatos
    const candidateSelectors = [
      ".page-item-detail",
      ".post-title",
      ".item-summary",
      ".bsx",
      ".utao",
      ".listupd .bs",
      ".page-item-detail.manga",
      "a[href*='/manga/']",
    ];

    // Conta quantos elementos existem em cada seletor
    const selectorCounts = {};

    for (const selector of candidateSelectors) {
      const count = await page.locator(selector).count();
      selectorCounts[selector] = count;
    }

    // Extrai links diretos de mangá do DOM renderizado
    const mangas = await page.$$eval(
      "a[href*='/manga/']",
      (links) => {
        const results = [];
        const seen = new Set();

        links.forEach((linkElement) => {
          const href = linkElement.href;

          if (!href) return;
          if (seen.has(href)) return;

          const text =
            (linkElement.textContent || "").replace(/\s+/g, " ").trim();

          const img = linkElement.querySelector("img");

          const imgAlt = img
            ? (img.getAttribute("alt") || "").replace(/\s+/g, " ").trim()
            : "";

          const titleAttr =
            (linkElement.getAttribute("title") || "").replace(/\s+/g, " ").trim();

          const title = text || titleAttr || imgAlt;

          if (!title) return;

          const cover = img
            ? img.getAttribute("src") || img.getAttribute("data-src") || ""
            : "";

          seen.add(href);

          results.push({
            title,
            link: href,
            cover,
          });
        });

        return results;
      }
    );

    // Filtra melhor os resultados
    const filteredMangas = mangas
      .filter((item) => {
        const lowerLink = String(item.link).toLowerCase();
        const lowerTitle = String(item.title).toLowerCase();

        // Tem que ser rota de mangá
        if (!lowerLink.includes("/manga/")) return false;

        // Ignora coisas muito curtas ou ruins
        if (!item.title || item.title.trim().length < 2) return false;

        // Ignora textos de interface
        const blockedTitles = [
          "home",
          "manga",
          "capítulo",
          "capitulo",
          "próximo",
          "anterior",
          "ler",
          "leia mais",
          "ver mais",
        ];

        if (blockedTitles.includes(lowerTitle)) return false;

        return true;
      })
      .map((item, index) => ({
        id: index + 1,
        title: cleanText(item.title),
        slug: getSlugFromUrl(item.link),
        link: toAbsoluteUrl(item.link),
        cover: toAbsoluteUrl(item.cover),
      }));

    // Remove duplicados por link
    const uniqueMap = new Map();

    filteredMangas.forEach((item) => {
      if (!uniqueMap.has(item.link)) {
        uniqueMap.set(item.link, item);
      }
    });

    const finalMangas = Array.from(uniqueMap.values());

    // Debug forte
    console.log("DEBUG scrapeHome PLAYWRIGHT:", {
      url: homeUrl,
      httpStatus: response ? response.status() : 200,
      pageTitle: cleanText(await page.title()),
      selectorCounts,
      totalRaw: mangas.length,
      totalFinal: finalMangas.length,
      sample: finalMangas.slice(0, 5),
    });

    // Fecha contexto
    await context.close();

    // Fecha navegador
    await browser.close();
    browser = null;

    return finalMangas;

  } catch (error) {
    // Fecha browser se necessário
    if (browser) {
      await browser.close();
    }

    console.error("Erro ao buscar mangás:", error.message);
    return [];
  }
};


// ===============================
// FUNÇÃO: BUSCAR DETALHES DO MANGÁ
// ===============================
const scrapeMangaDetails = async (slug) => {
  try {
    // Valida slug
    if (!slug) {
      throw new Error("Slug do mangá não informado.");
    }

    // Monta URL
    const mangaUrl = `${BASE_URL}${MANGA_PATH}/${slug}/`;

    // Busca HTML usando axios ou Playwright
    const result = await fetchHtml(mangaUrl);

    // Se ainda estiver bloqueado, retorna null
    if (result.blocked) {
      console.log("BLOQUEIO DETECTADO NOS DETALHES:", {
        slug,
        status: result.status,
        method: result.method,
      });
      return null;
    }

    // Carrega HTML
    const $ = cheerio.load(result.html);

    // Título
    let title =
      cleanText($("h1.manga-title").first().text()) ||
      cleanText($("h1").first().text()) ||
      cleanText($(".post-title").first().text()) ||
      cleanText($(".entry-title").first().text()) ||
      getMetaContent($, 'meta[property="og:title"]') ||
      getMetaContent($, 'meta[name="twitter:title"]');

    title = title
      .replace(/\s*[-|]\s*Manga Livre.*$/i, "")
      .replace(/\s*[-|]\s*Leia.*$/i, "")
      .trim();

    // Capa
    let cover =
      $(".summary_image img").attr("src") ||
      $(".thumb img").attr("src") ||
      $(".post img").first().attr("src") ||
      $('meta[property="og:image"]').attr("content") ||
      $('meta[name="twitter:image"]').attr("content") ||
      null;

    cover = toAbsoluteUrl(cover);

    // Sinopse
    const synopsis = pickBestSynopsis($);

    // Metadados
    const metadata = extractMetadata($);

    // Gêneros
    const genres = [];

    $(".manga-tag, .genres a, .manga-genres a, .genres-content a, a[href*='/genero/'], a[href*='/genre/']").each((index, element) => {
      const genre = cleanText($(element).text());

      if (genre && !genres.includes(genre)) {
        genres.push(genre);
      }
    });

    // Lista crua de capítulos
    const rawChapters = [];

    // Evita repetidos
    const seenLinks = new Set();

    // Primeiro tenta pelos seletores mais comuns
    $(".chapters-list .chapter-item, .wp-manga-chapter, li.wp-manga-chapter").each((index, element) => {
      const linkElement = $(element).find("a").first();

      let link = linkElement.attr("href");

      const title =
        cleanText($(element).find(".chapter-number").text()) ||
        cleanText(linkElement.text()) ||
        cleanText($(element).text());

      if (!link || !title) return;

      link = toAbsoluteUrl(link);

      if (seenLinks.has(link)) return;
      seenLinks.add(link);

      const chapterSlug = getSlugFromUrl(link);
      const numberMatch = title.match(/(\d+(\.\d+)?)/);
      const number = numberMatch ? Number(numberMatch[1]) : null;

      rawChapters.push({
        id: rawChapters.length + 1,
        title,
        slug: chapterSlug,
        link,
        number,
      });
    });

    // Fallback amplo
    if (rawChapters.length === 0) {
      $("a").each((index, element) => {
        const chapterTitle = cleanText($(element).text());
        let link = $(element).attr("href");

        if (!link) return;

        link = toAbsoluteUrl(link);

        const looksLikeChapter =
          chapterTitle.toLowerCase().includes("capítulo") ||
          chapterTitle.toLowerCase().includes("capitulo") ||
          chapterTitle.toLowerCase().includes("chapter") ||
          link.toLowerCase().includes(`${CHAPTER_PATH}/`);

        if (chapterTitle.toLowerCase().includes("iniciar")) return;
        if (!looksLikeChapter) return;
        if (seenLinks.has(link)) return;

        seenLinks.add(link);

        const chapterSlug = getSlugFromUrl(link);
        const numberMatch = chapterTitle.match(/(\d+(\.\d+)?)/);
        const number = numberMatch ? Number(numberMatch[1]) : null;

        rawChapters.push({
          id: rawChapters.length + 1,
          title: chapterTitle,
          slug: chapterSlug,
          link,
          number,
        });
      });
    }

    // Normaliza capítulos
    const chapters = normalizeChapters(rawChapters);

    // Pega os 2 mais recentes
    const latestChapters = chapters.slice(-2).reverse();

    // Debug
    console.log("DEBUG scrapeMangaDetails:", {
      slug,
      title,
      cover,
      synopsisLength: synopsis.length,
      genresCount: genres.length,
      rawChaptersCount: rawChapters.length,
      chaptersCount: chapters.length,
      latestChaptersCount: latestChapters.length,
      status: metadata.status,
      author: metadata.author,
      artist: metadata.artist,
      year: metadata.year,
      method: result.method,
      httpStatus: result.status,
    });

    // Fallback pelo home
    if (!title) {
      const mangas = await scrapeHome();

      const mangaFromHome = mangas.find(
        (item) => item.slug === slug
      );

      if (mangaFromHome) {
        title = mangaFromHome.title;
        cover = cover || mangaFromHome.cover || null;
      }
    }

    // Se ainda não tiver título, retorna null
    if (!title) {
      return null;
    }

    // Retorna dados completos
    return {
      title,
      slug,
      link: mangaUrl,
      cover,
      synopsis,
      status: metadata.status,
      author: metadata.author,
      artist: metadata.artist,
      year: metadata.year,
      genres,
      chapters,
      latestChapters,
    };

  } catch (error) {
    console.error("Erro ao buscar detalhes do mangá:", error.message);
    return null;
  }
};


// ===============================
// FUNÇÃO: BUSCAR CAPÍTULOS
// ===============================
const scrapeChapters = async (mangaUrl) => {
  try {
    // Busca HTML usando axios ou Playwright
    const result = await fetchHtml(mangaUrl);

    // Se ainda estiver bloqueado, retorna vazio
    if (result.blocked) {
      console.log("BLOQUEIO DETECTADO EM CHAPTERS:", {
        mangaUrl,
        status: result.status,
        method: result.method,
      });
      return [];
    }

    // Carrega HTML
    const $ = cheerio.load(result.html);

    // Lista bruta
    const rawChapters = [];

    // Evita duplicados
    const seenLinks = new Set();

    // Seletor principal
    $(".chapters-list .chapter-item, .wp-manga-chapter, li.wp-manga-chapter").each((index, element) => {
      const linkElement = $(element).find("a").first();

      let link = linkElement.attr("href");

      const title =
        cleanText($(element).find(".chapter-number").text()) ||
        cleanText(linkElement.text()) ||
        cleanText($(element).text());

      if (!link || !title) return;

      link = toAbsoluteUrl(link);

      if (seenLinks.has(link)) return;
      seenLinks.add(link);

      const slug = getSlugFromUrl(link);
      const numberMatch = title.match(/(\d+(\.\d+)?)/);
      const number = numberMatch ? Number(numberMatch[1]) : null;

      rawChapters.push({
        id: rawChapters.length + 1,
        title,
        slug,
        link,
        number,
      });
    });

    // Fallback amplo
    if (rawChapters.length === 0) {
      $("a").each((index, element) => {
        const title = cleanText($(element).text());
        let link = $(element).attr("href");

        if (!link) return;

        link = toAbsoluteUrl(link);

        const looksLikeChapter =
          title.toLowerCase().includes("capítulo") ||
          title.toLowerCase().includes("capitulo") ||
          title.toLowerCase().includes("chapter") ||
          link.toLowerCase().includes(`${CHAPTER_PATH}/`);

        if (title.toLowerCase().includes("iniciar")) return;
        if (!looksLikeChapter) return;
        if (seenLinks.has(link)) return;

        seenLinks.add(link);

        const slug = getSlugFromUrl(link);
        const numberMatch = title.match(/(\d+(\.\d+)?)/);
        const number = numberMatch ? Number(numberMatch[1]) : null;

        rawChapters.push({
          id: rawChapters.length + 1,
          title,
          slug,
          link,
          number,
        });
      });
    }

    // Normaliza
    const chapters = normalizeChapters(rawChapters);

    return chapters;

  } catch (error) {
    console.error("Erro ao buscar capítulos:", error.message);
    return [];
  }
};


// ===============================
// FUNÇÃO: BUSCAR PÁGINAS
// ===============================
const scrapePages = async (chapterUrl) => {
  try {
    // Busca HTML usando axios ou Playwright
    const result = await fetchHtml(chapterUrl);

    // Se ainda estiver bloqueado, retorna vazio
    if (result.blocked) {
      console.log("BLOQUEIO DETECTADO NAS PÁGINAS:", {
        chapterUrl,
        status: result.status,
        method: result.method,
      });
      return [];
    }

    // Carrega HTML
    const $ = cheerio.load(result.html);

    // Lista final
    const pages = [];

    // Evita repetidas
    const seenImages = new Set();

    // Função para validar imagens reais
    const isValidPageImageUrl = (url = "") => {
      if (!url) return false;

      const lowerUrl = url.toLowerCase();

      const isImageFile =
        lowerUrl.includes(".jpg") ||
        lowerUrl.includes(".jpeg") ||
        lowerUrl.includes(".png") ||
        lowerUrl.includes(".webp");

      if (!isImageFile) {
        return false;
      }

      const blockedTerms = [
        "logo",
        "banner",
        "avatar",
        "icon",
        "thumb",
        "thumbnail",
        "cover",
        "capa",
        "cropped",
        "ads",
        "anuncio",
        "favicon",
      ];

      if (blockedTerms.some((term) => lowerUrl.includes(term))) {
        return false;
      }

      return true;
    };

    // Função para adicionar página
    const pushPageImage = (imageUrl) => {
      const absoluteUrl = toAbsoluteUrl(imageUrl);

      if (!isValidPageImageUrl(absoluteUrl)) return;
      if (seenImages.has(absoluteUrl)) return;

      seenImages.add(absoluteUrl);

      pages.push({
        page: pages.length + 1,
        image: absoluteUrl,
      });
    };

    // Primeiro tenta container clássico
    $(".chapter-image-container img, .reading-content img, .page-break img, .text-left img").each((index, element) => {
      const src =
        $(element).attr("src") ||
        $(element).attr("data-src") ||
        $(element).attr("data-lazy-src") ||
        $(element).attr("data-original");

      pushPageImage(src);
    });

    // Fallback em qualquer imagem
    if (pages.length < 2) {
      pages.length = 0;
      seenImages.clear();

      $("img").each((index, element) => {
        const src =
          $(element).attr("src") ||
          $(element).attr("data-src") ||
          $(element).attr("data-lazy-src") ||
          $(element).attr("data-original");

        pushPageImage(src);
      });
    }

    // Reindexa
    pages.forEach((page, index) => {
      page.page = index + 1;
    });

    // Debug
    console.log("DEBUG scrapePages:", {
      chapterUrl,
      totalPages: pages.length,
      sample: pages.slice(0, 3),
      method: result.method,
      status: result.status,
    });

    return pages;

  } catch (error) {
    console.error("Erro ao buscar páginas:", error.message);
    return [];
  }
};


// Exporta as funções
module.exports = {
  scrapeHome,
  scrapeMangaDetails,
  scrapeChapters,
  scrapePages,
};