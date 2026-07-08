import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import {
  VehicleKnowledgeSchema,
  type VehicleKnowledge,
} from "@/lib/vehicle-knowledge-fields";

/** La recherche IA n'est dispo que si une clé API Anthropic existe. */
export const VEHICLE_KNOWLEDGE_AI_ENABLED = !!process.env.ANTHROPIC_API_KEY;

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

/**
 * Recherche sur le web (via l'outil de recherche de Claude) les informations de
 * diagnostic propres à un modèle : pannes fréquentes, commandes OBD spécifiques
 * constructeur (mode 22 — ex. lecture du kilométrage réel), procédures de
 * réinitialisation, astuces. Renvoie une base structurée, mise en cache par le
 * appelant et enrichie au fil des connexions.
 */
export async function researchVehicleKnowledge(
  vehicle: VehicleInfo
): Promise<VehicleKnowledge> {
  if (!VEHICLE_KNOWLEDGE_AI_ENABLED) {
    throw new Error("Recherche IA non configurée (clé API manquante).");
  }

  const vehicleTxt = [
    vehicle.make,
    vehicle.model,
    vehicle.year ? String(vehicle.year) : null,
  ]
    .filter(Boolean)
    .join(" ");

  const prompt = `Tu es un expert en diagnostic automobile et en OBD-II / protocoles constructeur. Recherche sur le web les informations de diagnostic utiles pour ce véhicule et construis une base de connaissances réutilisable.

VÉHICULE : ${vehicleTxt || "inconnu"} — carburant ${vehicle.fuelType}${
    vehicle.vin ? `\nVIN : ${vehicle.vin}` : ""
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

N'invente PAS de commandes : ne mets dans obdCommands que ce qui est réellement documenté pour ce modèle (laisse la liste vide sinon). Écris en français. C'est indicatif et ne remplace pas la documentation constructeur.`;

  const client = new Anthropic();
  const message = await client.messages.create({
    model: "claude-opus-4-8",
    max_tokens: 4000,
    tools: [{ type: "web_search_20260209", name: "web_search", max_uses: 6 }],
    messages: [{ role: "user", content: prompt }],
  });

  const text = message.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("")
    .trim();

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
