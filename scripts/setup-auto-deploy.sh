#!/usr/bin/env bash
#
# Active le DÉPLOIEMENT AUTOMATIQUE de Carnet Auto.
#
# Un timer systemd vérifie GitHub régulièrement (toutes les 2 min par défaut) et,
# dès que tu pousses sur la branche « main », le Pi se met à jour tout seul :
# git pull → base de données → build → redémarrage.
#
# C'est le Pi qui va chercher GitHub : AUCUN port à ouvrir, AUCUNE clé à confier.
#
# Usage :
#   sudo bash scripts/setup-auto-deploy.sh
#   (intervalle personnalisable :  sudo INTERVAL=5min bash scripts/setup-auto-deploy.sh)
#
set -euo pipefail

if [ "$(id -u)" -ne 0 ]; then
  echo "❌ Lance ce script avec sudo :  sudo bash scripts/setup-auto-deploy.sh"
  exit 1
fi

HERE="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(cd "$HERE/.." && pwd)"
RUN_USER="$(stat -c '%U' "$PROJECT_DIR")"
RUN_HOME="$(getent passwd "$RUN_USER" | cut -d: -f6)"
INTERVAL="${INTERVAL:-2min}"
SYSTEMCTL="$(command -v systemctl)"

echo "📁 Projet       : $PROJECT_DIR"
echo "👤 Utilisateur  : $RUN_USER (HOME=$RUN_HOME)"
echo "⏱️  Intervalle   : $INTERVAL"

chmod +x "$HERE/auto-deploy.sh"

# 1) Sudoers : autorise CE script à redémarrer le service sans mot de passe.
cat > /etc/sudoers.d/carnet-deploy <<EOF
$RUN_USER ALL=(root) NOPASSWD: $SYSTEMCTL restart carnet
EOF
chmod 440 /etc/sudoers.d/carnet-deploy

# 2) Service oneshot qui lance le déploiement.
cat > /etc/systemd/system/carnet-deploy.service <<EOF
[Unit]
Description=Carnet Auto - déploiement automatique depuis GitHub
After=network-online.target
Wants=network-online.target

[Service]
Type=oneshot
User=$RUN_USER
Environment=HOME=$RUN_HOME
WorkingDirectory=$PROJECT_DIR
ExecStart=$HERE/auto-deploy.sh
EOF

# 3) Timer qui déclenche le service à intervalle régulier.
cat > /etc/systemd/system/carnet-deploy.timer <<EOF
[Unit]
Description=Vérifie les mises à jour de Carnet Auto sur GitHub

[Timer]
OnBootSec=1min
OnUnitActiveSec=$INTERVAL
Unit=carnet-deploy.service

[Install]
WantedBy=timers.target
EOF

systemctl daemon-reload
systemctl enable --now carnet-deploy.timer

echo ""
echo "✅ Auto-déploiement activé (vérification toutes les $INTERVAL)."
echo "   À chaque 'git push' sur main, le Pi se met à jour automatiquement."
echo ""
echo "🔎 Voir les déploiements :  journalctl -u carnet-deploy -f"
echo "▶️  Forcer maintenant    :  sudo systemctl start carnet-deploy"
echo "⏸️  Désactiver           :  sudo systemctl disable --now carnet-deploy.timer"
