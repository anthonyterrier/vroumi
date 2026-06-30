"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireUser, assertCanWrite } from "@/lib/auth";
import { assertVehicleAccess } from "@/lib/vehicles";
import { getVehiclePerms } from "@/lib/perms";
import { isAcceptedUploadType } from "@/lib/carte-grise-fields";
import {
  extractServicePlan,
  SERVICE_PLAN_AI_ENABLED,
} from "@/lib/service-plan";
import type { ServicePlanItem } from "@/lib/service-plan-fields";

const MAX_PLAN_BYTES = 8 * 1024 * 1024; // 8 Mo (une à deux pages)
const MAX_MANUAL_BYTES = 25 * 1024 * 1024; // 25 Mo (notice complète)

export type ServicePlanState =
  | { error?: string; message?: string; items?: ServicePlanItem[] }
  | undefined;

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
  revalidatePath(`/vehicles/${vehicleId}/maintenance`);
}

// --- Plan d'entretien (carnet constructeur) ------------------------------

export async function uploadServicePlan(vehicleId: string, formData: FormData) {
  await guard(vehicleId);
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) return;
  if (file.size > MAX_PLAN_BYTES) return;
  if (!isAcceptedUploadType(file.type)) return;

  const bytes = Buffer.from(await file.arrayBuffer());
  await prisma.vehicleServicePlan.upsert({
    where: { vehicleId },
    create: {
      vehicleId,
      data: bytes,
      mimeType: file.type,
      fileName: file.name || null,
    },
    // Nouveau document → l'ancienne extraction n'est plus pertinente.
    update: {
      data: bytes,
      mimeType: file.type,
      fileName: file.name || null,
      intervals: "[]",
    },
  });
  refresh(vehicleId);
}

export async function deleteServicePlan(vehicleId: string) {
  await guard(vehicleId);
  await prisma.vehicleServicePlan.deleteMany({ where: { vehicleId } });
  refresh(vehicleId);
}

export async function analyzeServicePlan(
  vehicleId: string,
  _prev: ServicePlanState,
  _formData: FormData
): Promise<ServicePlanState> {
  if (!SERVICE_PLAN_AI_ENABLED) {
    return { error: "L'analyse IA n'est pas configurée sur ce serveur." };
  }
  await guard(vehicleId);

  const plan = await prisma.vehicleServicePlan.findUnique({
    where: { vehicleId },
  });
  if (!plan?.data) {
    return { error: "Aucun document de plan d'entretien à analyser." };
  }

  let items: ServicePlanItem[];
  try {
    items = await extractServicePlan(Buffer.from(plan.data), plan.mimeType ?? "");
  } catch (e) {
    const detail = e instanceof Error ? e.message : String(e);
    console.error("Analyse plan d'entretien échouée:", detail);
    return { error: `L'analyse a échoué : ${detail.slice(0, 300)}` };
  }

  await prisma.vehicleServicePlan.update({
    where: { vehicleId },
    data: { intervals: JSON.stringify(items) },
  });
  refresh(vehicleId);

  if (items.length === 0) {
    return { error: "Aucune ligne d'entretien détectée sur le document." };
  }
  return { items, message: `${items.length} ligne(s) d'entretien détectée(s).` };
}

// --- Manuel / notice -----------------------------------------------------

export async function saveManual(vehicleId: string, formData: FormData) {
  await guard(vehicleId);

  const title = String(formData.get("title") ?? "").trim() || null;
  const url = String(formData.get("url") ?? "").trim() || null;
  const file = formData.get("file");
  const hasFile = file instanceof File && file.size > 0;

  if (hasFile) {
    if (file.size > MAX_MANUAL_BYTES) return;
    if (!isAcceptedUploadType(file.type)) return;
    const bytes = Buffer.from(await file.arrayBuffer());
    await prisma.vehicleManual.upsert({
      where: { vehicleId },
      create: {
        vehicleId,
        data: bytes,
        mimeType: file.type,
        fileName: file.name || null,
        title,
      },
      // Un fichier remplace un éventuel lien.
      update: {
        data: bytes,
        mimeType: file.type,
        fileName: file.name || null,
        url: null,
        title,
      },
    });
  } else if (url) {
    // Lien externe (on n'autorise que http/https).
    if (!/^https?:\/\//i.test(url)) return;
    await prisma.vehicleManual.upsert({
      where: { vehicleId },
      create: { vehicleId, url, title },
      // Un lien remplace un éventuel fichier.
      update: { url, title, data: null, mimeType: null, fileName: null },
    });
  } else {
    // Ni fichier ni lien : on met juste à jour le titre s'il existe déjà.
    await prisma.vehicleManual.updateMany({
      where: { vehicleId },
      data: { title },
    });
  }
  refresh(vehicleId);
}

export async function deleteManual(vehicleId: string) {
  await guard(vehicleId);
  await prisma.vehicleManual.deleteMany({ where: { vehicleId } });
  refresh(vehicleId);
}
