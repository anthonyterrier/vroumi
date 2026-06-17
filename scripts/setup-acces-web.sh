#!/usr/bin/env bash
#
# Assistant tout-en-un : rend Vroumi accessible depuis l'extérieur via une
# adresse web fixe et gratuite, en HTTPS.
#
#   1. configure DuckDNS (sous-domaine gratuit + mise à jour auto de l'IP),
#   2. installe Caddy (reverse proxy + certificat HTTPS Let's Encrypt),
#   3. active le cookie de session sécurisé dans .env,
#   4. redémarre Vroumi.
#
# Usage :
#   sudo bash scripts/setup-acces-web.sh
# (le script te pose les 2 questions : sous-domaine et token DuckDNS)
#
# Tu peux aussi passer les valeurs en arguments :
#   sudo bash scripts/setup-acces-web.sh vroumi TON_TOKEN
#
set -euo pipefail

if [ "$(id -u)" -ne 0 ]; then
  echo "❌ Lance ce script avec sudo :  sudo bash scripts/setup-acces-web.sh"
  exit 1
fi

HERE="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(cd "$HERE/.." && pwd)"

echo "════════════════════════════════════════════════════════════"
echo "  Vroumi — Accès web depuis l'extérieur (DuckDNS + HTTPS)"
echo "════════════════════════════════════════════════════════════"
echo ""
echo "Avant de continuer, tu dois avoir :"
echo "  • un compte gratuit sur https://www.duckdns.org (connexion Google/GitHub),"
echo "  • un sous-domaine créé (ex. 'vroumi') et ton TOKEN (en haut de la page)."
echo ""

SUBDOMAIN="${1:-}"
TOKEN="${2:-}"

if [ -z "$SUBDOMAIN" ]; then
  read -rp "👉 Sous-domaine DuckDNS (ex. vroumi) : " SUBDOMAIN
fi
SUBDOMAIN="${SUBDOMAIN%%.duckdns.org}"

if [ -z "$TOKEN" ]; then
  read -rp "👉 Token DuckDNS : " TOKEN
fi

if [ -z "$SUBDOMAIN" ] || [ -z "$TOKEN" ]; then
  echo "❌ Sous-domaine et token sont obligatoires."
  exit 1
fi

DOMAIN="$SUBDOMAIN.duckdns.org"

echo ""
echo "──► Étape 1/4 : DuckDNS ($DOMAIN)"
bash "$HERE/setup-duckdns.sh" "$SUBDOMAIN" "$TOKEN"

echo ""
echo "──► Étape 2/4 : HTTPS automatique (Caddy)"
echo ""
echo "⚠️  IMPORTANT — sur ta box (http://192.168.1.1 → NAT/PAT), tu dois"
echo "    avoir redirigé vers ce Pi les ports TCP 80 ET 443."
echo "    Sans ça, le certificat HTTPS ne pourra pas être obtenu."
echo ""
read -rp "    Les ports 80 et 443 sont-ils redirigés ? [o/N] " OK
case "$OK" in
  o|O|oui|y|Y) ;;
  *)
    echo ""
    echo "⏸️  Pas de souci. Fais la redirection des ports 80 et 443 sur la box,"
    echo "    puis relance :  sudo bash scripts/setup-acces-web.sh $SUBDOMAIN $TOKEN"
    exit 0
    ;;
esac

bash "$HERE/setup-https-caddy.sh" "$DOMAIN"

echo ""
echo "──► Étape 3/4 : cookie de session sécurisé (.env)"
ENV_FILE="$PROJECT_DIR/.env"
if [ -f "$ENV_FILE" ]; then
  if grep -q '^COOKIE_SECURE=' "$ENV_FILE"; then
    sed -i 's/^COOKIE_SECURE=.*/COOKIE_SECURE="true"/' "$ENV_FILE"
  else
    echo 'COOKIE_SECURE="true"' >> "$ENV_FILE"
  fi
  echo "   ✅ COOKIE_SECURE=true ajouté à .env"
else
  echo "   ⚠️  .env introuvable ($ENV_FILE) — ajoute COOKIE_SECURE=\"true\" manuellement."
fi

echo ""
echo "──► Étape 4/4 : redémarrage de Vroumi"
systemctl restart vroumi 2>/dev/null && echo "   ✅ Vroumi redémarré." \
  || echo "   ⚠️  Redémarre manuellement :  sudo systemctl restart vroumi"

echo ""
echo "════════════════════════════════════════════════════════════"
echo "  ✅ Terminé !  Ouvre :  https://$DOMAIN"
echo "════════════════════════════════════════════════════════════"
echo ""
echo "Le 1er accès peut prendre 1–2 min (obtention du certificat HTTPS)."
echo "Suivi en direct :  sudo journalctl -u caddy -f"
