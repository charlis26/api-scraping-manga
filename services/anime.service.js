// TTL do índice global completo: 3 dias
const FULL_CATALOG_INDEX_CACHE_TTL_MS =
  3 * 24 * 60 * 60 * 1000;

// TTL do índice incremental: 1 dia
const INCREMENTAL_CATALOG_INDEX_CACHE_TTL_MS =
  24 * 60 * 60 * 1000;

// Importa persistência do índice global em SQLite
const {
  saveAnimeIndexBatch,
  getAllAnimeIndexItems,
  clearAnimeIndex,
  saveAnimeDetails,
  getAnimeDetailsBySlug,
  saveRecentUpdatesBatch,
  getRecentUpdatesItems,
  saveAnimeEpisodesBatch,
  savePopularSidebarBatch,
  getPopularSidebarItems,
  getAnimeEpisodesBySlug,
  saveCatalogMeta,
  getCatalogMeta,
  deleteCatalogMetaKeys,
  checkpointWal
} = require("../database/sqlite");

// Importa o scraper responsável por buscar dados dos animes
const scraper = require("../utils/anime.scraper");

// Importa o erro customizado para recursos não encontrados
const { NotFoundError } = require("../utils/errors");

// Importa o cache compartilhado do projeto
const { getCache, setCache } = require("../cache/cache");

// Importa o scraper do módulo de anime
const animeScraper = require("../utils/anime.scraper");

// Importa o resolvedor de aliases de slug
const { resolveSlugAlias } = require("../utils/slugAlias");

// ===============================
// CONFIGURAÇÕES DO MÓDULO
// ===============================

// Limite manual máximo de páginas do catálogo
// Evita rebuild infinito quando o site pai retorna valores inconsistentes
const MAX_CATALOG_PAGES_LIMIT = 350;

// Define um prefixo fixo e limpo para o cache do módulo de anime
const ANIME_CACHE_PREFIX = "anime_module";

// Define o tamanho da paginação local da busca
const SEARCH_PAGE_SIZE = 24;

// Quantidade de páginas rápidas que serão pré-aquecidas com mais frequência
const FAST_REFRESH_PAGES_LIMIT = 4;

// Lista de tipos de catálogo suportados
const ALLOWED_ANIME_CATALOG_TYPES = [
  "updated",
  "top",
  "launching",
  "dubbed",
  "subbed"
];

// Chaves dos metadados do catálogo
const CATALOG_META_KEYS = {
  TOTAL_PAGES: "total_pages",
  TOTAL_ITEMS: "total_items",
  LAST_PROCESSED_PAGE: "last_processed_page",
  LAST_PARTIAL_REBUILD_AT: "last_partial_rebuild_at",
  LAST_FULL_REBUILD_AT: "last_full_rebuild_at",
  LAST_INCREMENTAL_AT: "last_incremental_at",
  BUILD_STATUS: "catalog_build_status",
  BUILD_MODE: "catalog_build_mode"
};

// ===============================
// MONTAGEM DAS CHAVES DE CACHE
// ===============================

// Monta a chave de cache da home estruturada
const getAnimeHomeCacheKey = () => {
  return `${ANIME_CACHE_PREFIX}_home`;
};

// Monta a chave de cache da lista de animes com filtros
const getAnimesCacheKey = ({
  page = 1,
  letter = "",
  genre = "",
  type = ""
}) => {
  return `${ANIME_CACHE_PREFIX}_list_page_${page}_letter_${letter || "all"}_genre_${genre || "all"}_type_${type || "default"}`;
};

// Monta a chave de cache da busca
const getAnimeSearchCacheKey = ({
  query = "",
  page = 1
}) => {
  return `${ANIME_CACHE_PREFIX}_search_query_${query}_page_${page}`;
};

// Monta a chave de cache da lista de gêneros
const getAnimeGenresCacheKey = () => {
  return `${ANIME_CACHE_PREFIX}_genres`;
};

// Monta a chave de cache dos detalhes do anime
const getAnimeDetailsCacheKey = (slug) => {
  return `${ANIME_CACHE_PREFIX}_details_${slug}`;
};

// Monta a chave de cache dos episódios do anime
const getAnimeEpisodesCacheKey = (slug) => {
  return `${ANIME_CACHE_PREFIX}_episodes_${slug}`;
};

// Monta a chave de cache do player do episódio
const getAnimePlayerCacheKey = (slug, episodeNumber) => {
  return `${ANIME_CACHE_PREFIX}_player_${slug}_${episodeNumber}`;
};

// Monta a chave do índice global do catálogo
const getAnimeCatalogIndexCacheKey = () => {
  return `${ANIME_CACHE_PREFIX}_catalog_index`;
};

// Monta a chave do metadata do índice global
const getAnimeCatalogIndexMetaCacheKey = () => {
  return `${ANIME_CACHE_PREFIX}_catalog_index_meta`;
};

// ===============================
// CONTROLE DE REFRESH EM BACKGROUND
// ===============================

// Evita múltiplos refreshs simultâneos do índice global
let isRefreshingFullCatalogIndex = false;

// Evita múltiplos refreshs simultâneos das páginas rápidas
let isRefreshingFastPages = false;

// ===============================
// HELPERS DE METADADOS
// ===============================

// Lê um metadado do catálogo com fallback seguro
const readCatalogMetaValue = (key, defaultValue = "") => {
  const row = getCatalogMeta.get(key);

  if (!row || typeof row.value === "undefined" || row.value === null) {
    return defaultValue;
  }

  return String(row.value);
};

// Salva um metadado do catálogo com timestamp atualizado
const writeCatalogMetaValue = (key, value) => {
  saveCatalogMeta.run({
    key: String(key || "").trim(),
    value: String(value ?? ""),
    updated_at: new Date().toISOString()
  });
};

// Remove todos os metadados de progresso do rebuild
const clearCatalogBuildProgressMeta = () => {
  deleteCatalogMetaKeys([
    CATALOG_META_KEYS.LAST_PROCESSED_PAGE,
    CATALOG_META_KEYS.LAST_PARTIAL_REBUILD_AT,
    CATALOG_META_KEYS.BUILD_STATUS,
    CATALOG_META_KEYS.BUILD_MODE
  ]);
};

// Converte itens persistidos do SQLite para o formato do service
const normalizePersistedAnimeItems = (items = []) => {
  return items.map((item) => {
    return {
      slug: String(item?.slug || "").trim(),
      title: String(item?.title || "").trim(),
      link: String(item?.link || "").trim(),
      cover: String(item?.cover || "").trim(),
      score: String(item?.score || "").trim(),
      isNew: Number(item?.is_new || 0) === 1,
      isNewEpisode: Number(item?.is_new_episode || 0) === 1,
      badgeLabel: String(item?.badge_label || "").trim()
    };
  });
};

