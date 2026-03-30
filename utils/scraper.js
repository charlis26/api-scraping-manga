// Importa o axios para fazer requisições HTTP
const axios = require("axios");

// Importa o cheerio para manipular o HTML
const cheerio = require("cheerio");

// Define a URL base do site
const BASE_URL = "https://mangalivre.blog";


// Função auxiliar para converter URL relativa em absoluta
const toAbsoluteUrl = (url) => {

  // Retorna null se não existir URL
  if (!url) return null;

  // Se já for absoluta, retorna como está
  if (url.startsWith("http")) return url;

  // Se a URL começar com barra, concatena direto
  if (url.startsWith("/")) {
    return `${BASE_URL}${url}`;
  }

  // Se não começar com barra, adiciona a barra manualmente
  return `${BASE_URL}/${url}`;

};


// Função auxiliar para limpar textos
const cleanText = (text = "") => {

  // Remove espaços duplicados e espaços nas pontas
  return text.replace(/\s+/g, " ").trim();

};


// Função auxiliar para extrair slug de uma URL
const getSlugFromUrl = (url = "") => {

  // Retorna vazio se não existir URL
  if (!url) return "";

  // Remove barras do final
  const normalizedUrl = url.replace(/\/+$/, "");

  // Divide a URL em partes
  const parts = normalizedUrl.split("/").filter(Boolean);

  // Retorna a última parte
  return parts[parts.length - 1] || "";

};


// Função auxiliar para pegar conteúdo de metatag
const getMetaContent = ($, selector) => {

  // Busca o conteúdo da metatag
  const content = $(selector).attr("content");

  // Retorna o conteúdo limpo
  return cleanText(content || "");

};


// Função auxiliar para montar axios com headers mais estáveis
const createRequestConfig = () => {

  // Retorna a configuração padrão das requisições
  return {
    timeout: 15000,
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
      "Accept":
        "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
      "Accept-Language": "pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7",
      "Referer": BASE_URL,
      "Cache-Control": "no-cache",
      "Pragma": "no-cache",
    },
  };

};


// Função auxiliar para detectar se o texto parece estar em inglês
const looksLikeEnglish = (text = "") => {

  // Lista simples de palavras comuns em inglês
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

  // Converte texto para minúsculo
  const lowerText = text.toLowerCase();

  // Inicializa contador
  let count = 0;

  // Percorre as palavras
  englishWords.forEach((word) => {

    // Se encontrar no texto, incrementa
    if (lowerText.includes(word)) {
      count++;
    }

  });

  // Considera inglês se tiver várias ocorrências
  return count >= 3;

};


// Função auxiliar para escolher a melhor sinopse
const pickBestSynopsis = ($) => {

  // Lista de candidatas de sinopse
  const synopsisCandidates = [
    cleanText($(".summary__content").text()),
    cleanText($(".description-summary").text()),
    cleanText($(".manga-excerpt").text()),
    cleanText($(".entry-content").text()),
  ];

  // Variável para guardar sinopse em português
  let portugueseSynopsis = "";

  // Variável para guardar sinopse em inglês
  let englishSynopsis = "";

  // Percorre as candidatas
  for (const candidate of synopsisCandidates) {

    // Ignora vazios
    if (!candidate) continue;

    // Se parecer inglês, guarda como fallback
    if (looksLikeEnglish(candidate)) {

      // Guarda só a primeira em inglês
      if (!englishSynopsis) {
        englishSynopsis = candidate;
      }

      // Continua procurando português
      continue;

    }

    // Se não parecer inglês, assume como principal
    portugueseSynopsis = candidate;
    break;

  }

  // Se encontrou em português, retorna
  if (portugueseSynopsis) {
    return cleanText(portugueseSynopsis);
  }

  // Se não encontrou português mas encontrou inglês, retorna inglês
  if (englishSynopsis) {
    return cleanText(englishSynopsis);
  }

  // Último fallback via metatag
  const metaDescription =
    getMetaContent($, 'meta[property="og:description"]') ||
    getMetaContent($, 'meta[name="description"]');

  // Retorna metatag limpa
  return cleanText(metaDescription);

};


