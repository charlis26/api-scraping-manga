// Lê as variáveis de ambiente e centraliza a configuração da fonte
const SOURCE_CONFIG = {
  // URL principal do site fonte
  BASE_URL: process.env.SOURCE_BASE_URL || "https://mangalivre.tv",

  // Caminho base dos mangás
  MANGA_PATH: process.env.SOURCE_MANGA_PATH || "/manga",

  // Caminho base dos capítulos
  CHAPTER_PATH: process.env.SOURCE_CHAPTER_PATH || "/capitulo",

  // Referer padrão
  REFERER:
    process.env.SOURCE_REFERER || "https://mangalivre.tv/",

  // Nome da fonte
  SOURCE_NAME:
    process.env.SOURCE_NAME || "MangaLivre tv",
};

// Exporta a configuração
module.exports = SOURCE_CONFIG;