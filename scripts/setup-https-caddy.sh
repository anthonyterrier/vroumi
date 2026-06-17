#!/usr/bin/env bash
#
# Installe Caddy en reverse proxy devant Vroumi, avec HTTPS automatique
# (certificat Let's Encrypt gratuit, renouvelé tout seul). Ton mot de passe
# circule alors chiffré : indispensable si l'app est accessible depuis
# internet via un nom de domaine (ex. DuckDNS).
#
#   Internet ──► Box (ports 80+443) ──► Caddy (HTTPS) ──► Vroumi :3000
#
# Prérequis :
#   - Vroumi installé et lancé (port 3000),
#   - un nom de domaine qui pointe vers ta box (voir scripts/setup-duckdns.sh),
#   - sur la box : rediriger les ports TCP 80 ET 443 vers le Pi.
#
# Usage :
#   sudo bash scripts/setup-https-caddy.sh <domaine>
# Exemple :
#   sudo bash scripts/setup-https-caddy.sh vroumi-anthony.duckdns.org
#
set -euo pipefail

if [ "$(id -u)" -ne 0 ]; then
  echo "❌ Lance ce script avec sudo."
  exit 1
fi

DOMAIN="${1:-}"
if [ -z "$DOMAIN" ]; then
  echo "Usage : sudo bash scripts/setup-https-caddy.sh <domaine>"
  echo "Exemple : sudo bash scripts/setup-https-caddy.sh vroumi-anthony.duckdns.org"
  exit 1
fi

UPSTREAM="${UPSTREAM:-localhost:3000}"

# --- Installation de Caddy (dépôt officiel) ---------------------------------
if ! command -v caddy >/dev/null 2>&1; then
  echo "📦 Installation de Caddy…"
  apt-get update -qq
  apt-get install -y -qq debian-keyring debian-archive-keyring apt-transport-https curl gnupg
  curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' \
    | gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
  curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' \
    | tee /etc/apt/sources.list.d/caddy-stable.list >/dev/null
  apt-get update -qq
  apt-get install -y -qq caddy
else
  echo "✅ Caddy déjà installé."
fi

# --- Configuration : reverse proxy + HTTPS auto -----------------------------
echo "📝 Écriture du Caddyfile (/etc/caddy/Caddyfile)…"
cat > /etc/caddy/Caddyfile <<EOF
# Vroumi — HTTPS automatique (Let's Encrypt) + reverse proxy vers l'app.
$DOMAIN {
	encode gzip
	reverse_proxy $UPSTREAM
}
EOF

systemctl enable caddy >/dev/null 2>&1 || true
systemctl restart caddy

echo ""
echo "✅ Caddy configuré pour https://$DOMAIN"
echo ""
echo "⏳ Le certificat HTTPS est obtenu automatiquement au 1er accès"
echo "   (les ports 80 ET 443 doivent être redirigés vers le Pi sur la box)."
echo ""
echo "🔐 Pense à activer le cookie sécurisé dans .env :"
echo "      COOKIE_SECURE=true"
echo "   puis :  sudo systemctl restart vroumi"
echo ""
echo "🌐 Une fois fait, ouvre :  https://$DOMAIN"
echo ""
echo "🔎 Suivi des certificats / erreurs :  sudo journalctl -u caddy -f"
