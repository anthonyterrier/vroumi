"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireUser, assertCanWrite } from "@/lib/auth";
import { assertVehicleAccess, currentMileage } from "@/lib/vehicles";
import { getVehiclePerms } from "@/lib/perms";
import { runObdDiagnosis, OBD_AI_ENABLED } from "@/lib/obd-diagnosis";
import type {
  ObdDiagnosis,
  ObdSnapshot,
} from "@/lib/obd-diagnosis-fields";

export type ObdDiagnosisState =
  | { error?: string; diagnosis?: ObdDiagnosis }
  | undefined;

/** Aide au diagnostic IA à partir de l'instantané OBD (lecture seule). */
export async function diagnoseWithAI(
  vehicleId: string,
  snapshot: ObdSnapshot
): Promise<ObdDiagnosisState> {
  if (!OBD_AI_ENABLED) {
    return { error: "L'aide au diagnostic IA n'est pas configurée sur ce serveur." };
  }
  const user = await requireUser();
  const vehicle = await assertVehicleAccess(user.id, vehicleId);
  if (!vehicle) return { error: "Véhicule introuvable." };

  const mileage = await currentMileage(vehicle.id, vehicle.initialMileage);
  try {
    const diagnosis = await runObdDiagnosis(
      {
        name: vehicle.name,
        make: vehicle.make,
        model: vehicle.model,
        year: vehicle.year,
        fuelType: vehicle.fuelType,
        mileage,
      },
      snapshot
    );
    return { diagnosis };
  } catch (e) {
    const detail = e instanceof Error ? e.message : String(e);
    console.error("Aide au diagnostic IA échouée:", detail);
    return { error: `L'analyse a échoué : ${detail.slice(0, 300)}` };
  }
}

/** Enregistre le kilométrage lu à l'odomètre comme relevé sur la fiche. */
export async function saveOdometer(vehicleId: string, km: number) {
  const user = await requireUser();
  await assertCanWrite();
  const vehicle = await assertVehicleAccess(user.id, vehicleId);
  if (!vehicle) redirect("/dashboard");
  if (!(await getVehiclePerms(user.id, vehicleId)).mileageAdd) {
    redirect(`/vehicles/${vehicleId}`);
  }
  const value = Math.round(km);
  if (!Number.isFinite(value) || value <= 0) return;

  await prisma.mileageEntry.create({
    data: {
      vehicleId,
      readAt: new Date(),
      mileage: value,
      notes: "Relevé OBD (odomètre)",
    },
  });
  revalidatePath(`/vehicles/${vehicleId}`, "layout");
}
