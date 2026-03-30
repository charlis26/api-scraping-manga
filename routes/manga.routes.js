// Importa o Express
const express = require("express");

// Cria o router
const router = express.Router();

// Importa os controllers
const {
  getMangas,
  getMangaDetails,
  getPagesBySlug,
  getHealth
} = require("../controllers/manga.controller");

// Importa o asyncHandler
const asyncHandler = require("../utils/asyncHandler");


// Rota profissional de health check
router.get(
  "/health",
  asyncHandler(getHealth)
);


// Rota para listar todos os mangás
router.get(
  "/mangas",
  asyncHandler(getMangas)
);


// Rota para retornar detalhes completos do mangá usando slug
router.get(
  "/mangas/detalhes/:slug",
  asyncHandler(getMangaDetails)
);


// Rota para listar páginas de um capítulo por slug
router.get(
  "/capitulo/slug/:slug",
  asyncHandler(getPagesBySlug)
);


// Exporta o router
module.exports = router;