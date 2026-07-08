import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import {
  ResetProcedureSchema,
  type ResetProcedure,
} from "@/lib/obd-reset-fields";

/** La recherche IA n'est dispo que si une clé API Anthropic existe. */
export const OBD_RESET_AI_ENABLED = !!process.env.ANTHROPIC_API_KEY;

type VehicleInfo = {
  name: string;
  make: string | null;
  model: string | null;
  year: number | null;
};

function extractJsonObject(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    const start = text.indexOf("{");
    const end = text.lastIndexOf("}");
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
 * Recherche sur le web (via l'outil de recherche de Claude) la procédure de
 * réinitialisation de l'indicateur d'entretien après une vidange, à partir du
 * VIN et des infos véhicule. Renvoie une procédure structurée avec sources.
 */
export async function runResetProcedure(
  vin: string,
  vehicle: VehicleInfo
): Promise<ResetProcedure> {
  if (!OBD_RESET_AI_ENABLED) {
    throw new Error("Recherche IA non configurée (clé API manquante).");
  }

  const vehicleTxt = [
    vehicle.make,
    vehicle.model,
    vehicle.year ? String(vehicle.year) : null,
  ]
    .filter(Boolean)
    .join(" ");

  const prompt = `Tu es un mécanicien automobile. À partir du numéro VIN et des informations véhicule, recherche sur le web la procédure OFFICIELLE (ou largement documentée) de RÉINITIALISATION de l'indicateur d'entretien / voyant de vidange après un entretien.

VIN : ${vin}
VÉHICULE (indicatif) : ${vehicleTxt || vehicle.name}

Décode d'abord le VIN pour confirmer marque, modèle et année, puis cherche la procédure de remise à zéro du rappel d'entretien (« reset service light / oil reset ») propre à ce véhicule.

Réponds UNIQUEMENT avec un objet JSON (pas de texte autour, pas de markdown) :
{
  "found": true,
  "vehicle": "marque modèle (années) identifié via le VIN",
  "resets": "ce que la procédure réinitialise (ex. voyant vidange / rappel d'entretien)",
  "steps": ["étape 1", "étape 2", ...],
  "caution": "précautions éventuelles",
  "sources": [ { "title": "titre de la source", "url": "https://..." } ]
}

Si tu ne trouves pas de procédure fiable pour ce véhicule précis, mets "found": false et explique brièvement dans "caution". Écris en français. Rappelle que c'est indicatif et de se référer au carnet constructeur.`;

  const client = new Anthropic();
  const message = await client.messages.create({
    model: "claude-opus-4-8",
    max_tokens: 3000,
    tools: [{ type: "web_search_20260209", name: "web_search", max_uses: 5 }],
    messages: [{ role: "user", content: prompt }],
  });

  const text = message.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("")
    .trim();

  const parsed = extractJsonObject(text);
  const result = ResetProcedureSchema.safeParse(parsed);
  if (!result.success) {
    return {
      found: false,
      vehicle: vehicleTxt || vehicle.name,
      resets: "",
      steps: [],
      caution:
        text.slice(0, 500) ||
        "Aucune procédure fiable trouvée. Réfère-toi au carnet d'entretien constructeur.",
      sources: [],
    };
  }
  return result.data;
}
