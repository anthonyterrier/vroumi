import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import {
  ServicePlanSchema,
  type ServicePlanItem,
} from "@/lib/service-plan-fields";
import { isAcceptedImageType, isPdf } from "@/lib/carte-grise-fields";

/** L'analyse IA n'est disponible que si une clé API Anthropic est configurée. */
export const SERVICE_PLAN_AI_ENABLED = !!process.env.ANTHROPIC_API_KEY;

type ImageMediaType = "image/jpeg" | "image/png" | "image/webp";

const PROMPT = `Tu analyses la page « programme / plan d'entretien » du carnet d'entretien d'un véhicule (constructeur), fournie en image ou en PDF.
Liste CHAQUE opération d'entretien avec sa périodicité. Réponds UNIQUEMENT avec un tableau JSON (pas de texte, pas de markdown, pas de \`\`\`), où chaque élément est un objet :
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
 * Extrait les intervalles d'entretien d'une photo/PDF du carnet constructeur.
 * Lève si la clé API est absente.
 */
export async function extractServicePlan(
  file: Buffer,
  mimeType: string
): Promise<ServicePlanItem[]> {
  if (!SERVICE_PLAN_AI_ENABLED) {
    throw new Error("Analyse IA non configurée (clé API manquante).");
  }
  const data = file.toString("base64");
  const sourceBlock: Anthropic.ContentBlockParam = isPdf(mimeType)
    ? {
        type: "document",
        source: { type: "base64", media_type: "application/pdf", data },
      }
    : {
        type: "image",
        source: {
          type: "base64",
          media_type: isAcceptedImageType(mimeType)
            ? (mimeType as ImageMediaType)
            : "image/jpeg",
          data,
        },
      };

  const client = new Anthropic();
  const message = await client.messages.create({
    model: "claude-opus-4-8",
    max_tokens: 4096,
    messages: [
      { role: "user", content: [sourceBlock, { type: "text", text: PROMPT }] },
    ],
  });

  const text = message.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("")
    .trim();

  const parsed = extractJsonArray(text);
  if (!Array.isArray(parsed)) return [];
  const result = ServicePlanSchema.safeParse(parsed);
  return result.success ? result.data.filter((i) => i.label.trim()).slice(0, 60) : [];
}