// Define se o rebuild completo deve retomar ou limpar tudo
const getFullBuildStartStrategy = ({
  persistedItems = [],
  totalPages = 1
}) => {
  const buildStatus =
    readCatalogMetaValue(CATALOG_META_KEYS.BUILD_STATUS, "");

  const buildMode =
    readCatalogMetaValue(CATALOG_META_KEYS.BUILD_MODE, "");

  const lastProcessedPage =
    Number(
      readCatalogMetaValue(
        CATALOG_META_KEYS.LAST_PROCESSED_PAGE,
        "0"
      )
    ) || 0;

  const hasPersistedItems =
    Array.isArray(persistedItems) &&
    persistedItems.length > 0;

  const isInterruptedFullBuild =
    buildStatus === "running" &&
    buildMode === "full" &&
    hasPersistedItems &&
    lastProcessedPage >= 1 &&
    lastProcessedPage < totalPages;

  if (isInterruptedFullBuild) {
    return {
      shouldResume: true,
      startPage: lastProcessedPage + 1,
      lastProcessedPage,
      buildStatus,
      buildMode
    };
  }

  return {
    shouldResume: false,
    startPage: 1,
    lastProcessedPage,
    buildStatus,
    buildMode
  };
};

// ===============================
// VALIDAÇÕES
// ===============================

// Valida se o slug foi informado
const validateSlug = (slug) => {
  if (!slug || !String(slug).trim()) {
    throw new NotFoundError("Slug do anime não informado.");
  }
};

// Valida se o número do episódio foi informado
const validateEpisodeNumber = (episodeNumber) => {
  if (!episodeNumber || !String(episodeNumber).trim()) {
    throw new NotFoundError("Número do episódio não informado.");
  }
};

// Normaliza página recebida
const normalizePage = (page) => {
  const pageNumber = Number(page || 1);

  if (!Number.isFinite(pageNumber) || pageNumber < 1) {
    return 1;
  }

  return Math.floor(pageNumber);
};

// Normaliza letra recebida
const normalizeLetter = (letter) => {
  const normalizedLetter = String(letter || "")
    .trim()
    .toLowerCase();

  if (!normalizedLetter) {
    return "";
  }

  if (!/^[a-z]$/.test(normalizedLetter)) {
    return "";
  }

  return normalizedLetter;
};

// Normaliza gênero recebido
const normalizeGenre = (genre) => {
  return String(genre || "")
    .trim()
    .toLowerCase();
};

// Normaliza termo de busca
const normalizeSearchQuery = (query) => {
  return String(query || "")
    .trim();
};

// Normaliza tipo de catálogo recebido
const normalizeCatalogType = (type) => {
  const normalizedType = String(type || "")
    .trim()
    .toLowerCase();

  if (!normalizedType) {
    return "";
  }

  if (!ALLOWED_ANIME_CATALOG_TYPES.includes(normalizedType)) {
    return "";
  }

  return normalizedType;
};

// Normaliza texto para comparação de busca
const normalizeTextForSearch = (value = "") => {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
};

// Remove duplicados por slug ou link
const uniqueAnimeItems = (items = []) => {
  const map = new Map();

  items.forEach((item) => {
    if (!item || typeof item !== "object") {
      return;
    }

    const key =
      String(item.slug || "").trim() ||
      String(item.link || "").trim() ||
      String(item.title || "").trim();

    if (!key) {
      return;
    }

    if (!map.has(key)) {
      map.set(key, item);
    }
  });

  return Array.from(map.values());
};

// Normaliza o retorno bruto do catálogo
const normalizeCatalogResult = (
  result,
  {
    page = 1,
    letter = "",
    genre = "",
    type = ""
  } = {}
) => {
  const normalizedPage = normalizePage(page);
  const normalizedLetter = normalizeLetter(letter);
  const normalizedGenre = normalizeGenre(genre);
  const normalizedType = normalizeCatalogType(type);

  const normalizedResult = {
    page: Number(result?.page || normalizedPage),
    total: Number(result?.total || 0),
    totalPages: Number(result?.totalPages || normalizedPage),
    hasNextPage: Boolean(result?.hasNextPage),
    hasPreviousPage: Boolean(result?.hasPreviousPage),
    letter: normalizedLetter,
    genre: normalizedGenre,
    type: normalizedType,
    data: Array.isArray(result?.data) ? result.data : []
  };

  if (normalizedResult.totalPages < normalizedResult.page) {
    normalizedResult.totalPages = normalizedResult.page;
  }

  normalizedResult.hasNextPage =
    normalizedResult.page < normalizedResult.totalPages;

  normalizedResult.hasPreviousPage =
    normalizedResult.page > 1;

  return normalizedResult;
};

// Lê a primeira página do catálogo de forma segura
const getCatalogFirstPage = async () => {
  return fetchAnimes({
    page: 1
  });
};

// ===============================
// ÍNDICE GLOBAL DO CATÁLOGO
// ===============================

// Lê o índice global do cache.
// Se não existir em memória, tenta recuperar do SQLite.
const getCachedCatalogIndex = () => {
  const cachedIndex = getCache(
    getAnimeCatalogIndexCacheKey()
  );

  if (cachedIndex) {
    return cachedIndex;
  }

  try {
    const persistedItems =
      getAllAnimeIndexItems();

    if (
      !Array.isArray(persistedItems) ||
      persistedItems.length === 0
    ) {
      return null;
    }

    const totalPages =
      Number(
        readCatalogMetaValue(
          CATALOG_META_KEYS.TOTAL_PAGES,
          "1"
        )
      ) || 1;

    const normalizedItems =
      normalizePersistedAnimeItems(persistedItems);

    const recoveredIndex = {
      totalItems: normalizedItems.length,
      totalPages:
        Number.isFinite(totalPages) && totalPages > 0
          ? totalPages
          : 1,
      items: normalizedItems
    };

    setCache(
      getAnimeCatalogIndexCacheKey(),
      recoveredIndex,
      FULL_CATALOG_INDEX_CACHE_TTL_MS
    );

    console.log(
      `[CATALOG INDEX] índice recuperado do SQLite | totalItems=${recoveredIndex.totalItems} | totalPages=${recoveredIndex.totalPages}`
    );

    return recoveredIndex;
  } catch (error) {
    console.error(
      "[CATALOG INDEX] erro ao recuperar índice do SQLite:",
      error.message
    );

    return null;
  }
};

