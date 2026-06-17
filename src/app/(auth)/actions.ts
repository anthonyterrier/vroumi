"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import {
  createSession,
  destroySession,
  hashPassword,
  verifyPassword,
} from "@/lib/auth";

const registerSchema = z.object({
  name: z.string().trim().min(1, "Indiquez votre nom."),
  email: z.string().trim().toLowerCase().email("E-mail invalide."),
  password: z.string().min(6, "Le mot de passe doit faire au moins 6 caractères."),
  garageName: z.string().trim().optional(),
});

export type AuthState = { error?: string } | undefined;

export async function registerAction(
  _prev: AuthState,
  formData: FormData
): Promise<AuthState> {
  // L'inscription libre n'est autorisée que pour créer le tout premier compte
  // (l'administrateur). Ensuite, seuls les liens d'invitation créent des comptes.
  const userCount = await prisma.user.count();
  if (userCount > 0) {
    return {
      error:
        "Les inscriptions sont fermées. Demandez un lien d'invitation à l'administrateur.",
    };
  }

  const parsed = registerSchema.safeParse({
    name: formData.get("name"),
    email: formData.get("email"),
    password: formData.get("password"),
    garageName: formData.get("garageName"),
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Données invalides." };
  }
  const { name, email, password, garageName } = parsed.data;

  const user = await prisma.user.create({
    data: {
      name,
      email,
      passwordHash: await hashPassword(password),
      isAdmin: true, // le premier compte est l'administrateur
      memberships: {
        create: {
          role: "OWNER",
          garage: {
            create: { name: garageName?.trim() || `Garage de ${name}` },
          },
        },
      },
    },
  });

  await createSession(user.id);
  redirect("/dashboard");
}

const acceptInviteSchema = z.object({
  token: z.string().min(1),
  password: z
    .string()
    .min(6, "Le mot de passe doit faire au moins 6 caractères."),
});

/** Création de compte par l'invité : il choisit lui-même son mot de passe. */
export async function acceptInviteAction(
  _prev: AuthState,
  formData: FormData
): Promise<AuthState> {
  const parsed = acceptInviteSchema.safeParse({
    token: formData.get("token"),
    password: formData.get("password"),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Données invalides." };
  }
  const { token, password } = parsed.data;

  const invite = await prisma.invite.findUnique({ where: { token } });
  if (!invite || invite.acceptedAt || invite.expiresAt < new Date()) {
    return { error: "Cette invitation est invalide ou expirée." };
  }

  const existing = await prisma.user.findUnique({
    where: { email: invite.email },
  });
  if (existing) {
    return { error: "Un compte existe déjà avec cet e-mail. Connectez-vous." };
  }

  const user = await prisma.user.create({
    data: {
      name: invite.name,
      email: invite.email,
      passwordHash: await hashPassword(password),
      memberships: {
        create: { role: invite.role, garageId: invite.garageId },
      },
    },
  });
  await prisma.invite.update({
    where: { id: invite.id },
    data: { acceptedAt: new Date() },
  });

  await createSession(user.id);
  redirect("/dashboard");
}

const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email("E-mail invalide."),
  password: z.string().min(1, "Mot de passe requis."),
});

export async function loginAction(
  _prev: AuthState,
  formData: FormData
): Promise<AuthState> {
  const parsed = loginSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Données invalides." };
  }

  const user = await prisma.user.findUnique({
    where: { email: parsed.data.email },
  });
  if (!user || !(await verifyPassword(parsed.data.password, user.passwordHash))) {
    return { error: "E-mail ou mot de passe incorrect." };
  }

  await createSession(user.id);
  redirect("/dashboard");
}

export async function logoutAction() {
  await destroySession();
  redirect("/login");
}
