#!/usr/bin/env bash
#
# Configure un sous-domaine gratuit DuckDNS qui pointe toujours vers ta box,
# même quand l'IP publique change (pas besoin de nom de domaine payant).
#
# Prérequis : un compte gratuit sur https://www.duckdns.org (connexion via
# Google/GitHub), puis crée un sous-domaine (ex. "carnet-anthony") et récupère
# ton TOKEN affiché en haut de la page.
#
# Usage :
#   sudo bash scripts/setup-duckdns.sh <sous-domaine> <token>
# Exemple :
#   sudo bash scripts/setup-duckdns.sh carnet-anthony 5f3c1a2b-....
#
# Le script :
#   - met à jour l'IP tout de suite,
#   - installe une tâche cron (toutes les 5 min) qui garde le sous-domaine à jour.
#
set -euo pipefail

if [ "$(id -u)" -ne 0 ]; then
  echo "❌ Lance ce script avec sudo."
  exit 1
fi

SUBDOMAIN="${1:-}"
TOKEN="${2:-}"
if [ -z "$SUBDOMAIN" ] || [ -z "$TOKEN" ]; then
  echo "Usage : sudo bash scripts/setup-duckdns.sh <sous-domaine> <token>"
  echo "Exemple : sudo bash scripts/setup-duckdns.sh carnet-anthony 5f3c1a2b-...."
  exit 1
fi

# Retire un éventuel suffixe .duckdns.org saisi par erreur.
SUBDOMAIN="${SUBDOMAIN%%.duckdns.org}"

DUCK_DIR="/opt/duckdns"
UPDATE_SH="$DUCK_DIR/update.sh"
LOG_FILE="$DUCK_DIR/duck.log"

mkdir -p "$DUCK_DIR"

# Script de mise à jour (DuckDNS détecte l'IP publique côté serveur si on
# laisse le champ ip vide).
cat > "$UPDATE_SH" <<EOF
#!/usr/bin/env bash
# Mise à jour DuckDNS pour $SUBDOMAIN.duckdns.org — généré par Carnet Auto.
curl -ksS "https://www.duckdns.org/update?domains=$SUBDOMAIN&token=$TOKEN&ip=" \\
  -o "$LOG_FILE" 2>/dev/null
echo " (\$(date '+%F %T'))" >> "$LOG_FILE"
EOF
chmod 700 "$UPDATE_SH"

echo "🔄 Première mise à jour DuckDNS…"
bash "$UPDATE_SH"
RESULT="$(head -1 "$LOG_FILE" 2>/dev/null || true)"
if [ "$RESULT" = "OK" ]; then
  echo "   ✅ $SUBDOMAIN.duckdns.org pointe maintenant vers ton IP publique."
else
  echo "   ⚠️  Réponse DuckDNS : '$RESULT' (attendu : OK). Vérifie le sous-domaine et le token."
fi

# Tâche cron toutes les 5 minutes (idempotent : on remplace l'ancienne ligne).
CRON_LINE="*/5 * * * * $UPDATE_SH >/dev/null 2>&1"
TMP="$(mktemp)"
crontab -l 2>/dev/null | grep -v "$UPDATE_SH" > "$TMP" || true
echo "$CRON_LINE" >> "$TMP"
crontab "$TMP"
rm -f "$TMP"

echo ""
echo "✅ DuckDNS configuré pour : $SUBDOMAIN.duckdns.org"
echo "   Mise à jour automatique de l'IP toutes les 5 minutes (cron)."
echo "   Journal : $LOG_FILE"
echo ""
echo "👉 Étape suivante : le HTTPS automatique avec"
echo "   sudo bash scripts/setup-https-caddy.sh $SUBDOMAIN.duckdns.org"