// Lê o metadata do índice global.
// Se não existir em memória, tenta recuperar do SQLite.
const getCachedCatalogIndexMeta = () => {
  const cachedMeta = getCache(
    getAnimeCatalogIndexMetaCacheKey()
  );

  if (cachedMeta) {
    return cachedMeta;
  }

  try {
    const recoveredMeta = {
      totalPages: Number(
        readCatalogMetaValue(
          CATALOG_META_KEYS.TOTAL_PAGES,
          "0"
        )
      ),
      totalItems: Number(
        readCatalogMetaValue(
          CATALOG_META_KEYS.TOTAL_ITEMS,
          "0"
        )
      ),
      updatedAt: readCatalogMetaValue(
        CATALOG_META_KEYS.LAST_FULL_REBUILD_AT,
        ""
      ),
      mode: readCatalogMetaValue(
        CATALOG_META_KEYS.BUILD_MODE,
        "sqlite-fallback"
      ),
      buildStatus: readCatalogMetaValue(
        CATALOG_META_KEYS.BUILD_STATUS,
        ""
      ),
      lastProcessedPage: Number(
        readCatalogMetaValue(
          CATALOG_META_KEYS.LAST_PROCESSED_PAGE,
          "0"
        )
      )
    };

    if (
      !recoveredMeta.totalPages &&
      !recoveredMeta.totalItems &&
      !recoveredMeta.updatedAt
    ) {
      return null;
    }

    setCache(
      getAnimeCatalogIndexMetaCacheKey(),
      recoveredMeta,
      FULL_CATALOG_INDEX_CACHE_TTL_MS
    );

    console.log(
      `[CATALOG META] metadata recuperada do SQLite | totalItems=${recoveredMeta.totalItems} | totalPages=${recoveredMeta.totalPages} | buildStatus=${recoveredMeta.buildStatus || "n/a"}`
    );

    return recoveredMeta;
  } catch (error) {
    console.error(
      "[CATALOG META] erro ao recuperar metadata do SQLite:",
      error.message
    );

    return null;
  }
};

// Constrói o índice global completo do catálogo
const buildFullCatalogIndex = async () => {
  if (isRefreshingFullCatalogIndex) {
    console.log(
      "[CATALOG INDEX] atualização ignorada porque já existe uma em andamento"
    );

    return getCachedCatalogIndex();
  }

  isRefreshingFullCatalogIndex = true;

  const startTime = Date.now();

  try {
    console.log(
      "[CATALOG INDEX] iniciando reconstrução completa..."
    );

    const firstPageRaw = await scraper.scrapeAnimeCatalog({
      page: 1
    });

    const firstPage = normalizeCatalogResult(
      firstPageRaw,
      {
        page: 1,
        letter: "",
        genre: "",
        type: ""
      }
    );

    // Total detectado no site pai
const detectedTotalPages =
  Number(firstPage?.totalPages || 1) || 1;

// Aplica limite manual de segurança
const totalPages = Math.min(
  detectedTotalPages,
  MAX_CATALOG_PAGES_LIMIT
);

console.log(
  `[CATALOG INDEX] totalPages detectado=${detectedTotalPages} | limite aplicado=${MAX_CATALOG_PAGES_LIMIT} | totalPages efetivo=${totalPages}`
);

console.log(
  `[CATALOG INDEX] totalPages detectado no site pai=${totalPages}`
);

    const persistedItemsRaw =
      getAllAnimeIndexItems();

    const strategy =
      getFullBuildStartStrategy({
        persistedItems: persistedItemsRaw,
        totalPages
      });

    let allItems = [];

    if (strategy.shouldResume) {
      allItems =
        normalizePersistedAnimeItems(persistedItemsRaw);

      console.log(
        `[CATALOG INDEX] retomando rebuild interrompido | startPage=${strategy.startPage} | lastProcessedPage=${strategy.lastProcessedPage} | persistedItems=${allItems.length}`
      );
        } else {
      console.log(
        `[CATALOG INDEX] iniciando rebuild limpo sem apagar índice visível | previousStatus=${strategy.buildStatus || "n/a"} | previousMode=${strategy.buildMode || "n/a"} | previousLastProcessedPage=${strategy.lastProcessedPage || 0}`
      );

      // Limpa apenas os metadados de progresso do build antigo.
      // NÃO apaga o anime_index aqui, para o site continuar exibindo
      // o catálogo completo antigo durante o rebuild.
      clearCatalogBuildProgressMeta();

      // Começa a nova coleta em memória a partir da página 1.
      // A substituição real do índice continua acontecendo só no final do rebuild.
      allItems = Array.isArray(firstPage?.data)
        ? [...firstPage.data]
        : [];
    }

    // Marca estado do full rebuild como em andamento
    writeCatalogMetaValue(
      CATALOG_META_KEYS.BUILD_STATUS,
      "running"
    );

    writeCatalogMetaValue(
      CATALOG_META_KEYS.BUILD_MODE,
      "full"
    );

    writeCatalogMetaValue(
      CATALOG_META_KEYS.TOTAL_PAGES,
      String(totalPages)
    );

    writeCatalogMetaValue(
      CATALOG_META_KEYS.LAST_PROCESSED_PAGE,
      String(
        strategy.shouldResume
          ? strategy.lastProcessedPage
          : 1
      )
    );

    // Se o rebuild começou limpo, já salva a página 1 como checkpoint inicial
    if (!strategy.shouldResume) {
      const initialUniqueItems =
        uniqueAnimeItems(allItems);

      saveAnimeIndexBatch(initialUniqueItems);

      writeCatalogMetaValue(
        CATALOG_META_KEYS.TOTAL_ITEMS,
        String(initialUniqueItems.length)
      );

      writeCatalogMetaValue(
        CATALOG_META_KEYS.LAST_PARTIAL_REBUILD_AT,
        new Date().toISOString()
      );

      checkpointWal();

      console.log(
        `[CATALOG INDEX] checkpoint inicial salvo | página=1 | totalItems=${initialUniqueItems.length}`
      );
    }

    // Decide de onde continua
    const startPage =
      strategy.shouldResume
        ? strategy.startPage
        : 2;

    // Percorre as próximas páginas
    for (
      let currentPage = startPage;
      currentPage <= totalPages;
      currentPage += 1
    ) {
      const pageResultRaw =
        await scraper.scrapeAnimeCatalog({
          page: currentPage
        });

      const pageResult = normalizeCatalogResult(
        pageResultRaw,
        {
          page: currentPage,
          letter: "",
          genre: "",
          type: ""
        }
      );

      if (
        Array.isArray(pageResult?.data) &&
        pageResult.data.length > 0
      ) {
        allItems.push(...pageResult.data);
      }

      const dedupedItems =
        uniqueAnimeItems(allItems);

      // Atualiza índice parcial e checkpoint a cada página
      saveAnimeIndexBatch(dedupedItems);

      writeCatalogMetaValue(
        CATALOG_META_KEYS.TOTAL_ITEMS,
        String(dedupedItems.length)
      );

      writeCatalogMetaValue(
        CATALOG_META_KEYS.LAST_PROCESSED_PAGE,
        String(currentPage)
      );

      writeCatalogMetaValue(
        CATALOG_META_KEYS.LAST_PARTIAL_REBUILD_AT,
        new Date().toISOString()
      );

      // Força checkpoint do WAL a cada 5 páginas
      if (currentPage % 5 === 0) {
        checkpointWal();
      }

      console.log(
        `[CATALOG INDEX] página ${currentPage}/${totalPages} processada | itens acumulados=${dedupedItems.length}`
      );
    }

    const uniqueItems =
      uniqueAnimeItems(allItems);

    const catalogIndex = {
      totalItems: uniqueItems.length,
      totalPages,
      items: uniqueItems
    };

    const meta = {
      totalItems: uniqueItems.length,
      totalPages,
      updatedAt: new Date().toISOString(),
      durationMs: Date.now() - startTime,
      mode: "full",
      buildStatus: "completed",
      lastProcessedPage: totalPages
    };

    setCache(
      getAnimeCatalogIndexCacheKey(),
      catalogIndex,
      FULL_CATALOG_INDEX_CACHE_TTL_MS
    );

    setCache(
      getAnimeCatalogIndexMetaCacheKey(),
      meta,
      FULL_CATALOG_INDEX_CACHE_TTL_MS
    );

    // Garante persistência final limpa e consistente
    clearAnimeIndex();
    saveAnimeIndexBatch(uniqueItems);

    writeCatalogMetaValue(
      CATALOG_META_KEYS.TOTAL_PAGES,
      String(totalPages)
    );

    writeCatalogMetaValue(
      CATALOG_META_KEYS.TOTAL_ITEMS,
      String(uniqueItems.length)
    );

    writeCatalogMetaValue(
      CATALOG_META_KEYS.LAST_FULL_REBUILD_AT,
      meta.updatedAt
    );

    writeCatalogMetaValue(
      CATALOG_META_KEYS.LAST_PROCESSED_PAGE,
      String(totalPages)
    );

    writeCatalogMetaValue(
      CATALOG_META_KEYS.BUILD_STATUS,
      "completed"
    );

    writeCatalogMetaValue(
      CATALOG_META_KEYS.BUILD_MODE,
      "full"
    );

    checkpointWal();

    console.log(
      `[CATALOG INDEX] reconstrução concluída em ${meta.durationMs}ms | totalPages=${totalPages} | totalItems=${uniqueItems.length}`
    );

    return catalogIndex;
  } catch (error) {
    console.error(
      "[CATALOG INDEX] erro ao reconstruir índice completo:",
      error.message
    );

    writeCatalogMetaValue(
      CATALOG_META_KEYS.BUILD_STATUS,
      "failed"
    );

    writeCatalogMetaValue(
      CATALOG_META_KEYS.BUILD_MODE,
      "full"
    );

    return getCachedCatalogIndex() || null;
  } finally {
    isRefreshingFullCatalogIndex = false;
  }
};

