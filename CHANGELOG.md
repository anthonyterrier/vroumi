# Journal des modifications — Vroumi

## En continu (déploiement automatique)

Chaque push sur `main` est déployé automatiquement sur le Raspberry Pi
(timer systemd `vroumi-deploy`, vérification toutes les 2 min).

### Fonctionnalités initiales
- Véhicules, entretiens, réparations, carburant (consommation), kilométrage,
  documents (assurance / contrôle technique) avec échéances et export `.ics`,
  rappels, synthèse des coûts (CSV + rapport PDF).
- Authentification maison, comptes multi-utilisateurs par garage, invitations.
- Administration : invitations, promotion/rétrogradation admin,
  **suppression de compte** (garde-fous : pas soi-même, pas le dernier admin).
- Déploiement : service systemd `vroumi` (port 3001 pour cohabiter avec
  Oudiral), auto-déploiement, accès extérieur DuckDNS + HTTPS (Caddy).
