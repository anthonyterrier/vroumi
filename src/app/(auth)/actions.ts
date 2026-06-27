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

/**
 * Acceptation d'une invitation : l'invité choisit son mot de passe. Si
 * l'invitation cible un compte existant (`userId`, créé par l'admin sans
 * accès), ce compte est ACTIVÉ ; sinon un nouveau compte est créé. Dans les
 * deux cas, l'adhésion au garage est posée avec le rôle de l'invitation.
 */
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

  const passwordHash = await hashPassword(password);
  let userId: string;

  if (invite.userId) {
    // Activation d'un compte existant créé par l'administrateur.
    const target = await prisma.user.findUnique({
      where: { id: invite.userId },
    });
    if (!target) {
      return { error: "Le compte associé à cette invitation est introuvable." };
    }
    await prisma.user.update({
      where: { id: target.id },
      data: {
        passwordHash,
        activated: true,
        // Renseigne l'e-mail de l'invitation s'il manquait au compte.
        ...(invite.email && !target.email ? { email: invite.email } : {}),
      },
    });
    userId = target.id;
  } else {
    // Création d'un nouveau compte.
    if (invite.email) {
      const existing = await prisma.user.findUnique({
        where: { email: invite.email },
      });
      if (existing) {
        return {
          error: "Un compte existe déjà avec cet e-mail. Connectez-vous.",
        };
      }
    }
    const created = await prisma.user.create({
      data: {
        name: invite.name,
        email: invite.email,
        passwordHash,
        activated: true,
      },
    });
    userId = created.id;
  }

  await prisma.membership.upsert({
    where: { userId_garageId: { userId, garageId: invite.garageId } },
    create: { userId, garageId: invite.garageId, role: invite.role },
    update: { role: invite.role },
  });
  await prisma.invite.update({
    where: { id: invite.id },
    data: { acceptedAt: new Date() },
  });

  await createSession(userId);
  redirect("/dashboard");
}

const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email("E-mail invalide."),
  password: z.string().min(1, "Mot de passe requis."),
});

// Limitation simple en mémoire des tentatives de connexion par e-mail.
// Suffisant pour un déploiement auto-hébergé (instance unique). Pour un
// déploiement multi-instances, déplacer ce compteur dans un store partagé.
const LOGIN_WINDOW_MS = 15 * 60 * 1000;
const LOGIN_MAX_ATTEMPTS = 10;
const loginAttempts = new Map<string, { count: number; resetAt: number }>();

function tooManyAttempts(key: string): boolean {
  const now = Date.now();
  const entry = loginAttempts.get(key);
  if (!entry || entry.resetAt < now) return false;
  return entry.count >= LOGIN_MAX_ATTEMPTS;
}

function recordFailure(key: string): void {
  const now = Date.now();
  const entry = loginAttempts.get(key);
  if (!entry || entry.resetAt < now) {
    loginAttempts.set(key, { count: 1, resetAt: now + LOGIN_WINDOW_MS });
  } else {
    entry.count += 1;
  }
}

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
  const { email, password } = parsed.data;

  if (tooManyAttempts(email)) {
    return {
      error:
        "Trop de tentatives de connexion. Réessayez dans une quinzaine de minutes.",
    };
  }

  const user = await prisma.user.findUnique({ where: { email } });
  if (!user || !user.activated || !(await verifyPassword(password, user.passwordHash))) {
    recordFailure(email);
    return { error: "E-mail ou mot de passe incorrect." };
  }

  loginAttempts.delete(email);
  await createSession(user.id);
  redirect("/dashboard");
}

export async function logoutAction() {
  await destroySession();
  redirect("/login");
}