// ===============================
// REFRESH INCREMENTAL DO ÍNDICE GLOBAL
// ===============================
const refreshIncrementalCatalogIndex = async () => {
  try {
    console.log(
      "[CATALOG INDEX] iniciando refresh incremental..."
    );

    const currentIndex =
      getCachedCatalogIndex();

    if (
      !currentIndex ||
      !Array.isArray(currentIndex.items)
    ) {
      console.log(
        "[CATALOG INDEX] índice inexistente no cache, fazendo rebuild completo como fallback..."
      );

      return await buildFullCatalogIndex();
    }

    const recentUpdates =
      await fetchRecentUpdates();

    const currentItems =
      Array.isArray(currentIndex.items)
        ? currentIndex.items
        : [];

    const recentItems =
      Array.isArray(recentUpdates?.data)
        ? recentUpdates.data
        : [];

    const mergedItems =
      uniqueAnimeItems([
        ...recentItems,
        ...currentItems
      ]);

    const updatedIndex = {
      totalItems: mergedItems.length,
      totalPages: Number(currentIndex.totalPages || 1),
      items: mergedItems
    };

    const updatedMeta = {
      totalItems: mergedItems.length,
      totalPages: Number(currentIndex.totalPages || 1),
      updatedAt: new Date().toISOString(),
      mode: "incremental",
      buildStatus: "completed",
      lastProcessedPage: Number(currentIndex.totalPages || 1)
    };

    setCache(
      getAnimeCatalogIndexCacheKey(),
      updatedIndex,
      INCREMENTAL_CATALOG_INDEX_CACHE_TTL_MS
    );

    setCache(
      getAnimeCatalogIndexMetaCacheKey(),
      updatedMeta,
      INCREMENTAL_CATALOG_INDEX_CACHE_TTL_MS
    );

    saveAnimeIndexBatch(mergedItems);

    writeCatalogMetaValue(
      CATALOG_META_KEYS.TOTAL_PAGES,
      String(updatedIndex.totalPages)
    );

    writeCatalogMetaValue(
      CATALOG_META_KEYS.TOTAL_ITEMS,
      String(updatedIndex.totalItems)
    );

    writeCatalogMetaValue(
      CATALOG_META_KEYS.LAST_INCREMENTAL_AT,
      updatedMeta.updatedAt
    );

    writeCatalogMetaValue(
      CATALOG_META_KEYS.BUILD_STATUS,
      "completed"
    );

    writeCatalogMetaValue(
      CATALOG_META_KEYS.BUILD_MODE,
      "incremental"
    );

    writeCatalogMetaValue(
      CATALOG_META_KEYS.LAST_PROCESSED_PAGE,
      String(updatedIndex.totalPages)
    );

    checkpointWal();

    console.log(
      `[CATALOG INDEX] refresh incremental concluído | totalItems=${updatedIndex.totalItems} | totalPages=${updatedIndex.totalPages}`
    );

    return updatedIndex;
  } catch (error) {
    console.error(
      "[CATALOG INDEX] erro no refresh incremental:",
      error.message
    );

    writeCatalogMetaValue(
      CATALOG_META_KEYS.BUILD_STATUS,
      "failed"
    );

    writeCatalogMetaValue(
      CATALOG_META_KEYS.BUILD_MODE,
      "incremental"
    );

    return getCachedCatalogIndex() || null;
  }
};

