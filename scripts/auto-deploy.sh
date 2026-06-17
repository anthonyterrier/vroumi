#!/usr/bin/env bash
#
# Déploiement automatique de Carnet Auto.
# Récupère la branche de déploiement (main) et, SI du nouveau code est
# disponible, applique la base, rebuild et redémarre le service.
# Lancé périodiquement par le timer systemd « carnet-deploy.timer ».
#
# Quand rien n'a changé, le script s'arrête en quelques millisecondes
# (simple comparaison de commits) : aucun rebuild inutile.
#
set -euo pipefail

HERE="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(cd "$HERE/.." && pwd)"
cd "$PROJECT_DIR"

BRANCH="${DEPLOY_BRANCH:-main}"
ts() { date '+%F %T'; }

if ! git fetch --quiet origin "$BRANCH" 2>/dev/null; then
  echo "[$(ts)] ⚠️  git fetch impossible (réseau ou identifiants) — on réessaiera."
  exit 0
fi

LOCAL="$(git rev-parse HEAD)"
REMOTE="$(git rev-parse "origin/$BRANCH")"
if [ "$LOCAL" = "$REMOTE" ]; then
  exit 0 # déjà à jour, rien à faire
fi

echo "[$(ts)] 🔄 Nouvelle version détectée (${LOCAL:0:7} → ${REMOTE:0:7}), déploiement…"
git reset --hard "origin/$BRANCH"

# Dépendances (on inclut les devDeps nécessaires au build : prisma, next…).
npm install --include=dev --no-audit --no-fund

# Base de données : applique d'éventuels nouveaux modèles (non destructif).
npm run db:push

# Build de production.
npm run build

# Redémarrage du service applicatif (sudo sans mot de passe, cf. sudoers).
sudo systemctl restart carnet

echo "[$(ts)] ✅ Déploiement terminé (${REMOTE:0:7})."
