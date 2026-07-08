"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { after } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser, assertCanWrite } from "@/lib/auth";
import { assertVehicleAccess, currentMileage } from "@/lib/vehicles";
import { getVehiclePerms } from "@/lib/perms";
import { runObdDiagnosis, OBD_AI_ENABLED } from "@/lib/obd-diagnosis";
import { runResetProcedure, OBD_RESET_AI_ENABLED } from "@/lib/obd-reset";
import {
  researchVehicleKnowledge,
  VEHICLE_KNOWLEDGE_AI_ENABLED,
} from "@/lib/vehicle-knowledge";
import type {
  ObdDiagnosis,
  ObdSnapshot,
} from "@/lib/obd-diagnosis-fields";
import type { ResetProcedure } from "@/lib/obd-reset-fields";
import {
  VehicleKnowledgeSchema,
  knowledgeKey,
  type VehicleKnowledge,
} from "@/lib/vehicle-knowledge-fields";

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

  // On réutilise la base de connaissances du modèle (pannes fréquentes déjà
  // recensées) pour affiner le diagnostic, si elle existe en cache.
  let knowledgeContext: string | null = null;
  const key = knowledgeKey(vehicle.make, vehicle.model, vehicle.year);
  if (key) {
    const cached = await prisma.vehicleKnowledge.findUnique({ where: { key } });
    const knowledge = cached ? parseKnowledge(cached.data) : null;
    if (knowledge && knowledge.commonFaults.length) {
      knowledgeContext = knowledge.commonFaults
        .map(
          (f) =>
            `- ${[f.code, f.title].filter(Boolean).join(" ")} : ${f.description}`
        )
        .join("\n");
    }
  }

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
      snapshot,
      knowledgeContext
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

// Fraîcheur du cache : au-delà, on rafraîchit à la connexion.
const KNOWLEDGE_TTL_MS = 90 * 24 * 60 * 60 * 1000; // 90 jours

/** Parse le JSON stocké en base de connaissances de façon tolérante. */
function parseKnowledge(data: string): VehicleKnowledge | null {
  try {
    const r = VehicleKnowledgeSchema.safeParse(JSON.parse(data));
    return r.success ? r.data : null;
  } catch {
    return null;
  }
}

/** Statut renvoyé par le sondage (polling) de la base de connaissances. */
export type VehicleKnowledgePollState =
  | {
      status: "pending" | "ready" | "error" | "none" | "unavailable";
      knowledge?: VehicleKnowledge;
      updatedAt?: string;
      error?: string;
    }
  | undefined;

/**
 * Lecture SEULE de la base de connaissances (rapide) — utilisée par le sondage
 * côté client pendant que la recherche tourne en tâche de fond.
 */
export async function getVehicleKnowledge(
  vehicleId: string
): Promise<VehicleKnowledgePollState> {
  const user = await requireUser();
  const vehicle = await assertVehicleAccess(user.id, vehicleId);
  if (!vehicle) return { status: "error", error: "Véhicule introuvable." };

  const key = knowledgeKey(vehicle.make, vehicle.model, vehicle.year);
  if (!key) return { status: "none" };

  const row = await prisma.vehicleKnowledge.findUnique({ where: { key } });
  if (!row) return { status: "none" };

  const status = (row.status as "pending" | "ready" | "error") ?? "ready";
  const knowledge = parseKnowledge(row.data) ?? undefined;
  return {
    status,
    knowledge,
    updatedAt: row.updatedAt.toISOString(),
    error: row.error ?? undefined,
  };
}

/**
 * Lance (en tâche de fond, via `after`) la recherche IA de la base de
 * connaissances, puis renvoie IMMÉDIATEMENT — le client sonde ensuite le
 * résultat via getVehicleKnowledge. Évite les longues requêtes synchrones qui
 * dépassent les délais du proxy (« Failed to fetch »). Si un cache frais existe
 * et que force est faux, renvoie directement le cache sans relancer.
 */
export async function startVehicleKnowledgeResearch(
  vehicleId: string,
  force = false
): Promise<VehicleKnowledgePollState> {
  const user = await requireUser();
  const vehicle = await assertVehicleAccess(user.id, vehicleId);
  if (!vehicle) return { status: "error", error: "Véhicule introuvable." };

  const key = knowledgeKey(vehicle.make, vehicle.model, vehicle.year);
  if (!key) {
    return {
      status: "none",
      error:
        "Renseigne la marque, le modèle et l'année du véhicule pour construire la base de connaissances.",
    };
  }

  if (!VEHICLE_KNOWLEDGE_AI_ENABLED) {
    const row = await prisma.vehicleKnowledge.findUnique({ where: { key } });
    const knowledge = row ? parseKnowledge(row.data) ?? undefined : undefined;
    if (knowledge)
      return { status: "ready", knowledge, updatedAt: row!.updatedAt.toISOString() };
    return {
      status: "unavailable",
      error: "La recherche IA n'est pas configurée sur ce serveur.",
    };
  }

  const existing = await prisma.vehicleKnowledge.findUnique({ where: { key } });

  // Cache frais et prêt → on le renvoie directement.
  if (existing && !force && existing.status === "ready") {
    const fresh = Date.now() - existing.updatedAt.getTime() < KNOWLEDGE_TTL_MS;
    const knowledge = parseKnowledge(existing.data);
    if (fresh && knowledge) {
      return {
        status: "ready",
        knowledge,
        updatedAt: existing.updatedAt.toISOString(),
      };
    }
  }

  // Une recherche récente est déjà en cours → on ne la relance pas.
  if (
    existing &&
    existing.status === "pending" &&
    Date.now() - existing.updatedAt.getTime() < 5 * 60 * 1000
  ) {
    return { status: "pending", updatedAt: existing.updatedAt.toISOString() };
  }

  // Marque la recherche « en cours » (conserve les données existantes).
  await prisma.vehicleKnowledge.upsert({
    where: { key },
    create: {
      key,
      make: vehicle.make,
      model: vehicle.model,
      year: vehicle.year,
      data: "",
      status: "pending",
    },
    update: { status: "pending", error: null },
  });

  const info = {
    make: vehicle.make,
    model: vehicle.model,
    year: vehicle.year,
    fuelType: vehicle.fuelType,
    vin: vehicle.vin,
  };

  // Recherche exécutée APRÈS l'envoi de la réponse (serveur long-running).
  after(async () => {
    try {
      const knowledge = await researchVehicleKnowledge(info);
      await prisma.vehicleKnowledge.update({
        where: { key },
        data: { data: JSON.stringify(knowledge), status: "ready", error: null },
      });
    } catch (e) {
      const detail = e instanceof Error ? e.message : String(e);
      console.error("Recherche base de connaissances échouée:", detail);
      await prisma.vehicleKnowledge
        .update({
          where: { key },
          data: { status: "error", error: detail.slice(0, 300) },
        })
        .catch(() => {});
    }
  });

  return { status: "pending" };
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
