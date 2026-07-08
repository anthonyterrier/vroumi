// Recherche IA d'une procédure de réinitialisation d'entretien à partir du VIN.
// Module client-safe (types + schéma partagés).
import { z } from "zod";

export const ResetProcedureSchema = z.object({
  // Vrai si une procédure fiable a pu être identifiée.
  found: z.boolean().catch(false),
  // Véhicule identifié à partir du VIN (marque, modèle, années).
  vehicle: z.string().catch(""),
  // Ce que la procédure réinitialise (voyant vidange / entretien, etc.).
  resets: z.string().catch(""),
  // Étapes numérotées à suivre.
  steps: z.array(z.string()).catch([]),
  // Précautions / avertissements.
  caution: z.string().catch(""),
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

export type ResetProcedure = z.infer<typeof ResetProcedureSchema>;
