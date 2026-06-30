// Plan d'entretien extrait du carnet constructeur. Module client-safe (pas de
// "server-only") : utilisé par l'UI et le serveur.
import { z } from "zod";

export const ServicePlanItemSchema = z.object({
  label: z.string().min(1),
  km: z.coerce.number().int().nullable().catch(null),
  months: z.coerce.number().int().nullable().catch(null),
  note: z.string().nullable().catch(null),
});

export const ServicePlanSchema = z.array(ServicePlanItemSchema);

export type ServicePlanItem = z.infer<typeof ServicePlanItemSchema>;

/** Parse le JSON stocké en liste validée (vide si invalide). */
export function parseServicePlan(json: string | null | undefined): ServicePlanItem[] {
  if (!json) return [];
  try {
    const result = ServicePlanSchema.safeParse(JSON.parse(json));
    return result.success ? result.data.filter((i) => i.label.trim()) : [];
  } catch {
    return [];
  }
}

/** Libellé lisible de la périodicité d'une ligne de plan. */
export function formatPlanInterval(
  item: ServicePlanItem,
  unit?: string | null
): string {
  const u = unit === "HOURS" ? "h" : "km";
  const parts: string[] = [];
  if (item.km != null) parts.push(`${item.km.toLocaleString("fr-FR")} ${u}`);
  if (item.months != null) {
    parts.push(
      item.months % 12 === 0
        ? `${item.months / 12} an${item.months / 12 > 1 ? "s" : ""}`
        : `${item.months} mois`
    );
  }
  let label = parts.length ? `tous les ${parts.join(" ou ")}` : "—";
  if (item.note) label += ` (${item.note})`;
  return label;
}
