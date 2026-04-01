// Importa módulo nativo de arquivos
const fs = require("fs");

// Importa módulo nativo de caminhos
const path = require("path");


// ===============================
// CONFIGURAÇÃO DE PASTAS
// ===============================

// Define a pasta de logs
const logsDirectory =
  path.join(__dirname, "../logs");

// Garante que a pasta exista
if (!fs.existsSync(logsDirectory)) {
  fs.mkdirSync(logsDirectory, {
    recursive: true
  });
}


// Define os arquivos de log
const accessLogPath =
  path.join(logsDirectory, "access.log");

const errorLogPath =
  path.join(logsDirectory, "error.log");


// ===============================
// FUNÇÃO AUXILIAR
// ===============================

// Escreve uma linha no arquivo
const writeLogLine = (filePath, line) => {
  // Adiciona quebra de linha e escreve
  fs.appendFileSync(filePath, `${line}\n`, "utf8");
};


// Retorna timestamp atual formatado
const getTimestamp = () => {
  return new Date().toISOString();
};


// ===============================
// LOG DE ACESSO
// ===============================

// Registra requisição normal
const logAccess = ({
  method = "",
  url = "",
  statusCode = "",
  durationMs = "",
  ip = ""
}) => {
  // Monta linha do log
  const line =
    `[${getTimestamp()}] ` +
    `METHOD=${method} ` +
    `URL=${url} ` +
    `STATUS=${statusCode} ` +
    `DURATION_MS=${durationMs} ` +
    `IP=${ip}`;

  // Escreve no arquivo
  writeLogLine(accessLogPath, line);
};


// ===============================
// LOG DE ERRO
// ===============================

// Registra erro da aplicação
const logError = ({
  method = "",
  url = "",
  statusCode = "",
  message = "",
  stack = "",
  code = ""
}) => {
  // Monta linha base do erro
  const line =
    `[${getTimestamp()}] ` +
    `METHOD=${method} ` +
    `URL=${url} ` +
    `STATUS=${statusCode} ` +
    `CODE=${code || "N/A"} ` +
    `MESSAGE=${message} ` +
    `STACK=${stack ? String(stack).replace(/\s+/g, " ").trim() : "N/A"}`;

  // Escreve no arquivo
  writeLogLine(errorLogPath, line);
};


// ===============================
// EXPORTAÇÃO
// ===============================

module.exports = {
  logAccess,
  logError,
  accessLogPath,
  errorLogPath
};