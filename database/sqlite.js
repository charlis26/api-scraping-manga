
// Importa o caminho do Node
const path = require("path");

// Importa o better-sqlite3
const Database = require("better-sqlite3");

// Define o caminho do banco SQLite no disco
const dbPath = path.join(__dirname, "nexanimes.sqlite");

// Cria ou abre o banco
const db = new Database(dbPath);

// Ativa algumas otimizações seguras
db.pragma("journal_mode = WAL");
db.pragma("synchronous = NORMAL");

// Garante a tabela do índice global
db.exec(`
  CREATE TABLE IF NOT EXISTS anime_index (
    slug TEXT PRIMARY KEY,
    title TEXT,
    link TEXT,
    cover TEXT,
    score TEXT,
    is_new INTEGER DEFAULT 0,
    is_new_episode INTEGER DEFAULT 0,
    badge_label TEXT DEFAULT '',
    updated_at TEXT
  );
`);

// Garante a tabela de metadados do catálogo
db.exec(`
  CREATE TABLE IF NOT EXISTS catalog_meta (
    key TEXT PRIMARY KEY,
    value TEXT,
    updated_at TEXT
  );
`);

// Garante a tabela de detalhes dos animes
db.exec(`
  CREATE TABLE IF NOT EXISTS anime_details (
    slug TEXT PRIMARY KEY,
    data TEXT NOT NULL,
    updated_at TEXT
  );
`);

// ===============================
// TABELA DE ATUALIZAÇÕES RECENTES
// ===============================

// Armazena os episódios de cada anime
db.exec(`
  CREATE TABLE IF NOT EXISTS anime_episodes (
    anime_slug TEXT NOT NULL,
    episode_number TEXT,
    title TEXT,
    link TEXT,
    season TEXT,
    episode_slug TEXT,
    updated_at TEXT,
    PRIMARY KEY (anime_slug, episode_number, episode_slug)
  );
`);

// Armazena os últimos episódios lançados
db.exec(`
  CREATE TABLE IF NOT EXISTS recent_updates (
    slug TEXT PRIMARY KEY,
    title TEXT,
    cover TEXT,
    episode TEXT,
    link TEXT,
    updated_at TEXT
  );
`);
// ===============================
// TABELA DO POPULAR SIDEBAR
// ===============================

// Armazena os itens do bloco lateral da home
db.exec(`
  CREATE TABLE IF NOT EXISTS popular_sidebar (
    slug TEXT PRIMARY KEY,
    title TEXT,
    cover TEXT,
    link TEXT,
    updated_at TEXT
  );
`);
// ===============================
// FUNÇÕES DO ÍNDICE GLOBAL
// ===============================

// Prepara o upsert de um item do índice global
const upsertAnimeIndexItem = db.prepare(`
  INSERT INTO anime_index (
    slug,
    title,
    link,
    cover,
    score,
    is_new,
    is_new_episode,
    badge_label,
    updated_at
  )
  VALUES (
    @slug,
    @title,
    @link,
    @cover,
    @score,
    @is_new,
    @is_new_episode,
    @badge_label,
    @updated_at
  )
  ON CONFLICT(slug) DO UPDATE SET
    title = excluded.title,
    link = excluded.link,
    cover = excluded.cover,
    score = excluded.score,
    is_new = excluded.is_new,
    is_new_episode = excluded.is_new_episode,
    badge_label = excluded.badge_label,
    updated_at = excluded.updated_at
`);

// Salva vários animes em lote com transação
const saveAnimeIndexBatch = db.transaction((items = []) => {
  for (const item of items) {
    upsertAnimeIndexItem.run({
      slug: String(item?.slug || "").trim(),
      title: String(item?.title || "").trim(),
      link: String(item?.link || "").trim(),
      cover: String(item?.cover || "").trim(),
      score: String(item?.score || "").trim(),
      is_new: item?.isNew ? 1 : 0,
      is_new_episode: item?.isNewEpisode ? 1 : 0,
      badge_label: String(item?.badgeLabel || "").trim(),
      updated_at: new Date().toISOString()
    });
  }
});

// Salva ou atualiza os detalhes de um anime
const saveAnimeDetails = db.prepare(`
  INSERT INTO anime_details (
    slug,
    data,
    updated_at
  )
  VALUES (
    @slug,
    @data,
    @updated_at
  )
  ON CONFLICT(slug) DO UPDATE SET
    data = excluded.data,
    updated_at = excluded.updated_at
`);

