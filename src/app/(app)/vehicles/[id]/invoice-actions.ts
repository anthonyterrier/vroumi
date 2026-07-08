"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { Prisma, MaintenanceType } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireUser, assertCanWrite } from "@/lib/auth";
import { assertVehicleAccess } from "@/lib/vehicles";
import { getVehiclePerms } from "@/lib/perms";
import { isAcceptedUploadType } from "@/lib/carte-grise-fields";
import { MAINTENANCE_TYPE_LABELS } from "@/lib/labels";
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

/**
 * Analyse une pièce jointe DÉJÀ enregistrée (facture stockée) et met à jour
 * l'entretien avec les champs détectés (ne touche qu'aux champs trouvés).
 */
export async function analyzeAttachment(
  vehicleId: string,
  attachmentId: string
) {
  if (!INVOICE_AI_ENABLED) return;
  const user = await requireUser();
  await assertCanWrite();
  const vehicle = await assertVehicleAccess(user.id, vehicleId);
  if (!vehicle) redirect("/dashboard");
  if (!(await getVehiclePerms(user.id, vehicleId)).maintenanceEdit) {
    redirect(`/vehicles/${vehicleId}`);
  }

  const att = await prisma.maintenanceAttachment.findFirst({
    where: { id: attachmentId, maintenance: { vehicleId } },
    select: { maintenanceId: true, data: true, mimeType: true },
  });
  if (!att) return;

  let ext;
  try {
    ext = await extractMaintenanceInvoice(Buffer.from(att.data), att.mimeType);
  } catch (e) {
    console.error("Analyse pièce jointe échouée:", e);
    return;
  }

  const data: Prisma.MaintenanceUpdateInput = {};
  if (ext.date) {
    const d = new Date(ext.date);
    if (!isNaN(d.getTime())) data.performedAt = d;
  }
  if (ext.mileage != null) data.mileage = ext.mileage;
  if (ext.cost != null) data.cost = ext.cost;
  if (ext.serviceName) data.serviceName = ext.serviceName;
  if (ext.title) data.title = ext.title;
  const validTypes = ext.types.filter((t) => t in MAINTENANCE_TYPE_LABELS);
  if (validTypes.length) {
    data.type = validTypes[0] as MaintenanceType;
    data.types = validTypes.join(",");
  }

  if (Object.keys(data).length > 0) {
    await prisma.maintenance.update({
      where: { id: att.maintenanceId },
      data,
    });
  }
  revalidatePath(`/vehicles/${vehicleId}`, "layout");
}
