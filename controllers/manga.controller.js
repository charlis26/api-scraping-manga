// Importa o service responsável por buscar os dados
const mangaService = require("../services/manga.service");


// Lista todos os mangás disponíveis
const getMangas = async (req, res) => {

  // Busca os dados no service
  const data = await mangaService.fetchMangas();

  // Retorna resposta padronizada da API
  res.json({
    success: true,
    total: data.length, // quantidade de mangás encontrados
    data: data // lista de mangás
  });

};


// Lista capítulos de um mangá específico
const getChapters = async (req, res) => {

  // Obtém o id do mangá enviado na URL
  const { id } = req.params;

  // Busca os capítulos do mangá
  const data = await mangaService.fetchChapters(id);

  // Retorna resposta padronizada
  res.json({
    success: true,
    total: data.length,
    data: data
  });

};


// Lista páginas de um capítulo específico
const getPages = async (req, res) => {

  // Obtém o id do capítulo enviado na URL
  const { id } = req.params;

  // Busca as páginas do capítulo
  const data = await mangaService.fetchPages(id);

  // Retorna resposta padronizada
  res.json({
    success: true,
    total: data.length,
    data: data
  });

};


// Exporta as funções para uso nas rotas
module.exports = {
  getMangas,
  getChapters,
  getPages
};