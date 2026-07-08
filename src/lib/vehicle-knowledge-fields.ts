// Base de connaissances véhicule construite par l'IA. Module client-safe
// (types + schéma partagés serveur/client).
import { z } from "zod";

export const VehicleKnowledgeSchema = z.object({
  // Modèle identifié (marque, modèle, motorisation, années).
  vehicle: z.string().catch(""),
  // Synthèse en quelques phrases.
  summary: z.string().catch(""),
  // Pannes / défauts fréquents de ce modèle.
  commonFaults: z
    .array(
      z.object({
        code: z.string().catch(""),
        title: z.string().catch(""),
        description: z.string().catch(""),
      })
    )
    .catch([]),
  // Commandes OBD spécifiques constructeur (mode 22, etc.), ex. lecture du
  // kilométrage réel sur le combiné. Directement exécutables dans la console.
  obdCommands: z
    .array(
      z.object({
        command: z.string().catch(""),
        label: z.string().catch(""),
        description: z.string().catch(""),
      })
    )
    .catch([]),
  // Procédures de réinitialisation / entretien.
  resetProcedures: z
    .array(
      z.object({
        title: z.string().catch(""),
        steps: z.array(z.string()).catch([]),
      })
    )
    .catch([]),
  // Astuces de diagnostic diverses.
  tips: z.array(z.string()).catch([]),
  // Sources web utilisées.
  sources: z
    .array(
      z.object({
        title: z.string().catch(""),
        url: z.string().catch(""),
      })
    )
    .catch([]),
});

export type VehicleKnowledge = z.infer<typeof VehicleKnowledgeSchema>;

/** Clé de cache normalisée (marque|modèle|année). */
export function knowledgeKey(
  make: string | null,
  model: string | null,
  year: number | null
): string | null {
  const parts = [make, model, year ? String(year) : null]
    .map((p) => (p ?? "").trim().toLowerCase())
    .filter(Boolean);
  // Il faut au moins la marque et le modèle pour une clé exploitable.
  return parts.length >= 2 ? parts.join("|") : null;
}