// Atualiza rapidamente as primeiras páginas do catálogo
const refreshFastCatalogPages = async () => {
  if (isRefreshingFastPages) {
    console.log(
      "[FAST PAGES] atualização ignorada porque já existe uma em andamento"
    );
    return;
  }

  isRefreshingFastPages = true;

  const startTime = Date.now();

  try {
    console.log(
      `[FAST PAGES] iniciando atualização das páginas 1-${FAST_REFRESH_PAGES_LIMIT}...`
    );

    for (
      let currentPage = 1;
      currentPage <= FAST_REFRESH_PAGES_LIMIT;
      currentPage += 1
    ) {
      const result = await scraper.scrapeAnimeCatalog({
        page: currentPage,
        letter: "",
        genre: "",
        type: ""
      });

      const normalizedResult = normalizeCatalogResult(
        result,
        {
          page: currentPage,
          letter: "",
          genre: "",
          type: ""
        }
      );

      const cacheKey = getAnimesCacheKey({
        page: currentPage,
        letter: "",
        genre: "",
        type: ""
      });

      setCache(cacheKey, normalizedResult);

      console.log(
        `[FAST PAGES] página ${currentPage} atualizada | itens=${normalizedResult.data.length} | totalPages=${normalizedResult.totalPages}`
      );
    }

    const durationMs = Date.now() - startTime;

    console.log(
      `[FAST PAGES] atualização concluída em ${durationMs}ms`
    );
  } catch (error) {
    console.error(
      "[FAST PAGES] erro ao atualizar páginas rápidas:",
      error.message
    );
  } finally {
    isRefreshingFastPages = false;
  }
};

// ===============================
// POPULAR SIDEBAR
// ===============================
const refreshPopularSidebar = async () => {
  console.log(
    "[POPULAR SIDEBAR] iniciando atualização..."
  );

  const homeSections =
    await animeScraper.scrapeAnimeHomeSections();

  const popularSidebar = Array.isArray(homeSections?.popularSidebar)
    ? homeSections.popularSidebar
    : [];

  if (!popularSidebar.length) {
    console.warn(
      "[POPULAR SIDEBAR] nenhum item encontrado no scraper"
    );

    return [];
  }

  try {
    savePopularSidebarBatch(popularSidebar);

    console.log(
      `[POPULAR SIDEBAR] SQLITE SAVE total=${popularSidebar.length}`
    );
  } catch (error) {
    console.error(
      "[POPULAR SIDEBAR] SQLITE SAVE ERROR",
      error.message
    );
  }

  return popularSidebar;
};

// ===============================
// HOME ESTRUTURADA
// ===============================
const fetchAnimeHomeSections = async () => {

  // Busca sempre as atualizações recentes
  // Agora elas vêm do cache/SQLite próprio delas
  const recentUpdates = await fetchRecentUpdates();

  // Busca sempre o índice global já salvo
  const cachedCatalogIndex = getCachedCatalogIndex();

  // "Mais vistos" continua vindo do índice global
  // e em ordem alfabética porque o SQLite já entrega assim
  const mostViewedFromIndex =
    Array.isArray(cachedCatalogIndex?.items)
      ? cachedCatalogIndex.items.slice(0, 10)
      : [];

     // Lê o popular sidebar diretamente do SQLite
  let popularSidebar = [];

  try {
    popularSidebar =
      getPopularSidebarItems(5);

    if (!Array.isArray(popularSidebar)) {
      popularSidebar = [];
    }
  } catch (error) {
    console.warn(
      "[HOME SERVICE] erro ao ler popularSidebar do SQLite:",
      error.message
    );

    popularSidebar = [];
  }

  // Monta a home final sem depender de um cache fechado da home inteira
  const normalizedHomeSections = {
    mostViewed: mostViewedFromIndex,
    latestEpisodes: Array.isArray(recentUpdates?.data)
      ? recentUpdates.data
      : [],
    recentAnimes: Array.isArray(recentUpdates?.data)
      ? recentUpdates.data
      : [],
    popularSidebar: Array.isArray(popularSidebar)
      ? popularSidebar
      : []
  };

  console.log(
    `[HOME BLOCKS] mostViewed(index)=${normalizedHomeSections.mostViewed.length} | latestEpisodes(recent_updates)=${normalizedHomeSections.latestEpisodes.length} | recentAnimes(recent_updates)=${normalizedHomeSections.recentAnimes.length} | popularSidebar=${normalizedHomeSections.popularSidebar.length}`
  );

  // Se tudo vier vazio, não derruba a home
  if (
    normalizedHomeSections.mostViewed.length === 0 &&
    normalizedHomeSections.latestEpisodes.length === 0 &&
    normalizedHomeSections.recentAnimes.length === 0 &&
    normalizedHomeSections.popularSidebar.length === 0
  ) {
    console.warn(
      "[HOME SERVICE] Todas as seções vieram vazias. Retornando home vazia sem lançar erro."
    );
  }

  return normalizedHomeSections;
};

