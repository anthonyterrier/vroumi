"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireUser, assertCanWrite, generateToken } from "@/lib/auth";
import { assertVehicleAccess } from "@/lib/vehicles";
import { getVehiclePerms } from "@/lib/perms";

/** Garde : session, non lecture seule, accès véhicule, droit `vehiclesEdit`. */
async function guard(vehicleId: string) {
  const user = await requireUser();
  await assertCanWrite();
  const vehicle = await assertVehicleAccess(user.id, vehicleId);
  if (!vehicle) redirect("/dashboard");
  if (!(await getVehiclePerms(user.id, vehicleId)).vehiclesEdit) {
    redirect(`/vehicles/${vehicleId}`);
  }
  return vehicle;
}

function refresh(vehicleId: string) {
  revalidatePath(`/vehicles/${vehicleId}/edit`);
}

/** Active le partage public (génère un jeton s'il n'en existe pas). */
export async function enablePublicSharing(vehicleId: string) {
  await guard(vehicleId);
  const existing = await prisma.vehicle.findUnique({
    where: { id: vehicleId },
    select: { publicToken: true },
  });
  await prisma.vehicle.update({
    where: { id: vehicleId },
    data: {
      publicEnabled: true,
      publicToken: existing?.publicToken ?? generateToken(),
    },
  });
  refresh(vehicleId);
}

/** Désactive le partage public (le lien/QR ne fonctionne plus). */
export async function disablePublicSharing(vehicleId: string) {
  await guard(vehicleId);
  await prisma.vehicle.update({
    where: { id: vehicleId },
    data: { publicEnabled: false },
  });
  refresh(vehicleId);
}

/** Régénère le jeton public (révoque l'ancien QR) et garde le partage actif. */
export async function regeneratePublicToken(vehicleId: string) {
  await guard(vehicleId);
  await prisma.vehicle.update({
    where: { id: vehicleId },
    data: { publicToken: generateToken(), publicEnabled: true },
  });
  refresh(vehicleId);
}
