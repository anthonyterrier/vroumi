import "server-only";
import { aiComplete, AI_ENABLED } from "@/lib/ai-client";
import {
  ServicePlanSchema,
  type ServicePlanItem,
} from "@/lib/service-plan-fields";

/** L'analyse IA n'est disponible que si un fournisseur (local ou Claude) existe. */
export const SERVICE_PLAN_AI_ENABLED = AI_ENABLED;

const PROMPT = `Tu analyses le « programme / plan d'entretien » du carnet d'entretien d'un véhicule (constructeur), fourni sur une ou PLUSIEURS pages (images ou PDF). Considère l'ensemble des pages comme un seul document.
Liste CHAQUE opération d'entretien avec sa périodicité, en fusionnant les pages et sans doublon. Réponds UNIQUEMENT avec un tableau JSON (pas de texte, pas de markdown, pas de \`\`\`), où chaque élément est un objet :
- "label" : nom de l'opération (ex. "Vidange huile moteur", "Courroie de distribution", "Plaquettes de frein", "Filtre habitacle"…).
- "km" : intervalle kilométrique en kilomètres (entier) ou null si non précisé.
- "months" : intervalle en mois (entier) ou null si non précisé. Convertis les durées en mois (2 ans → 24).
- "note" : précision éventuelle (ex. "au premier des deux termes", "conduite sévère", "selon usage") ou null.
Inclus toutes les lignes lisibles. N'invente aucune valeur ; mets null en cas de doute.`;

function extractJsonArray(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    const start = text.indexOf("[");
    const end = text.lastIndexOf("]");
    if (start !== -1 && end > start) {
      try {
        return JSON.parse(text.slice(start, end + 1));
      } catch {
        return null;
      }
    }
    return null;
  }
}

/**
 * Extrait les intervalles d'entretien d'une ou plusieurs pages/photos du carnet
 * constructeur (analysées ensemble). Lève si la clé API est absente.
 */
export async function extractServicePlan(
  docs: { data: Buffer; mimeType: string }[]
): Promise<ServicePlanItem[]> {
  if (!SERVICE_PLAN_AI_ENABLED) {
    throw new Error("Analyse IA non configurée (clé API manquante).");
  }
  if (docs.length === 0) return [];

  const text = await aiComplete({
    prompt: PROMPT,
    files: docs.map((d) => ({ buffer: d.data, mimeType: d.mimeType })),
    maxTokens: 4096,
  });

  const parsed = extractJsonArray(text);
  if (!Array.isArray(parsed)) return [];
  const result = ServicePlanSchema.safeParse(parsed);
  return result.success ? result.data.filter((i) => i.label.trim()).slice(0, 60) : [];
}
