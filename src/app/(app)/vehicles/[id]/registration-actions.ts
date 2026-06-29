"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { FuelType } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireUser, assertCanWrite } from "@/lib/auth";
import { assertVehicleAccess } from "@/lib/vehicles";
import { getVehiclePerms } from "@/lib/perms";
import {
  extractCarteGrise,
  isAcceptedImageType,
  CARTE_GRISE_AI_ENABLED,
} from "@/lib/carte-grise";

const MAX_BYTES = 8 * 1024 * 1024; // 8 Mo

export type RegistrationState = { error?: string; message?: string } | undefined;

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
  if (!isAcceptedImageType(file.type)) return;

  const bytes = Buffer.from(await file.arrayBuffer());
  const data = {
    data: bytes,
    mimeType: file.type,
    fileName: file.name || null,
  };
  await prisma.vehicleRegistration.upsert({
    where: { vehicleId },
    create: { vehicleId, ...data },
    update: data,
  });
  refresh(vehicleId);
}

/** Supprime la photo de la carte grise. */
export async function deleteRegistration(vehicleId: string) {
  await guardManage(vehicleId);
  await prisma.vehicleRegistration.deleteMany({ where: { vehicleId } });
  refresh(vehicleId);
}

/**
 * Analyse la photo de la carte grise avec l'IA et pré-remplit les champs encore
 * vides du profil véhicule (n'écrase pas une valeur déjà saisie). Pensée pour
 * `useActionState` : `analyzeRegistration.bind(null, vehicleId)`.
 */
export async function analyzeRegistration(
  vehicleId: string,
  _prev: RegistrationState,
  _formData: FormData
): Promise<RegistrationState> {
  if (!CARTE_GRISE_AI_ENABLED) {
    return { error: "L'analyse IA n'est pas configurée sur ce serveur." };
  }
  const vehicle = await guardManage(vehicleId);

  const reg = await prisma.vehicleRegistration.findUnique({
    where: { vehicleId },
  });
  if (!reg) {
    return { error: "Aucune photo de carte grise à analyser." };
  }

  let fields;
  try {
    fields = await extractCarteGrise(Buffer.from(reg.data), reg.mimeType);
  } catch {
    return {
      error: "L'analyse a échoué. Réessayez avec une photo plus nette.",
    };
  }

  // On ne remplit que les champs encore vides (non destructif).
  const data: Record<string, unknown> = {};
  const filled: string[] = [];
  const setIfEmpty = (
    key: "make" | "model" | "plate" | "vin",
    value: string | null,
    label: string
  ) => {
    if (value && !vehicle[key]) {
      data[key] = value;
      filled.push(label);
    }
  };
  setIfEmpty("make", fields.make, "marque");
  setIfEmpty("model", fields.model, "modèle");
  setIfEmpty("plate", fields.plate, "immatriculation");
  setIfEmpty("vin", fields.vin, "VIN");
  if (fields.year && !vehicle.year) {
    data.year = fields.year;
    filled.push("année");
  }
  if (fields.fuelType && vehicle.fuelType === FuelType.GASOLINE) {
    // GASOLINE est la valeur par défaut : on la considère comme « non renseignée ».
    data.fuelType = fields.fuelType as FuelType;
    filled.push("carburant");
  }

  if (Object.keys(data).length === 0) {
    return {
      message:
        "Aucun nouveau champ détecté (les informations sont peut-être déjà renseignées).",
    };
  }

  await prisma.vehicle.update({ where: { id: vehicleId }, data });
  refresh(vehicleId);
  return { message: `Champs pré-remplis : ${filled.join(", ")}.` };
}
