"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import {
  assertCanWrite,
  getSessionUserId,
  hashPassword,
  verifyPassword,
} from "@/lib/auth";

export type ProfileState =
  | { error?: string; success?: string }
  | undefined;

const profileSchema = z.object({
  name: z.string().trim().min(1, "Indiquez votre nom."),
  email: z
    .string()
    .trim()
    .toLowerCase()
    .email("E-mail invalide.")
    .or(z.literal("")),
  firstName: z.string().trim().max(80).optional(),
  lastName: z.string().trim().max(80).optional(),
  phone: z.string().trim().max(40).optional(),
});

/** Met à jour les informations de profil du compte réellement connecté. */
export async function updateProfileAction(
  _prev: ProfileState,
  formData: FormData
): Promise<ProfileState> {
  await assertCanWrite();
  const userId = await getSessionUserId();
  if (!userId) return { error: "Session expirée. Reconnectez-vous." };

  const parsed = profileSchema.safeParse({
    name: formData.get("name"),
    email: formData.get("email"),
    firstName: formData.get("firstName"),
    lastName: formData.get("lastName"),
    phone: formData.get("phone"),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Données invalides." };
  }
  const { name, email, firstName, lastName, phone } = parsed.data;

  // E-mail unique : on vérifie qu'aucun autre compte ne l'utilise déjà.
  if (email) {
    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing && existing.id !== userId) {
      return { error: "Cet e-mail est déjà utilisé par un autre compte." };
    }
  }

  await prisma.user.update({
    where: { id: userId },
    data: {
      name,
      email: email || null,
      firstName: firstName || null,
      lastName: lastName || null,
      phone: phone || null,
    },
  });

  revalidatePath("/", "layout");
  return { success: "Informations enregistrées." };
}

const passwordSchema = z
  .object({
    current: z.string().min(1, "Mot de passe actuel requis."),
    next: z
      .string()
      .min(6, "Le nouveau mot de passe doit faire au moins 6 caractères."),
    confirm: z.string().min(1, "Confirmez le nouveau mot de passe."),
  })
  .refine((d) => d.next === d.confirm, {
    message: "La confirmation ne correspond pas au nouveau mot de passe.",
    path: ["confirm"],
  });

/** Change le mot de passe du compte réellement connecté. */
export async function changePasswordAction(
  _prev: ProfileState,
  formData: FormData
): Promise<ProfileState> {
  await assertCanWrite();
  const userId = await getSessionUserId();
  if (!userId) return { error: "Session expirée. Reconnectez-vous." };

  const parsed = passwordSchema.safeParse({
    current: formData.get("current"),
    next: formData.get("next"),
    confirm: formData.get("confirm"),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Données invalides." };
  }
  const { current, next } = parsed.data;

  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) return { error: "Compte introuvable." };

  if (!(await verifyPassword(current, user.passwordHash))) {
    return { error: "Le mot de passe actuel est incorrect." };
  }

  await prisma.user.update({
    where: { id: userId },
    data: { passwordHash: await hashPassword(next) },
  });

  return { success: "Mot de passe modifié." };
}
