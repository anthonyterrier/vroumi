import "server-only";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { randomBytes } from "crypto";
import bcrypt from "bcryptjs";
import { SignJWT, jwtVerify } from "jose";
import { prisma } from "@/lib/prisma";

const COOKIE_NAME = "vroumi_session";
const SESSION_DAYS = 30;

function getSecret(): Uint8Array {
  const secret = process.env.AUTH_SECRET;
  if (!secret) {
    throw new Error(
      "AUTH_SECRET est manquant. Définissez-le dans votre fichier .env (voir .env.example)."
    );
  }
  return new TextEncoder().encode(secret);
}

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 10);
}

export async function verifyPassword(
  password: string,
  hash: string
): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

/** Crée la session (JWT signé) et pose le cookie httpOnly. */
export async function createSession(userId: string): Promise<void> {
  const token = await new SignJWT({ sub: userId })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${SESSION_DAYS}d`)
    .sign(getSecret());

  const cookieStore = await cookies();
  cookieStore.set(COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.COOKIE_SECURE === "true",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_DAYS * 24 * 60 * 60,
  });
}

export async function destroySession(): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.delete(COOKIE_NAME);
}

/** Renvoie l'utilisateur courant ou null (sans rediriger). */
export async function getCurrentUser() {
  const cookieStore = await cookies();
  const token = cookieStore.get(COOKIE_NAME)?.value;
  if (!token) return null;

  try {
    const { payload } = await jwtVerify(token, getSecret());
    const userId = payload.sub;
    if (!userId || typeof userId !== "string") return null;

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, email: true, name: true, isAdmin: true },
    });
    return user;
  } catch {
    return null;
  }
}

/** Exige une session : renvoie l'utilisateur ou redirige vers /login. */
export async function requireUser() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return user;
}

/**
 * Détermine si l'utilisateur est administrateur. Au premier usage (aucun admin
 * en base), le compte le plus ancien — celui qui a installé l'app — est promu
 * automatiquement administrateur.
 */
export async function isAdminUser(userId: string): Promise<boolean> {
  const adminCount = await prisma.user.count({ where: { isAdmin: true } });
  if (adminCount === 0) {
    const first = await prisma.user.findFirst({ orderBy: { createdAt: "asc" } });
    if (first) {
      await prisma.user.update({
        where: { id: first.id },
        data: { isAdmin: true },
      });
      return first.id === userId;
    }
  }
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { isAdmin: true },
  });
  return !!user?.isAdmin;
}

/** Exige une session ET le rôle administrateur (redirige sinon). */
export async function requireAdmin() {
  const user = await requireUser();
  if (!(await isAdminUser(user.id))) redirect("/dashboard");
  return user;
}

/** Jeton aléatoire sûr pour les liens d'invitation. */
export function generateToken(): string {
  return randomBytes(24).toString("base64url");
}
