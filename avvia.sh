#!/bin/bash
# FantaSanRocco — avvia server + tunnel Cloudflare
# Uso: ./avvia.sh  |  Ctrl+C per spegnere tutto.

cd "$(dirname "$0")"

ORANGE="\033[1;33m"
CYAN="\033[1;36m"
GREEN="\033[1;32m"
RESET="\033[0m"

# Ferma processi precedenti
pkill -9 -f "node src/server.js" 2>/dev/null || true
pkill -9 -f "cloudflared tunnel"  2>/dev/null || true
sleep 1

echo ""
echo -e "${ORANGE}  🟠 FantaSanRocco — avvio...${RESET}"
echo ""

# 1) Avvia Node PRIMA e aspetta che sia pronto su :3000
node src/server.js > /tmp/fsr_node.log 2>&1 &
NODE_PID=$!

echo -e "  ⏳  Avvio server..."
for i in $(seq 1 20); do
  sleep 0.5
  curl -s -o /dev/null http://localhost:3000 && break
done

if ! kill -0 $NODE_PID 2>/dev/null; then
  echo -e "  ❌  Errore avvio server:"
  cat /tmp/fsr_node.log
  exit 1
fi
echo -e "  ${GREEN}✅  Server pronto${RESET}"

# 2) Solo ora avvia Cloudflare (il server è già up, niente 1033)
echo -e "  ⏳  Connessione a Cloudflare..."
cloudflared tunnel --url http://localhost:3000 > /tmp/fsr_tunnel.log 2>&1 &
TUNNEL_PID=$!

URL=""
for i in $(seq 1 30); do
  URL=$(grep -o "https://[a-z0-9-]*\.trycloudflare\.com" /tmp/fsr_tunnel.log 2>/dev/null | head -1)
  [ -n "$URL" ] && break
  sleep 0.5
done

echo ""
if [ -n "$URL" ]; then
  echo -e "  ${CYAN}┌──────────────────────────────────────────────┐${RESET}"
  echo -e "  ${CYAN}│  🌐  SITO ONLINE                             │${RESET}"
  echo -e "  ${CYAN}└──────────────────────────────────────────────┘${RESET}"
  echo -e "  ${ORANGE}  → ${URL}${RESET}"
else
  echo -e "  ⚠️  Tunnel non disponibile."
fi

echo ""
echo -e "  Premi ${ORANGE}Ctrl+C${RESET} per spegnere tutto."
echo -e "  ─────────────────────────────────────────────"
echo ""

# Mostra i log del server in tempo reale
tail -f /tmp/fsr_node.log &
TAIL_PID=$!

# Ctrl+C → ferma tutto per PID (niente zombie)
cleanup() {
  echo ""
  echo -e "${ORANGE}  Spegnendo...${RESET}"
  kill $NODE_PID $TUNNEL_PID $TAIL_PID 2>/dev/null
  echo -e "  👋  Arrivederci!"
  exit 0
}
trap cleanup INT TERM

wait $NODE_PID
kill $TUNNEL_PID $TAIL_PID 2>/dev/null
