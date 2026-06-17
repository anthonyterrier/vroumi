# CLAUDE.md — Contexte projet Vroumi

Guide pour toute instance de Claude Code travaillant sur ce dépôt. Lis-le avant
de coder.

## En deux mots

**Vroumi** est une application web de **suivi d'entretien automobile**
(entretiens, réparations, carburant, kilométrage, documents administratifs,
coûts, rappels). Mobile-first, multi-utilisateurs par **garage**,
auto-hébergeable.

> 🔧 Outil d'aide au suivi. Les intervalles d'entretien (`src/lib/maintenance-intervals.ts`)
> sont **indicatifs** : toujours afficher le disclaimer et renvoyer au carnet
> constructeur.

## Stack

- **Next.js 15** (App Router, React 19, Server Components, **Server Actions**)
- **TypeScript** strict, alias `@/*` → `src/*`
- **Prisma ORM** + **SQLite** (`dev.db` en local, `prod.db` en prod)
- **Tailwind CSS** (classes maison : `.btn-primary`, `.btn-secondary`, `.card`, `.input`, `.label`, `.badge`)
- **Recharts** (kilométrage, consommation, coûts)
- **Auth maison** : JWT (`jose`, HS256) + `bcryptjs`, cookie httpOnly `vroumi_session`
- **Zod** (validation), **date-fns** (locale `fr`), **pdf-lib** (rapport PDF)

## Commandes

```bash
npm install
cp .env.example .env      # AUTH_SECRET (openssl rand -base64 32)
npm run db:push           # applique le schéma Prisma
npm run db:seed           # démo : demo@vroumi.app / demo1234
npm run dev               # http://localhost:3000
npm run build             # prisma generate && next build (vérifie les types)
```

Toujours faire `npm run build` avant de pousser.

## Structure

```
src/
├─ app/
│  ├─ (auth)/                 # login / register (1er = admin) / invite/[token]
│  │  └─ actions.ts           # registerAction, loginAction, acceptInviteAction…
│  ├─ (app)/                  # zone authentifiée (layout vérifie la session)
│  │  ├─ dashboard/           # liste des véhicules
│  │  ├─ admin/               # comptes + invitations + garages (admin only)
│  │  └─ vehicles/[id]/       # fiche véhicule : aperçu + onglets
│  │     ├─ maintenance/ repairs/ fuel/ mileage/ documents/ reminders/ costs/ edit/
│  │     └─ actions.ts        # TOUTES les server actions CRUD des saisies
│  └─ api/vehicles/[id]/      # export CSV, .ics (documents & rappels), rapport PDF
├─ components/                # Modal, *Select, formulaires, graphiques…
└─ lib/                       # prisma, auth, vehicles (accès), labels, format, ics, catalogues
prisma/schema.prisma          # modèle de données
```

## Modèle de données (Prisma)

`User` (isAdmin) — `Garage` — `Membership` (rôle OWNER/DRIVER/VIEWER) — `Invite`
— `Vehicle` — séries `Maintenance`, `Repair`, `FuelEntry`, `MileageEntry`,
`Document`, `Reminder`. Catalogue par garage : `ServiceContact`.

- Index `(vehicleId, date)` sur les séries, `onDelete: Cascade`.
- Catalogue : `@@unique([garageId, name])`.

## Conventions importantes

- **Accès & sécurité** : tout passe par le garage. Lecture `requireVehicle(id)` /
  `getAccessibleVehicles`. Mutation : `guard(vehicleId)` (= `assertVehicleAccess`)
  puis filtre **toujours** par `{ id, vehicleId }` (ou `garageId`) dans
  `deleteMany`/`updateMany`. Ne jamais muter par `id` seul.
- **Server actions** : dans `vehicles/[id]/actions.ts`. Pattern `add* / update* /
  delete* / toggle*`, liées avec `.bind(null, vehicleId[, id])`, suivies de
  `refresh(vehicleId)` (revalidatePath en mode "layout").
- **Édition d'une entrée** : bouton ✏️ ouvrant un `<Modal>` pré-rempli (defaultValue).
  Les champs partagés ajout/édition sont factorisés en sous-composant `*Fields`.
- **Date** : `TodayDateInput` (date du jour par défaut, prop `iso` pour
  pré-remplir, `optional` pour rendre facultatif). `NowDateTimeInput` existe aussi.
- **Catalogue sélectionnable** : `ServiceSelect` (client) = menu déroulant + option
  « Autre » (mémorisée via upsert). Les noms saisis sont auto-ajoutés au catalogue.
- **Enums Prisma** : importer depuis `@prisma/client` ; helper `enumVal` pour
  valider une valeur de formulaire avant insertion.
- **Échéances** : `dueStatus(date, mileage, currentMileage)` → `ok/soon/overdue`,
  styles dans `DUE_STATUS_STYLE`. `currentMileage()` agrège le km max connu.
- **Comptes** : 1er compte = **admin** (inscription libre ensuite fermée).
  L'admin invite via `/admin` → `/invite/[token]`.
- **Cookie** : `COOKIE_SECURE` dans `.env` — `"true"` en HTTPS, sinon `"false"`.
- **Langue** : toute l'UI est en **français**.

## Pièges connus

- Server Components : pas de handler `onClick`/`onChange` → composant client dédié.
- Modal : se ferme après submit via un `setTimeout` (ne pas casser ce comportement).
- Recharts : composants graphiques en `"use client"`.
- Consommation carburant : calculée entre deux **pleins complets** consécutifs
  avec kilométrage renseigné.
