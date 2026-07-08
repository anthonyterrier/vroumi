"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireUser, assertCanWrite } from "@/lib/auth";
import { assertVehicleAccess, currentMileage } from "@/lib/vehicles";
import { getVehiclePerms } from "@/lib/perms";
import { runObdDiagnosis, OBD_AI_ENABLED } from "@/lib/obd-diagnosis";
import { runResetProcedure, OBD_RESET_AI_ENABLED } from "@/lib/obd-reset";
import type {
  ObdDiagnosis,
  ObdSnapshot,
} from "@/lib/obd-diagnosis-fields";
import type { ResetProcedure } from "@/lib/obd-reset-fields";

export type ObdDiagnosisState =
  | { error?: string; diagnosis?: ObdDiagnosis }
  | undefined;

type StoredCode = { code: string; description: string; pending?: boolean };

/** Signature d'un ensemble de codes (indépendante de l'ordre). */
function codesSignature(codes: { code: string }[]): string {
  return codes
    .map((c) => c.code)
    .sort()
    .join(",");
}

/**
 * Enregistre le diagnostic IA dans l'historique. Si le dernier relevé porte
 * exactement les mêmes codes que l'instantané, on l'enrichit ; sinon on crée
 * un nouveau relevé. Silencieux si l'utilisateur n'a pas le droit d'écrire.
 */
async function persistDiagnosis(
  userId: string,
  vehicleId: string,
  snapshot: ObdSnapshot,
  mileage: number | null,
  diagnosis: ObdDiagnosis
): Promise<void> {
  if (!(await getVehiclePerms(userId, vehicleId)).maintenanceAdd) return;

  const aiDiagnosis = JSON.stringify(diagnosis);
  const snapSig = codesSignature(snapshot.codes);

  const latest = await prisma.diagnosticReport.findFirst({
    where: { vehicleId },
    orderBy: { performedAt: "desc" },
  });

  let latestSig: string | null = null;
  if (latest) {
    try {
      latestSig = codesSignature(JSON.parse(latest.codes) as StoredCode[]);
    } catch {
      latestSig = null;
    }
  }

  if (latest && latestSig === snapSig) {
    await prisma.diagnosticReport.update({
      where: { id: latest.id },
      data: { aiDiagnosis },
    });
  } else {
    const storedCodes: StoredCode[] = snapshot.codes.map((c) => ({
      code: c.code,
      description: c.description,
      pending: c.pending,
    }));
    await prisma.diagnosticReport.create({
      data: {
        vehicleId,
        codes: JSON.stringify(storedCodes),
        voltage: snapshot.voltage,
        mileage,
        aiDiagnosis,
      },
    });
  }
  revalidatePath(`/vehicles/${vehicleId}/diagnostic`);
}

/** Aide au diagnostic IA à partir de l'instantané OBD ; l'enregistre au relevé. */
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
    // On conserve le diagnostic avec le relevé, seulement s'il y a des codes.
    if (snapshot.codes.length > 0) {
      try {
        await persistDiagnosis(user.id, vehicle.id, snapshot, mileage, diagnosis);
      } catch (e) {
        // L'enregistrement ne doit jamais faire échouer l'affichage du diagnostic.
        console.error("Enregistrement du diagnostic IA échoué:", e);
      }
    }
    return { diagnosis };
  } catch (e) {
    const detail = e instanceof Error ? e.message : String(e);
    console.error("Aide au diagnostic IA échouée:", detail);
    return { error: `L'analyse a échoué : ${detail.slice(0, 300)}` };
  }
}

export type ResetProcedureState =
  | { error?: string; procedure?: ResetProcedure }
  | undefined;

/** Recherche IA (web) de la procédure de réinitialisation d'entretien via le VIN. */
export async function resetProcedureFromVin(
  vehicleId: string,
  vin: string
): Promise<ResetProcedureState> {
  if (!OBD_RESET_AI_ENABLED) {
    return { error: "La recherche IA n'est pas configurée sur ce serveur." };
  }
  const cleanVin = vin.trim().toUpperCase();
  if (cleanVin.length < 11) {
    return { error: "VIN invalide ou incomplet." };
  }
  const user = await requireUser();
  const vehicle = await assertVehicleAccess(user.id, vehicleId);
  if (!vehicle) return { error: "Véhicule introuvable." };

  try {
    const procedure = await runResetProcedure(cleanVin, {
      name: vehicle.name,
      make: vehicle.make,
      model: vehicle.model,
      year: vehicle.year,
    });
    return { procedure };
  } catch (e) {
    const detail = e instanceof Error ? e.message : String(e);
    console.error("Recherche procédure de réinitialisation échouée:", detail);
    return { error: `La recherche a échoué : ${detail.slice(0, 300)}` };
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
