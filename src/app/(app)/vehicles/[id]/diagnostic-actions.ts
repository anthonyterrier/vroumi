"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireUser, assertCanWrite } from "@/lib/auth";
import { assertVehicleAccess } from "@/lib/vehicles";
import { getVehiclePerms, type PermKey } from "@/lib/perms";

/** Garde de mutation : session, non lecture seule, accès véhicule, droit `perm`. */
async function guard(vehicleId: string, perm: PermKey) {
  const user = await requireUser();
  await assertCanWrite();
  const vehicle = await assertVehicleAccess(user.id, vehicleId);
  if (vehicle) {
    const perms = await getVehiclePerms(user.id, vehicleId);
    if (!perms[perm]) redirect(`/vehicles/${vehicleId}`);
  }
  return vehicle;
}

function refresh(vehicleId: string) {
  revalidatePath(`/vehicles/${vehicleId}/diagnostic`);
  revalidatePath(`/vehicles/${vehicleId}/edit`);
  revalidatePath(`/vehicles/${vehicleId}`, "layout");
}

/** Enregistre le VIN lu sur le port OBD dans la fiche véhicule. */
export async function saveVin(vehicleId: string, vin: string) {
  await guard(vehicleId, "vehiclesEdit");
  const clean = vin
    .toUpperCase()
    .replace(/[^A-HJ-NPR-Z0-9]/g, "")
    .slice(0, 17);
  if (clean.length < 11) return;
  await prisma.vehicle.update({
    where: { id: vehicleId },
    data: { vin: clean },
  });
  refresh(vehicleId);
}

/**
 * Mémorise les informations véhicule lues sur le port OBD (ECU, Calibration ID,
 * CVN, protocole…) pour les réafficher sans re-extraction. Silencieux si
 * l'utilisateur n'a pas le droit d'éditer le véhicule.
 */
export async function saveVehicleObdInfo(
  vehicleId: string,
  info: { label: string; value: string }[]
) {
  const user = await requireUser();
  await assertCanWrite();
  const vehicle = await assertVehicleAccess(user.id, vehicleId);
  if (!vehicle) return;
  if (!(await getVehiclePerms(user.id, vehicleId)).vehiclesEdit) return;
  const clean = (Array.isArray(info) ? info : [])
    .filter((i) => i && i.label && i.value)
    .map((i) => ({ label: String(i.label), value: String(i.value) }))
    .slice(0, 50);
  await prisma.vehicle.update({
    where: { id: vehicleId },
    data: { obdInfo: clean.length ? JSON.stringify(clean) : null },
  });
  refresh(vehicleId);
}

export type DiagnosticCode = {
  code: string;
  description: string;
  pending?: boolean;
};

export type DiagnosticInput = {
  codes: DiagnosticCode[];
  voltage?: number | null;
  vin?: string | null;
  mileage?: number | null;
  notes?: string | null;
};

/** Journalise un relevé de diagnostic dans l'historique du véhicule. */
export async function saveDiagnosticReport(
  vehicleId: string,
  input: DiagnosticInput
) {
  await guard(vehicleId, "maintenanceAdd");
  const codes = Array.isArray(input.codes) ? input.codes : [];
  await prisma.diagnosticReport.create({
    data: {
      vehicleId,
      codes: JSON.stringify(codes),
      voltage: input.voltage ?? null,
      vin: input.vin ?? null,
      mileage: input.mileage ?? null,
      notes: input.notes ?? null,
    },
  });
  refresh(vehicleId);
}

/** Supprime un relevé de diagnostic. */
export async function deleteDiagnosticReport(vehicleId: string, id: string) {
  await guard(vehicleId, "maintenanceDelete");
  await prisma.diagnosticReport.deleteMany({ where: { id, vehicleId } });
  refresh(vehicleId);
}
