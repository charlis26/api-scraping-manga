// Importa o scraper responsável por buscar os dados
const scraper = require("../utils/scraper");

// Importa o cache com TTL
const { getCache, setCache } = require("../cache/manga.cache");

// Importa o erro customizado
const { NotFoundError } = require("../utils/errors");


// ===============================
// BUSCAR LISTA DE MANGÁS
// ===============================
const fetchMangas = async () => {

  // Define chave do cache
  const cacheKey = "mangas";

  // Tenta buscar no cache
  let mangas = getCache(cacheKey);

  // Se não existir no cache
  if (!mangas) {

    // Loga scraping
    console.log("SCRAPING: mangas");

    // Busca dados
    mangas = await scraper.scrapeHome();

    // Salva no cache
    setCache(cacheKey, mangas);

  } else {

    // Loga cache hit
    console.log("CACHE HIT: mangas");

  }

  // Retorna lista
  return mangas;

};


// ===============================
// BUSCAR DETALHES DO MANGÁ
// ===============================
const fetchMangaDetails = async (slug) => {

  // Valida slug
  if (!slug) {
    throw new NotFoundError(
      "Slug do mangá não informado."
    );
  }

  // Define chave do cache
  const cacheKey = `manga_details_${slug}`;

  // Tenta buscar no cache
  let manga = getCache(cacheKey);

  // Se não existir no cache
  if (!manga) {

    // Loga scraping
    console.log(`SCRAPING: detalhes ${slug}`);

    // Busca detalhes
    manga = await scraper.scrapeMangaDetails(slug);

    // Se não encontrou
    if (!manga) {
      throw new NotFoundError(
        "Mangá não encontrado."
      );
    }

  } else {

    // Loga cache hit
    console.log(`CACHE HIT: detalhes ${slug}`);

  }

  // Garante que latestChapters exista mesmo em cache antigo
  if (
    !manga.latestChapters &&
    Array.isArray(manga.chapters)
  ) {

    // Cria os 2 últimos capítulos
    manga.latestChapters = manga.chapters.slice(-2).reverse();

  }

  // Atualiza o cache já no formato novo
  setCache(cacheKey, manga);

  // Retorna todos os dados organizados
  return {
    title: manga.title,
    slug: manga.slug,
    link: manga.link,
    cover: manga.cover,
    synopsis: manga.synopsis,
    status: manga.status,
    author: manga.author,
    artist: manga.artist,
    year: manga.year,
    genres: manga.genres || [],
    chapters: manga.chapters || [],
    latestChapters: manga.latestChapters || []
  };

};


// ===============================
// BUSCAR PÁGINAS POR SLUG
// ===============================
const fetchPagesBySlug = async (slug) => {

  // Valida slug
  if (!slug) {
    throw new NotFoundError(
      "Slug do capítulo não informado."
    );
  }

  // Define chave do cache
  const cacheKey = `pages_slug_${slug}`;

  // Tenta buscar no cache
  let pages = getCache(cacheKey);

  // Se não existir no cache
  if (!pages) {

    // Loga scraping
    console.log(`SCRAPING: ${slug}`);

    // Monta URL do capítulo
    const chapterUrl = `https://mangalivre.blog/capitulo/${slug}/`;

    // Busca páginas
    pages = await scraper.scrapePages(chapterUrl);

    // Salva no cache
    setCache(cacheKey, pages);

  } else {

    // Loga cache hit
    console.log(`CACHE HIT: ${slug}`);

  }

  // Retorna páginas
  return pages;

};


// ===============================
// EXPORTAÇÃO
// ===============================
module.exports = {
  fetchMangas,
  fetchMangaDetails,
  fetchPagesBySlug
};