// Função auxiliar para extrair um bloco entre labels
const extractBlockValue = (text = "", startLabels = [], endLabels = []) => {

  // Limpa o texto recebido
  const normalizedText = cleanText(text);

  // Se vier vazio, retorna vazio
  if (!normalizedText) return "";

  // Percorre os labels iniciais possíveis
  for (const startLabel of startLabels) {

    // Escapa o label inicial para regex
    const escapedStart = startLabel.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

    // Monta a parte dos labels finais
    const escapedEnds = endLabels
      .map((label) => label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
      .join("|");

    // Se houver labels finais, captura até o próximo label
    const regex = escapedEnds
      ? new RegExp(`${escapedStart}\\s*:?\\s*(.*?)(?=\\s+(?:${escapedEnds})\\s*:|$)`, "i")
      : new RegExp(`${escapedStart}\\s*:?\\s*(.*)$`, "i");

    // Executa a regex
    const match = normalizedText.match(regex);

    // Se encontrou, limpa e retorna
    if (match && match[1]) {
      return cleanText(match[1]);
    }

  }

  // Se não encontrou, retorna vazio
  return "";

};


// Função auxiliar para limpar resíduos de interface
const stripUiNoise = (value = "") => {

  // Remove textos de interface que podem grudar no campo
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

  // Junta textos de áreas prováveis e também do body inteiro como fallback
  const metadataSources = [
    cleanText($(".post-status").text()),
    cleanText($(".summary_content").text()),
    cleanText($(".summary_content_wrap").text()),
    cleanText($(".post-content").text()),
    cleanText($(".summary__content").text()),
    cleanText($("body").text()),
  ];

  // Junta tudo em uma string só
  const combinedText = cleanText(metadataSources.join(" "));

  // Extrai status entre Status e Autor/Artista/Ano
  const rawStatus = extractBlockValue(
    combinedText,
    ["Status"],
    ["Autor", "Author", "Artista", "Artist", "Ano", "Year"]
  );

  // Extrai autor entre Autor e Artista/Ano
  const rawAuthor = extractBlockValue(
    combinedText,
    ["Autor", "Author"],
    ["Artista", "Artist", "Ano", "Year"]
  );

  // Extrai artista entre Artista e Ano
  const rawArtist = extractBlockValue(
    combinedText,
    ["Artista", "Artist"],
    ["Ano", "Year"]
  );

  // Extrai ano como exatamente 4 dígitos
  const yearMatch = combinedText.match(/(?:Ano|Year)\s*:?\s*(19\d{2}|20\d{2})/i);

  // Define o ano
  const rawYear = yearMatch && yearMatch[1] ? yearMatch[1] : "";

  // Retorna metadados organizados
  return {
    status: stripUiNoise(rawStatus),
    author: stripUiNoise(rawAuthor),
    artist: stripUiNoise(rawArtist),
    year: stripUiNoise(rawYear),
  };

};


// Função auxiliar para escolher a melhor versão de capítulo duplicado
const chooseBetterChapter = (currentChapter, newChapter) => {

  // Se não existir capítulo atual, usa o novo
  if (!currentChapter) {
    return newChapter;
  }

  // Verifica se o slug atual termina com sufixo numérico tipo "-2"
  const currentHasSuffix = /-\d+$/.test(currentChapter.slug);

  // Verifica se o novo slug termina com sufixo numérico tipo "-2"
  const newHasSuffix = /-\d+$/.test(newChapter.slug);

  // Prefere o slug sem sufixo
  if (currentHasSuffix && !newHasSuffix) {
    return newChapter;
  }

  // Mantém o atual se ele for mais limpo
  if (!currentHasSuffix && newHasSuffix) {
    return currentChapter;
  }

  // Se ambos forem equivalentes, prefere o título maior
  if (newChapter.title.length > currentChapter.title.length) {
    return newChapter;
  }

  // Caso contrário mantém o atual
  return currentChapter;

};


// Função auxiliar para deduplicar e reindexar capítulos
const normalizeChapters = (chapters = []) => {

  // Mapa para guardar capítulos únicos
  const uniqueChaptersMap = new Map();

  // Percorre a lista original
  chapters.forEach((chapter) => {

    // Define chave principal baseada no número
    const chapterKey =
      chapter.number !== null
        ? `number_${chapter.number}`
        : `slug_${chapter.slug}`;

    // Busca capítulo atual dessa chave
    const existingChapter = uniqueChaptersMap.get(chapterKey);

    // Decide qual versão manter
    const bestChapter = chooseBetterChapter(existingChapter, chapter);

    // Salva a melhor versão
    uniqueChaptersMap.set(chapterKey, bestChapter);

  });

  // Converte mapa em array
  const normalizedChapters = Array.from(uniqueChaptersMap.values());

  // Ordena capítulos do mais antigo para o mais novo
  normalizedChapters.sort((a, b) => {

    // Se ambos tiverem número, ordena por número
    if (a.number !== null && b.number !== null) {
      return a.number - b.number;
    }

    // Senão ordena pelo título
    return a.title.localeCompare(b.title, "pt-BR", { numeric: true });

  });

  // Recria os ids depois da ordenação final
  normalizedChapters.forEach((chapter, index) => {

    // Reindexa o id
    chapter.id = index + 1;

  });

  // Retorna capítulos normalizados
  return normalizedChapters;

};


// Função auxiliar para pegar o melhor src possível da imagem
const getBestImageSrc = ($, element) => {

  // Tenta src padrão
  let src = $(element).attr("src");

  // Tenta lazy load
  if (!src) {
    src = $(element).attr("data-src");
  }

  // Tenta data-lazy-src
  if (!src) {
    src = $(element).attr("data-lazy-src");
  }

  // Tenta data-original
  if (!src) {
    src = $(element).attr("data-original");
  }

  // Retorna absoluta
  return toAbsoluteUrl(src);

};


// Função auxiliar para validar se a imagem parece real de leitura
const isValidReaderImage = (src = "") => {

  // Se não existir src, rejeita
  if (!src) return false;

  // Converte para minúsculo
  const lowerSrc = src.toLowerCase();

  // Só aceita uploads reais
  if (!lowerSrc.includes("/wp-content/uploads/")) {
    return false;
  }

  // Precisa ser uma extensão de imagem válida
  const isImageFile =
    lowerSrc.includes(".jpg") ||
    lowerSrc.includes(".jpeg") ||
    lowerSrc.includes(".png") ||
    lowerSrc.includes(".webp");

  if (!isImageFile) {
    return false;
  }

  // Bloqueia imagens comuns de interface e recomendação
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

  // Se contiver algum termo bloqueado, rejeita
  if (blockedTerms.some((term) => lowerSrc.includes(term))) {
    return false;
  }

  // Caso passe nas regras, aceita
  return true;

};


// Função auxiliar para coletar páginas de um container
const collectReaderImagesFromContainer = ($, container, pages, seenImages) => {

  // Percorre imagens do container
  $(container).find("img").each((index, element) => {

    // Pega melhor src
    const src = getBestImageSrc($, element);

    // Ignora o que não parecer imagem real de leitura
    if (!isValidReaderImage(src)) return;

    // Evita repetidas
    if (seenImages.has(src)) return;

    // Marca como já vista
    seenImages.add(src);

    // Adiciona página
    pages.push({
      page: pages.length + 1,
      image: src,
    });

  });

};


// ===============================
// FUNÇÃO: BUSCAR MANGÁS DA HOME
// ===============================
const scrapeHome = async () => {
  try {

    // Faz a requisição para a home
    const response = await axios.get(
      BASE_URL,
      createRequestConfig()
    );

    // Carrega o HTML no cheerio
    const $ = cheerio.load(response.data);

    // Lista final de mangás
    const mangas = [];

    // Set para evitar links repetidos
    const seenLinks = new Set();

    // Percorre todos os links da página
    $("a").each((index, element) => {

      // Pega o texto do link
      const title = cleanText($(element).text());

      // Pega o href do link
      let link = $(element).attr("href");

      // Ignora se não tiver link
      if (!link) return;

      // Só aceita links de mangá
      if (!link.includes("/manga/")) return;

      // Ignora links genéricos
      if (link === "/manga/" || link === `${BASE_URL}/manga/`) return;

      // Ignora links com parâmetros
      if (link.includes("?")) return;

      // Converte link relativo em absoluto
      link = toAbsoluteUrl(link);

      // Ignora título vazio
      if (!title) return;

      // Ignora títulos muito curtos
      if (title.length < 2) return;

      // Ignora textos que sejam só números ou pontuação
      const isOnlyNumber = /^[\d.,\s]+$/.test(title);
      if (isOnlyNumber) return;

      // Ignora alguns títulos genéricos
      const invalidTitles = [
        "Todos os Mangás",
        "Em Lançamento",
        "Início",
        "Modo Escuro",
        "Fazer Login",
      ];

      // Ignora títulos genéricos
      if (invalidTitles.includes(title)) return;

      // Evita duplicados
      if (seenLinks.has(link)) return;
      seenLinks.add(link);

      // Tenta encontrar a imagem mais próxima do link
      let cover =
        $(element).find("img").attr("src") ||
        $(element).closest("article").find("img").first().attr("src") ||
        $(element).closest("div").find("img").first().attr("src") ||
        $(element).parent().find("img").first().attr("src") ||
        null;

      // Converte capa para absoluta
      cover = toAbsoluteUrl(cover);

      // Extrai o slug do link
      const slug = getSlugFromUrl(link);

      // Adiciona o mangá
      mangas.push({
        id: mangas.length + 1,
        title,
        slug,
        link,
        cover,
      });

    });

    // Retorna a lista final
    return mangas;

  } catch (error) {

    // Mostra erro no terminal
    console.error("Erro ao buscar mangás:", error.message);

    // Retorna lista vazia em caso de erro
    return [];

  }
};


// ===============================
// FUNÇÃO: BUSCAR DETALHES DO MANGÁ PELO SLUG
// ===============================
const scrapeMangaDetails = async (slug) => {
  try {

    // Verifica se o slug foi informado
    if (!slug) {
      throw new Error("Slug do mangá não informado.");
    }

    // Monta a URL do mangá
    const mangaUrl = `${BASE_URL}/manga/${slug}/`;

    // Faz a requisição da página do mangá
    const response = await axios.get(
      mangaUrl,
      createRequestConfig()
    );

    // Carrega o HTML
    const $ = cheerio.load(response.data);

    // Extrai o título com vários fallbacks
    let title =
      cleanText($("h1").first().text()) ||
      cleanText($(".post-title").first().text()) ||
      cleanText($(".entry-title").first().text()) ||
      cleanText($(".post h1").first().text()) ||
      getMetaContent($, 'meta[property="og:title"]') ||
      getMetaContent($, 'meta[name="twitter:title"]');

    // Se o título vier com nome do site, limpa
    title = title
      .replace(/\s*[-|]\s*Manga Livre.*$/i, "")
      .replace(/\s*[-|]\s*Leia.*$/i, "")
      .trim();

    // Extrai capa com vários fallbacks
    let cover =
      $(".summary_image img").attr("src") ||
      $(".thumb img").attr("src") ||
      $(".post img").first().attr("src") ||
      $('meta[property="og:image"]').attr("content") ||
      $('meta[name="twitter:image"]').attr("content") ||
      null;

    // Converte capa para absoluta
    cover = toAbsoluteUrl(cover);

    // Extrai a melhor sinopse disponível
    const synopsis = pickBestSynopsis($);

    // Extrai metadados organizados
    const metadata = extractMetadata($);

    // Cria array de gêneros
    const genres = [];

    // Procura gêneros em vários seletores
    $(".genres a, .manga-genres a, .genres-content a, a[href*='/genero/'], a[href*='/genre/']").each((index, element) => {

      // Pega o texto do gênero
      const genre = cleanText($(element).text());

      // Adiciona se for válido e ainda não estiver no array
      if (genre && !genres.includes(genre)) {
        genres.push(genre);
      }

    });

    // Cria array bruto de capítulos
    const rawChapters = [];

    // Evita links idênticos repetidos
    const seenLinks = new Set();

    // Percorre todos os links da página
    $("a").each((index, element) => {

      // Pega o título do link
      const chapterTitle = cleanText($(element).text());

      // Pega o href
      let link = $(element).attr("href");

      // Ignora link vazio
      if (!link) return;

      // Converte para URL absoluta
      link = toAbsoluteUrl(link);

      // Verifica se parece um capítulo
      const looksLikeChapter =
        chapterTitle.toLowerCase().includes("capítulo") ||
        chapterTitle.toLowerCase().includes("capitulo") ||
        chapterTitle.toLowerCase().includes("chapter") ||
        link.toLowerCase().includes("/capitulo/");

      // Ignora botão de iniciar leitura
      if (chapterTitle.toLowerCase().includes("iniciar")) return;

      // Ignora o que não for capítulo
      if (!looksLikeChapter) return;

      // Evita repetição de link exato
      if (seenLinks.has(link)) return;
      seenLinks.add(link);

      // Extrai slug do capítulo
      const chapterSlug = getSlugFromUrl(link);

      // Tenta extrair número do capítulo
      const numberMatch = chapterTitle.match(/(\d+(\.\d+)?)/);

      // Converte para número quando existir
      const number = numberMatch ? Number(numberMatch[1]) : null;

      // Adiciona no array bruto
      rawChapters.push({
        id: rawChapters.length + 1,
        title: chapterTitle,
        slug: chapterSlug,
        link,
        number,
      });

    });

    // Normaliza capítulos, remove duplicados e recria ids
    const chapters = normalizeChapters(rawChapters);

    // Separa os 2 últimos capítulos para facilitar o frontend
    const latestChapters = chapters.slice(-2).reverse();

    // Debug útil
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
    });

    // Se não encontrou título, tenta fallback pela própria home
    if (!title) {

      // Busca a home como fallback
      const mangas = await scrapeHome();

      // Procura o mangá pelo slug
      const mangaFromHome = mangas.find(
        (item) => item.slug === slug
      );

      // Se encontrou na home, usa os dados básicos para não falhar
      if (mangaFromHome) {
        title = mangaFromHome.title;
        cover = cover || mangaFromHome.cover || null;
      }

    }

    // Se ainda assim não encontrou título, retorna null
    if (!title) {
      return null;
    }

    // Retorna os detalhes completos
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

    // Mostra erro detalhado no terminal
    console.error("Erro ao buscar detalhes do mangá:", error.message);

    // Retorna null para o service tratar
    return null;

  }
};


