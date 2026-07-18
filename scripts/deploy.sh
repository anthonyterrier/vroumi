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

# Sauvegarde de la base AVANT toute évolution de schéma. `db push` est lancé
# avec --accept-data-loss (nécessaire à l'automatisation) : en cas de
# changement destructif, la sauvegarde permet de restaurer. On garde les 30
# dernières copies dans backups/ (non suivi par git, préservé par reset --hard).
DB_URL="$(grep -E '^DATABASE_URL=' .env 2>/dev/null | tail -1 | cut -d= -f2- | tr -d "\"'" || true)"
DB_REL="${DB_URL#file:}"
if [ -n "$DB_REL" ]; then
  case "$DB_REL" in
    /*) DB_PATH="$DB_REL" ;;          # chemin absolu
    *) DB_PATH="prisma/${DB_REL#./}" ;; # file: est résolu depuis prisma/
  esac
  if [ -f "$DB_PATH" ]; then
    mkdir -p backups
    cp "$DB_PATH" "backups/$(basename "$DB_PATH" .db)-$(date +%Y%m%d-%H%M%S).db"
    # Ne garde que les 30 sauvegardes les plus récentes.
    ls -1t backups/*.db 2>/dev/null | tail -n +31 | xargs -r rm -f
    echo "$(date '+%F %T') sauvegarde base : $DB_PATH"
  fi
fi

# Applique les évolutions de schéma (nouvelles tables/colonnes).
npx prisma db push --skip-generate --accept-data-loss

# Build PROPRE mais SÛR : on met l'ancien build de côté (au lieu de le
# supprimer). `next build` repart donc d'un .next vide (évite le HTML qui
# référence le hash d'un asset d'un build précédent → 400/404 et perte de
# style), MAIS si le build échoue on RESTAURE l'ancien build : le site ne tombe
# jamais faute de .next (c'est ce qui avait provoqué une boucle de redémarrage).
rm -rf .next.bak
[ -d .next ] && mv .next .next.bak

# `if` neutralise `set -e` sur la condition : on peut gérer l'échec nous-mêmes.
if npm run build; then
  rm -rf .next.bak
else
  echo "$(date '+%F %T') build ÉCHOUÉ : restauration de l'ancien build, service inchangé"
  rm -rf .next
  [ -d .next.bak ] && mv .next.bak .next
  exit 1
fi

sudo systemctl restart "$SERVICE"
echo "$(date '+%F %T') déploiement terminé : ${REMOTE:0:7}"
