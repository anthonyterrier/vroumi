import "server-only";
import { cache } from "react";
import { notFound, redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireUser, getPreviewRole } from "@/lib/auth";

/**
 * Droits granulaires de l'application.
 *
 * Chaque clé est le produit d'une fonctionnalité et d'une action. Pour les
 * ressources CRUD : `<feat>View` / `<feat>Add` / `<feat>Edit` / `<feat>Delete`.
 * Pour les modules au niveau du garage : une clé à action unique
 * (`costsView`, `membersManage`, `catalogManage`).
 *
 * La liste est volontairement déclarée en littéral `as const` pour que
 * `PermKey` soit une union de chaînes exactes (type-safety aux points d'appel).
 */
export const PERM_KEYS = [
  // Véhicules (module au niveau du garage, mais granularité CRUD)
  "vehiclesView",
  "vehiclesAdd",
  "vehiclesEdit",
  "vehiclesDelete",
  // Entretiens
  "maintenanceView",
  "maintenanceAdd",
  "maintenanceEdit",
  "maintenanceDelete",
  // Réparations
  "repairsView",
  "repairsAdd",
  "repairsEdit",
  "repairsDelete",
  // Carburant
  "fuelView",
  "fuelAdd",
  "fuelEdit",
  "fuelDelete",
  // Kilométrage
  "mileageView",
  "mileageAdd",
  "mileageEdit",
  "mileageDelete",
  // Documents administratifs
  "documentsView",
  "documentsAdd",
  "documentsEdit",
  "documentsDelete",
  // Rappels
  "remindersView",
  "remindersAdd",
  "remindersEdit",
  "remindersDelete",
  // Modules sensibles / au niveau de l'organisation (action unique)
  "costsView", // synthèse financière (sensible)
  "membersManage", // gestion des membres du garage
  "catalogManage", // catalogue des prestataires
] as const;

export type PermKey = (typeof PERM_KEYS)[number];
export type GranularPerms = Record<PermKey, boolean>;

const PERM_KEY_SET: ReadonlySet<string> = new Set(PERM_KEYS);

export function isPermKey(value: string): value is PermKey {
  return PERM_KEY_SET.has(value);
}

/** Construit un jeu de droits où seules les clés fournies sont accordées. */
export function base(keys: readonly PermKey[]): GranularPerms {
  const granted = new Set<string>(keys);
  const perms = {} as GranularPerms;
  for (const k of PERM_KEYS) perms[k] = granted.has(k);
  return perms;
}

/** Union de deux jeux de droits (OU logique clé par clé). */
export function mergePerms(a: GranularPerms, b: GranularPerms): GranularPerms {
  const perms = {} as GranularPerms;
  for (const k of PERM_KEYS) perms[k] = a[k] || b[k];
  return perms;
}

/** Ne conserve que les droits de consultation (`*View`). */
export function readOnly(p: GranularPerms): GranularPerms {
  const perms = {} as GranularPerms;
  for (const k of PERM_KEYS) perms[k] = p[k] && k.endsWith("View");
  return perms;
}

/** Vrai si aucun droit n'est accordé. */
export function isEmpty(p: GranularPerms): boolean {
  return PERM_KEYS.every((k) => !p[k]);
}

// --- Rôles ---------------------------------------------------------------

export type RoleKey = "OWNER" | "DRIVER" | "VIEWER";
export const ROLE_KEYS: readonly RoleKey[] = ["OWNER", "DRIVER", "VIEWER"];

/** Normalise une valeur de rôle (y compris héritée/inconnue) vers une RoleKey. */
export function roleKey(role: string | null | undefined): RoleKey {
  return role === "OWNER" || role === "DRIVER" ? role : "VIEWER";
}

// Ressources opérationnelles d'un véhicule (hors module véhicule lui-même).
const OPERATIONAL = [
  "maintenance",
  "repairs",
  "fuel",
  "mileage",
  "documents",
  "reminders",
] as const;

const ALL_CRUD = (feat: string) =>
  ["View", "Add", "Edit", "Delete"].map((a) => `${feat}${a}` as PermKey);

// DRIVER (≈ EMPLOYEE) : vision d'ensemble + saisie sur les ressources
// opérationnelles, gestion du catalogue, mais PAS de finances (costsView) ni de
// gestion des membres, et pas de suppression de véhicule.
const DRIVER_KEYS: PermKey[] = [
  ...OPERATIONAL.flatMap(ALL_CRUD),
  "vehiclesView",
  "vehiclesAdd",
  "vehiclesEdit",
  "catalogManage",
];

// VIEWER (≈ MEMBER) : lecture seule minimale (consultation, hors finances).
const VIEWER_KEYS: PermKey[] = [
  ...OPERATIONAL.map((f) => `${f}View` as PermKey),
  "vehiclesView",
];

/** Droits par défaut par rôle (surchargeables en base via RolePerms). */
export const ROLE_DEFAULTS: Record<RoleKey, GranularPerms> = {
  OWNER: base(PERM_KEYS), // accès complet
  DRIVER: base(DRIVER_KEYS),
  VIEWER: base(VIEWER_KEYS),
};