// ===============================
// FUNÇÃO: BUSCAR CAPÍTULOS
// ===============================
const scrapeChapters = async (mangaUrl) => {
  try {

    // Faz a requisição para a página do mangá
    const response = await axios.get(
      mangaUrl,
      createRequestConfig()
    );

    // Carrega o HTML
    const $ = cheerio.load(response.data);

    // Lista bruta de capítulos
    const rawChapters = [];

    // Evita duplicados exatos de link
    const seenLinks = new Set();

    // Percorre todos os links
    $("a").each((index, element) => {

      // Texto do link
      const title = cleanText($(element).text());

      // Href do link
      let link = $(element).attr("href");

      // Ignora links vazios
      if (!link) return;

      // Converte para URL absoluta
      link = toAbsoluteUrl(link);

      // Verifica se parece capítulo
      const looksLikeChapter =
        title.toLowerCase().includes("capítulo") ||
        title.toLowerCase().includes("capitulo") ||
        title.toLowerCase().includes("chapter") ||
        link.toLowerCase().includes("/capitulo/");

      // Ignora botão de iniciar leitura
      if (title.toLowerCase().includes("iniciar")) return;

      // Ignora o que não for capítulo
      if (!looksLikeChapter) return;

      // Evita duplicados exatos de link
      if (seenLinks.has(link)) return;
      seenLinks.add(link);

      // Extrai o slug do capítulo
      const slug = getSlugFromUrl(link);

      // Tenta extrair número do capítulo
      const numberMatch = title.match(/(\d+(\.\d+)?)/);

      // Converte para número quando existir
      const number = numberMatch ? Number(numberMatch[1]) : null;

      // Adiciona capítulo bruto
      rawChapters.push({
        id: rawChapters.length + 1,
        title,
        slug,
        link,
        number,
      });

    });

    // Normaliza capítulos, remove duplicados e recria ids
    const chapters = normalizeChapters(rawChapters);

    // Retorna capítulos
    return chapters;

  } catch (error) {

    // Mostra erro no terminal
    console.error("Erro ao buscar capítulos:", error.message);

    // Retorna lista vazia
    return [];

  }
};


