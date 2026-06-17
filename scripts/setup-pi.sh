#!/usr/bin/env bash
#
# Installation / mise à jour de Carnet Auto sur un Raspberry Pi (ou tout Linux).
# Idempotent : on peut le relancer après un « git pull » pour mettre à jour.
#
# Usage :
#   bash scripts/setup-pi.sh           # install + build
#   bash scripts/setup-pi.sh --seed    # + données de démonstration
#
set -euo pipefail

cd "$(dirname "$0")/.."
echo "📁 Projet : $(pwd)"

# --- 1. Vérification de Node.js ---------------------------------------------
if ! command -v node >/dev/null 2>&1; then
  echo "❌ Node.js n'est pas installé."
  echo "   Installez Node 20+ :  curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash - && sudo apt-get install -y nodejs"
  exit 1
fi
NODE_MAJOR="$(node -p 'process.versions.node.split(".")[0]')"
echo "🟢 Node.js v$(node -v | sed 's/v//')"
if [ "$NODE_MAJOR" -lt 20 ]; then
  echo "⚠️  Node 20+ recommandé (vous avez la v$NODE_MAJOR). L'app peut ne pas démarrer."
fi

# --- 2. Fichier .env (créé une seule fois) ----------------------------------
if [ ! -f .env ]; then
  echo "🔐 Création du fichier .env avec une clé AUTH_SECRET aléatoire…"
  SECRET="$(node -e 'console.log(require("crypto").randomBytes(32).toString("base64"))')"
  cat > .env <<EOF
# Base de données SQLite locale (un simple fichier, parfait pour le Raspberry Pi).
DATABASE_URL="file:./prod.db"
# Clé secrète de session (générée automatiquement, gardez-la privée).
AUTH_SECRET="$SECRET"
# Mettez "true" UNIQUEMENT si l'app est servie en HTTPS (Caddy + nom de domaine).
COOKIE_SECURE="false"
EOF
  echo "   ✅ .env créé (base : prisma/prod.db)"
else
  echo "🔐 .env déjà présent — conservé."
fi

# --- 3. Dépendances ----------------------------------------------------------
echo "📦 Installation des dépendances (npm ci)…"
if [ -f package-lock.json ]; then
  npm ci
else
  npm install
fi

# --- 4. Base de données ------------------------------------------------------
echo "🗄️  Application du schéma à la base de données…"
npm run db:push

if [ "${1:-}" = "--seed" ]; then
  echo "🌱 Chargement des données de démonstration…"
  npm run db:seed
fi

# --- 5. Build de production --------------------------------------------------
# Sur les Pi à faible mémoire (1 Go), on limite la mémoire de Node pour éviter
# les plantages pendant le build.
TOTAL_MB="$(free -m 2>/dev/null | awk '/^Mem:/{print $2}' || echo 4096)"
if [ "${TOTAL_MB:-4096}" -lt 2000 ]; then
  echo "🧠 Mémoire faible détectée (${TOTAL_MB} Mo) — build avec mémoire limitée."
  echo "   💡 Si le build échoue, activez du swap (voir docs/RASPBERRY-PI.md)."
  export NODE_OPTIONS="--max-old-space-size=900"
fi
echo "🏗️  Build de production…"
npm run build

echo ""
echo "✅ Carnet Auto est prêt !"
echo ""
echo "▶️  Lancer maintenant :        npm run start"
echo "♾️  Lancer en permanence :     voir deploy/carnet.service et docs/RASPBERRY-PI.md"
echo ""
IP="$(hostname -I 2>/dev/null | awk '{print $1}')"
echo "🌐 Une fois lancé, ouvrez :   http://${IP:-<ip-du-pi>}:3000"
