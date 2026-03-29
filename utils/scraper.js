// Importa o axios para fazer requisições HTTP
const axios = require("axios");

// Importa o cheerio para manipular HTML
const cheerio = require("cheerio");


// ===============================
// FUNÇÃO: BUSCAR MANGÁS DA HOME
// ===============================
const scrapeHome = async () => {

  try {

    // Faz requisição para a home do site
    const response =
      await axios.get(
        "https://mangalivre.blog/",
        {
          // Define timeout para evitar travamento
          timeout: 10000
        }
      );

    // Carrega o HTML no cheerio
    const $ = cheerio.load(response.data);

    // Lista final de mangás
    const mangas = [];

    // Set para evitar links repetidos
    const seenLinks = new Set();


    // Percorre cada card de mangá
    $(".page-item-detail").each((index, element) => {

      // Pega o título do mangá
      const title =
        $(element)
          .find(".post-title a")
          .text()
          .trim();

      // Pega o link do mangá
      let link =
        $(element)
          .find(".post-title a")
          .attr("href");

      // Pega a imagem da capa
      let cover =
        $(element)
          .find("img")
          .attr("src");


      // Ignora se faltar dados
      if (!title || !link) return;


      // Converte link relativo para absoluto
      if (!link.startsWith("http")) {

        link =
          "https://mangalivre.blog" +
          link;

      }


      // Converte imagem relativa para absoluta
      if (cover && !cover.startsWith("http")) {

        cover =
          "https://mangalivre.blog" +
          cover;

      }


      // Evita duplicados
      if (seenLinks.has(link)) return;

      // Marca como já usado
      seenLinks.add(link);


      // Adiciona o mangá na lista
      mangas.push({

        // ID sequencial
        id: mangas.length + 1,

        // Título do mangá
        title,

        // Link do mangá
        link,

        // Capa do mangá
        cover

      });

    });


    // Retorna a lista final
    return mangas;

  }

  catch (error) {

    // Loga erro no terminal
    console.error(
      "Erro ao buscar mangás:",
      error.message
    );

    // Retorna lista vazia para não quebrar a API
    return [];

  }

};



// ===============================
// FUNÇÃO: BUSCAR CAPÍTULOS
// ===============================
const scrapeChapters = async (mangaUrl) => {

  try {

    // Faz requisição para página do mangá
    const response =
      await axios.get(
        mangaUrl,
        {
          timeout: 10000
        }
      );

    // Carrega HTML
    const $ =
      cheerio.load(
        response.data
      );

    // Lista de capítulos
    const chapters = [];

    // Evita duplicados
    const seenLinks =
      new Set();


    // Percorre todos os links
    $("a").each((index, element) => {

      // Pega texto
      const title =
        $(element)
          .text()
          .trim();

      // Pega link
      let link =
        $(element)
          .attr("href");


      // Ignora se não tiver link
      if (!link) return;


      // Converte link relativo
      if (!link.startsWith("http")) {

        link =
          "https://mangalivre.blog" +
          link;

      }


      // Detecta se parece capítulo
      const looksLikeChapter =

        title
          .toLowerCase()
          .includes("capítulo")

        ||

        link
          .toLowerCase()
          .includes("/capitulo/");


      // Ignora botão iniciar leitura
      if (
        title
          .toLowerCase()
          .includes("iniciar")
      ) return;


      // Ignora se não for capítulo
      if (!looksLikeChapter) return;


      // Evita duplicados
      if (seenLinks.has(link)) return;

      seenLinks.add(link);


      // Adiciona capítulo
      chapters.push({

        // ID sequencial
        id:
          chapters.length + 1,

        // Título
        title,

        // Link
        link

      });

    });


    // Retorna capítulos
    return chapters;

  }

  catch (error) {

    console.error(
      "Erro ao buscar capítulos:",
      error.message
    );

    return [];

  }

};



// ===============================
// FUNÇÃO: BUSCAR PÁGINAS
// ===============================
const scrapePages = async (chapterUrl) => {

  try {

    // Faz requisição
    const response =
      await axios.get(
        chapterUrl,
        {
          timeout: 10000
        }
      );

    // Carrega HTML
    const $ =
      cheerio.load(
        response.data
      );

    // Lista final
    const pages = [];

    // Evita imagens repetidas
    const seenImages =
      new Set();

    // Contador
    let pageNumber = 1;


    // Percorre imagens
    $("img").each((index, element) => {

      // Pega src
      let src =
        $(element)
          .attr("src");


      // Ignora vazio
      if (!src) return;


      // Converte link relativo
      if (!src.startsWith("http")) {

        src =
          "https://mangalivre.blog" +
          src;

      }


      // Só aceita imagens reais
      const isUploadImage =
        src.includes(
          "/wp-content/uploads/"
        );


      if (!isUploadImage) return;


      // Evita duplicados
      if (seenImages.has(src)) return;

      seenImages.add(src);


      // Adiciona página
      pages.push({

        // Número da página
        page:
          pageNumber,

        // URL da imagem
        image:
          src

      });


      pageNumber++;

    });


    return pages;

  }

  catch (error) {

    console.error(
      "Erro ao buscar páginas:",
      error.message
    );

    return [];

  }

};



// Exporta funções
module.exports = {

  scrapeHome,
  scrapeChapters,
  scrapePages

};