// ===============================
// FUNÇÃO: BUSCAR PÁGINAS
// ===============================
const scrapePages = async (chapterUrl) => {
  try {

    // Faz a requisição para a página do capítulo
    const response = await axios.get(
      chapterUrl,
      createRequestConfig()
    );

    // Carrega o HTML
    const $ = cheerio.load(response.data);

    // Lista final das páginas
    const pages = [];

    // Evita imagens repetidas
    const seenImages = new Set();


    // Função interna para validar se a imagem está em uma área ignorada
    const isInsideIgnoredArea = (element) => {

      // Áreas que normalmente não fazem parte da leitura
      const ignoredSelectors = [
        "header",
        "footer",
        "nav",
        ".summary_image",
        ".thumb",
        ".related",
        ".sidebar",
        ".widget",
        ".profile-manga",
        ".post-title",
        ".popular-slider",
        ".swiper",
        ".ranking",
        ".ads",
        ".advertisement",
        ".c-breadcrumb",
      ];

      // Se estiver dentro de alguma dessas áreas, ignora
      return ignoredSelectors.some((selector) => {
        return $(element).closest(selector).length > 0;
      });

    };


    // Função interna para pegar a melhor URL possível da imagem
    const getImageUrl = (element) => {

      // Tenta pegar src normal
      let src = $(element).attr("src");

      // Tenta lazy load
      if (!src) {
        src = $(element).attr("data-src");
      }

      // Tenta data-lazy-src
      if (!src) {
        src = $(element).attr("data-lazy-src");
      }

      // Tenta data-original
      if (!src) {
        src = $(element).attr("data-original");
      }

      // Tenta srcset e pega a primeira URL
      if (!src) {
        const srcset = $(element).attr("srcset");

        if (srcset) {
          src = srcset.split(",")[0].trim().split(" ")[0].trim();
        }
      }

      // Converte para absoluta
      return toAbsoluteUrl(src);

    };


    // Função interna para verificar se a imagem parece página real
    const isReaderPageImage = (src, element) => {

      // Rejeita vazio
      if (!src) return false;

      // Rejeita se estiver em área ignorada
      if (isInsideIgnoredArea(element)) return false;

      // Converte para minúsculo
      const lowerSrc = src.toLowerCase();

      // Só aceita imagens reais de upload
      if (!lowerSrc.includes("/wp-content/uploads/")) {
        return false;
      }

      // Só aceita extensões de imagem
      const isValidExtension =
        lowerSrc.includes(".jpg") ||
        lowerSrc.includes(".jpeg") ||
        lowerSrc.includes(".png") ||
        lowerSrc.includes(".webp");

      if (!isValidExtension) {
        return false;
      }

      // Ignora alguns padrões comuns de imagens que não são páginas
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

      if (blockedTerms.some((term) => lowerSrc.includes(term))) {
        return false;
      }

      // Verifica atributos de tamanho quando existirem
      const width = Number($(element).attr("width") || 0);
      const height = Number($(element).attr("height") || 0);

      // Ignora imagens pequenas demais quando houver tamanho informado
      if ((width > 0 && width < 400) || (height > 0 && height < 400)) {
        return false;
      }

      // Se passou em tudo, aceita
      return true;

    };


    // Função interna para adicionar imagens válidas
    const collectImages = (selector) => {

      // Percorre as imagens do seletor
      $(selector).each((index, element) => {

        // Pega a melhor URL
        const src = getImageUrl(element);

        // Ignora o que não parecer página real
        if (!isReaderPageImage(src, element)) return;

        // Evita repetidas
        if (seenImages.has(src)) return;

        // Marca como vista
        seenImages.add(src);

        // Adiciona como página
        pages.push({
          page: pages.length + 1,
          image: src,
        });

      });

    };


    // 1) Tenta primeiro os seletores mais confiáveis do leitor
    const preferredSelectors = [
      "img.wp-manga-chapter-img",
      ".reading-content img",
      ".chapter-content img",
      ".text-left img",
      ".entry-content img",
      "img[class*='chapter']",
      "img[class*='reading']",
    ];

    for (const selector of preferredSelectors) {

      // Coleta imagens desse seletor
      collectImages(selector);

      // Se já encontrou páginas suficientes, para
      if (pages.length >= 2) {
        break;
      }

    }


    // 2) Se ainda não encontrou, tenta todas as imagens da página
    if (pages.length < 2) {

      // Limpa resultado anterior
      pages.length = 0;
      seenImages.clear();

      // Tenta todas as imagens
      collectImages("img");

    }


    // 3) Ordena pela ordem em que foram encontradas e reindexa
    pages.forEach((page, index) => {

      // Reindexa páginas
      page.page = index + 1;

    });

    // Debug útil
    console.log("DEBUG scrapePages:", {
      chapterUrl,
      totalPages: pages.length,
      pages: pages.slice(0, 5),
    });

    // Retorna a lista final
    return pages;

  } catch (error) {

    // Mostra erro no terminal
    console.error("Erro ao buscar páginas:", error.message);

    // Retorna vazio
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