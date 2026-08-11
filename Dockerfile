# =============================================================================
#  Dockerfile — FantaSanRocco (Node + Express + SQLite)
#  Pensato per Dokploy (build dal repo Git, reverse-proxy Traefik).
#
#  Dokploy, lato pannello, va configurato con:
#    • Build Type: Dockerfile   • Context: .   • Dockerfile Path: Dockerfile
#    • Domain -> Container Port 3000 (HTTPS Let's Encrypt)
#    • Volume Mount persistente -> /app/data   (DB SQLite + foto: NON perderlo!)
#    • Env: NODE_ENV, SECURE_COOKIES=true, SESSION_SECRET, APP_URL, DATA_DIR, PORT
#    • Build Arg (facoltativo): GIT_SHA -> finisce in /health insieme alla data
#      di build, così da fuori si vede quale versione sta girando. Se non lo si
#      passa resta vuoto: la data da sola dice comunque se la build è fresca.
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

# Targhetta della build, per sapere COSA sta girando davvero.
# Serve a rispondere in due secondi alla domanda "quello che ho pushato è
# online?": si apre /health dal telefono e c'è scritto. Senza, l'unico modo
# era leggere il sorgente della pagina, e una build fallita in silenzio non
# si distingueva da un cambiamento che non si vede.
#
# La data la mette la build stessa, quindi c'è sempre. Il commit invece è un
# ARG: .git non entra nell'immagine (è in .dockerignore), quindi da dentro
# non è ricavabile. Se Dokploy non lo passa resta vuoto e amen — la data da
# sola basta a capire se la build è fresca.
ARG GIT_SHA=""
RUN printf '{"commit":"%s","build":"%s"}\n' "$GIT_SHA" "$(date -u +%Y-%m-%dT%H:%M:%SZ)" > /app/build-info.json

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
