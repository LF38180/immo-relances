#!/bin/bash
# ImmoRelances — Démarrage de l'application (mode développement)
set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$SCRIPT_DIR"

API_PORT=3001
WEB_PORT=5173

echo "ImmoRelances — Démarrage..."

# Installation serveur
if [ ! -d "server/node_modules" ]; then
  echo "Installation des dépendances serveur..."
  (cd server && npm install)
fi

# Installation client
if [ ! -d "client/node_modules" ]; then
  echo "Installation des dépendances client..."
  (cd client && npm install)
fi

# Libérer les ports occupés par d'anciennes instances (évite les connexions impossibles)
for PORT in $API_PORT $WEB_PORT; do
  PIDS=$(lsof -nP -iTCP:$PORT -sTCP:LISTEN -t 2>/dev/null || true)
  if [ -n "$PIDS" ]; then
    echo "Port $PORT déjà utilisé — arrêt de l'ancienne instance (PID $PIDS)..."
    kill $PIDS 2>/dev/null || true
    sleep 1
  fi
done

# Démarrage du serveur API en arrière-plan
cd "$SCRIPT_DIR/server" && node src/index.js &
SERVER_PID=$!

# Nettoyage à l'arrêt
trap "kill $SERVER_PID 2>/dev/null; echo ''; echo 'Arrêt de l'\''application'" EXIT INT TERM

# Vérifier que le serveur API répond avant de lancer le client
echo "Attente du serveur API sur le port $API_PORT..."
for i in $(seq 1 20); do
  if curl -s -o /dev/null "http://localhost:$API_PORT/api/health"; then
    echo "Serveur API prêt."
    break
  fi
  if ! kill -0 $SERVER_PID 2>/dev/null; then
    echo ""
    echo "ERREUR : le serveur API n'a pas démarré (port $API_PORT occupé ou erreur au démarrage)."
    echo "Vérifiez qu'aucune autre instance ne tourne, puis relancez ce script."
    exit 1
  fi
  sleep 0.5
done

echo ""
echo "Application disponible sur : http://localhost:$WEB_PORT"
echo "   Comptes : agent@lequai-immobilier.com/agent123 · manager@lequai-immobilier.com/manager123 · admin@lequai-immobilier.com/admin123"
echo ""
echo "Ctrl+C pour arrêter"
echo ""

# Client (bloquant) — port fixe pour rester aligné avec ce message
cd "$SCRIPT_DIR/client" && npx vite --port $WEB_PORT --strictPort