// ===============================
// ATUALIZAÇÕES RECENTES
// ===============================
const fetchRecentUpdates = async (options = {}) => {
  const {
    forceRefresh = false
  } = options;

  // TTL das atualizações recentes: 20 minutos
  const RECENT_UPDATES_CACHE_TTL_MS =
    20 * 60 * 1000;

  // Chave fixa do cache de atualizações recentes
  const cacheKey =
    `${ANIME_CACHE_PREFIX}_recent_updates_pages_1_2`;


  // 2) Tenta buscar do SQLite
  // Só usa SQLite como retorno direto se NÃO for refresh forçado
  if (!forceRefresh) {
    try {
      const persistedItems =
        getRecentUpdatesItems(10);

      if (
        Array.isArray(persistedItems) &&
        persistedItems.length > 0
      ) {
        const normalizedPersistedItems =
          persistedItems.map((item) => {
            return {
              slug: String(item?.slug || "").trim(),
              title: String(item?.title || "").trim(),
              cover: String(item?.cover || "").trim(),
              episode: String(item?.episode || "").trim(),
              episodeNumber: String(item?.episode || "").trim(),
              latestEpisode: String(item?.episode || "").trim(),
              link: String(item?.link || "").trim(),
              episodeLink: String(item?.link || "").trim(),
              isNew: true,
              isNewEpisode: true,
              badgeLabel: "Novo"
            };
          });

        const sqliteResult = {
          source: "sqlite_recent_updates",
          updatedAt: new Date().toISOString(),
          total: normalizedPersistedItems.length,
          pages: [1, 2],
          data: normalizedPersistedItems,
          fullData: normalizedPersistedItems
        };

                console.log(
          `[RECENT UPDATES SQLITE HIT] total=${normalizedPersistedItems.length}`
        );

        return sqliteResult;
      }
    } catch (error) {
      console.error(
        "[RECENT UPDATES SQLITE READ ERROR]",
        error.message
      );
    }
  }

  // 3) Faz scraping das 2 primeiras páginas de atualizações
  console.log(
    forceRefresh
      ? "[RECENT UPDATES FORCE REFRESH] atualizando páginas 1 e 2..."
      : "[RECENT UPDATES SCRAPER MISS] iniciando bootstrap das páginas 1 e 2..."
  );

    let page1;
  let page2;

  // Se for refresh forçado, raspa direto o site pai
  // para não cair no SQLite de recent_updates e reciclar dado antigo
  if (forceRefresh) {
    const page1Raw =
      await scraper.scrapeAnimeCatalog({
        page: 1,
        type: "updated"
      });

    const page2Raw =
      await scraper.scrapeAnimeCatalog({
        page: 2,
        type: "updated"
      });

    page1 = normalizeCatalogResult(page1Raw, {
      page: 1,
      letter: "",
      genre: "",
      type: "updated"
    });

    page2 = normalizeCatalogResult(page2Raw, {
      page: 2,
      letter: "",
      genre: "",
      type: "updated"
    });
  } else {
    page1 = await fetchAnimes({
      page: 1,
      type: "updated"
    });

    page2 = await fetchAnimes({
      page: 2,
      type: "updated"
    });
  }

  const mergedItems = [
    ...(Array.isArray(page1?.data) ? page1.data : []),
    ...(Array.isArray(page2?.data) ? page2.data : [])
  ];

  const uniqueItems = uniqueAnimeItems(mergedItems);

  const normalizedItemsWithBadge = uniqueItems.map((item) => {
    const existsInPage1 = Array.isArray(page1?.data)
      ? page1.data.some((page1Item) => {
          const sameSlug =
            String(page1Item?.slug || "").trim() &&
            String(page1Item?.slug || "").trim() ===
              String(item?.slug || "").trim();

          const sameLink =
            String(page1Item?.link || "").trim() &&
            String(page1Item?.link || "").trim() ===
              String(item?.link || "").trim();

          return sameSlug || sameLink;
        })
      : false;

    return {
      ...item,
      isNew: existsInPage1,
      isNewEpisode: existsInPage1,
      badgeLabel: existsInPage1 ? "Novo" : ""
    };
  });

  try {
    saveRecentUpdatesBatch(normalizedItemsWithBadge);

    console.log(
      `[RECENT UPDATES SQLITE SAVE] total=${normalizedItemsWithBadge.length}`
    );
  } catch (error) {
    console.error(
      "[RECENT UPDATES SQLITE SAVE ERROR]",
      error.message
    );
  }

  const normalizedResult = {
    source: forceRefresh
      ? "updated_pages_1_2_forced"
      : "updated_pages_1_2",
    updatedAt: new Date().toISOString(),
    total: normalizedItemsWithBadge.length,
    pages: [1, 2],
    data: normalizedItemsWithBadge.slice(0, 10),
    fullData: normalizedItemsWithBadge
  };

   return normalizedResult;
};

