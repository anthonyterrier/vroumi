"use server";

import { redirect } from "next/navigation";
import { requireUser, assertCanWrite } from "@/lib/auth";
import { assertVehicleAccess } from "@/lib/vehicles";
import { getVehiclePerms } from "@/lib/perms";
import { isAcceptedUploadType } from "@/lib/carte-grise-fields";
import { extractOilInfo, OIL_AI_ENABLED } from "@/lib/oil-extract";
import type { OilExtraction } from "@/lib/oil-extract-fields";

const MAX_BYTES = 20 * 1024 * 1024; // 20 Mo

export type OilScanState =
  | { error?: string; fields?: OilExtraction }
  | undefined;

/**
 * Analyse une photo (facture d'entretien ou bidon d'huile) et renvoie les
 * caractéristiques de l'huile pour pré-remplir l'étiquette. Ne crée rien.
 */
export async function scanOilInfo(
  vehicleId: string,
  _prev: OilScanState,
  formData: FormData
): Promise<OilScanState> {
  if (!OIL_AI_ENABLED) {
    return { error: "L'analyse IA n'est pas configurée sur ce serveur." };
  }
  const user = await requireUser();
  await assertCanWrite();
  const vehicle = await assertVehicleAccess(user.id, vehicleId);
  if (!vehicle) redirect("/dashboard");
  if (!(await getVehiclePerms(user.id, vehicleId)).maintenanceAdd) {
    redirect(`/vehicles/${vehicleId}`);
  }

  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return { error: "Sélectionne d'abord une photo (facture ou bidon)." };
  }
  if (file.size > MAX_BYTES) {
    return { error: "Fichier trop lourd (max 20 Mo)." };
  }
  if (!isAcceptedUploadType(file.type)) {
    return { error: "Format non accepté (JPEG, PNG, WebP ou PDF)." };
  }

  const bytes = Buffer.from(await file.arrayBuffer());
  try {
    const fields = await extractOilInfo(bytes, file.type);
    return { fields };
  } catch (e) {
    const detail = e instanceof Error ? e.message : String(e);
    console.error("Analyse huile échouée:", detail);
    return { error: `L'analyse a échoué : ${detail.slice(0, 300)}` };
  }
}
