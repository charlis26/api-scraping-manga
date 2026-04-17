// Importa o scraper responsável por buscar os dados
const scraper = require("../utils/manga.scraper");

// Importa o cache com TTL
const { getCache, setCache } = require("../cache/cache");

// Importa o erro customizado
const { NotFoundError } = require("../utils/errors");

// Importa a configuração central da fonte
const SOURCE_CONFIG = require("../config/source.config");

// Guarda a URL base atual da fonte
const BASE_URL = SOURCE_CONFIG.BASE_URL;

// Guarda o caminho base dos capítulos
const CHAPTER_PATH = SOURCE_CONFIG.CHAPTER_PATH;


// Função auxiliar para criar um identificador seguro da fonte atual
const getSourceCachePrefix = () => {
  // Remove protocolo e caracteres problemáticos para usar na chave do cache
  return BASE_URL
    .replace(/^https?:\/\//, "")
    .replace(/[^\w]/g, "_");
};


// ===============================
// BUSCAR LISTA DE MANGÁS
// ===============================
const fetchMangas = async () => {

  // Cria prefixo exclusivo da fonte atual
  const sourcePrefix = getSourceCachePrefix();

  // Define chave do cache separada por domínio
  const cacheKey = `mangas_${sourcePrefix}`;

  // Tenta buscar no cache
  let mangas = getCache(cacheKey);

  // Se não existir no cache
  if (!mangas) {

    // Loga scraping
    console.log(`SCRAPING: mangas | fonte=${BASE_URL}`);

    // Busca dados
    mangas = await scraper.scrapeHome();

    // Só salva no cache se vier lista válida e com conteúdo
    if (Array.isArray(mangas) && mangas.length > 0) {
      setCache(cacheKey, mangas);
    } else {
      console.log(
        `AVISO: lista de mangás vazia não será salva no cache | fonte=${BASE_URL}`
      );
    }

  } else {

    // Loga cache hit
    console.log(`CACHE HIT: mangas | fonte=${BASE_URL}`);

  }

  // Garante retorno seguro
  return Array.isArray(mangas) ? mangas : [];

};


// ===============================
// BUSCAR DETALHES DO MANGÁ
// ===============================
const fetchMangaDetails = async (slug) => {

  // Valida slug
  if (!slug) {
    throw new NotFoundError("Slug do mangá não informado.");
  }

  // Cria prefixo exclusivo da fonte atual
  const sourcePrefix = getSourceCachePrefix();

  // Define chave do cache separada por domínio
  const cacheKey = `manga_details_${sourcePrefix}_${slug}`;

  // Tenta buscar no cache
  let manga = getCache(cacheKey);

  // Se não existir no cache
  if (!manga) {

    // Loga scraping
    console.log(`SCRAPING: detalhes ${slug} | fonte=${BASE_URL}`);

    // Busca detalhes
    manga = await scraper.scrapeMangaDetails(slug);

    // Se não encontrou
    if (!manga) {
      throw new NotFoundError("Mangá não encontrado.");
    }

    // Salva no cache
    setCache(cacheKey, manga);

  } else {

    // Loga cache hit
    console.log(`CACHE HIT: detalhes ${slug} | fonte=${BASE_URL}`);

  }

  // Garante latestChapters mesmo em cache antigo
  if (
    !manga.latestChapters &&
    Array.isArray(manga.chapters)
  ) {
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
    throw new NotFoundError("Slug do capítulo não informado.");
  }

  // Cria prefixo exclusivo da fonte atual
  const sourcePrefix = getSourceCachePrefix();

  // Define chave do cache separada por domínio
  const cacheKey = `pages_slug_${sourcePrefix}_${slug}`;

  // Tenta buscar no cache
  let pages = getCache(cacheKey);

  // Se não existir no cache
  if (!pages) {

    // Loga scraping
    console.log(`SCRAPING: ${slug} | fonte=${BASE_URL}`);

    // Monta URL do capítulo usando a configuração central
    const chapterUrl = `${BASE_URL}${CHAPTER_PATH}/${slug}/`;

    // Busca páginas
    pages = await scraper.scrapePages(chapterUrl);

    // Só salva no cache se vier uma lista com conteúdo
    if (Array.isArray(pages) && pages.length > 0) {
      setCache(cacheKey, pages);
    } else {
      console.log(
        `AVISO: páginas vazias não serão salvas no cache | slug=${slug} | fonte=${BASE_URL}`
      );
    }

  } else {

    // Loga cache hit
    console.log(`CACHE HIT: ${slug} | fonte=${BASE_URL}`);

  }

  // Garante retorno seguro
  return Array.isArray(pages) ? pages : [];

};


// ===============================
// EXPORTAÇÃO
// ===============================
module.exports = {
  fetchMangas,
  fetchMangaDetails,
  fetchPagesBySlug
};