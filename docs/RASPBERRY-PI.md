# Héberger Carnet Auto sur un Raspberry Pi

Guide pour faire tourner Carnet Auto en permanence sur un Raspberry Pi (testé
sur Pi 4 / Pi 5, Raspberry Pi OS 64 bits). Vaut aussi pour tout serveur Linux.

## 1. Prérequis : Node.js 20+

```bash
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs git
node -v   # doit afficher v20.x ou plus
```

## 2. Récupérer le projet

```bash
cd ~
git clone https://github.com/anthonyterrier/carnet-entretien-auto.git
cd carnet-entretien-auto
```

> Le service et les scripts supposent le chemin `/home/pi/carnet-entretien-auto`.
> Si vous clonez ailleurs, adaptez `deploy/carnet.service`.

## 3. Installer, configurer, builder (script tout-en-un)

```bash
bash scripts/setup-pi.sh            # install + .env auto + db:push + build
# bash scripts/setup-pi.sh --seed   # ajoute le compte de démo
```

Le script crée un `.env` avec une `AUTH_SECRET` aléatoire et une base SQLite
`prisma/prod.db`. Pour tester tout de suite :

```bash
npm run start        # http://<ip-du-pi>:3000
```

## 4. Lancer en permanence (service systemd)

```bash
sudo cp deploy/carnet.service /etc/systemd/system/carnet.service
# Vérifiez User=, WorkingDirectory= et le chemin de npm (which npm) dans le fichier
sudo systemctl daemon-reload
sudo systemctl enable --now carnet
sudo systemctl status carnet      # doit être "active (running)"
journalctl -u carnet -f           # journaux en direct
```

L'app redémarre automatiquement au boot et en cas de plantage.

## 5. Déploiement automatique depuis GitHub (optionnel mais pratique)

Un timer systemd vérifie GitHub toutes les 2 min ; à chaque `git push` sur
`main`, le Pi se met à jour seul (pull → db:push → build → restart). Aucun port
à ouvrir.

```bash
sudo bash scripts/setup-auto-deploy.sh
# intervalle personnalisé : sudo INTERVAL=5min bash scripts/setup-auto-deploy.sh
journalctl -u carnet-deploy -f    # suivre les déploiements
```

**Pousser sur `main` = déployer.** ~2 min de délai.

## 6. Mettre à jour manuellement

```bash
cd ~/carnet-entretien-auto
git pull
bash scripts/setup-pi.sh
sudo systemctl restart carnet
```

## 7. Sauvegarde des données

Toutes les données sont dans un seul fichier SQLite :

```bash
cp ~/carnet-entretien-auto/prisma/prod.db ~/sauvegardes/carnet-$(date +%F).db
```

## 8. Pi à faible mémoire (1 Go)

Si le `build` échoue (mémoire insuffisante), activez du swap :

```bash
sudo dphys-swapfile swapoff
sudo sed -i 's/^CONF_SWAPSIZE=.*/CONF_SWAPSIZE=1024/' /etc/dphys-swapfile
sudo dphys-swapfile setup && sudo dphys-swapfile swapon
```

## Accès depuis l'extérieur

Pour un accès hors du domicile (HTTPS, nom de domaine), la solution la plus
simple est un reverse-proxy **Caddy** + un domaine dynamique (DuckDNS), ou un
VPN **WireGuard**. Pensez alors à passer `COOKIE_SECURE="true"` dans `.env`
(obligatoire en HTTPS, sinon déconnexion à chaque navigation).
