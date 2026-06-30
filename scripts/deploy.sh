#!/usr/bin/env bash
# Déploiement automatique de Vroumi.
# Récupère la branche suivie, et SI elle a changé : applique le schéma Prisma,
# reconstruit l'app et redémarre le service systemd. Conçu pour être lancé
# périodiquement par un timer systemd (voir deploy/README.md).
#
# En cas d'échec du build, le service N'EST PAS redémarré : l'ancienne version
# continue de tourner.
set -euo pipefail

# Racine du dépôt (ce script est dans scripts/).
cd "$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

BRANCH="${VROUMI_BRANCH:-main}"
SERVICE="${VROUMI_SERVICE:-vroumi}"

# Empêche deux déploiements simultanés.
exec 9>/tmp/vroumi-deploy.lock
if ! flock -n 9; then
  echo "$(date '+%F %T') déploiement déjà en cours, on saute."
  exit 0
fi

git fetch --quiet origin "$BRANCH"
LOCAL="$(git rev-parse HEAD)"
REMOTE="$(git rev-parse "origin/$BRANCH")"

# Rien de neuf : on sort sans rien faire (cas le plus fréquent).
if [ "$LOCAL" = "$REMOTE" ]; then
  exit 0
fi

echo "$(date '+%F %T') mise à jour détectée : ${LOCAL:0:7} -> ${REMOTE:0:7}"

# Récupère exactement l'état distant (ne touche pas aux fichiers ignorés :
# .env, prod.db, etc.).
git reset --hard "origin/$BRANCH"

# Dépendances — on inclut les devDependencies (nécessaires au build) même si
# NODE_ENV=production.
npm install --include=dev --no-audit --no-fund

# Applique les évolutions de schéma (nouvelles tables/colonnes).
npx prisma db push --skip-generate --accept-data-loss

# Build (prisma generate + next build). `set -e` stoppe ici en cas d'échec,
# donc le service n'est pas redémarré.
npm run build

sudo systemctl restart "$SERVICE"
echo "$(date '+%F %T') déploiement terminé : ${REMOTE:0:7}"
