// Extraction d'une facture d'entretien par IA. Module client-safe (utilisé pour
// pré-remplir le formulaire d'ajout d'entretien).
import { z } from "zod";

export const InvoiceExtractionSchema = z.object({
  // Date de l'intervention (AAAA-MM-JJ).
  date: z.string().nullable().catch(null),
  // Kilométrage relevé.
  mileage: z.coerce.number().int().nullable().catch(null),
  // Coût TTC.
  cost: z.coerce.number().nullable().catch(null),
  // Garage / prestataire.
  serviceName: z.string().nullable().catch(null),
  // Résumé libre (ex. "Vidange + filtre à huile + filtre habitacle").
  title: z.string().nullable().catch(null),
  // Types d'entretien détectés (valeurs de l'enum MaintenanceType).
  types: z.array(z.string()).catch([]),
});

export type InvoiceExtraction = z.infer<typeof InvoiceExtractionSchema>;
