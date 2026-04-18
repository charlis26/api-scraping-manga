# NexAnimes API

API REST para scraping de animes e mangás com cache, rate limit, banco SQLite e atualização incremental automática.

Esta API é responsável por:

- Buscar dados do site fonte
- Armazenar dados em SQLite
- Gerenciar cache
- Controlar requisições (rate limit)
- Atualizar dados automaticamente
- Servir dados para o frontend

---

# Tecnologias utilizadas

- Node.js
- Express
- SQLite
- Axios
- Cheerio
- Playwright (fallback)
- Cache em memória
- Rate limit
- Compression
- Helmet
- CORS

---

# Requisitos

Node.js:

18 ou superior

---

# Instalação

Clone o repositório:

git clone https://github.com/seu-usuario/nexanimes-api

Entre na pasta:

cd nexanimes-api

Instale as dependências:

npm install

---

# Configuração

Crie o arquivo:

.env

Exemplo:

PORT=10000

ANIME_BASE_URL=https://animefire.io/

RATE_LIMIT_WINDOW=15
RATE_LIMIT_MAX=300

CACHE_TTL=10

---

# Rodar em desenvolvimento

npm run dev

ou

node server.js

---

# Endpoints principais

Health:

/health

Lista de animes:

/api/animes

Detalhes de anime:

/api/animes/:slug

Episódios:

/api/animes/:slug/episodes

Player:

/api/animes/:slug/episode/:number

---

# Arquitetura

Backend:

Routes
Controllers
Services
Cache
Database
Scraper

Banco:

SQLite

Atualizações:

Incremental automático
Rebuild completo automático

---

# Deploy

Fluxo de produção:

1) Configurar .env
2) npm install
3) node server.js

Em produção:

pm2 start server.js --name nexanimes-api

---

# Monitoramento

Health check:

/health

Cache status:

/api/cache/status

Limpar cache:

/api/cache/clear

---

# Estrutura do projeto

routes/
services/
middlewares/
cache/
database/
utils/

server.js

---

# Autor

Richardson P. Sodre