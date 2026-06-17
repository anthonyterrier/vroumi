# Carnet Auto — Suivi d'entretien automobile

Application web **mobile-first** pour suivre l'entretien de vos véhicules :
entretiens, réparations, pleins de carburant (avec calcul de consommation),
kilométrage, documents administratifs (assurance, contrôle technique, carte
grise…), rappels et coûts. Multi-utilisateurs par **garage**, auto-hébergeable.

> 🔧 Outil d'aide au suivi. Les intervalles d'entretien proposés sont
> **indicatifs** — référez-vous toujours au carnet d'entretien du constructeur.

## Stack

- **Next.js 15** (App Router, React 19, Server Actions)
- **TypeScript** strict, alias `@/*` → `src/*`
- **Prisma ORM** + **SQLite** (PostgreSQL possible en prod)
- **Tailwind CSS** (classes maison `.btn-primary`, `.card`, `.input`, `.badge`…)
- **Recharts** (kilométrage, consommation, coûts)
- **Auth maison** : JWT (`jose`, HS256) + `bcryptjs`, cookie httpOnly `carnet_session`
- **Zod** (validation), **date-fns** (locale `fr`), **pdf-lib** (rapport PDF)

## Démarrage

```bash
npm install
cp .env.example .env      # définir AUTH_SECRET (openssl rand -base64 32)
npm run db:push           # applique le schéma Prisma
npm run db:seed           # données de démo (demo@carnet-auto.app / demo1234)
npm run dev               # http://localhost:3000
```

`npm run build` lance `prisma generate && next build` (vérifie aussi les types).

## Fonctionnalités

- **Véhicules** : profil (marque, modèle, immatriculation, carburant…).
- **Entretiens** : type (vidange, freins, distribution…), date, km, coût, garage,
  prochaine échéance (date / km).
- **Réparations** : pannes, coût, sous garantie.
- **Carburant** : pleins, prix, calcul automatique de la **consommation** (L/100 km).
- **Kilométrage** : relevés + graphique d'évolution.
- **Documents** : assurance, contrôle technique, carte grise, Crit'Air… avec
  **échéances** et export `.ics` (rappel calendrier 7 jours avant).
- **Rappels** : par date et/ou kilométrage, à cocher.
- **Coûts** : synthèse, répartition par catégorie, coût par km, export **CSV** et
  **rapport PDF**.
- **Comptes** : premier compte = admin ; les autres rejoignent via **invitation**
  (`/admin` → lien `/invite/[token]`). Rôles : propriétaire / conducteur / lecture.

## Modèle de données (Prisma)

`User` (isAdmin) — `Garage` — `Membership` (OWNER/DRIVER/VIEWER) — `Invite` —
`Vehicle` — séries `Maintenance`, `Repair`, `FuelEntry`, `MileageEntry`,
`Document`, `Reminder`. Catalogue par garage : `ServiceContact`.

## Sécurité & accès

Tout passe par le garage : lecture via `requireVehicle` / `getAccessibleVehicles`,
mutations via `assertVehicleAccess` puis filtre systématique `{ id, vehicleId }`
(ou `garageId`) dans `deleteMany` / `updateMany`.

## Licence

Projet personnel — usage libre.
