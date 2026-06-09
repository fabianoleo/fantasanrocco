# Immagine Node completa: include i tool per compilare better-sqlite3 senza sorprese.
FROM node:20-bookworm

WORKDIR /app

# Installa prima le sole dipendenze (sfrutta la cache di Docker)
COPY package.json ./
RUN npm install --omit=dev

# Copia il resto del codice
COPY . .

# La cartella dati (db + foto) sarà montata come volume
ENV DATA_DIR=/app/data
EXPOSE 3000

CMD ["node", "src/server.js"]
