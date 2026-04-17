// ===============================
// CACHE GLOBAL DA APLICAÇÃO
// ===============================


// Cria o armazenamento principal do cache em memória
const cacheStore = new Map();


// ===============================
// CONFIGURAÇÃO DE TTL
// ===============================


// Define TTL padrão em minutos caso o .env não esteja configurado
const DEFAULT_TTL_MINUTES = 10;


// Lê o TTL do .env
const ENV_TTL_MINUTES = Number(process.env.CACHE_TTL);


// Define o TTL final em milissegundos
const CACHE_TTL_MS =
  Number.isFinite(ENV_TTL_MINUTES) &&
  ENV_TTL_MINUTES > 0
    ? ENV_TTL_MINUTES * 60 * 1000
    : DEFAULT_TTL_MINUTES * 60 * 1000;


// ===============================
// FUNÇÕES INTERNAS
// ===============================


// Remove uma chave expirada
const deleteIfExpired = (key, entry) => {

  // Se não existir entrada, retorna inválida
  if (!entry) {
    return true;
  }

  // Verifica se expirou
  if (Date.now() > entry.expiresAt) {

    // Remove do cache
    cacheStore.delete(key);

    // Informa que expirou
    return true;

  }

  // Se não expirou, continua válida
  return false;

};


// ===============================
// OPERAÇÕES DO CACHE
// ===============================


// Busca um item no cache
const getCache = (key) => {

  // Busca entrada
  const entry = cacheStore.get(key);

  // Remove se expirado
  if (deleteIfExpired(key, entry)) {
    return null;
  }

  // Retorna valor
  return entry.value;

};


// Salva um item no cache
// Salva um item no cache
const setCache = (key, value, customTtlMs = null) => {

  // Decide qual TTL será usado
  const resolvedTtlMs =
    Number.isFinite(customTtlMs) &&
    customTtlMs > 0
      ? customTtlMs
      : CACHE_TTL_MS;

  // Salva valor com tempo de expiração
  cacheStore.set(key, {
    value,
    createdAt: Date.now(),
    expiresAt: Date.now() + resolvedTtlMs
  });

  return value;

};


// Remove uma chave específica
const deleteCache = (key) => {

  return cacheStore.delete(key);

};


// Limpa todo o cache
const clearCache = () => {

  // Captura quantidade antes
  const totalBeforeClear =
    cacheStore.size;

  // Limpa tudo
  cacheStore.clear();

  return {
    cleared: true,
    totalBeforeClear
  };

};


// Retorna estatísticas do cache
const getCacheStats = () => {

  const validKeys = [];

  let expiredRemoved = 0;

  for (const [key, entry] of cacheStore.entries()) {

    if (deleteIfExpired(key, entry)) {

      expiredRemoved++;

      continue;

    }

    validKeys.push({
      key,
      expiresInMs:
        Math.max(
          entry.expiresAt - Date.now(),
          0
        )
    });

  }

  return {
    totalKeys: validKeys.length,
    expiredRemoved,
    ttlMs: CACHE_TTL_MS,
    keys: validKeys
  };

};


// ===============================
// EXPORTAÇÃO
// ===============================


module.exports = {
  getCache,
  setCache,
  deleteCache,
  clearCache,
  getCacheStats
};