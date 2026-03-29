// Importa o Express
const express = require("express");

// Cria o router
const router = express.Router();

// Importa os controllers
const {
  getMangas,
  getChapters,
  getPages
} = require("../controllers/manga.controller");

// Importa o asyncHandler
const asyncHandler = require("../utils/asyncHandler");


// Rota para listar todos os mangás
router.get(
  "/mangas",
  asyncHandler(getMangas)
);


// Rota para listar capítulos de um mangá
router.get(
  "/mangas/:id",
  asyncHandler(getChapters)
);


// Rota para listar páginas de um capítulo
router.get(
  "/capitulo/:id",
  asyncHandler(getPages)
);


// Exporta o router
module.exports = router;