# Déploiement automatique (Raspberry Pi / systemd)

Met à jour Vroumi tout seul : un **timer systemd** lance `scripts/deploy.sh`
toutes les 2 minutes. Si la branche `main` a changé sur GitHub, le script
récupère le code, applique le schéma Prisma, reconstruit l'app et redémarre le
service `vroumi`. Sinon il ne fait rien.

> Chemins supposés : dépôt dans `/home/pi/vroumi`, service systemd `vroumi`,
> utilisateur `pi`. Adaptez si besoin (et les chemins dans les fichiers
> `deploy/*`).

## Installation (une seule fois, sur le Pi)

```bash
# 0) Mise à jour manuelle initiale pour récupérer ces fichiers
cd /home/pi/vroumi
git pull origin main
npm install --include=dev
npx prisma db push --accept-data-loss
npm run build
sudo systemctl restart vroumi

# 1) Rendre le script exécutable
chmod +x /home/pi/vroumi/scripts/deploy.sh

# 2) Autoriser `pi` à redémarrer le service sans mot de passe
echo 'pi ALL=(root) NOPASSWD: /usr/bin/systemctl restart vroumi, /bin/systemctl restart vroumi' \
  | sudo tee /etc/sudoers.d/vroumi
sudo chmod 440 /etc/sudoers.d/vroumi

# 3) Installer le service + le timer
sudo cp /home/pi/vroumi/deploy/vroumi-deploy.service /etc/systemd/system/
sudo cp /home/pi/vroumi/deploy/vroumi-deploy.timer   /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now vroumi-deploy.timer
```

C'est tout : à partir de là, chaque fusion sur `main` est déployée
automatiquement dans les ~2 minutes.

## Suivi / dépannage

```bash
# Voir les déploiements en direct
journalctl -u vroumi-deploy -f

# Forcer un déploiement immédiat
sudo systemctl start vroumi-deploy.service

# État du timer (prochaine exécution)
systemctl list-timers vroumi-deploy.timer

# Désactiver l'auto-déploiement
sudo systemctl disable --now vroumi-deploy.timer
```

## Notes

- Le build se fait pendant que l'ancienne version tourne ; le redémarrage n'a
  lieu **qu'en cas de build réussi**.
- Chaque déploiement supprime `.next` avant de reconstruire (build propre) pour
  éviter les incohérences de build incrémental — symptôme typique : la page
  s'affiche **sans aucun style** (le HTML pointe vers un CSS `/_next/...` d'un
  ancien build qui renvoie 400/404). Si ça se reproduit, forcer manuellement :
  `cd /home/pi/vroumi && rm -rf .next && npm run build && sudo systemctl restart vroumi`.
- `git reset --hard origin/main` ne touche pas aux fichiers ignorés
  (`.env`, `prod.db`…).
- `prisma db push --accept-data-loss` applique les changements de schéma sans
  interaction. C'est nécessaire pour l'automatisation ; en contrepartie une
  évolution de schéma destructive serait appliquée sans confirmation (les
  données de Vroumi étant personnelles et sauvegardées par ailleurs, le risque
  est limité — mais gardez-le en tête).
