import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { AI_ENABLED, LOCAL_AI_ENABLED, aiComplete } from "@/lib/ai-client";
import {
  VehicleKnowledgeSchema,
  type VehicleKnowledge,
} from "@/lib/vehicle-knowledge-fields";

/**
 * La recherche IA est dispo si un fournisseur existe (IA locale OU Claude).
 * Avec Claude : vraie recherche web (sources à l'appui). Avec l'IA locale :
 * réponse issue des connaissances du modèle (hors-ligne, sans sources web).
 */
export const VEHICLE_KNOWLEDGE_AI_ENABLED = AI_ENABLED;

type VehicleInfo = {
  make: string | null;
  model: string | null;
  year: number | null;
  fuelType: string;
  vin: string | null;
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

function buildPrompt(vehicleTxt: string, vin: string | null, fuelType: string): string {
  // Consigne de sourcing selon le fournisseur : Claude recherche sur le web,
  // l'IA locale s'appuie sur ses connaissances (pas d'accès web).
  const sourceIntro = LOCAL_AI_ENABLED
    ? "Tu es un expert en diagnostic automobile et en OBD-II / protocoles constructeur. Tu n'as PAS d'accès à Internet : appuie-toi uniquement sur tes connaissances techniques pour construire une base de connaissances réutilisable pour ce véhicule."
    : "Tu es un expert en diagnostic automobile et en OBD-II / protocoles constructeur. Recherche sur le web les informations de diagnostic utiles pour ce véhicule et construis une base de connaissances réutilisable.";

  const commandsRule = LOCAL_AI_ENABLED
    ? "N'invente PAS de commandes : ne mets dans obdCommands que des commandes constructeur dont tu es réellement certain pour ce modèle (laisse la liste vide en cas de doute — mieux vaut vide qu'inexact)."
    : "N'invente PAS de commandes : ne mets dans obdCommands que ce qui est réellement documenté pour ce modèle (laisse la liste vide sinon).";

  const sourcesRule = LOCAL_AI_ENABLED
    ? "Comme tu n'as pas d'accès web, laisse \"sources\" vide."
    : "Renseigne \"sources\" avec les pages web réellement consultées.";

  return `${sourceIntro}

VÉHICULE : ${vehicleTxt || "inconnu"} — carburant ${fuelType}${
    vin ? `\nVIN : ${vin}` : ""
  }

Cherche notamment :
- les PANNES et défauts FRÉQUENTS de ce modèle (avec code OBD si pertinent) ;
- les COMMANDES OBD SPÉCIFIQUES au constructeur (mode 22 UDS et adressage ECU) réellement documentées pour ce modèle — en priorité comment LIRE LE KILOMÉTRAGE réel (combiné d'instruments), et autres relevés non exposés par l'OBD générique. Donne la commande exacte à envoyer (ex. « 22F40C ») ;
- les PROCÉDURES de réinitialisation d'entretien ;
- des ASTUCES de diagnostic.

Réponds UNIQUEMENT avec un objet JSON (pas de texte autour, pas de markdown) :
{
  "vehicle": "modèle identifié (marque modèle motorisation, années)",
  "summary": "synthèse en 1-3 phrases",
  "commonFaults": [ { "code": "P0xxx ou vide", "title": "…", "description": "…" } ],
  "obdCommands": [ { "command": "22F40C", "label": "Kilométrage combiné", "description": "à quoi ça sert / comment l'utiliser" } ],
  "resetProcedures": [ { "title": "…", "steps": ["…", "…"] } ],
  "tips": ["…"],
  "sources": [ { "title": "…", "url": "https://…" } ]
}

${commandsRule} ${sourcesRule} Écris en français. C'est indicatif et ne remplace pas la documentation constructeur.`;
}

// Recherche web via Claude (outil web_search) — sources réelles à l'appui.
async function researchWithClaude(prompt: string): Promise<string> {
  const client = new Anthropic();
  const message = await client.messages.create({
    model: "claude-haiku-4-5",
    max_tokens: 4000,
    tools: [{ type: "web_search_20250305", name: "web_search", max_uses: 6 }],
    messages: [{ role: "user", content: prompt }],
  });
  return message.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("")
    .trim();
}

/**
 * Construit une base de connaissances de diagnostic propre à un modèle : pannes
 * fréquentes, commandes OBD spécifiques constructeur (mode 22 — ex. lecture du
 * kilométrage réel), procédures de réinitialisation, astuces.
 *
 * - Avec une IA locale configurée : réponse issue des connaissances du modèle
 *   (hors-ligne, gratuit, sans sources web).
 * - Sinon : recherche web via Claude (sources à l'appui).
 *
 * Le résultat est mis en cache par l'appelant et enrichi au fil des connexions.
 */
export async function researchVehicleKnowledge(
  vehicle: VehicleInfo
): Promise<VehicleKnowledge> {
  if (!VEHICLE_KNOWLEDGE_AI_ENABLED) {
    throw new Error("Recherche IA non configurée (aucun fournisseur).");
  }

  const vehicleTxt = [
    vehicle.make,
    vehicle.model,
    vehicle.year ? String(vehicle.year) : null,
  ]
    .filter(Boolean)
    .join(" ");

  const prompt = buildPrompt(vehicleTxt, vehicle.vin, vehicle.fuelType);

  // IA locale : complétion texte simple (pas d'outil web). Sinon : Claude web.
  const text = LOCAL_AI_ENABLED
    ? await aiComplete({ prompt, maxTokens: 4000 })
    : await researchWithClaude(prompt);

  const parsed = extractJsonObject(text);
  const result = VehicleKnowledgeSchema.safeParse(parsed);
  if (!result.success) {
    return {
      vehicle: vehicleTxt,
      summary:
        text.slice(0, 500) ||
        "Aucune information exploitable trouvée pour ce modèle.",
      commonFaults: [],
      obdCommands: [],
      resetProcedures: [],
      tips: [],
      sources: [],
    };
  }
  return result.data;
}
