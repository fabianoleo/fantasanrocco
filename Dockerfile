# Immagine Node completa: include i tool per compilare better-sqlite3 senza sorprese.
FROM node:20-bookworm

WORKDIR /app

# Installa prima le sole dipendenze (sfrutta la cache di Docker)
COPY package.json ./
RUN npm install --omit=dev

# Copia il resto del codice
COPY . .

# La cartella dati (db + foto) sarà montata come volume
ENV DATA_DIR=/data
EXPOSE 3000

# Docker usa questo per sapere se il container va riavviato: fallisce se il
# processo non risponde o il database non è raggiungibile (vedi /health).
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD node -e "require('http').get('http://127.0.0.1:3000/health', r => process.exit(r.statusCode === 200 ? 0 : 1)).on('error', () => process.exit(1))"

CMD ["node", "src/server.js"]
