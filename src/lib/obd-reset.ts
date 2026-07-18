import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { AI_ENABLED, LOCAL_AI_ENABLED, aiComplete } from "@/lib/ai-client";
import {
  ResetProcedureSchema,
  type ResetProcedure,
} from "@/lib/obd-reset-fields";

/**
 * La recherche IA est dispo si un fournisseur existe (IA locale OU Claude).
 * Avec Claude : vraie recherche web (sources à l'appui). Avec l'IA locale :
 * réponse issue des connaissances du modèle (hors-ligne, sans sources web).
 */
export const OBD_RESET_AI_ENABLED = AI_ENABLED;

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

function buildPrompt(vin: string, vehicleTxt: string): string {
  const sourceIntro = LOCAL_AI_ENABLED
    ? "Tu es un mécanicien automobile. Tu n'as PAS d'accès à Internet : appuie-toi sur tes connaissances pour donner la procédure de RÉINITIALISATION de l'indicateur d'entretien / voyant de vidange après un entretien."
    : "Tu es un mécanicien automobile. À partir du numéro VIN et des informations véhicule, recherche sur le web la procédure OFFICIELLE (ou largement documentée) de RÉINITIALISATION de l'indicateur d'entretien / voyant de vidange après un entretien.";

  const sourcesRule = LOCAL_AI_ENABLED
    ? "Comme tu n'as pas d'accès web, laisse \"sources\" vide. Si tu n'es pas certain de la procédure pour ce véhicule précis, mets \"found\": false."
    : "Renseigne \"sources\" avec les pages réellement consultées. Si tu ne trouves pas de procédure fiable pour ce véhicule précis, mets \"found\": false et explique brièvement dans \"caution\".";

  return `${sourceIntro}

VIN : ${vin}
VÉHICULE (indicatif) : ${vehicleTxt}

Décode d'abord le VIN pour confirmer marque, modèle et année, puis donne la procédure de remise à zéro du rappel d'entretien (« reset service light / oil reset ») propre à ce véhicule.

Réponds UNIQUEMENT avec un objet JSON (pas de texte autour, pas de markdown) :
{
  "found": true,
  "vehicle": "marque modèle (années) identifié via le VIN",
  "resets": "ce que la procédure réinitialise (ex. voyant vidange / rappel d'entretien)",
  "steps": ["étape 1", "étape 2", ...],
  "caution": "précautions éventuelles",
  "sources": [ { "title": "titre de la source", "url": "https://..." } ]
}

${sourcesRule} Écris en français. Rappelle que c'est indicatif et de se référer au carnet constructeur.`;
}

// Recherche web via Claude (outil web_search) — sources réelles à l'appui.
async function resetWithClaude(prompt: string): Promise<string> {
  const client = new Anthropic();
  const message = await client.messages.create({
    model: "claude-haiku-4-5",
    max_tokens: 3000,
    tools: [{ type: "web_search_20250305", name: "web_search", max_uses: 5 }],
    messages: [{ role: "user", content: prompt }],
  });
  return message.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("")
    .trim();
}

/**
 * Donne la procédure de réinitialisation de l'indicateur d'entretien après une
 * vidange, à partir du VIN et des infos véhicule.
 *
 * - Avec une IA locale configurée : réponse issue des connaissances du modèle
 *   (hors-ligne, gratuit, sans sources web).
 * - Sinon : recherche web via Claude (sources à l'appui).
 */
export async function runResetProcedure(
  vin: string,
  vehicle: VehicleInfo
): Promise<ResetProcedure> {
  if (!OBD_RESET_AI_ENABLED) {
    throw new Error("Recherche IA non configurée (aucun fournisseur).");
  }

  const vehicleTxt = [
    vehicle.make,
    vehicle.model,
    vehicle.year ? String(vehicle.year) : null,
  ]
    .filter(Boolean)
    .join(" ");

  const prompt = buildPrompt(vin, vehicleTxt || vehicle.name);

  // IA locale : complétion texte simple (pas d'outil web). Sinon : Claude web.
  const text = LOCAL_AI_ENABLED
    ? await aiComplete({ prompt, maxTokens: 3000 })
    : await resetWithClaude(prompt);

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