// =========================
// BUSCAR LISTA DE ANIMES COM CACHE POR FILTRO
// =========================
const fetchAnimes = async ({
  page = 1,
  letter = "",
  genre = "",
  type = ""
}) => {
  // Normaliza página
  const normalizedPage = normalizePage(page);

  // Normaliza filtros
  const normalizedLetter = normalizeLetter(letter);
  const normalizedGenre = normalizeGenre(genre);
  const normalizedType = normalizeCatalogType(type);

  
  // ==================================================
  // REGRA NOVA:
  // Se for listagem de atualizações recentes,
  // usa o SQLite da tabela recent_updates
  // em vez de fazer scraping ao vivo
  // ==================================================
  const isUpdatedCatalogRequest =
    normalizedType === "updated";

  if (isUpdatedCatalogRequest) {
    // Lê uma quantidade suficiente para montar as 2 páginas
    const persistedUpdatedItems =
      getRecentUpdatesItems(48);

    if (
      Array.isArray(persistedUpdatedItems) &&
      persistedUpdatedItems.length > 0
    ) {
      const normalizedUpdatedItems =
        persistedUpdatedItems.map((item) => {
          return {
            slug: String(item?.slug || "").trim(),
            title: String(item?.title || "").trim(),
            cover: String(item?.cover || "").trim(),

            // Compatibilidade com o card e frontend
            episode: String(item?.episode || "").trim(),
            episodeNumber: String(item?.episode || "").trim(),
            latestEpisode: String(item?.episode || "").trim(),

            link: String(item?.link || "").trim(),
            episodeLink: String(item?.link || "").trim(),

            isNew: true,
            isNewEpisode: true,
            badgeLabel: "Novo"
          };
        });

      // Mantém paginação local igual ao pageSize atual
      const pageSize = SEARCH_PAGE_SIZE;

      const totalItems = normalizedUpdatedItems.length;

      // Continua limitando em 2 páginas, como já era sua regra
      const totalPages = Math.min(
        2,
        Math.max(
          1,
          Math.ceil(totalItems / pageSize)
        )
      );

      const safePage = Math.min(
        normalizedPage,
        totalPages
      );

      const startIndex =
        (safePage - 1) * pageSize;

      const endIndex =
        startIndex + pageSize;

      const paginatedItems =
        normalizedUpdatedItems.slice(startIndex, endIndex);

      const normalizedResult = {
        page: safePage,
        total: totalItems,
        totalPages,
        hasNextPage: safePage < totalPages,
        hasPreviousPage: safePage > 1,
        letter: "",
        genre: "",
        type: "updated",
        source: "sqlite_recent_updates",
        data: paginatedItems
      };

      console.log(
        `[SQLITE RECENT UPDATES -> LIST] page=${safePage} | totalItems=${totalItems} | totalPages=${totalPages} | returned=${paginatedItems.length}`
      );

      return normalizedResult;
    }
  }

  // ==================================================
  // REGRA NOVA:
  // Se for listagem padrão sem filtros,
  // usa o índice global salvo em memória/SQLite
  // em vez de fazer scraping ao vivo
  // ==================================================
    const isDefaultCatalogRequest =
    normalizedPage >= 1 &&
    !normalizedLetter &&
    !normalizedGenre &&
    !normalizedType;

  if (isDefaultCatalogRequest) {
    // Em vez de confiar no cache em memória do índice,
    // lê direto do SQLite para refletir o progresso mais atual do rebuild
    const persistedItems = getAllAnimeIndexItems();

    if (
      Array.isArray(persistedItems) &&
      persistedItems.length > 0
    ) {
      const normalizedItems = persistedItems.map((item) => {
        return {
          slug: String(item?.slug || "").trim(),
          title: String(item?.title || "").trim(),
          link: String(item?.link || "").trim(),
          cover: String(item?.cover || "").trim(),
          score: String(item?.score || "").trim(),
          isNew: Number(item?.is_new || 0) === 1,
          isNewEpisode: Number(item?.is_new_episode || 0) === 1,
          badgeLabel: String(item?.badge_label || "").trim()
        };
      });

      // Mantém paginação local fixa
      const pageSize = SEARCH_PAGE_SIZE;

      const totalItems = normalizedItems.length;

      const totalPages = Math.max(
        1,
        Math.ceil(totalItems / pageSize)
      );

      const safePage = Math.min(
        normalizedPage,
        totalPages
      );

      const startIndex =
        (safePage - 1) * pageSize;

      const endIndex =
        startIndex + pageSize;

      const paginatedItems =
        normalizedItems.slice(startIndex, endIndex);

      const normalizedResult = {
        page: safePage,
        total: totalItems,
        totalPages,
        hasNextPage: safePage < totalPages,
        hasPreviousPage: safePage > 1,
        letter: "",
        genre: "",
        type: "",
        source: "sqlite_catalog_index",
        data: paginatedItems
      };

      // Salva somente a página final no cache em memória
      // para evitar recalcular a mesma página toda hora
  
      console.log(
        `[SQLITE INDEX -> LIST] page=${safePage} | totalItems=${totalItems} | totalPages=${totalPages} | returned=${paginatedItems.length}`
      );

      return normalizedResult;
    }
  }

  // ==================================================
  // FALLBACK:
  // Se não for listagem padrão ou se o índice não existir,
  // continua usando scraping normal
  // ==================================================
  const result = await scraper.scrapeAnimeCatalog({
    page: normalizedPage,
    letter: normalizedLetter,
    genre: normalizedGenre,
    type: normalizedType
  });

  // Normaliza o retorno do catálogo
  const normalizedResult = normalizeCatalogResult(
    result,
    {
      page: normalizedPage,
      letter: normalizedLetter,
      genre: normalizedGenre,
      type: normalizedType
    }
  );

  // Regra fixa para Atualizações Recentes:
  // sempre limitar a 2 páginas no backend
  if (normalizedType === "updated") {
    normalizedResult.totalPages = 2;
    normalizedResult.hasPreviousPage = normalizedPage > 1;
    normalizedResult.hasNextPage = normalizedPage < 2;
  }

  return normalizedResult;
};

// ===============================
// BUSCAR ANIMES POR NOME
// ===============================
const searchAnimes = async (filters = {}) => {
  const query =
    normalizeSearchQuery(filters.query);

  const page =
    normalizePage(filters.page);

  if (!query) {
    throw new NotFoundError(
      "Termo de busca não informado."
    );
  }

  const cacheKey =
    getAnimeSearchCacheKey({
      query,
      page
    });

  const cachedData =
    getCache(cacheKey);

  if (cachedData) {
    return cachedData;
  }

  const normalizedQuery =
    normalizeTextForSearch(query);

  let cachedCatalogIndex =
    getCachedCatalogIndex();

  if (
    !cachedCatalogIndex ||
    !Array.isArray(cachedCatalogIndex.items)
  ) {
    console.log(
      "[SEARCH] índice global não encontrado em cache. Fazendo fallback temporário."
    );

    const firstCatalogPage =
      await getCatalogFirstPage();

    const fallbackItems =
      Array.isArray(firstCatalogPage?.data)
        ? firstCatalogPage.data
        : [];

    const matchedFallbackItems =
      fallbackItems.filter((item) => {
        const searchableTitle =
          normalizeTextForSearch(item?.title || "");
        const searchableSlug =
          normalizeTextForSearch(item?.slug || "");
        const searchableLink =
          normalizeTextForSearch(item?.link || "");

        return (
          searchableTitle.includes(normalizedQuery) ||
          searchableSlug.includes(normalizedQuery) ||
          searchableLink.includes(normalizedQuery)
        );
      });

    const fallbackTotalPages = Math.max(
      1,
      Math.ceil(
        matchedFallbackItems.length /
          SEARCH_PAGE_SIZE
      )
    );

    const safeFallbackPage = Math.min(
      page,
      fallbackTotalPages
    );

    const startIndex =
      (safeFallbackPage - 1) * SEARCH_PAGE_SIZE;

    const endIndex =
      startIndex + SEARCH_PAGE_SIZE;

    const fallbackResult = {
      query,
      page: safeFallbackPage,
      totalPages: fallbackTotalPages,
      hasNextPage: safeFallbackPage < fallbackTotalPages,
      hasPreviousPage: safeFallbackPage > 1,
      total: matchedFallbackItems.length,
      data: matchedFallbackItems.slice(startIndex, endIndex)
    };

    setCache(cacheKey, fallbackResult);

    return fallbackResult;
  }

  const catalogItems =
    Array.isArray(cachedCatalogIndex.items)
      ? cachedCatalogIndex.items
      : [];

  const matchedItems =
    catalogItems.filter((item) => {
      const searchableTitle =
        normalizeTextForSearch(item?.title || "");
      const searchableSlug =
        normalizeTextForSearch(item?.slug || "");
      const searchableLink =
        normalizeTextForSearch(item?.link || "");

      return (
        searchableTitle.includes(normalizedQuery) ||
        searchableSlug.includes(normalizedQuery) ||
        searchableLink.includes(normalizedQuery)
      );
    });

  const totalMatchedItems =
    matchedItems.length;

  const totalPages = Math.max(
    1,
    Math.ceil(
      totalMatchedItems / SEARCH_PAGE_SIZE
    )
  );

  const safePage = Math.min(page, totalPages);

  const startIndex =
    (safePage - 1) * SEARCH_PAGE_SIZE;

  const endIndex =
    startIndex + SEARCH_PAGE_SIZE;

  const paginatedItems =
    matchedItems.slice(startIndex, endIndex);

  const normalizedResult = {
    query,
    page: safePage,
    totalPages,
    hasNextPage: safePage < totalPages,
    hasPreviousPage: safePage > 1,
    total: totalMatchedItems,
    data: paginatedItems
  };

  setCache(cacheKey, normalizedResult);

  return normalizedResult;
};

