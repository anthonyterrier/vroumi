// Extraction IA des infos d'huile moteur depuis une photo (facture ou bidon).
// Module client-safe (schéma + type partagés).
import { z } from "zod";

export const OilExtractionSchema = z.object({
  brand: z.string().catch(""), // marque / référence commerciale
  viscosity: z.string().catch(""), // ex. 5W30, 0W20
  norm: z.string().catch(""), // homologations / normes (VW 504 00, ACEA C3…)
  quantity: z.string().catch(""), // ex. 5 L
});

export type OilExtraction = z.infer<typeof OilExtractionSchema>;
