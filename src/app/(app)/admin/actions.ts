"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { Role } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import {
  requireAdmin,
  generateToken,
  hashPassword,
  setImpersonation,
  setPreviewRole,
  clearLens,
  type PreviewRole,
} from "@/lib/auth";
import { isPermKey, roleKey, type RoleKey } from "@/lib/perms";

const INVITE_DAYS = 7;

// Normalise un e-mail facultatif : "", null ou absent → null.
// `.nullish()` accepte null ET undefined : indispensable car un champ absent
// d'un formulaire arrive à `null` via formData.get() (pas `undefined`).
const optionalEmail = z
  .string()
  .trim()
  .toLowerCase()
  .email("E-mail invalide.")
  .nullish()
  .or(z.literal(""))
  .transform((v) => (v ? v : null));

const optionalText = z
  .string()
  .trim()
  .nullish()
  .transform((v) => (v ? v : null));

// --- Comptes -------------------------------------------------------------

const createAccountSchema = z.object({
  name: z.string().trim().min(1, "Nom requis."),
  email: optionalEmail,
  firstName: optionalText,
  lastName: optionalText,
  phone: optionalText,
  garageId: optionalText,
  role: z.nativeEnum(Role).optional(),
});

/**
 * Crée un compte « sans accès » (activated=false, mot de passe inutilisable).
 * Le compte est activé plus tard quand la personne accepte une invitation. Si
 * un garage est fourni, l'adhésion est créée avec le rôle indiqué.
 */
export async function createAccount(formData: FormData) {
  await requireAdmin();
  const parsed = createAccountSchema.safeParse({
    name: formData.get("name"),
    email: formData.get("email"),
    firstName: formData.get("firstName"),
    lastName: formData.get("lastName"),
    phone: formData.get("phone"),
    garageId: formData.get("garageId"),
    role: formData.get("role") || undefined,
  });
  if (!parsed.success) return;
  const { name, email, firstName, lastName, phone, garageId, role } =
    parsed.data;

  if (email) {
    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) return; // e-mail déjà utilisé
  }

  // Mot de passe aléatoire inutilisable tant que le compte n'est pas activé.
  const passwordHash = await hashPassword(generateToken());

  await prisma.user.create({
    data: {
      name,
      email,
      firstName,
      lastName,
      phone,
      activated: false,
      passwordHash,
      ...(garageId
        ? {
            memberships: {
              create: { garageId, role: role ?? Role.DRIVER },
            },
          }
        : {}),
    },
  });
  revalidatePath("/admin");
}

const inviteSchema = z.object({
  name: z.string().trim().min(1, "Nom requis."),
  email: optionalEmail,
  garageId: z.string().min(1, "Garage requis."),
  role: z.nativeEnum(Role),
  userId: optionalText,
});

/**
 * Crée une invitation (lien `/invite/[token]`). Si `userId` est fourni, le lien
 * activera ce compte existant ; sinon il créera un nouveau compte.
 */
export async function inviteUser(formData: FormData) {
  const admin = await requireAdmin();
  const parsed = inviteSchema.safeParse({
    name: formData.get("name"),
    email: formData.get("email"),
    garageId: formData.get("garageId"),
    role: formData.get("role"),
    userId: formData.get("userId"),
  });
  if (!parsed.success) {
    console.error(
      "Création d'invitation invalide:",
      parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join(", ")
    );
    return;
  }

  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + INVITE_DAYS);

  await prisma.invite.create({
    data: {
      token: generateToken(),
      name: parsed.data.name,
      email: parsed.data.email,
      garageId: parsed.data.garageId,
      role: parsed.data.role,
      userId: parsed.data.userId,
      createdById: admin.id,
      expiresAt,
    },
  });
  revalidatePath("/admin");
}

export async function deleteInvite(inviteId: string) {
  await requireAdmin();
  await prisma.invite.delete({ where: { id: inviteId } });
  revalidatePath("/admin");
}

export async function toggleAdmin(userId: string, makeAdmin: boolean) {
  const admin = await requireAdmin();
  // On ne se retire pas soi-même le rôle (évite de se verrouiller dehors).
  if (admin.id === userId && !makeAdmin) return;
  await prisma.user.update({
    where: { id: userId },
    data: { isAdmin: makeAdmin },
  });
  revalidatePath("/admin");
}

/**
 * Supprime définitivement un compte (et ses adhésions, en cascade).
 * Garde-fous : pas soi-même, pas le dernier administrateur.
 */