// Busca os detalhes de um anime pelo slug
const getAnimeDetailsBySlug = db.prepare(`
  SELECT
    slug,
    data,
    updated_at
  FROM anime_details
  WHERE slug = ?
`);

// ===============================
// FUNÇÕES DAS ATUALIZAÇÕES RECENTES
// ===============================

// Salva ou atualiza um item de atualização recente
const upsertRecentUpdateItem = db.prepare(`
  INSERT INTO recent_updates (
    slug,
    title,
    cover,
    episode,
    link,
    updated_at
  )
  VALUES (
    @slug,
    @title,
    @cover,
    @episode,
    @link,
    @updated_at
  )
  ON CONFLICT(slug) DO UPDATE SET
    title = excluded.title,
    cover = excluded.cover,
    episode = excluded.episode,
    link = excluded.link,
    updated_at = excluded.updated_at
  WHERE
    COALESCE(recent_updates.title, '') <> COALESCE(excluded.title, '')
    OR COALESCE(recent_updates.cover, '') <> COALESCE(excluded.cover, '')
    OR COALESCE(recent_updates.episode, '') <> COALESCE(excluded.episode, '')
    OR COALESCE(recent_updates.link, '') <> COALESCE(excluded.link, '')
`);

// Salva vários itens de atualizações recentes em lote
const saveRecentUpdatesBatch = db.transaction((items = []) => {
  for (const item of items) {
    upsertRecentUpdateItem.run({
      slug: String(item?.slug || "").trim(),
      title: String(item?.title || "").trim(),
      cover: String(item?.cover || "").trim(),
      episode: String(
        item?.episode ||
        item?.episodeNumber ||
        item?.latestEpisode ||
        ""
      ).trim(),
      link: String(
        item?.link ||
        item?.episodeLink ||
        ""
      ).trim(),
      updated_at: new Date().toISOString()
    });
  }
});

// Lê as atualizações recentes já salvas
const getRecentUpdatesItems = (limit = 10) => {
  return db.prepare(`
    SELECT
      slug,
      title,
      cover,
      episode,
      link,
      updated_at
    FROM recent_updates
    ORDER BY updated_at DESC
    LIMIT ?
  `).all(Number(limit || 10));
};

// Lê todos os itens do índice global
const getAllAnimeIndexItems = () => {
  return db.prepare(`
    SELECT
      slug,
      title,
      link,
      cover,
      score,
      is_new,
      is_new_episode,
      badge_label,
      updated_at
    FROM anime_index
    ORDER BY title COLLATE NOCASE ASC
  `).all();
};

// Limpa completamente o índice global persistido
const clearAnimeIndex = () => {
  return db.prepare(`
    DELETE FROM anime_index
  `).run();
};
// ===============================
// FUNÇÕES DO POPULAR SIDEBAR
// ===============================

// Salva ou atualiza um item do popular sidebar
const upsertPopularSidebarItem = db.prepare(`
  INSERT INTO popular_sidebar (
    slug,
    title,
    cover,
    link,
    updated_at
  )
  VALUES (
    @slug,
    @title,
    @cover,
    @link,
    @updated_at
  )
  ON CONFLICT(slug) DO UPDATE SET
    title = excluded.title,
    cover = excluded.cover,
    link = excluded.link,
    updated_at = excluded.updated_at
`);

// Salva vários itens do popular sidebar em lote
const savePopularSidebarBatch = db.transaction((items = []) => {
  for (const item of items) {
    upsertPopularSidebarItem.run({
      slug: String(item?.slug || "").trim(),
      title: String(item?.title || "").trim(),
      cover: String(
        item?.cover ||
        item?.image ||
        item?.thumb ||
        ""
      ).trim(),
      link: String(item?.link || "").trim(),
      updated_at: new Date().toISOString()
    });
  }
});

// Lê os itens do popular sidebar já salvos
const getPopularSidebarItems = (limit = 5) => {
  return db.prepare(`
    SELECT
      slug,
      title,
      cover,
      link,
      updated_at
    FROM popular_sidebar
    ORDER BY updated_at DESC
    LIMIT ?
  `).all(Number(limit || 5));
};