/**
 * Droits effectifs d'un rôle : lit la surcharge en base (RolePerms) si présente
 * (JSON validé contre PERM_KEYS), sinon applique ROLE_DEFAULTS. Mémoïsé par
 * requête (cache React) pour éviter de relire la table à chaque vérification.
 */
export const getRolePerms = cache(
  async (role: RoleKey): Promise<GranularPerms> => {
    const row = await prisma.rolePerms.findUnique({ where: { role } });
    if (row) {
      try {
        const parsed = JSON.parse(row.perms);
        if (Array.isArray(parsed)) {
          const keys = parsed.filter(
            (k): k is PermKey => typeof k === "string" && isPermKey(k)
          );
          return base(keys);
        }
      } catch {
        // JSON invalide : on retombe sur les valeurs par défaut.
      }
    }
    return ROLE_DEFAULTS[role];
  }
);

/** Droits effectifs des trois rôles (pour l'éditeur /admin/roles). */
export async function getAllRolePerms(): Promise<
  Record<RoleKey, GranularPerms>
> {
  const [OWNER, DRIVER, VIEWER] = await Promise.all([
    getRolePerms("OWNER"),
    getRolePerms("DRIVER"),
    getRolePerms("VIEWER"),
  ]);
  return { OWNER, DRIVER, VIEWER };
}

// --- Métadonnées pour l'éditeur de droits (/admin/roles) -----------------

/** Groupes de droits CRUD (une fonctionnalité = 4 actions). */
export const PERM_CRUD_GROUPS: { feature: string; keys: PermKey[] }[] = [
  {
    feature: "vehicles",
    keys: ["vehiclesView", "vehiclesAdd", "vehiclesEdit", "vehiclesDelete"],
  },
  ...OPERATIONAL.map((f) => ({ feature: f, keys: ALL_CRUD(f) })),
];

/** Droits « module » (action unique). */
export const PERM_MODULE_KEYS: PermKey[] = [
  "costsView",
  "membersManage",
  "catalogManage",
];

// --- Contrôles d'accès au niveau du garage -------------------------------

/** Droit d'un utilisateur sur un garage donné (selon son rôle de membre). */
export async function garageCan(
  userId: string,
  garageId: string,
  perm: PermKey
): Promise<boolean> {
  const membership = await prisma.membership.findUnique({
    where: { userId_garageId: { userId, garageId } },
    select: { role: true },
  });
  if (!membership) return false;
  const perms = await getRolePerms(roleKey(membership.role));
  return perms[perm];
}

/** Liste des garages où l'utilisateur dispose d'un droit donné. */
export async function getGaragesForPerm(
  userId: string,
  perm: PermKey
): Promise<string[]> {
  const memberships = await prisma.membership.findMany({
    where: { userId },
    select: { garageId: true, role: true },
  });
  const out: string[] = [];
  for (const m of memberships) {
    const perms = await getRolePerms(roleKey(m.role));
    if (perms[perm]) out.push(m.garageId);
  }
  return out;
}

// --- Contrôles d'accès au niveau du véhicule -----------------------------

/**
 * Droits effectifs d'un utilisateur sur un véhicule : union des droits de tous
 * ses rôles dans le garage propriétaire ET dans les garages avec lesquels le
 * véhicule est partagé.
 */
export async function getVehiclePerms(
  userId: string,
  vehicleId: string
): Promise<GranularPerms> {
  const vehicle = await prisma.vehicle.findUnique({
    where: { id: vehicleId },
    select: { garageId: true, shares: { select: { garageId: true } } },
  });
  if (!vehicle) return base([]);

  const garageIds = [vehicle.garageId, ...vehicle.shares.map((s) => s.garageId)];
  const memberships = await prisma.membership.findMany({
    where: { userId, garageId: { in: garageIds } },
    select: { role: true },
  });

  let perms = base([]);
  for (const m of memberships) {
    perms = mergePerms(perms, await getRolePerms(roleKey(m.role)));
  }
  return perms;
}

/**
 * Droits effectifs en tenant compte d'un éventuel aperçu de rôle (admin qui
 * prévisualise l'app « en tant que » OWNER/DRIVER/VIEWER). À utiliser pour
 * masquer/afficher des surfaces de lecture. Les écritures, elles, sont bloquées
 * indépendamment (voir assertCanWrite).
 */
export async function getEffectiveVehiclePerms(
  userId: string,
  vehicleId: string
): Promise<GranularPerms> {
  const preview = await getPreviewRole();
  if (preview) return readOnly(await getRolePerms(preview));
  return getVehiclePerms(userId, vehicleId);
}

/**
 * Garde de chargement de page : exige un droit précis sur un véhicule.
 * `notFound()` si le droit n'est pas accordé. Renvoie l'utilisateur courant.
 */
export async function requireVehiclePerm(vehicleId: string, perm: PermKey) {
  const user = await requireUser();
  const perms = await getEffectiveVehiclePerms(user.id, vehicleId);
  if (!perms[perm]) notFound();
  return user;
}

/** Variante non bloquante : redirige vers la fiche véhicule si droit manquant. */
export async function assertVehiclePerm(
  userId: string,
  vehicleId: string,
  perm: PermKey
) {
  const perms = await getVehiclePerms(userId, vehicleId);
  if (!perms[perm]) redirect(`/vehicles/${vehicleId}`);
}
