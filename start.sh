#!/bin/bash
# ImmoRelances — Démarrage de l'application
set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$SCRIPT_DIR"

echo "🏠 ImmoRelances — Démarrage..."

# Installation serveur
if [ ! -d "server/node_modules" ]; then
  echo "📦 Installation des dépendances serveur..."
  cd server && npm install && cd ..
fi

# Installation client
if [ ! -d "client/node_modules" ]; then
  echo "📦 Installation des dépendances client..."
  cd client && npm install && cd ..
fi

echo ""
echo "✅ Application disponible sur : http://localhost:5173"
echo "   Comptes : agent@agence.fr/agent123 · manager@agence.fr/manager123 · admin@agence.fr/admin123"
echo ""
echo "▶  Ctrl+C pour arrêter"
echo ""

# Serveur en arrière-plan
cd "$SCRIPT_DIR/server" && node src/index.js &
SERVER_PID=$!

# Nettoyage à l'arrêt
trap "kill $SERVER_PID 2>/dev/null; echo ''; echo '👋 Arrêt de l application'" EXIT INT TERM

# Client (bloquant)
cd "$SCRIPT_DIR/client" && npx vite
