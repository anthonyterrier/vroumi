"use server";

import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireUser, assertCanWrite } from "@/lib/auth";
import { assertVehicleAccess } from "@/lib/vehicles";
import { getVehiclePerms } from "@/lib/perms";
import { isAcceptedUploadType } from "@/lib/carte-grise-fields";
import {
  extractMaintenanceInvoice,
  INVOICE_AI_ENABLED,
} from "@/lib/maintenance-invoice";
import type { InvoiceExtraction } from "@/lib/maintenance-invoice-fields";

const MAX_INVOICE_BYTES = 20 * 1024 * 1024; // 20 Mo

export type InvoiceScanState =
  | { error?: string; extraction?: InvoiceExtraction }
  | undefined;

/**
 * Analyse une facture d'entretien (image ou PDF) et renvoie les champs extraits
 * pour pré-remplir le formulaire d'ajout. Ne crée rien en base.
 */
export async function analyzeInvoice(
  vehicleId: string,
  _prev: InvoiceScanState,
  formData: FormData
): Promise<InvoiceScanState> {
  if (!INVOICE_AI_ENABLED) {
    return { error: "L'analyse IA n'est pas configurée sur ce serveur." };
  }
  // Garde : session, non lecture seule, accès véhicule, droit d'ajout.
  const user = await requireUser();
  await assertCanWrite();
  const vehicle = await assertVehicleAccess(user.id, vehicleId);
  if (!vehicle) redirect("/dashboard");
  if (!(await getVehiclePerms(user.id, vehicleId)).maintenanceAdd) {
    redirect(`/vehicles/${vehicleId}`);
  }

  const file = formData.get("files") ?? formData.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return { error: "Sélectionnez d'abord la facture (image ou PDF)." };
  }
  if (file.size > MAX_INVOICE_BYTES) {
    return { error: "Fichier trop lourd (max 20 Mo)." };
  }
  if (!isAcceptedUploadType(file.type)) {
    return { error: "Format non accepté (JPEG, PNG, WebP ou PDF)." };
  }

  const bytes = Buffer.from(await file.arrayBuffer());
  try {
    const extraction = await extractMaintenanceInvoice(bytes, file.type);
    return { extraction };
  } catch (e) {
    const detail = e instanceof Error ? e.message : String(e);
    console.error("Analyse facture échouée:", detail);
    return { error: `L'analyse a échoué : ${detail.slice(0, 300)}` };
  }
}
