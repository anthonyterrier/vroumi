import "server-only";
import { notFound, redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";

/** Renvoie l'id des garages auxquels appartient l'utilisateur. */
export async function getUserGarageIds(userId: string): Promise<string[]> {
  const memberships = await prisma.membership.findMany({
    where: { userId },
    select: { garageId: true },
  });
  return memberships.map((m) => m.garageId);
}

/**
 * Condition d'accès : véhicule appartenant à l'un des garages de l'utilisateur,
 * OU partagé avec l'un de ces garages.
 */
function accessWhere(garageIds: string[]) {
  return {
    OR: [
      { garageId: { in: garageIds } },
      { shares: { some: { garageId: { in: garageIds } } } },
    ],
  };
}

/** Liste les véhicules accessibles par l'utilisateur courant (possédés + partagés). */
export async function getAccessibleVehicles(userId: string) {
  const garageIds = await getUserGarageIds(userId);
  return prisma.vehicle.findMany({
    where: accessWhere(garageIds),
    orderBy: { createdAt: "asc" },
  });
}

/**
 * Charge un véhicule en vérifiant que l'utilisateur courant y a accès
 * (propriétaire ou partagé). Redirige vers /login si non connecté, 404 sinon.
 */
export async function requireVehicle(vehicleId: string) {
  const user = await requireUser();
  const garageIds = await getUserGarageIds(user.id);
  const vehicle = await prisma.vehicle.findFirst({
    where: { id: vehicleId, ...accessWhere(garageIds) },
  });
  if (!vehicle) notFound();
  return { user, vehicle };
}

/**
 * Vérifie l'accès à un véhicule pour une action (mutation).
 * Renvoie le véhicule ou redirige vers le tableau de bord.
 */
export async function assertVehicleAccess(userId: string, vehicleId: string) {
  const garageIds = await getUserGarageIds(userId);
  const vehicle = await prisma.vehicle.findFirst({
    where: { id: vehicleId, ...accessWhere(garageIds) },
  });
  if (!vehicle) {
    redirect("/dashboard");
  }
  return vehicle;
}

/**
 * Kilométrage courant estimé d'un véhicule : maximum entre le kilométrage
 * initial et tous les relevés connus (entretiens, réparations, pleins,
 * relevés kilométriques).
 */
export async function currentMileage(
  vehicleId: string,
  initialMileage?: number | null
): Promise<number | null> {
  const [maint, repair, fuel, mileage] = await Promise.all([
    prisma.maintenance.aggregate({
      where: { vehicleId },
      _max: { mileage: true },
    }),
    prisma.repair.aggregate({ where: { vehicleId }, _max: { mileage: true } }),
    prisma.fuelEntry.aggregate({
      where: { vehicleId },
      _max: { mileage: true },
    }),
    prisma.mileageEntry.aggregate({
      where: { vehicleId },
      _max: { mileage: true },
    }),
  ]);

  const candidates = [
    initialMileage ?? null,
    maint._max.mileage,
    repair._max.mileage,
    fuel._max.mileage,
    mileage._max.mileage,
  ].filter((v): v is number => typeof v === "number");

  if (candidates.length === 0) return null;
  return Math.max(...candidates);
}