// ===============================
// FUNÇÕES DE METADADOS
// ===============================

// Prepara o upsert de metadado
const saveCatalogMeta = db.prepare(`
  INSERT INTO catalog_meta (
    key,
    value,
    updated_at
  )
  VALUES (
    @key,
    @value,
    @updated_at
  )
  ON CONFLICT(key) DO UPDATE SET
    value = excluded.value,
    updated_at = excluded.updated_at
`);

// Lê um metadado específico
const getCatalogMeta = db.prepare(`
  SELECT value
  FROM catalog_meta
  WHERE key = ?
`);

// Remove um metadado específico
const deleteCatalogMeta = db.prepare(`
  DELETE FROM catalog_meta
  WHERE key = ?
`);

// Remove vários metadados em uma transação
const deleteCatalogMetaKeys = db.transaction((keys = []) => {
  for (const key of keys) {
    deleteCatalogMeta.run(String(key || "").trim());
  }
});

// Faz checkpoint manual do WAL quando necessário
const checkpointWal = () => {
  db.exec("PRAGMA wal_checkpoint(FULL)");
};

// ===============================
// FUNÇÕES DOS EPISÓDIOS DOS ANIMES
// ===============================

// Remove todos os episódios antigos de um anime
const deleteAnimeEpisodesBySlug = db.prepare(`
  DELETE FROM anime_episodes
  WHERE anime_slug = ?
`);

// Insere ou atualiza um episódio
const upsertAnimeEpisodeItem = db.prepare(`
  INSERT INTO anime_episodes (
    anime_slug,
    episode_number,
    title,
    link,
    season,
    episode_slug,
    updated_at
  )
  VALUES (
    @anime_slug,
    @episode_number,
    @title,
    @link,
    @season,
    @episode_slug,
    @updated_at
  )
  ON CONFLICT(anime_slug, episode_number, episode_slug) DO UPDATE SET
    title = excluded.title,
    link = excluded.link,
    season = excluded.season,
    updated_at = excluded.updated_at
`);

// Salva todos os episódios de um anime em lote
const saveAnimeEpisodesBatch = db.transaction((animeSlug, episodes = []) => {
  const normalizedAnimeSlug =
    String(animeSlug || "").trim();

  // Segurança: não salva se o slug principal vier vazio
  if (!normalizedAnimeSlug) {
    return;
  }

  // Antes de regravar, remove os episódios antigos desse anime
  deleteAnimeEpisodesBySlug.run(normalizedAnimeSlug);

  // Insere a lista nova
  for (const episode of episodes) {
    const episodeNumber =
      String(
        episode?.number ||
        episode?.episodeNumber ||
        ""
      ).trim();

    const episodeLink =
      String(episode?.link || "").trim();

    const episodeSlug =
      String(
        episode?.episodeSlug ||
        episode?.slug ||
        ""
      ).trim();

    upsertAnimeEpisodeItem.run({
      anime_slug: normalizedAnimeSlug,
      episode_number: episodeNumber,
      title: String(
        episode?.title ||
        `Episódio ${episodeNumber || ""}`
      ).trim(),
      link: episodeLink,
      season: String(
        episode?.season || 1
      ).trim(),
      episode_slug: episodeSlug,
      updated_at: new Date().toISOString()
    });
  }
});

// Lê os episódios já salvos de um anime
const getAnimeEpisodesBySlug = db.prepare(`
  SELECT
    anime_slug,
    episode_number,
    title,
    link,
    season,
    episode_slug,
    updated_at
  FROM anime_episodes
  WHERE anime_slug = ?
  ORDER BY
    CAST(COALESCE(season, '1') AS INTEGER) ASC,
    CAST(COALESCE(episode_number, '0') AS INTEGER) ASC
`);

// Exporta conexão e helpers
module.exports = {
db,
saveAnimeIndexBatch,
getAllAnimeIndexItems,
clearAnimeIndex,
saveAnimeDetails,
savePopularSidebarBatch,
getPopularSidebarItems,
getAnimeDetailsBySlug,
saveRecentUpdatesBatch,
getRecentUpdatesItems,
saveAnimeEpisodesBatch,
getAnimeEpisodesBySlug,
deleteAnimeEpisodesBySlug,
saveCatalogMeta,
getCatalogMeta,
deleteCatalogMetaKeys,
checkpointWal
};