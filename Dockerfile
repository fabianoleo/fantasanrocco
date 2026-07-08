# =============================================================================
#  Dockerfile — FantaSanRocco (Node + Express + SQLite)
#  Pensato per Dokploy (build dal repo Git, reverse-proxy Traefik).
#
#  Dokploy, lato pannello, va configurato con:
#    • Build Type: Dockerfile   • Context: .   • Dockerfile Path: Dockerfile
#    • Domain -> Container Port 3000 (HTTPS Let's Encrypt)
#    • Volume Mount persistente -> /app/data   (DB SQLite + foto: NON perderlo!)
#    • Env: NODE_ENV, SECURE_COOKIES=true, SESSION_SECRET, APP_URL, DATA_DIR, PORT
# =============================================================================

# ---- Stage 1: builder — dipendenze + toolchain per i moduli nativi ----------
FROM node:20-bookworm-slim AS builder
WORKDIR /app

# Toolchain per compilare i moduli nativi (better-sqlite3, in futuro sharp) se
# manca un prebuild per la piattaforma. Resta solo in questo stage, non nel finale.
RUN apt-get update \
 && apt-get install -y --no-install-recommends python3 make g++ ca-certificates \
 && rm -rf /var/lib/apt/lists/*

# Installa PRIMA le sole dipendenze → cache di layer efficace.
# `npm ci` = build riproducibile dal lockfile (tienilo allineato a package.json!).
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

# ---- Stage 2: runtime — immagine finale snella, senza toolchain -------------
FROM node:20-bookworm-slim AS runtime

# tini = PID 1 corretto: inoltra SIGTERM a Node così SQLite chiude/checkpointa
# in modo pulito quando Dokploy ferma o riavvia il container.
RUN apt-get update \
 && apt-get install -y --no-install-recommends tini \
 && rm -rf /var/lib/apt/lists/*

ENV NODE_ENV=production \
    PORT=3000 \
    DATA_DIR=/app/data
WORKDIR /app

# Dipendenze già risolte dal builder + codice applicativo.
COPY --from=builder /app/node_modules ./node_modules
COPY . .

# Cartella dati persistente (DB + foto): creata e assegnata all'utente non-root.
# Su Dokploy va montato qui un Volume: un named volume nuovo eredita questi
# permessi (node:node) al primo mount → l'app può scriverci senza girare da root.
RUN mkdir -p /app/data \
 && chown -R node:node /app

# Principio del minimo privilegio: niente root.
USER node

EXPOSE 3000

# Healthcheck applicativo: Dokploy/Traefik capiscono quando il container è pronto.
# /health verifica anche che il database risponda davvero, non solo che il
# processo sia in ascolto (più preciso di un semplice check su "/").
HEALTHCHECK --interval=15s --timeout=5s --start-period=25s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

# tini come entrypoint → segnali gestiti correttamente.
ENTRYPOINT ["/usr/bin/tini", "--"]
CMD ["node", "src/server.js"]
