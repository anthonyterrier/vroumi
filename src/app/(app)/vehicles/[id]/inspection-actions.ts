"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireUser, assertCanWrite } from "@/lib/auth";
import { assertVehicleAccess } from "@/lib/vehicles";
import { getVehiclePerms, type PermKey } from "@/lib/perms";
import { isAcceptedUploadType } from "@/lib/carte-grise-fields";
import {
  normalizeResult,
  normalizeSeverity,
  computeNextInspectionDue,
} from "@/lib/technical-inspection-fields";
import { extractInspection, INSPECTION_AI_ENABLED } from "@/lib/technical-inspection";

const MAX_REPORT_BYTES = 20 * 1024 * 1024; // 20 Mo

export type InspectionState =
  | { error?: string; message?: string }
  | undefined;

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
  revalidatePath(`/vehicles/${vehicleId}/inspection`);
  revalidatePath(`/vehicles/${vehicleId}`, "layout");
}

function optDate(value: string | null): Date | null {
  if (!value || !value.trim()) return null;
  const d = new Date(value);
  return isNaN(d.getTime()) ? null : d;
}

/** Ajout manuel d'un contrôle technique (sans scan). */
export async function addInspection(vehicleId: string, formData: FormData) {
  const vehicle = await guard(vehicleId, "documentsAdd");
  const performedAt = optDate(String(formData.get("performedAt") ?? "")) ?? new Date();
  const result = normalizeResult(String(formData.get("result") ?? ""));
  const mileageRaw = String(formData.get("mileage") ?? "").trim();
  // Échéance saisie sinon calculée depuis le résultat, la date et la
  // périodicité propre au véhicule.
  const nextDueDate =
    optDate(String(formData.get("nextDueDate") ?? "")) ??
    computeNextInspectionDue(
      performedAt,
      result,
      vehicle?.inspectionIntervalMonths
    );
  await prisma.technicalInspection.create({
    data: {
      vehicleId,
      performedAt,
      result: result as never,
      mileage: mileageRaw ? parseInt(mileageRaw, 10) || null : null,
      center: String(formData.get("center") ?? "").trim() || null,
      nextDueDate,
      notes: String(formData.get("notes") ?? "").trim() || null,
    },
  });
  refresh(vehicleId);
}

/**
 * Envoi + analyse IA d'un compte rendu de contrôle technique : crée le contrôle
 * et ses défaillances à partir du fichier scanné.
 */
export async function scanInspection(
  vehicleId: string,
  _prev: InspectionState,
  formData: FormData
): Promise<InspectionState> {
  if (!INSPECTION_AI_ENABLED) {
    return { error: "L'analyse IA n'est pas configurée sur ce serveur." };
  }
  const vehicle = await guard(vehicleId, "documentsAdd");

  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return { error: "Sélectionnez le compte rendu (image ou PDF)." };
  }
  if (file.size > MAX_REPORT_BYTES) {
    return { error: "Fichier trop lourd (max 20 Mo)." };
  }
  if (!isAcceptedUploadType(file.type)) {
    return { error: "Format non accepté (JPEG, PNG, WebP ou PDF)." };
  }

  const bytes = Buffer.from(await file.arrayBuffer());
  let extracted;
  try {
    extracted = await extractInspection(bytes, file.type);
  } catch (e) {
    const detail = e instanceof Error ? e.message : String(e);
    console.error("Analyse contrôle technique échouée:", detail);
    return { error: `L'analyse a échoué : ${detail.slice(0, 300)}` };
  }

  const performedAt = optDate(extracted.date) ?? new Date();
  const result = normalizeResult(extracted.result);
  await prisma.technicalInspection.create({
    data: {
      vehicleId,
      performedAt,
      result: result as never,
      mileage: extracted.mileage ?? null,
      center: extracted.center,
      // Échéance lue sur le compte rendu, sinon calculée selon la périodicité.
      nextDueDate:
        optDate(extracted.nextDueDate) ??
        computeNextInspectionDue(
          performedAt,
          result,
          vehicle?.inspectionIntervalMonths
        ),
      data: bytes,
      mimeType: file.type,
      fileName: file.name || null,
      extractedAt: new Date(),
      defects: {
        create: extracted.defects.map((d) => ({
          severity: normalizeSeverity(d.severity) as never,
          code: d.code,
          description: d.description,
        })),
      },
    },
  });

  refresh(vehicleId);
  return {
    message:
      extracted.defects.length > 0
        ? `Contrôle technique enregistré : ${extracted.defects.length} défaillance(s) détectée(s).`
        : "Contrôle technique enregistré (aucune défaillance détectée).",
  };
}

/** Coche / décoche une défaillance comme traitée. */
export async function toggleDefect(vehicleId: string, defectId: string) {
  await guard(vehicleId, "documentsEdit");
  // Filtre par la relation pour garantir l'appartenance au véhicule.
  const defect = await prisma.inspectionDefect.findFirst({
    where: { id: defectId, inspection: { vehicleId } },
    select: { id: true, fixed: true },
  });
  if (!defect) return;
  await prisma.inspectionDefect.update({
    where: { id: defect.id },
    data: {
      fixed: !defect.fixed,
      fixedAt: defect.fixed ? null : new Date(),
    },
  });
  refresh(vehicleId);
}

/** Supprime un contrôle technique (et ses défaillances en cascade). */
export async function deleteInspection(vehicleId: string, id: string) {
  await guard(vehicleId, "documentsDelete");
  await prisma.technicalInspection.deleteMany({ where: { id, vehicleId } });
  refresh(vehicleId);
}
