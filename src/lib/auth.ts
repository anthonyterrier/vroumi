import "server-only";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { randomBytes } from "crypto";
import bcrypt from "bcryptjs";
import { SignJWT, jwtVerify } from "jose";
import { prisma } from "@/lib/prisma";

const COOKIE_NAME = "vroumi_session";
// Cookies des « lentilles » admin : endossement d'un compte et aperçu de rôle.
const VIEWAS_COOKIE = "vroumi_viewas";
const PREVIEW_COOKIE = "vroumi_preview";
const SESSION_DAYS = 30;

/** Valeurs de rôle prévisualisables (aligné sur RoleKey de lib/perms). */
export type PreviewRole = "OWNER" | "DRIVER" | "VIEWER";

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
  // On nettoie aussi les éventuelles lentilles admin.
  cookieStore.delete(VIEWAS_COOKIE);
  cookieStore.delete(PREVIEW_COOKIE);
}

/** Lit l'id de l'utilisateur depuis le JWT, sans requête base. */
export async function getSessionUserId(): Promise<string | null> {
  const token = (await cookies()).get(COOKIE_NAME)?.value;
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, getSecret());
    return typeof payload.sub === "string" ? payload.sub : null;
  } catch {
    return null;
  }
}

const USER_SELECT = {
  id: true,
  email: true,
  name: true,
  isAdmin: true,
  activated: true,
} as const;

async function fetchUser(id: string) {
  return prisma.user.findUnique({ where: { id }, select: USER_SELECT });
}

/** Utilisateur réellement connecté (ignore tout endossement). */
export async function getSessionUser() {
  const id = await getSessionUserId();
  return id ? fetchUser(id) : null;
}

/**
 * Utilisateur courant « vu » par l'application : le compte endossé si un admin
 * a activé le mode « voir en tant que », sinon l'utilisateur de la session.
 * Renvoie null si pas de session.
 */
export async function getCurrentUser() {
  const realId = await getSessionUserId();
  if (!realId) return null;

  const viewas = (await cookies()).get(VIEWAS_COOKIE)?.value;
  if (viewas && viewas !== realId && (await isRealAdmin(realId))) {
    const target = await fetchUser(viewas);
    if (target) return target;
  }
  return fetchUser(realId);
}

/** Exige une session : renvoie l'utilisateur courant ou redirige vers /login. */
export async function requireUser() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return user;
}

/**
 * Statut administrateur RÉEL (flag en base), indépendant des lentilles. Au
 * premier usage (aucun admin en base), le compte le plus ancien — celui qui a
 * installé l'app — est promu automatiquement administrateur.
 */
export async function isRealAdmin(userId: string): Promise<boolean> {
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

/** Vrai si l'admin réel endosse actuellement un autre compte. */
export async function isImpersonating(): Promise<boolean> {
  const realId = await getSessionUserId();
  if (!realId) return false;
  const viewas = (await cookies()).get(VIEWAS_COOKIE)?.value;
  return !!viewas && viewas !== realId && (await isRealAdmin(realId));
}

/** Rôle actuellement prévisualisé par l'admin réel, ou null. */
export async function getPreviewRole(): Promise<PreviewRole | null> {
  const realId = await getSessionUserId();
  if (!realId || !(await isRealAdmin(realId))) return null;
  const v = (await cookies()).get(PREVIEW_COOKIE)?.value;
  return v === "OWNER" || v === "DRIVER" || v === "VIEWER" ? v : null;
}

/** Vrai si une lentille (endossement ou aperçu de rôle) est active. */
export async function isLensActive(): Promise<boolean> {
  return (await isImpersonating()) || (await getPreviewRole()) !== null;
}

/**
 * Statut administrateur pour l'INTERFACE : renvoie false lorsqu'une lentille est
 * active (endossement / aperçu de rôle), afin de masquer la chrome admin et de
 * simuler fidèlement l'expérience d'un non-admin.
 */
export async function isAdminUser(userId: string): Promise<boolean> {
  if (await isLensActive()) return false;
  return isRealAdmin(userId);
}

/**
 * Exige une session ET le rôle administrateur RÉEL (ignore les lentilles, pour
 * que l'admin garde l'accès aux contrôles permettant de les désactiver).
 */
export async function requireAdmin() {
  const realId = await getSessionUserId();
  if (!realId) redirect("/login");
  if (!(await isRealAdmin(realId))) redirect("/dashboard");
  const user = await fetchUser(realId);
  if (!user) redirect("/login");
  return user;
}

/**
 * Bloque toute écriture lorsqu'une lentille (endossement / aperçu) est active :
 * dans ces modes, l'application est en LECTURE SEULE.
 */
export async function assertCanWrite(): Promise<void> {
  if (await isLensActive()) redirect("/dashboard");
}

// --- Contrôle des lentilles (réservé à l'admin réel) ---------------------

export async function setImpersonation(targetUserId: string): Promise<boolean> {
  const realId = await getSessionUserId();
  if (!realId || !(await isRealAdmin(realId))) return false;
  if (targetUserId === realId) return false;
  const cookieStore = await cookies();
  cookieStore.set(VIEWAS_COOKIE, targetUserId, {
    httpOnly: true,
    secure: process.env.COOKIE_SECURE === "true",
    sameSite: "lax",
    path: "/",
  });
  cookieStore.delete(PREVIEW_COOKIE);
  return true;
}

export async function setPreviewRole(role: PreviewRole): Promise<boolean> {
  const realId = await getSessionUserId();
  if (!realId || !(await isRealAdmin(realId))) return false;
  const cookieStore = await cookies();
  cookieStore.set(PREVIEW_COOKIE, role, {
    httpOnly: true,
    secure: process.env.COOKIE_SECURE === "true",
    sameSite: "lax",
    path: "/",
  });
  cookieStore.delete(VIEWAS_COOKIE);
  return true;
}

/** Désactive toutes les lentilles. */
export async function clearLens(): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.delete(VIEWAS_COOKIE);
  cookieStore.delete(PREVIEW_COOKIE);
}

/** Jeton aléatoire sûr pour les liens d'invitation. */
export function generateToken(): string {
  return randomBytes(24).toString("base64url");
}
