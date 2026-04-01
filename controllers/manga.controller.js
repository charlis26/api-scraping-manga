// Importa o service responsável por buscar os dados
const mangaService = require("../services/manga.service");

// Importa a função que retorna todas as chaves do cache
const { getAllCacheKeys } = require("../cache/cache");


// Lista todos os mangás disponíveis
const getMangas = async (req, res) => {

  // Busca os dados no service
  const data = await mangaService.fetchMangas();

  // Retorna resposta padronizada da API
  res.json({
    success: true,
    total: data.length,
    data: data
  });

};


// Retorna os detalhes completos de um mangá pelo slug
const getMangaDetails = async (req, res) => {

  // Obtém o slug do mangá enviado na URL
  const { slug } = req.params;

  // Busca os detalhes completos do mangá
  const data = await mangaService.fetchMangaDetails(slug);

  // Retorna resposta padronizada da API
  res.json({
    success: true,
    data: data
  });

};


// Lista páginas de um capítulo específico pelo slug
const getPagesBySlug = async (req, res) => {

  // Obtém o slug do capítulo enviado na URL
  const { slug } = req.params;

  // Busca as páginas do capítulo usando o slug
  const data = await mangaService.fetchPagesBySlug(slug);

  // Retorna resposta padronizada
  res.json({
    success: true,
    total: data.length,
    data: data
  });

};


// Endpoint profissional de health check
const getHealth = async (req, res) => {

  // Busca todas as chaves atuais do cache
  const cacheKeys = getAllCacheKeys();

  // Captura o uso atual de memória do processo Node
  const memoryUsage = process.memoryUsage();

  // Converte bytes para MB com 2 casas decimais
  const toMB = (bytes) => {
    return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
  };

  // Retorna o estado atual da API
  res.status(200).json({
    success: true,
    data: {
      status: "ok",
      environment: process.env.NODE_ENV || "development",
      port: process.env.PORT || 3000,
      uptimeInSeconds: Number(process.uptime().toFixed(2)),
      serverTime: new Date().toISOString(),
      cache: {
        totalKeys: cacheKeys.length,
        keys: cacheKeys
      },
      memory: {
        rss: toMB(memoryUsage.rss),
        heapTotal: toMB(memoryUsage.heapTotal),
        heapUsed: toMB(memoryUsage.heapUsed),
        external: toMB(memoryUsage.external)
      }
    }
  });

};


// Exporta as funções para uso nas rotas
module.exports = {
  getMangas,
  getMangaDetails,
  getPagesBySlug,
  getHealth
};