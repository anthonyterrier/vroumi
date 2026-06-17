# Accès depuis l'extérieur — DuckDNS + HTTPS (Caddy)

Rendre Vroumi accessible depuis internet, gratuitement et en **HTTPS**,
sans nom de domaine payant. Principe :

```
Internet ──► Box (ports 80+443) ──► Caddy (HTTPS) ──► Vroumi :3000
```

DuckDNS fournit un sous-domaine gratuit (`tonnom.duckdns.org`) qui suit ton IP
publique même quand elle change ; Caddy obtient et renouvelle automatiquement un
certificat Let's Encrypt.

## Prérequis

1. Vroumi installé et lancé sur le Pi (port 3000) — voir [`RASPBERRY-PI.md`](RASPBERRY-PI.md).
2. Un compte gratuit sur https://www.duckdns.org (connexion Google/GitHub).
3. Un sous-domaine créé (ex. `vroumi`) et le **TOKEN** affiché en haut de la page.
4. Sur ta box (Livebox/Freebox… → `http://192.168.1.1`, section NAT/PAT) :
   **rediriger les ports TCP 80 ET 443 vers l'IP locale du Pi**. C'est
   indispensable pour que le certificat HTTPS puisse être délivré.

## Méthode rapide (assistant tout-en-un)

```bash
sudo bash scripts/setup-acces-web.sh
```

Le script demande le sous-domaine et le token, configure DuckDNS, installe
Caddy (HTTPS), passe `COOKIE_SECURE="true"` dans `.env` et redémarre l'app.
Tu peux aussi passer les valeurs directement :

```bash
sudo bash scripts/setup-acces-web.sh vroumi TON_TOKEN
```

## Méthode pas à pas

```bash
# 1) DuckDNS : pointe ton sous-domaine vers ton IP (maj auto toutes les 5 min)
sudo bash scripts/setup-duckdns.sh vroumi TON_TOKEN

# 2) HTTPS : installe Caddy en reverse proxy + certificat automatique
sudo bash scripts/setup-https-caddy.sh vroumi.duckdns.org

# 3) Cookie sécurisé (obligatoire en HTTPS) puis redémarrage
sed -i 's/^COOKIE_SECURE=.*/COOKIE_SECURE="true"/' .env
sudo systemctl restart vroumi
```

Ouvre ensuite **https://vroumi.duckdns.org** (le 1er accès peut prendre 1–2 min,
le temps d'obtenir le certificat).

## ⚠️ Cookie de session

En HTTPS, `COOKIE_SECURE` **doit** valoir `"true"` dans `.env`. Sinon le cookie
de session n'est jamais transmis et tu es déconnecté à chaque navigation.
À l'inverse, en HTTP simple (réseau local / VPN), garde `"false"`.

## Dépannage

- **Certificat non délivré** : vérifie que les ports **80 et 443** sont bien
  redirigés vers le Pi, et que `vroumi.duckdns.org` pointe vers ton IP publique
  (`dig +short vroumi.duckdns.org`). Journaux : `sudo journalctl -u caddy -f`.
- **DuckDNS ne répond pas `OK`** : re-vérifie le sous-domaine et le token,
  journal dans `/opt/duckdns/duck.log`.
- **Déconnexion en boucle** : `COOKIE_SECURE` n'est pas à `"true"` (voir ci-dessus).
- **« 502 Bad Gateway »** : Vroumi n'écoute pas sur le port 3000
  (`sudo systemctl status vroumi`).

## Alternative : VPN (sans ouvrir de port)

Si tu préfères ne rien exposer sur internet, un VPN **WireGuard** sur le Pi
permet d'accéder à l'app à distance comme si tu étais sur le réseau local
(en HTTP, `COOKIE_SECURE="false"`). C'est plus privé, mais nécessite d'installer
le client VPN sur chaque téléphone/ordinateur.
