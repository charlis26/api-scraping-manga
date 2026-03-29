// Importa o scraper responsável por buscar os dados no site
const scraper = require("../utils/scraper");

// Importa o cache com TTL
const {
  getCache,
  setCache,
  getAllCacheKeys
} = require("../cache/manga.cache");

// Importa o erro customizado para recursos não encontrados
const { NotFoundError } = require("../utils/errors");


// Busca a lista de mangás
const fetchMangas = async () => {

  // Define a chave usada para armazenar os mangás no cache
  const mangasCacheKey = "mangas";

  // Tenta buscar os mangás no cache
  const cachedMangas = getCache(mangasCacheKey);

  // Se encontrou no cache, retorna sem fazer scraping novamente
  if (cachedMangas) {
    return cachedMangas;
  }

  // Faz o scraping da home para buscar os mangás
  const mangas = await scraper.scrapeHome();

  // Salva o resultado no cache
  setCache(mangasCacheKey, mangas);

  // Retorna a lista de mangás
  return mangas;

};


// Busca os capítulos de um mangá pelo ID
const fetchChapters = async (id) => {

  // Define a chave usada para armazenar os mangás no cache
  const mangasCacheKey = "mangas";

  // Tenta buscar os mangás no cache
  let mangas = getCache(mangasCacheKey);

  // Se o cache estiver vazio, faz o scraping automaticamente
  if (!mangas || mangas.length === 0) {

    // Busca os mangás na home
    mangas = await scraper.scrapeHome();

    // Salva os mangás no cache
    setCache(mangasCacheKey, mangas);

  }

  // Procura o mangá pelo ID
  const manga = mangas.find(
    item => item.id == id
  );

  // Se não encontrar o mangá, retorna erro
  if (!manga) {
    throw new NotFoundError(
      "Mangá não encontrado."
    );
  }

  // Define a chave do cache para os capítulos desse mangá
  const chaptersCacheKey = `chapters_${id}`;

  // Tenta buscar os capítulos no cache
  const cachedChapters = getCache(chaptersCacheKey);

  // Se encontrou no cache, retorna sem fazer scraping novamente
  if (cachedChapters) {
    return cachedChapters;
  }

  // Faz o scraping da página do mangá para buscar os capítulos
  const chapters = await scraper.scrapeChapters(
    manga.link
  );

  // Salva os capítulos no cache
  setCache(chaptersCacheKey, chapters);

  // Também salva a última lista de capítulos aberta
  // Isso ajuda a rota /api/capitulo/:id a funcionar
  setCache("current_chapters", chapters);

  // Retorna a lista de capítulos
  return chapters;

};


// Busca as páginas de um capítulo pelo ID
const fetchPages = async (chapterId) => {

  // Define a chave do cache para a última lista de capítulos aberta
  const currentChaptersCacheKey = "current_chapters";

  // Tenta buscar a última lista de capítulos usada
  let chapters = getCache(currentChaptersCacheKey);

  // Se não encontrar no cache atual, tenta buscar em todos os caches de capítulos
  if (!chapters || chapters.length === 0) {

    // Busca todas as chaves válidas do cache
    const cacheKeys = getAllCacheKeys();

    // Filtra apenas as chaves de capítulos
    const chapterKeys = cacheKeys.filter(
      key => key.startsWith("chapters_")
    );

    // Percorre todos os caches de capítulos
    for (const key of chapterKeys) {

      // Busca a lista de capítulos dessa chave
      const cachedChapterList = getCache(key);

      // Ignora se não houver lista
      if (!cachedChapterList || cachedChapterList.length === 0) {
        continue;
      }

      // Procura o capítulo pelo ID
      const foundChapter = cachedChapterList.find(
        item => item.id == chapterId
      );

      // Se encontrou, usa essa lista como base
      if (foundChapter) {
        chapters = cachedChapterList;

        // Atualiza também o current_chapters para facilitar próximas chamadas
        setCache(currentChaptersCacheKey, chapters);

        break;
      }

    }

  }

  // Se ainda não existir lista de capítulos no cache, retorna erro
  if (!chapters || chapters.length === 0) {
    throw new NotFoundError(
      "Capítulos não encontrados. Acesse /api/mangas/:id primeiro."
    );
  }

  // Procura o capítulo pelo ID
  const chapter = chapters.find(
    item => item.id == chapterId
  );

  // Se não encontrar o capítulo, retorna erro
  if (!chapter) {
    throw new NotFoundError(
      "Capítulo não encontrado."
    );
  }

  // Define a chave do cache para as páginas desse capítulo
  const pagesCacheKey = `pages_${chapterId}`;

  // Tenta buscar as páginas no cache
  const cachedPages = getCache(pagesCacheKey);

  // Se encontrou no cache, retorna sem fazer scraping novamente
  if (cachedPages) {
    return cachedPages;
  }

  // Faz o scraping da página do capítulo para buscar as imagens
  const pages = await scraper.scrapePages(
    chapter.link
  );

  // Salva as páginas no cache
  setCache(pagesCacheKey, pages);

  // Retorna a lista de páginas
  return pages;

};


// Busca as páginas de um capítulo pelo link diretamente
// Essa função é um refinamento profissional para reduzir dependência do cache atual
const fetchPagesByLink = async (chapterLink) => {

  // Verifica se o link foi informado
  if (!chapterLink) {
    throw new NotFoundError(
      "Link do capítulo não informado."
    );
  }

  // Define uma chave de cache baseada no link
  const pagesCacheKey = `pages_link_${chapterLink}`;

  // Tenta buscar as páginas no cache
  const cachedPages = getCache(pagesCacheKey);

  // Se encontrou no cache, retorna sem fazer scraping novamente
  if (cachedPages) {
    return cachedPages;
  }

  // Faz o scraping direto usando o link do capítulo
  const pages = await scraper.scrapePages(
    chapterLink
  );

  // Salva no cache
  setCache(pagesCacheKey, pages);

  // Retorna as páginas
  return pages;

};


// Exporta as funções para uso no controller
module.exports = {
  fetchMangas,
  fetchChapters,
  fetchPages,
  fetchPagesByLink
};