"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { Role } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireAdmin, generateToken } from "@/lib/auth";

const INVITE_DAYS = 7;

const inviteSchema = z.object({
  name: z.string().trim().min(1, "Nom requis."),
  email: z.string().trim().toLowerCase().email("E-mail invalide."),
  garageId: z.string().min(1, "Garage requis."),
  role: z.nativeEnum(Role),
});

export async function createInvite(formData: FormData) {
  await requireAdmin();
  const parsed = inviteSchema.safeParse({
    name: formData.get("name"),
    email: formData.get("email"),
    garageId: formData.get("garageId"),
    role: formData.get("role"),
  });
  if (!parsed.success) return;

  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + INVITE_DAYS);

  await prisma.invite.create({
    data: {
      token: generateToken(),
      name: parsed.data.name,
      email: parsed.data.email,
      garageId: parsed.data.garageId,
      role: parsed.data.role,
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

export async function createGarage(formData: FormData) {
  const admin = await requireAdmin();
  const name = String(formData.get("name") ?? "").trim();
  if (!name) return;
  await prisma.garage.create({
    data: {
      name,
      memberships: { create: { userId: admin.id, role: "OWNER" } },
    },
  });
  revalidatePath("/admin");
}

export async function removeMember(membershipId: string) {
  await requireAdmin();
  await prisma.membership.delete({ where: { id: membershipId } });
  revalidatePath("/admin");
}

/**
 * Supprime définitivement un compte utilisateur (et ses adhésions aux garages,
 * en cascade). Garde-fous : on ne peut pas se supprimer soi-même, ni supprimer
 * le dernier administrateur (pour ne pas verrouiller l'application).
 */
export async function deleteUser(userId: string) {
  const admin = await requireAdmin();
  if (admin.id === userId) return; // on ne se supprime pas soi-même

  const target = await prisma.user.findUnique({
    where: { id: userId },
    select: { isAdmin: true },
  });
  if (!target) return;

  if (target.isAdmin) {
    const adminCount = await prisma.user.count({ where: { isAdmin: true } });
    if (adminCount <= 1) return; // ne pas supprimer le dernier admin
  }

  await prisma.user.delete({ where: { id: userId } });
  revalidatePath("/admin");
}