export async function deleteUser(userId: string) {
  const admin = await requireAdmin();
  if (admin.id === userId) return;

  const target = await prisma.user.findUnique({
    where: { id: userId },
    select: { isAdmin: true },
  });
  if (!target) return;

  if (target.isAdmin) {
    const adminCount = await prisma.user.count({ where: { isAdmin: true } });
    if (adminCount <= 1) return;
  }

  await prisma.user.delete({ where: { id: userId } });
  revalidatePath("/admin");
}

// --- Garages -------------------------------------------------------------

export async function createGarage(formData: FormData) {
  const admin = await requireAdmin();
  const name = String(formData.get("name") ?? "").trim();
  if (!name) return;
  await prisma.garage.create({
    data: {
      name,
      address: String(formData.get("address") ?? "").trim() || null,
      phone: String(formData.get("phone") ?? "").trim() || null,
      memberships: { create: { userId: admin.id, role: Role.OWNER } },
    },
  });
  revalidatePath("/admin");
}

export async function updateGarage(garageId: string, formData: FormData) {
  await requireAdmin();
  const name = String(formData.get("name") ?? "").trim();
  if (!name) return;
  await prisma.garage.update({
    where: { id: garageId },
    data: {
      name,
      address: String(formData.get("address") ?? "").trim() || null,
      phone: String(formData.get("phone") ?? "").trim() || null,
    },
  });
  revalidatePath("/admin");
}

/** Supprime un garage (et ses véhicules/adhésions, en cascade). */
export async function deleteGarage(garageId: string) {
  await requireAdmin();
  await prisma.garage.delete({ where: { id: garageId } });
  revalidatePath("/admin");
}

// --- Membres d'un garage -------------------------------------------------

const addMemberSchema = z.object({
  garageId: z.string().min(1),
  userId: z.string().min(1),
  role: z.nativeEnum(Role),
});

export async function addMember(formData: FormData) {
  await requireAdmin();
  const parsed = addMemberSchema.safeParse({
    garageId: formData.get("garageId"),
    userId: formData.get("userId"),
    role: formData.get("role"),
  });
  if (!parsed.success) return;
  const { garageId, userId, role } = parsed.data;
  await prisma.membership.upsert({
    where: { userId_garageId: { userId, garageId } },
    create: { userId, garageId, role },
    update: { role },
  });
  revalidatePath("/admin");
}

export async function removeMember(membershipId: string) {
  await requireAdmin();
  await prisma.membership.delete({ where: { id: membershipId } });
  revalidatePath("/admin");
}

export async function updateMemberRole(
  membershipId: string,
  formData: FormData
) {
  await requireAdmin();
  const role = String(formData.get("role") ?? "");
  const r = (Object.values(Role) as string[]).includes(role)
    ? (role as Role)
    : Role.VIEWER;
  await prisma.membership.update({
    where: { id: membershipId },
    data: { role: r },
  });
  revalidatePath("/admin");
}

// --- Droits par rôle -----------------------------------------------------

/** Enregistre les droits cochés d'un rôle dans la table RolePerms (JSON). */
export async function saveRolePerms(role: string, formData: FormData) {
  await requireAdmin();
  const rk: RoleKey = roleKey(role);
  const selected = formData
    .getAll("perm")
    .map(String)
    .filter((k) => isPermKey(k));
  await prisma.rolePerms.upsert({
    where: { role: rk },
    create: { role: rk, perms: JSON.stringify(selected) },
    update: { perms: JSON.stringify(selected) },
  });
  revalidatePath("/admin/roles");
}

/** Réinitialise les droits d'un rôle (supprime la surcharge → valeurs par défaut). */
export async function resetRolePerms(role: string) {
  await requireAdmin();
  const rk: RoleKey = roleKey(role);
  await prisma.rolePerms.deleteMany({ where: { role: rk } });
  revalidatePath("/admin/roles");
}

// --- Lentilles admin : « voir en tant que » / aperçu de rôle -------------

export async function startImpersonation(userId: string) {
  await requireAdmin();
  await setImpersonation(userId);
  redirect("/dashboard");
}

export async function startPreview(role: string) {
  await requireAdmin();
  const r: PreviewRole =
    role === "OWNER" || role === "DRIVER" ? role : "VIEWER";
  await setPreviewRole(r);
  redirect("/dashboard");
}

export async function stopLens() {
  await requireAdmin(); // l'admin réel garde l'accès même sous lentille
  await clearLens();
  redirect("/admin");
}
