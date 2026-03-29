// Importa o axios
const axios = require("axios");

// Importa o cheerio
const cheerio = require("cheerio");


// Função que busca os mangás da home
const scrapeHome = async () => {

  // Faz a requisição para a home
  const response = await axios.get("https://mangalivre.blog/");

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

    // Pega o href
    let link = $(element).attr("href");

    // Ignora se não tiver link
    if (!link) return;

    // Só aceita links que contenham /manga/
    if (!link.includes("/manga/")) return;

    // Ignora links genéricos da listagem
    if (link === "/manga/" || link === "https://mangalivre.blog/manga/") return;

    // Ignora links com parâmetros
    if (link.includes("?")) return;

    // Converte link relativo para absoluto
    if (!link.startsWith("http")) {
      link = "https://mangalivre.blog" + link;
    }

    // Ignora títulos vazios
    if (!title) return;

    // Ignora títulos muito curtos
    if (title.length < 2) return;

    // Ignora títulos que sejam apenas números, vírgulas ou pontos
    const isOnlyNumber = /^[\d.,\s]+$/.test(title);
    if (isOnlyNumber) return;

    // Ignora alguns textos genéricos
    const invalidTitles = [
      "Todos os Mangás",
      "Em Lançamento"
    ];

    if (invalidTitles.includes(title)) return;

    // Evita duplicados
    if (seenLinks.has(link)) return;

    seenLinks.add(link);

    // Adiciona o mangá na lista
    mangas.push({
      id: mangas.length + 1,
      title,
      link,
      cover: null
    });

  });

  // Retorna a lista limpa
  return mangas;

};


// Função que busca os capítulos na página de um mangá
const scrapeChapters = async (mangaUrl) => {

  // Faz a requisição para a página do mangá
  const response = await axios.get(mangaUrl);

  // Carrega o HTML
  const $ = cheerio.load(response.data);

  // Lista de capítulos
  const chapters = [];

  // Set para evitar links repetidos
  const seenLinks = new Set();


  // Percorre todos os links da página
  $("a").each((index, element) => {

    // Texto do link
    const title = $(element).text().trim();

    // Href do link
    let link = $(element).attr("href");

    // Ignora links vazios
    if (!link) return;

    // Converte link relativo para absoluto
    if (!link.startsWith("http")) {
      link = "https://mangalivre.blog" + link;
    }

   // Só aceita links que realmente sejam capítulos
const looksLikeChapter =
  title.toLowerCase().includes("capítulo") ||
  link.toLowerCase().includes("/capitulo/");

// Ignora botão "Iniciar Leitura"
if (title.toLowerCase().includes("iniciar")) {
  return;
}

    if (!looksLikeChapter) return;

    // Evita duplicados
    if (seenLinks.has(link)) return;

    seenLinks.add(link);

    // Adiciona o capítulo
    chapters.push({
      id: chapters.length + 1,
      title,
      link
    });

  });

  // Retorna a lista de capítulos
  return chapters;

};

// Busca as imagens de um capítulo
const scrapePages = async (chapterUrl) => {

  // Faz a requisição para a página do capítulo
  const response = await axios.get(chapterUrl);

  // Carrega o HTML no cheerio
  const $ = cheerio.load(response.data);

  // Lista final das páginas
  const pages = [];

  // Evita imagens repetidas
  const seenImages = new Set();

  // Contador de páginas
  let pageNumber = 1;


  // Percorre todas as imagens da página
  $("img").each((index, element) => {

    // Pega o src da imagem
    let src = $(element).attr("src");

    // Ignora se não tiver src
    if (!src) return;

    // Converte link relativo em absoluto
    if (!src.startsWith("http")) {
      src = "https://mangalivre.blog" + src;
    }

    // Só aceita imagens da pasta real de uploads
    const isUploadImage = src.includes("/wp-content/uploads/");

    if (!isUploadImage) return;

    // Ignora imagens repetidas
    if (seenImages.has(src)) return;

    seenImages.add(src);

    // Adiciona a página
    pages.push({
      page: pageNumber,
      image: src
    });

    pageNumber++;

  });

  // Retorna a lista de páginas
  return pages;

};


// Exporta as funções
module.exports = {
  scrapeHome,
  scrapeChapters,
  scrapePages
};