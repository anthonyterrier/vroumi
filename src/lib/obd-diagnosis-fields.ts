// Aide au diagnostic OBD par IA. Module client-safe (types + schéma partagés).
import { z } from "zod";

export const ObdDiagnosisSchema = z.object({
  // Synthèse en une ou deux phrases.
  summary: z.string().catch(""),
  // Gravité globale estimée.
  severity: z.enum(["info", "attention", "urgent"]).catch("info"),
  // Causes probables, de la plus à la moins vraisemblable.
  causes: z
    .array(
      z.object({
        title: z.string(),
        likelihood: z.enum(["élevée", "moyenne", "faible"]).catch("moyenne"),
        // Vérifications / tests concrets à mener.
        checks: z.array(z.string()).catch([]),
      })
    )
    .catch([]),
  // Conseils et prochaines étapes.
  advice: z.string().catch(""),
});

export type ObdDiagnosis = z.infer<typeof ObdDiagnosisSchema>;

/** Instantané envoyé à l'IA pour analyse (construit côté client). */
export type ObdSnapshot = {
  codes: { code: string; description: string; pending?: boolean }[];
  live: { label: string; value: number; unit: string }[];
  freeze: { label: string; value: number; unit: string }[];
  monitors: { label: string; complete: boolean }[];
  milOn: boolean;
  protocol: string | null;
  voltage: number | null;
};

export const SEVERITY_STYLE: Record<string, string> = {
  info: "bg-blue-100 text-blue-800 border-blue-200",
  attention: "bg-amber-100 text-amber-800 border-amber-200",
  urgent: "bg-red-100 text-red-800 border-red-200",
};

export const LIKELIHOOD_STYLE: Record<string, string> = {
  élevée: "bg-red-100 text-red-800",
  moyenne: "bg-amber-100 text-amber-800",
  faible: "bg-gray-100 text-gray-600",
};
