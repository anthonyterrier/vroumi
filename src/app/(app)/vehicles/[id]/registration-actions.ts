"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { FuelType } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireUser, assertCanWrite } from "@/lib/auth";
import { assertVehicleAccess } from "@/lib/vehicles";
import { getVehiclePerms } from "@/lib/perms";
import { extractCarteGrise, CARTE_GRISE_AI_ENABLED } from "@/lib/carte-grise";
import {
  isAcceptedUploadType,
  parseStoredExtraction,
  CARTE_GRISE_FIELDS,
  type CarteGriseFields,
  type CarteGriseFieldKey,
} from "@/lib/carte-grise-fields";

const MAX_BYTES = 8 * 1024 * 1024; // 8 Mo

export type RegistrationState =
  | { error?: string; message?: string; fields?: CarteGriseFields }
  | undefined;

/**
 * Garde : session valide, application non en lecture seule, accès au véhicule,
 * ET droit `registrationManage` (par défaut réservé au propriétaire).
 */
async function guardManage(vehicleId: string) {
  const user = await requireUser();
  await assertCanWrite();
  const vehicle = await assertVehicleAccess(user.id, vehicleId);
  if (!vehicle) redirect("/dashboard");
  const perms = await getVehiclePerms(user.id, vehicleId);
  if (!perms.registrationManage) redirect(`/vehicles/${vehicleId}`);
  return vehicle;
}

function refresh(vehicleId: string) {
  revalidatePath(`/vehicles/${vehicleId}/edit`);
}

/** Envoie (ou remplace) la photo de la carte grise. */
export async function uploadRegistration(
  vehicleId: string,
  formData: FormData
) {
  await guardManage(vehicleId);

  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) return;
  if (file.size > MAX_BYTES) return;
  if (!isAcceptedUploadType(file.type)) return;

  const bytes = Buffer.from(await file.arrayBuffer());
  await prisma.vehicleRegistration.upsert({
    where: { vehicleId },
    create: {
      vehicleId,
      data: bytes,
      mimeType: file.type,
      fileName: file.name || null,
    },
    // Nouvelle photo → l'ancienne analyse n'est plus pertinente.
    update: {
      data: bytes,
      mimeType: file.type,
      fileName: file.name || null,
      extracted: null,
      extractedAt: null,
    },
  });
  refresh(vehicleId);
}

/** Supprime la photo de la carte grise (et son analyse). */
export async function deleteRegistration(vehicleId: string) {
  await guardManage(vehicleId);
  await prisma.vehicleRegistration.deleteMany({ where: { vehicleId } });
  refresh(vehicleId);
}

/**
 * Analyse la photo avec l'IA, conserve le résultat (JSON) et le renvoie pour
 * affichage. N'applique RIEN au profil — l'utilisateur valide ensuite champ par
 * champ via applyRegistrationFields. Pensée pour `useActionState` :
 * `analyzeRegistration.bind(null, vehicleId)`.
 */
export async function analyzeRegistration(
  vehicleId: string,
  _prev: RegistrationState,
  _formData: FormData
): Promise<RegistrationState> {
  if (!CARTE_GRISE_AI_ENABLED) {
    return { error: "L'analyse IA n'est pas configurée sur ce serveur." };
  }
  await guardManage(vehicleId);

  const reg = await prisma.vehicleRegistration.findUnique({
    where: { vehicleId },
  });
  if (!reg) {
    return { error: "Aucune photo de carte grise à analyser." };
  }

  let fields: CarteGriseFields;
  try {
    fields = await extractCarteGrise(Buffer.from(reg.data), reg.mimeType);
  } catch {
    return { error: "L'analyse a échoué. Réessayez avec une photo plus nette." };
  }

  await prisma.vehicleRegistration.update({
    where: { vehicleId },
    data: { extracted: JSON.stringify(fields), extractedAt: new Date() },
  });
  refresh(vehicleId);

  const count = CARTE_GRISE_FIELDS.filter(
    (f) => fields[f.key] != null
  ).length;
  if (count === 0) {
    return {
      fields,
      error: "Aucune information exploitable n'a été détectée sur la photo.",
    };
  }
  return {
    fields,
    message: `${count} champ(s) détecté(s). Cochez ceux à appliquer au profil.`,
  };
}

/**
 * Applique au profil les champs cochés dans l'aperçu. Les valeurs proviennent de
 * la dernière analyse stockée (on ne fait pas confiance aux valeurs du client) ;
 * le formulaire n'envoie que la liste des clés cochées (`apply`).
 */
export async function applyRegistrationFields(
  vehicleId: string,
  formData: FormData
) {
  await guardManage(vehicleId);

  const reg = await prisma.vehicleRegistration.findUnique({
    where: { vehicleId },
    select: { extracted: true },
  });
  const fields = parseStoredExtraction(reg?.extracted);
  if (!fields) redirect(`/vehicles/${vehicleId}/edit`);

  const selected = new Set(formData.getAll("apply").map(String));
  const data: Record<string, unknown> = {};

  for (const field of CARTE_GRISE_FIELDS) {
    if (!selected.has(field.key)) continue;
    const value = fields[field.key as CarteGriseFieldKey];
    if (value == null) continue;

    if (field.type === "int") {
      const n = typeof value === "number" ? value : parseInt(String(value), 10);
      if (!Number.isNaN(n)) data[field.key] = n;
    } else if (field.type === "date") {
      const d = new Date(String(value));
      if (!Number.isNaN(d.getTime())) data[field.key] = d;
    } else if (field.type === "fuel") {
      if ((Object.values(FuelType) as string[]).includes(String(value))) {
        data[field.key] = value as FuelType;
      }
    } else {
      data[field.key] = String(value);
    }
  }

  if (Object.keys(data).length > 0) {
    await prisma.vehicle.update({ where: { id: vehicleId }, data });
  }
  refresh(vehicleId);
  redirect(`/vehicles/${vehicleId}/edit`);
}