// ===============================
// LISTAR GÊNEROS
// ===============================
const fetchAnimeGenres = async () => {
 
  const genres =
    await animeScraper.scrapeAnimeGenres();

  if (!Array.isArray(genres) || genres.length === 0) {
    throw new NotFoundError(
      "Nenhum gênero encontrado."
    );
  }

  return genres;
};

// ===============================
// BUSCAR DETALHES DO ANIME
// ===============================
const fetchAnimeDetails = async (slug) => {
  // Valida slug
  if (!slug) {
    throw new NotFoundError("Slug do anime não informado.");
  }

  // 2) Tenta detalhes persistidos no SQLite
  try {
    const persistedDetails =
      getAnimeDetailsBySlug.get(slug);

    if (
      persistedDetails &&
      persistedDetails.data
    ) {
      const parsedDetails =
        JSON.parse(persistedDetails.data);

    
      console.log("[DETAILS SQLITE HIT]", slug);

      return parsedDetails;
    }
  } catch (error) {
    console.error(
      "[DETAILS SQLITE READ ERROR]",
      slug,
      error.message
    );
  }

  // 3) Se não encontrou em cache nem SQLite, faz scraping
  console.log("[DETAILS SCRAPER MISS]", slug);

  const animeDetails =
    await scraper.scrapeAnimeDetails(slug);

  // Debug opcional
  console.log(
    "[SERVICE] animeDetails recebido:",
    !!animeDetails
  );

  // Se não veio nada
  if (!animeDetails) {
    throw new NotFoundError(
      "Detalhes do anime não encontrados."
    );
  }

  // Se veio objeto mas sem título
  if (!animeDetails.title) {
    throw new NotFoundError(
      "Detalhes do anime inválidos."
    );
  }

  // 4) Salva no SQLite
  try {
    saveAnimeDetails.run({
      slug: String(slug).trim(),
      data: JSON.stringify(animeDetails),
      updated_at: new Date().toISOString()
    });

    console.log("[DETAILS SQLITE SAVE]", slug);
  } catch (error) {
    console.error(
      "[DETAILS SQLITE SAVE ERROR]",
      slug,
      error.message
    );
  }

  // 6) Retorna resultado
  return animeDetails;
};

// ===============================
// EPISÓDIOS DO ANIME
// ===============================
const fetchAnimeEpisodes = async (slug) => {
  // Valida o slug recebido
  validateSlug(slug);

  // Resolve alias do slug
  slug = resolveSlugAlias(slug);

  console.log("[SERVICE] slug resolvido:", slug);

  // 2) Tenta pegar os episódios já salvos no SQLite
  try {
    const persistedEpisodes =
      getAnimeEpisodesBySlug.all(slug);

    if (
      Array.isArray(persistedEpisodes) &&
      persistedEpisodes.length > 0
    ) {
      const normalizedPersistedEpisodes =
        persistedEpisodes.map((episode) => {
          return {
            number: Number(
              episode?.episode_number || 0
            ),
            title: String(
              episode?.title || ""
            ).trim(),
            link: String(
              episode?.link || ""
            ).trim(),
            season: Number(
              episode?.season || 1
            ),
            episodeSlug: String(
              episode?.episode_slug || ""
            ).trim()
          };
        });

      console.log(
        `[EPISODES SQLITE HIT] ${slug} | total=${normalizedPersistedEpisodes.length}`
      );

      return normalizedPersistedEpisodes;
    }
  } catch (error) {
    console.error(
      "[EPISODES SQLITE READ ERROR]",
      slug,
      error.message
    );
  }

  // 3) Se não encontrou em memória nem no SQLite, faz scraping
  const episodes =
    await animeScraper.scrapeAnimeEpisodes(slug);

  console.log(
    "[SERVICE] episódios encontrados:",
    Array.isArray(episodes)
      ? episodes.length
      : "inválido"
  );

  // Valida resultado
  if (
    !episodes ||
    !Array.isArray(episodes) ||
    episodes.length === 0
  ) {
    throw new NotFoundError(
      "Nenhum episódio encontrado."
    );
  }

  // 4) Salva no SQLite
  try {
    saveAnimeEpisodesBatch(slug, episodes);

    console.log(
      `[EPISODES SQLITE SAVE] ${slug} | total=${episodes.length}`
    );
  } catch (error) {
    console.error(
      "[EPISODES SQLITE SAVE ERROR]",
      slug,
      error.message
    );
  }

  // 6) Retorna resultado
  return episodes;
};

// ===============================
// PLAYER DO EPISÓDIO
// ===============================
const fetchAnimeEpisodePlayer = async (
  slug,
  episodeNumber
) => {
  validateSlug(slug);

  slug = resolveSlugAlias(slug);

  validateEpisodeNumber(episodeNumber);

  const cacheKey =
    getAnimePlayerCacheKey(
      slug,
      episodeNumber
    );

  const cachedData =
    getCache(cacheKey);

  if (cachedData) {
    return cachedData;
  }

  const player =
    await animeScraper.scrapeAnimeEpisodePlayer(
      slug,
      episodeNumber
    );

  if (!player || typeof player !== "object") {
    throw new NotFoundError(
      "Player do episódio não encontrado."
    );
  }

  const normalizedPlayer = {
    title: player.title || `Episódio ${episodeNumber}`,
    slug: player.slug || slug,
    episodeNumber: Number(
      player.episodeNumber || episodeNumber
    ),
    episodeUrl: player.episodeUrl || "",
    players: Array.isArray(player.players)
      ? player.players
      : []
  };

  setCache(cacheKey, normalizedPlayer);

  return normalizedPlayer;
};

// ===============================
// EXPORTAÇÃO
// ===============================
module.exports = {
  refreshPopularSidebar,
  fetchAnimeHomeSections,
  fetchRecentUpdates,
  fetchAnimes,
  searchAnimes,
  fetchAnimeGenres,
  fetchAnimeDetails,
  fetchAnimeEpisodes,
  fetchAnimeEpisodePlayer,
  buildFullCatalogIndex,
  refreshIncrementalCatalogIndex,
  refreshFastCatalogPages,
  getCachedCatalogIndex,
  getCachedCatalogIndexMeta
};