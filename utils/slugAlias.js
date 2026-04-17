// ===============================
// SISTEMA DE ALIAS DE SLUG
// ===============================

// Mapa manual de slugs problemáticos
// Aqui ficam apenas casos conhecidos que precisam de correção

const SLUG_ALIAS_MAP = {
  // Exemplo real identificado no sistema
  "dr-stone-science-future": "dr-stone-hd"
};

// ===============================
// RESOLVER SLUG
// ===============================

const resolveSlugAlias = (slug) => {
  // Se não houver slug, retorna como está
  if (!slug) {
    return slug;
  }

  // Normaliza slug recebido
  const normalizedSlug = String(slug)
    .trim()
    .toLowerCase();

  // Verifica se existe alias
  if (SLUG_ALIAS_MAP[normalizedSlug]) {
    return SLUG_ALIAS_MAP[normalizedSlug];
  }

  // Retorna slug original se não houver alias
  return normalizedSlug;
};

module.exports = {
  resolveSlugAlias
};