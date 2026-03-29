// Armazena os dados em memória usando Map
const cache = new Map();


// Define o tempo padrão do cache em minutos
// Esse valor será usado caso o .env esteja inválido
const DEFAULT_TTL_MINUTES = 10;


// Converte o valor do .env para número
const cacheTTLMinutes = Number(process.env.CACHE_TTL);


// Verifica se o valor informado para TTL é válido
const isValidTTL = (ttl) => {

  // TTL precisa ser número e maior que zero
  return typeof ttl === "number"
    && !Number.isNaN(ttl)
    && ttl > 0;

};


// Define o TTL final em minutos
// Primeiro tenta usar o valor do .env
// Se não for válido, usa o valor padrão
const TTL_MINUTES = isValidTTL(cacheTTLMinutes)
  ? cacheTTLMinutes
  : DEFAULT_TTL_MINUTES;


// Converte o TTL final para milissegundos
const TTL_MS = TTL_MINUTES * 60 * 1000;


// Exibe no terminal o tempo de cache configurado
console.log(`Cache TTL configurado: ${TTL_MINUTES} minutos`);


// Busca um item no cache pela chave
const getCache = (key) => {

  // Obtém o item salvo no cache
  const item = cache.get(key);

  // Se não existir, retorna null
  if (!item) {
    return null;
  }

  // Verifica se o item expirou
  const isExpired = Date.now() > item.expiry;

  // Se expirou, remove do cache e retorna null
  if (isExpired) {

    cache.delete(key);

    return null;

  }

  // Retorna os dados armazenados
  return item.data;

};


// Salva um item no cache com TTL opcional
const setCache = (key, data, ttlMs = TTL_MS) => {

  // Define o TTL final em milissegundos
  const finalTTL = isValidTTL(ttlMs)
    ? ttlMs
    : TTL_MS;

  // Salva o item no cache
  cache.set(key, {
    data: data,
    expiry: Date.now() + finalTTL
  });

};


// Remove um item específico do cache
const deleteCache = (key) => {

  // Remove a chave do cache
  cache.delete(key);

};


// Limpa todo o cache
const clearCache = () => {

  // Remove todos os itens do cache
  cache.clear();

};


// Verifica se uma chave existe e ainda está válida
const hasCache = (key) => {

  // Reaproveita a lógica do getCache
  const data = getCache(key);

  // Retorna true se existir dado válido
  return data !== null;

};


// Lista todas as chaves válidas do cache
const getAllCacheKeys = () => {

  // Cria um array para armazenar as chaves válidas
  const validKeys = [];

  // Percorre todas as chaves do cache
  for (const key of cache.keys()) {

    // Só adiciona se a chave ainda estiver válida
    if (getCache(key) !== null) {
      validKeys.push(key);
    }

  }

  // Retorna a lista de chaves válidas
  return validKeys;

};


// Exporta as funções do cache
module.exports = {
  getCache,
  setCache,
  deleteCache,
  clearCache,
  hasCache,
  getAllCacheKeys
};