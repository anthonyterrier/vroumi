// Contrôle technique : libellés, styles et schéma d'extraction IA. Module
// client-safe (pas de "server-only") : utilisé par l'UI et le serveur.
import { z } from "zod";

export const INSPECTION_RESULT_LABELS: Record<string, string> = {
  FAVORABLE: "Favorable",
  CONTRE_VISITE: "Contre-visite (défaillances majeures)",
  DEFAVORABLE: "Défavorable (défaillances critiques)",
  INCONNU: "Inconnu",
};

export const INSPECTION_RESULT_STYLE: Record<string, string> = {
  FAVORABLE: "bg-green-100 text-green-800 border-green-200",
  CONTRE_VISITE: "bg-amber-100 text-amber-800 border-amber-200",
  DEFAVORABLE: "bg-red-100 text-red-800 border-red-200",
  INCONNU: "bg-gray-100 text-gray-600 border-gray-200",
};

export const DEFECT_SEVERITY_LABELS: Record<string, string> = {
  MINEURE: "Mineure",
  MAJEURE: "Majeure",
  CRITIQUE: "Critique",
  INCONNUE: "Non précisée",
};

export const DEFECT_SEVERITY_STYLE: Record<string, string> = {
  MINEURE: "bg-blue-100 text-blue-800 border-blue-200",
  MAJEURE: "bg-amber-100 text-amber-800 border-amber-200",
  CRITIQUE: "bg-red-100 text-red-800 border-red-200",
  INCONNUE: "bg-gray-100 text-gray-600 border-gray-200",
};

// Ordre de gravité décroissant (pour trier / résumer).
export const DEFECT_SEVERITY_ORDER: Record<string, number> = {
  CRITIQUE: 0,
  MAJEURE: 1,
  MINEURE: 2,
  INCONNUE: 3,
};

const RESULTS = ["FAVORABLE", "CONTRE_VISITE", "DEFAVORABLE", "INCONNU"] as const;
const SEVERITIES = ["MINEURE", "MAJEURE", "CRITIQUE", "INCONNUE"] as const;

/** Schéma d'un point/défaillance extrait par l'IA. */
export const InspectionDefectSchema = z.object({
  severity: z
    .enum(SEVERITIES)
    .nullable()
    .catch(null),
  code: z.string().nullable().catch(null),
  description: z.string().min(1),
});

/** Schéma du compte rendu de contrôle technique extrait par l'IA. */
export const InspectionExtractionSchema = z.object({
  date: z.string().nullable().catch(null),
  result: z.enum(RESULTS).nullable().catch(null),
  mileage: z.coerce.number().int().nullable().catch(null),
  center: z.string().nullable().catch(null),
  nextDueDate: z.string().nullable().catch(null),
  defects: z.array(InspectionDefectSchema).catch([]),
});

export type InspectionExtraction = z.infer<typeof InspectionExtractionSchema>;
export type InspectionDefectInput = z.infer<typeof InspectionDefectSchema>;

/** Normalise une gravité de formulaire/IA en valeur d'enum Prisma. */
export function normalizeSeverity(value: string | null | undefined): string {
  const v = (value ?? "").toUpperCase();
  return (SEVERITIES as readonly string[]).includes(v) ? v : "INCONNUE";
}

/** Normalise un résultat de formulaire/IA en valeur d'enum Prisma. */
export function normalizeResult(value: string | null | undefined): string {
  const v = (value ?? "").toUpperCase();
  return (RESULTS as readonly string[]).includes(v) ? v : "INCONNU";
}

/** Périodicité par défaut du contrôle technique (mois). */
export const DEFAULT_INSPECTION_INTERVAL_MONTHS = 24;

/** Choix de périodicité de contrôle technique proposés sur la fiche véhicule. */
export const INSPECTION_INTERVAL_OPTIONS: { months: number; label: string }[] = [
  { months: 24, label: "Standard — tous les 2 ans (voiture, utilitaire ≤ 3,5 t)" },
  {
    months: 12,
    label: "Annuel — tous les ans (taxi, VTC, ambulance, auto-école, location)",
  },
  { months: 60, label: "Collection — tous les 5 ans (véhicule de collection)" },
];

/**
 * Calcule la date du prochain passage à partir du résultat, de la date du
 * contrôle et de la périodicité du véhicule (règles françaises) :
 * - Favorable → prochain contrôle dans `intervalMonths` (24 par défaut).
 * - Contre-visite (majeures) ou défavorable (critiques) → contre-visite à
 *   effectuer sous 2 mois (indépendant de la périodicité).
 * - Résultat inconnu → non calculé (null).
 */
export function computeNextInspectionDue(
  performedAt: Date,
  result: string,
  intervalMonths: number | null | undefined = DEFAULT_INSPECTION_INTERVAL_MONTHS
): Date | null {
  const d = new Date(performedAt);
  switch (normalizeResult(result)) {
    case "FAVORABLE":
      d.setMonth(
        d.getMonth() + (intervalMonths || DEFAULT_INSPECTION_INTERVAL_MONTHS)
      );
      return d;
    case "CONTRE_VISITE":
    case "DEFAVORABLE":
      d.setMonth(d.getMonth() + 2);
      return d;
    default:
      return null;
  }
}
