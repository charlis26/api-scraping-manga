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

  // Monta a URL absoluta
  return `${BASE_URL}${url}`;
};


// ===============================
// FUNÇÃO: BUSCAR MANGÁS DA HOME
// ===============================
const scrapeHome = async () => {
  try {
    // Faz a requisição para a home
    const response = await axios.get(BASE_URL, {
      // Timeout para evitar travamento
      timeout: 10000,
      // User-Agent para reduzir bloqueios simples
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
      },
    });

    // Carrega o HTML no cheerio
    const $ = cheerio.load(response.data);

    // Lista final de mangás
    const mangas = [];

    // Set para evitar links repetidos
    const seenLinks = new Set();


    // Percorre todos os links da página
    $("a").each((index, element) => {
      // Pega o texto do link
      const title = $(element).text().trim();

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

      // Adiciona o mangá
      mangas.push({
        id: mangas.length + 1,
        title,
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
// FUNÇÃO: BUSCAR CAPÍTULOS
// ===============================
const scrapeChapters = async (mangaUrl) => {
  try {
    // Faz a requisição para a página do mangá
    const response = await axios.get(mangaUrl, {
      // Timeout
      timeout: 10000,
      // Headers básicos
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
      },
    });

    // Carrega o HTML
    const $ = cheerio.load(response.data);

    // Lista de capítulos
    const chapters = [];

    // Evita duplicados
    const seenLinks = new Set();


    // Percorre todos os links
    $("a").each((index, element) => {
      // Texto do link
      const title = $(element).text().trim();

      // Href do link
      let link = $(element).attr("href");

      // Ignora links vazios
      if (!link) return;

      // Converte para URL absoluta
      link = toAbsoluteUrl(link);

      // Verifica se parece capítulo
      const looksLikeChapter =
        title.toLowerCase().includes("capítulo") ||
        link.toLowerCase().includes("/capitulo/");

      // Ignora botão de iniciar leitura
      if (title.toLowerCase().includes("iniciar")) return;

      // Ignora o que não for capítulo
      if (!looksLikeChapter) return;

      // Evita duplicados
      if (seenLinks.has(link)) return;
      seenLinks.add(link);

      // Adiciona capítulo
      chapters.push({
        id: chapters.length + 1,
        title,
        link,
      });
    });

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
    const response = await axios.get(chapterUrl, {
      // Timeout
      timeout: 10000,
      // Headers básicos
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
      },
    });

    // Carrega o HTML
    const $ = cheerio.load(response.data);

    // Lista final das páginas
    const pages = [];

    // Evita imagens repetidas
    const seenImages = new Set();

    // Contador de páginas
    let pageNumber = 1;


    // Percorre as imagens
    $("img").each((index, element) => {
      // Pega o src
      let src = $(element).attr("src");

      // Ignora vazio
      if (!src) return;

      // Converte para absoluta
      src = toAbsoluteUrl(src);

      // Só aceita imagens reais do upload
      const isUploadImage = src.includes("/wp-content/uploads/");
      if (!isUploadImage) return;

      // Evita duplicados
      if (seenImages.has(src)) return;
      seenImages.add(src);

      // Adiciona página
      pages.push({
        page: pageNumber,
        image: src,
      });

      // Incrementa contador
      pageNumber++;
    });

    // Retorna páginas
    return pages;
  } catch (error) {
    // Mostra erro no terminal
    console.error("Erro ao buscar páginas:", error.message);

    // Retorna lista vazia
    return [];
  }
};


// Exporta as funções
module.exports = {
  scrapeHome,
  scrapeChapters,
  scrapePages,
};