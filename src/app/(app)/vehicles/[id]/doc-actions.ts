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

// Le document de plan d'entretien est ensuite envoyé à l'IA : l'API limite la
// taille (~32 Mo, gonflée par l'encodage base64). On plafonne donc à 20 Mo et
// on invite à n'envoyer que la/les page(s) du programme d'entretien.
const MAX_PLAN_BYTES = 20 * 1024 * 1024; // 20 Mo
const MAX_MANUAL_BYTES = 64 * 1024 * 1024; // 64 Mo (notice complète, parfois lourde)

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

/** Ajoute une page/photo au plan d'entretien (cumulatif). */
export async function uploadServicePlanDoc(
  vehicleId: string,
  formData: FormData
) {
  await guard(vehicleId);
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) return;
  if (file.size > MAX_PLAN_BYTES) return;
  if (!isAcceptedUploadType(file.type)) return;

  const bytes = Buffer.from(await file.arrayBuffer());
  await prisma.vehicleServicePlanDoc.create({
    data: {
      vehicleId,
      data: bytes,
      mimeType: file.type,
      fileName: file.name || null,
    },
  });
  refresh(vehicleId);
}

/** Supprime une page du plan d'entretien. */
export async function deleteServicePlanDoc(vehicleId: string, docId: string) {
  await guard(vehicleId);
  await prisma.vehicleServicePlanDoc.deleteMany({
    where: { id: docId, vehicleId },
  });
  refresh(vehicleId);
}

/** Analyse TOUTES les pages ensemble et stocke les intervalles agrégés. */
export async function analyzeServicePlan(
  vehicleId: string,
  _prev: ServicePlanState,
  _formData: FormData
): Promise<ServicePlanState> {
  if (!SERVICE_PLAN_AI_ENABLED) {
    return { error: "L'analyse IA n'est pas configurée sur ce serveur." };
  }
  await guard(vehicleId);

  const docs = await prisma.vehicleServicePlanDoc.findMany({
    where: { vehicleId },
    orderBy: { createdAt: "asc" },
  });
  if (docs.length === 0) {
    return { error: "Aucune page de plan d'entretien à analyser." };
  }

  let items: ServicePlanItem[];
  try {
    items = await extractServicePlan(
      docs.map((d) => ({ data: Buffer.from(d.data), mimeType: d.mimeType }))
    );
  } catch (e) {
    const detail = e instanceof Error ? e.message : String(e);
    console.error("Analyse plan d'entretien échouée:", detail);
    return { error: `L'analyse a échoué : ${detail.slice(0, 300)}` };
  }

  await prisma.vehicle.update({
    where: { id: vehicleId },
    data: { servicePlanIntervals: JSON.stringify(items) },
  });
  refresh(vehicleId);

  if (items.length === 0) {
    return { error: "Aucune ligne d'entretien détectée sur les pages." };
  }
  return {
    items,
    message: `${items.length} ligne(s) d'entretien détectée(s) sur ${docs.length} page(s).`,
  };
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
